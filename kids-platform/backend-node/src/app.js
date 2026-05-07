// src/app.js — نقطة تهيئة التطبيق

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const fs       = require('fs');

const app = express();

// Trust nginx reverse proxy
app.set('trust proxy', 1);

// ── الـ Middleware الأساسية ────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr:  ["'unsafe-inline'"],
            styleSrc:       ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc:        ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc:         ["'self'", "data:", "blob:"],
            connectSrc:     ["'self'"],
            objectSrc:      ["'none'"],
            frameAncestors: ["'none'"],
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ──────────────────────────────────────────────────────
// في الإنتاج: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
// في التطوير: إذا لم يُعيَّن، يُسمح فقط لنفس المنفذ (same-origin)
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null;

app.use(cors({
    origin: function(origin, callback) {
        // طلبات بدون origin (مثل same-origin أو curl) مسموحة دائماً
        if (!origin) return callback(null, true);
        if (allowedOrigins) {
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('CORS: origin not allowed'));
        }
        // تطوير: السماح لـ localhost فقط
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        callback(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    credentials: true
}));

// ── الـ API Routes ───────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth.routes'));
app.use('/api/parents',    require('./routes/parent.routes'));
app.use('/api/children',   require('./routes/child.routes'));
app.use('/api/activities', require('./routes/activity.routes'));
app.use('/api/internal',   require('./routes/internal.routes'));
app.use('/api/ai',         require('./routes/ai.routes'));      // ← نجّوم AI

// ── Static Frontend ──────────────────────────────────────────
// في الإنتاج: FRONTEND_PATH=/var/www/kids-platform/frontend
// في التطوير: يبحث تلقائياً في المسارات المحتملة
let frontendPath = null;

if (process.env.FRONTEND_PATH) {
    const explicit = path.resolve(process.env.FRONTEND_PATH);
    if (fs.existsSync(explicit) && fs.existsSync(path.join(explicit, 'home.html'))) {
        frontendPath = explicit;
    } else {
        console.error(`❌ FRONTEND_PATH="${explicit}" غير صالح أو لا يحتوي home.html`);
    }
}

if (!frontendPath) {
    const possiblePaths = [
        path.join(__dirname, '../../../frontend'),
        path.join(process.cwd(), '../frontend'),
        path.join(process.cwd(), '../../frontend'),
        path.join(process.cwd(), 'frontend'),
    ];
    for (const p of possiblePaths) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved) && fs.existsSync(path.join(resolved, 'home.html'))) {
            frontendPath = resolved;
            break;
        }
    }
}

if (frontendPath) {
    console.log('✅ Frontend found');
    app.use(express.static(frontendPath));
} else {
    console.error('❌ Frontend directory not found! Set FRONTEND_PATH in .env');
}

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'منصة الأطفال تعمل بخير 🌟',
        frontendFound: !!frontendPath,
        timestamp: new Date().toISOString()
    });
});

// ── Root redirect ────────────────────────────────────────────
app.get('/', (req, res) => {
    if (frontendPath && fs.existsSync(path.join(frontendPath, 'home.html'))) {
        return res.sendFile(path.join(frontendPath, 'home.html'));
    }
    res.status(503).send(`
        <html dir="rtl"><head><meta charset="UTF-8"><title>خطأ</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a0040;color:#fff;">
        <h1>⚠️ مجلد frontend غير موجود</h1>
        <p>الخادم يعمل لكن لم يتم العثور على ملفات الواجهة الأمامية.</p>
        <p>جرّب <a href="/health" style="color:#00E676;">/health</a> للتأكد أن الخادم يعمل.</p>
        </body></html>
    `);
});

// ── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, error: 'المسار غير موجود', code: 'NOT_FOUND' });
    }
    res.status(404).send(`
        <html dir="rtl"><head><meta charset="UTF-8"><title>404</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a0040;color:#fff;">
        <h1>🔍 الصفحة غير موجودة</h1>
        <p>المسار <code style="color:#FFD700;">${req.path}</code> غير موجود.</p>
        <p><a href="/home.html" style="color:#00E676;">← الصفحة الرئيسية</a> | 
           <a href="/login.html" style="color:#FFD700;">تسجيل الدخول</a></p>
        </body></html>
    `);
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('🔥 Unhandled error:', err);
    res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم', code: 'INTERNAL_ERROR' });
});

module.exports = app;