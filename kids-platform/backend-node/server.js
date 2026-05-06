require('dotenv').config();
const { initDB, saveDB } = require('./src/database/db');

initDB().then(() => {
    const app  = require('./src/app');
    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, () => {
        console.log('');
        console.log('🎉 ═══════════════════════════════════════════════');
        console.log('🚀 منصة نجوم التعلم — الخادم يعمل!');
        console.log('═══════════════════════════════════════════════════');
        console.log('');
        console.log(`🏠 الصفحة الرئيسية:    http://localhost:${PORT}/home.html`);
        console.log(`🔑 تسجيل الدخول:       http://localhost:${PORT}/login.html`);
        console.log(`🛡️  لوحة الإدارة:       http://localhost:${PORT}/admin.html`);
        console.log(`💚 Health Check:        http://localhost:${PORT}/health`);
        console.log('');
        console.log('⚠️  لا تستخدم Live Server — افتح الروابط أعلاه مباشرة!');
        console.log('═══════════════════════════════════════════════════');
    });

    // ── إيقاف آمن — حفظ قاعدة البيانات قبل الإغلاق ──────────
    function gracefulShutdown(signal) {
        console.log(`\n⏹️  ${signal} received — saving database...`);
        try {
            saveDB();
            console.log('✅ Database saved');
        } catch (err) {
            console.error('❌ Failed to save database:', err.message);
        }
        server.close(() => {
            console.log('👋 Server closed');
            process.exit(0);
        });
        // إذا لم يُغلق خلال 5 ثوانٍ — إغلاق إجباري
        setTimeout(() => { process.exit(1); }, 5000);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

}).catch(err => {
    console.error('❌ فشل تهيئة قاعدة البيانات:', err);
    process.exit(1);
});