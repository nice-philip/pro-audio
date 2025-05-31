const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');

const router = express.Router();

// ✅ S3 클라이언트 설정
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
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 제한
        files: 1
    }
});

// ✅ 오디오 업로드 및 예약 생성
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        console.log('📝 업로드 요청 받음');

        if (!req.file) {
            console.log('❌ 오디오 파일이 없습니다.');
            return res.status(400).json({ message: '오디오 파일이 필요합니다.' });
        }

        console.log('📁 파일 정보:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        const {
            name,
            age,
            gender,
            email,
            date,
            time,
            mainRequest,
            note,
            memberKey
        } = req.body;

        console.log('📋 폼 데이터:', { name, age, gender, email, date, time, memberKey });

        if (!name || !age || !gender || !email || !date || !time || !memberKey) {
            return res.status(400).json({ message: '모든 필수 항목을 입력해주세요.' });
        }

        // ✅ 파일명 생성
        const filename = `${uuidv4()}_${req.file.originalname}`;
        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        console.log('🚀 S3 업로드 시작');

        await s3Client.send(new PutObjectCommand(s3Params));

        console.log('✅ S3 업로드 완료');

        // ✅ 직접 URL 생성
        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${filename}`;

        const newAlbum = new Album({
            name,
            age: Number(age),
            gender,
            email,
            date: new Date(date),
            albumLength: time,
            albumDescription: mainRequest,
            note,
            reservationCode: memberKey,
            audioUrl,
            status: '처리중'
        });

        await newAlbum.save();
        console.log('✅ DB 저장 완료');

        res.status(200).json({
            message: '예약이 완료되었습니다.',
            reservationCode: memberKey,
            audioUrl
        });
    } catch (err) {
        console.error('❌ 예약 생성 실패:', err);
        res.status(500).json({
            message: '예약 생성 실패',
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ✅ 예약 삭제
router.delete('/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
        }

        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const s3Params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };

            await s3Client.send(new DeleteObjectCommand(s3Params));
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '예약이 삭제되었습니다.' });
    } catch (err) {
        console.error('❌ 예약 삭제 실패:', err);
        res.status(500).json({ message: '예약 삭제 실패', error: err.message });
    }
});

// ✅ 오디오 다운로드
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_'); // UUID 제거

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        const s3Stream = await s3Client.send(new GetObjectCommand(s3Params)).then(data => data.Body);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', album.audioUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');

        s3Stream.pipe(res);

        s3Stream.on('error', (err) => {
            console.error('❌ 스트리밍 오류:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '다운로드 실패', error: err.message });
            }
        });
    } catch (err) {
        console.error('❌ 다운로드 실패:', err);
        res.status(500).json({ message: '다운로드 실패', error: err.message });
    }
});

module.exports = router;