const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Album = require('./models/Album');

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
const upload = multer({ storage });

// ✅ 중국어 날짜 형식 처리 함수
function parseChineseDate(dateStr) {
    // ISO 형식 확인 (예: "2024-03-21T00:00:00.000Z")
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid ISO date format');
        }
        return date;
    }

    // 중국어 형식 처리
    const matches = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!matches) {
        throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY年MM月DD日 or ISO format`);
    }
    const [, yearStr, monthStr, dayStr] = matches;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // 날짜 유효성 검사
    if (isNaN(year) || year < 1900 || year > 2100) {
        throw new Error(`Invalid year: ${year}. Must be between 1900 and 2100`);
    }
    if (isNaN(month) || month < 1 || month > 12) {
        throw new Error(`Invalid month: ${month}. Must be between 1 and 12`);
    }
    if (isNaN(day) || day < 1 || day > 31) {
        throw new Error(`Invalid day: ${day}. Must be between 1 and 31`);
    }

    // 월별 일수 검사
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
        throw new Error(`Invalid day: ${day}. ${month} month has ${daysInMonth} days`);
    }

    return new Date(year, month - 1, day);
}

// ✅ 오디오 업로드 및 DB 저장 라우터
router.post('/', upload.single('audio'), async(req, res) => {
    try {
        console.log('[API] 受信データ:', {
            name: req.body.name,
            age: req.body.age,
            gender: req.body.gender,
            email: req.body.email,
            date: req.body.date,
            time: req.body.time,
            memberKey: req.body.memberKey
        });

        if (!req.file) {
            console.error('[API] 音声ファイルなし');
            return res.status(400).json({
                message: '音声ファイルを選択してください',
                code: 'FILE_REQUIRED'
            });
        }

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

        // 필수 항목 확인
        const required = [name, age, gender, email, date, time, memberKey];
        if (required.some(val => !val)) {
            console.error('[API] 必須項目不足:', required.filter(val => !val));
            return res.status(400).json({
                message: '必須項目が不足しています',
                fields: required.filter(val => !val),
                code: 'MISSING_FIELDS'
            });
        }

        // 날짜 파싱
        let parsedDate;
        try {
            parsedDate = parseChineseDate(date);
            console.log('[API] 日付パース成功:', parsedDate.toISOString());
        } catch (e) {
            console.error('[API] 日付パース失敗:', e.message);
            return res.status(400).json({
                message: '日付フォーマットが正しくありません',
                error: e.message,
                code: 'DATE_PARSE_ERROR'
            });
        }

        // S3 업로드
        const filename = `${uuidv4()}_${req.file.originalname}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        try {
            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log('[API] S3アップロード成功:', filename);
        } catch (s3Error) {
            console.error('[API] S3アップロード失敗:', s3Error);
            return res.status(500).json({
                message: 'ファイルアップロードに失敗しました',
                code: 'S3_UPLOAD_ERROR',
                error: process.env.NODE_ENV === 'development' ? s3Error.message : undefined
            });
        }

        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${filename}`;

        // MongoDB 저장
        const newAlbum = new Album({
            name,
            age: Number(age),
            gender,
            email,
            date: parsedDate,
            albumLength: time,
            albumDescription: mainRequest || '',
            note: note || '',
            reservationCode: memberKey,
            audioUrl,
            status: '処理中'
        });

        try {
            await newAlbum.save();
            console.log('[API] MongoDB保存成功:', newAlbum._id);
        } catch (dbError) {
            console.error('[API] MongoDB保存失敗:', dbError);
            // S3에 업로드된 파일 삭제
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${filename}`
                }));
            } catch (deleteError) {
                console.error('[API] S3ファイル削除失敗:', deleteError);
            }
            return res.status(500).json({
                message: 'データベース保存に失敗しました',
                code: 'DB_SAVE_ERROR',
                error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
            });
        }

        res.status(200).json({
            message: '保存完了',
            url: audioUrl
        });

    } catch (err) {
        console.error('[API] アップロード処理エラー:', err);
        res.status(500).json({
            message: '予約作成に失敗しました',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// ✅ 예약 삭제 라우터 (S3 파일도 함께 삭제)
router.delete('/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '未找到预约' });
        }

        // S3 오디오 파일 삭제
        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log('✅ S3文件已删除:', key);
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '预约已删除' });
    } catch (err) {
        console.error('❌ 删除失败:', err);
        res.status(500).json({ message: '删除失败', error: err.message });
    }
});

// ✅ 다운로드 라우터
router.get('/download/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album || !album.audioUrl) {
            return res.status(404).json({ message: '文件不存在' });
        }

        const key = decodeURIComponent(album.audioUrl.split('/').slice(-1)[0]);
        const filename = key.split('_').slice(1).join('_');

        const getObjectParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${key}`,
        };

        const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        Body.pipe(res);

        Body.on('error', (err) => {
            console.error('❌ S3流媒体失败:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '下载失败', error: err.message });
            }
        });
    } catch (err) {
        console.error('❌ 下载失败:', err);
        res.status(500).json({ message: '下载失败', error: err.message });
    }
});

module.exports = router;