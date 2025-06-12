const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

const router = express.Router();

// ✅ S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// ✅ Multer 메모리 저장소 설정
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB
        files: 51 // 앨범 커버(1) + 오디오 파일(최대 50)
    }
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio_0', maxCount: 1 },
    { name: 'audio_1', maxCount: 1 },
    { name: 'audio_2', maxCount: 1 },
    { name: 'audio_3', maxCount: 1 },
    { name: 'audio_4', maxCount: 1 },
    { name: 'audio_5', maxCount: 1 },
    { name: 'audio_6', maxCount: 1 },
    { name: 'audio_7', maxCount: 1 },
    { name: 'audio_8', maxCount: 1 },
    { name: 'audio_9', maxCount: 1 }
]);

// ✅ 이미지 검증 함수
async function validateImage(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        if (metadata.width !== 3000 || metadata.height !== 3000) {
            throw new Error('アルバムカバーは3000x3000ピクセルである必要があります。');
        }
        if (buffer.length > 10 * 1024 * 1024) {
            throw new Error('アルバムカバーは10MB以下である必要があります。');
        }
        return true;
    } catch (error) {
        throw error;
    }
}

// ✅ S3 업로드 함수
async function uploadToS3(file, folder) {
    const filename = `${uuidv4()}_${file.originalname}`;
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${filename}`,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    try {
        await s3Client.send(new PutObjectCommand(uploadParams));
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${filename}`;
    } catch (error) {
        console.error(`❌ S3 upload failed for ${filename}:`, error);
        throw error;
    }
}

// 에러 응답 헬퍼 함수
const sendErrorResponse = (res, status, message, error = null) => {
    const response = {
        success: false,
        message: message
    };

    if (error) {
        console.error('Error details:', error);
        if (process.env.NODE_ENV === 'development') {
            response.error = error.message;
            response.stack = error.stack;
        }
    }

    return res.status(status).json(response);
};

// ✅ 앨범 업로드 처리 라우터
router.post('/', (req, res) => {
    console.log('📝 Upload request received');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request body keys:', Object.keys(req.body || {}));
    
    upload(req, res, async (err) => {
        try {
            // Multer 에러 처리
            if (err instanceof multer.MulterError) {
                console.error('❌ Multer error:', {
                    code: err.code,
                    field: err.field,
                    message: err.message,
                    stack: err.stack
                });
                return sendErrorResponse(res, 400, `File upload error: ${err.message}`, err);
            } else if (err) {
                console.error('❌ Unknown upload error:', {
                    message: err.message,
                    stack: err.stack,
                    details: err
                });
                return sendErrorResponse(res, 500, `Unknown upload error: ${err.message}`, err);
            }

            console.log('📁 Files received:', {
                fileCount: req.files ? Object.keys(req.files).length : 0,
                fileFields: req.files ? Object.keys(req.files) : [],
                imagePresent: req.files && req.files.image ? 'yes' : 'no',
                audioFilesCount: req.files ? Object.keys(req.files).filter(key => key.startsWith('audio_')).length : 0
            });
            console.log('📄 Body received:', {
                bodyKeys: Object.keys(req.body || {}),
                songsPresent: req.body.songs ? 'yes' : 'no',
                songCount: req.body.songs ? req.body.songs.length : 0
            });

            // 필수 필드 검증
            if (!req.files) {
                console.error('❌ No files uploaded');
                return sendErrorResponse(res, 400, 'No files were uploaded');
            }

            // 앨범 커버 검증
            if (!req.files.image || !req.files.image[0]) {
                console.error('❌ Album cover missing');
                return sendErrorResponse(res, 400, 'Album cover is required');
            }

            // 오디오 파일 검증
            let audioFiles = [];
            for (let i = 0; i < 10; i++) {
                const key = `audio_${i}`;
                if (req.files[key] && req.files[key][0]) {
                    audioFiles.push(req.files[key][0]);
                }
            }

            if (audioFiles.length === 0) {
                console.error('❌ No audio files uploaded');
                return sendErrorResponse(res, 400, 'At least one audio file is required');
            }

            console.log('🎵 Audio files found:', audioFiles.length);

            // songs 배열 파싱
            let songs;
            try {
                songs = req.body.songs.map(songStr => {
                    try {
                        return JSON.parse(songStr);
                    } catch (parseError) {
                        console.error('❌ Song parsing error:', {
                            songString: songStr,
                            error: parseError.message
                        });
                        throw parseError;
                    }
                });
                console.log('📝 Songs parsed successfully:', songs.length);
            } catch (error) {
                console.error('❌ Songs parsing failed:', {
                    error: error.message,
                    songsData: req.body.songs
                });
                return sendErrorResponse(res, 400, 'Invalid songs data format', error);
            }

            // 앨범 커버 S3 업로드
            try {
                const coverKey = `covers/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(req.files.image[0].originalname)}`;
                await s3Client.send(new PutObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: coverKey,
                    Body: req.files.image[0].buffer,
                    ContentType: req.files.image[0].mimetype
                }));
                console.log('✅ Album cover uploaded to S3:', coverKey);
            } catch (error) {
                console.error('❌ Album cover S3 upload failed:', {
                    error: error.message,
                    stack: error.stack,
                    details: error
                });
                throw error;
            }

            // 오디오 파일 S3 업로드
            try {
                const uploadedSongs = await Promise.all(songs.map(async (song, index) => {
                    const audioFile = audioFiles[index];
                    if (!audioFile) {
                        throw new Error(`Missing audio file for song ${index + 1}`);
                    }

                    const audioKey = `audio/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(audioFile.originalname)}`;
                    await s3Client.send(new PutObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: audioKey,
                        Body: audioFile.buffer,
                        ContentType: audioFile.mimetype
                    }));
                    console.log(`✅ Audio file ${index + 1} uploaded to S3:`, audioKey);

                    return {
                        ...song,
                        audioUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioKey}`
                    };
                }));
                console.log('✅ All audio files uploaded successfully');
            } catch (error) {
                console.error('❌ Audio files S3 upload failed:', {
                    error: error.message,
                    stack: error.stack,
                    details: error
                });
                throw error;
            }

            // 앨범 데이터 생성
            const albumData = {
                releaseDate: req.body.releaseDate,
                email: req.body.email,
                password: req.body.password,
                albumNameDomestic: req.body.albumNameDomestic,
                albumNameInternational: req.body.albumNameInternational,
                artistNameKana: req.body.artistNameKana,
                artistNameEnglish: req.body.artistNameEnglish,
                versionInfo: req.body.versionInfo,
                songs: uploadedSongs,
                albumCover: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${coverKey}`,
                platforms: JSON.parse(req.body.platforms || '[]'),
                excludedCountries: JSON.parse(req.body.excludedCountries || '[]'),
                genre: req.body.genre,
                youtubeMonetize: req.body.youtubeMonetize || 'no',
                youtubeAgree: req.body.youtubeAgree === 'true',
                rightsAgreement: req.body.rightsAgreement === 'true',
                reReleaseAgreement: req.body.reReleaseAgreement === 'true',
                platformAgreement: req.body.platformAgreement === 'true',
                paymentStatus: 'completed'
            };

            console.log('Album data to save:', albumData);

            // MongoDB에 앨범 저장
            const album = new Album(albumData);
            await album.save();

            console.log('Album saved successfully:', album._id);

            // 성공 응답
            res.status(200).json({
                success: true,
                message: 'アルバムが正常に登録されました',
                albumId: album._id
            });

        } catch (error) {
            console.error('❌ Upload process error:', {
                message: error.message,
                stack: error.stack,
                type: error.constructor.name,
                details: error
            });
            
            if (error.name === 'ValidationError') {
                console.error('❌ Validation error details:', {
                    errors: Object.keys(error.errors).map(key => ({
                        field: key,
                        message: error.errors[key].message,
                        value: error.errors[key].value
                    }))
                });
                return sendErrorResponse(res, 400, 'Validation error', error);
            }
            
            if (error.code === 11000) {
                console.error('❌ Duplicate key error:', {
                    keyPattern: error.keyPattern,
                    keyValue: error.keyValue
                });
                return sendErrorResponse(res, 400, 'Duplicate data error', error);
            }
            
            sendErrorResponse(res, 500, 'Upload failed', error);
        }
    });
});

// ✅ 앨범 삭제 라우터
router.delete('/:id', async (req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: 'アルバムが見つかりません' });
        }

        // S3에서 앨범 커버 삭제
        if (album.albumCover) {
            const coverKey = album.albumCover.split('/').pop();
            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `covers/${coverKey}`
            }));
        }

        // S3에서 모든 곡 파일 삭제
        for (const song of album.songs) {
            if (song.audioUrl) {
                const audioKey = song.audioUrl.split('/').pop();
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${audioKey}`
                }));
            }
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'アルバムを削除しました' });
    } catch (error) {
        console.error('❌ Delete process error:', error);
        res.status(500).json({
            message: 'アルバムの削除に失敗しました',
            error: error.message
        });
    }
});

module.exports = router;