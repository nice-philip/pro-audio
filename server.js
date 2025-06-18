// ✅ server.js (전체 수정 버전)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
require('dotenv').config();

console.log('🚀 Starting server...');
console.log('Environment:', {
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI ? '(set)' : '(not set)',
    AWS_REGION: process.env.AWS_REGION,
    AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '(set)' : '(not set)',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '(set)' : '(not set)'
});

const uploadRoutes = require('./routes/upload');
const Album = require('./models/Album');

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
}).then(async() => {
    console.log('✅ MongoDB 接続完了');
    try {
        const count = await Album.countDocuments();
        console.log(`現在のアルバム数: ${count}`);
        const albums = await Album.find().sort({ _id: -1 }).limit(5);
        console.log('最新のアルバム:', albums);
    } catch (err) {
        console.error('❌ データベース確認エラー:', err);
    }
}).catch((err) => {
    console.error('❌ MongoDB 接続失敗:', err);
    process.exit(1);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB エラー:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB 接続が切断されました。再接続を試みています...');
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    });
});

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    console.error('❌ AWS 設定が不足しています');
    process.exit(1);
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const allowedOrigins = [
    'https://cheery-bienenstitch-8bad49.netlify.app',
    'https://pro-audio.netlify.app',
    'https://pro-audio-cn.netlify.app',
    'https://surroundio.life',
    'https://pro-audio.onrender.com',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('CORS is enabled for allowed origins:', allowedOrigins);

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/upload', uploadRoutes);

// 예약 조회 API - 일반 사용자용
app.post('/api/reservation/check', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'メールアドレスとパスワードを入力してください。' });
        }

        // 이메일과 패스워드로 예약 정보 조회
        const reservation = await Album.find({ 
            email: email.toLowerCase().trim(), 
            password: password 
        });

        if (!reservation) {
            return res.status(404).json({ message: '予約情報が見つかりませんでした。メールアドレスとパスワードを確認してください。' });
        }

        res.json(reservation);
    } catch (error) {
        console.error('Reservation check error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// 예약 조회 API - 관리자용
app.post('/api/reservation/admin', async (req, res) => {
    try {
        const { password } = req.body;
        
        // 관리자 권한 확인
        if (password !== 'admin25') {
            return res.status(403).json({ message: '管理者権限がありません。' });
        }

        // 전체 예약 목록 조회
        const reservations = await Album.find({}).sort({ createdAt: -1 });
        
        // 간단한 통계 계산
        const stats = {
            total: reservations.length,
            audioOnly: reservations.filter(r => r.serviceType === 'audioOnly').length,
            fullService: reservations.filter(r => r.serviceType === 'fullService').length,
            payLater: reservations.filter(r => r.payLater === true).length
        };

        res.json({
            reservations,
            stats
        });
    } catch (error) {
        console.error('Admin reservation check error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/application', (req, res) => {
    res.sendFile(path.join(__dirname, 'application.html'));
});

app.listen(port, () => {
    console.log(`✅ Server is running on port ${port}`);
});