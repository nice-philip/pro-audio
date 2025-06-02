const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const Album = require('./models/Album');

const app = express();
const port = process.env.PORT || 8080;

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log('✅ MongoDB 连接成功');
}).catch((err) => {
    console.error('❌ MongoDB 连接失败:', err);
});

// MongoDB 연결 에러 처리
mongoose.connection.on('error', (err) => {
    console.error('MongoDB 错误:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB 断开连接，尝试重新连接...');
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    });
});

// AWS S3 설정 검증
if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || 
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    console.error('❌ AWS 配置缺失');
    process.exit(1);
}

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:8080',
        'https://pro-audio.onrender.com',
        'https://surroundio.com',
        'https://pro-audio.netlify.app',
        'https://cheery-bienenstitch-8bad49.netlify.app',
        'https://surroundio.life'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    credentials: true
}));

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// AWS S3 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    maxAttempts: 3,
    retryMode: 'adaptive'
});

// Multer 설정
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
    }
});

// 예약 조회 API
app.get('/api/reservations', async(req, res) => {
    const key = req.query.key;

    if (!key) {
        return res.status(400).json({ message: '请输入预约号码' });
    }

    try {
        if (key === 'admin25') {
            const all = await Album.find().sort({ createdAt: -1 });
            return res.status(200).json(all);
        } else {
            const userReservations = await Album.find({ reservationCode: key }).sort({ createdAt: -1 });
            if (userReservations.length === 0) {
                return res.status(404).json({ message: '未找到预约信息' });
            }
            return res.status(200).json(userReservations);
        }
    } catch (err) {
        console.error('❌ 查询预约失败:', err);
        return res.status(500).json({ message: '查询失败', error: err.message });
    }
});

// 전역 에러 핸들러 추가
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        message: '服务器错误',
        error: process.env.NODE_ENV === 'development' ? err.message : '未知错误'
    });
});

// 파일 업로드 에러 처리 미들웨어
const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: '文件大小超出限制',
                code: 'FILE_TOO_LARGE'
            });
        }
        return res.status(400).json({
            message: '文件上传失败',
            code: 'UPLOAD_ERROR'
        });
    }
    next(err);
};

app.use(handleUploadErrors);

// 날짜 변환 함수 개선
function parseChineseDate(dateStr) {
    try {
        console.log('[날짜 파싱] 입력값 타입:', typeof dateStr);
        console.log('[날짜 파싱] 입력값:', dateStr);
        
        // 날짜 문자열이 없는 경우
        if (!dateStr) {
            console.error('[날짜 파싱] 날짜 문자열이 비어있음');
            throw new Error('Date string is empty');
        }

        // 날짜 문자열 정규화
        const normalizedDateStr = String(dateStr).trim();
        console.log('[날짜 파싱] 정규화된 문자열:', normalizedDateStr);

        // ISO 형식 확인 (예: "2024-03-21T00:00:00.000Z")
        if (normalizedDateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
            console.log('[날짜 파싱] ISO 형식 감지됨');
            const date = new Date(normalizedDateStr);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid ISO date format');
            }
            return date;
        }

        // "YYYY年MM月DD日" 형식에서 숫자만 추출
        const matches = normalizedDateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!matches) {
            console.error('[날짜 파싱] 형식이 맞지 않음. 예상 형식: YYYY年MM月DD日 또는 ISO');
            console.error('[날짜 파싱] 받은 형식:', normalizedDateStr);
            throw new Error(`Invalid date format. Expected: YYYY年MM月DD日 or ISO, Received: ${normalizedDateStr}`);
        }
        
        const [_, yearStr, monthStr, dayStr] = matches;
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        
        console.log('[날짜 파싱] 추출된 값:', { year, month, day });
        
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
    } catch (error) {
        console.error('[날짜 파싱] 오류:', error);
        throw error;
    }
}

// 예약 생성 API 개선
app.post('/api/reservations', upload.single('audio'), async(req, res) => {
    try {
        console.log('[API] 받은 데이터:', {
            name: req.body.name,
            age: req.body.age,
            gender: req.body.gender,
            email: req.body.email,
            date: req.body.date,
            time: req.body.time,
            memberKey: req.body.memberKey
        });

        // 필수 필드 검증
        const requiredFields = ['name', 'age', 'gender', 'email', 'date', 'time', 'memberKey'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            console.error('[API] 필수 필드 누락:', missingFields);
            return res.status(400).json({
                message: '缺少必填项',
                fields: missingFields,
                code: 'MISSING_FIELDS'
            });
        }

        if (!req.file) {
            console.error('[API] 오디오 파일 누락');
            return res.status(400).json({
                message: '请上传音频文件',
                code: 'FILE_REQUIRED'
            });
        }

        // 날짜 변환
        let parsedDate;
        try {
            parsedDate = parseChineseDate(req.body.date);
            console.log('[API] 날짜 변환 성공:', parsedDate.toISOString());
        } catch (dateError) {
            console.error('[API] 날짜 변환 실패:', dateError);
            return res.status(400).json({
                message: '日期格式错误',
                error: dateError.message,
                code: 'DATE_FORMAT_ERROR',
                details: {
                    receivedDate: req.body.date,
                    expectedFormat: 'YYYY年MM月DD日'
                }
            });
        }

        // S3 업로드 시도
        const filename = `${Date.now()}_${req.file.originalname}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `audio/${filename}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        try {
            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log('[API] S3 업로드 성공');
        } catch (s3Error) {
            console.error('[API] S3 업로드 실패:', s3Error);
            return res.status(500).json({
                message: 'S3上传失败',
                code: 'S3_UPLOAD_ERROR'
            });
        }

        const audioUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/audio/${filename}`;

        // MongoDB 저장 시도
        const newAlbum = new Album({
            name: req.body.name,
            age: Number(req.body.age),
            gender: req.body.gender,
            email: req.body.email,
            date: parsedDate,
            albumLength: req.body.time,
            albumDescription: req.body.mainRequest || '',
            note: req.body.note || '',
            reservationCode: req.body.memberKey,
            audioUrl,
            status: '处理中'
        });

        try {
            console.log('[API] MongoDB 저장 시도:', {
                name: newAlbum.name,
                date: newAlbum.date.toISOString(),
                time: newAlbum.albumLength
            });
            await newAlbum.save();
            console.log('[API] MongoDB 저장 성공');
        } catch (dbError) {
            console.error('[API] MongoDB 저장 실패:', dbError);
            // S3에 업로드된 파일 삭제 시도
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `audio/${filename}`
                }));
            } catch (deleteError) {
                console.error('[API] S3 파일 삭제 실패:', deleteError);
            }
            return res.status(500).json({
                message: '数据库保存失败',
                code: 'DB_SAVE_ERROR',
                details: dbError.message
            });
        }

        res.status(200).json({
            message: '预约完成',
            reservationCode: req.body.memberKey,
            audioUrl
        });

    } catch (err) {
        console.error('[API] 예약 생성 실패:', err);
        res.status(500).json({
            message: '预约创建失败',
            error: process.env.NODE_ENV === 'development' ? err.message : '未知错误',
            code: 'RESERVATION_ERROR'
        });
    }
});

// 예약 삭제 API
app.delete('/api/reservations/:id', async(req, res) => {
    try {
        const album = await Album.findById(req.params.id);
        if (!album) {
            return res.status(404).json({ message: '未找到预约' });
        }

        if (album.audioUrl) {
            const key = album.audioUrl.split('/').pop();
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `audio/${key}`
            };

            await s3Client.send(new DeleteObjectCommand(deleteParams));
        }

        await Album.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: '预约已删除' });
    } catch (err) {
        console.error('❌ 删除预约失败:', err);
        res.status(500).json({ message: '删除预约失败', error: err.message });
    }
});

// 서버 시작
app.listen(port, () => {
    console.log(`🚀 服务器运行在端口 ${port}`);
});