// src/index.ts — نقطة الدخول
// يقابل src/app.js في الخادم القديم. ما اختفى هنا مقصود:
//   • CORS      → الواجهة تطلب /api على نفس الأصل (API_BASE = '/api')، فلا حاجة له.
//   • express.static → static assets تُقدَّم من مجلد frontend/ عبر ربط ASSETS.
//   • dotenv    → المتغيرات تأتي من bindings/secrets.

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import activityRoutes from './routes/activities';
import aiRoutes from './routes/ai';
import authRoutes from './routes/auth';
import childRoutes from './routes/children';
import internalRoutes from './routes/internal';
import parentRoutes from './routes/parents';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

/**
 * الردّ القادم من ASSETS.fetch رؤوسه غير قابلة للتعديل (immutable)، وmiddleware
 * رؤوس الحماية يحاول الكتابة عليها فيرمي "Can't modify immutable headers".
 * إعادة تغليفه تعطينا نسخة رؤوسها قابلة للتعديل.
 */
async function serveAsset(assets: Fetcher, url: URL, path: string): Promise<Response> {
	const res = await assets.fetch(new Request(new URL(path, url)));
	return new Response(res.body, res);
}

// ── رؤوس الحماية (بديل helmet) ────────────────────────────────
// نفس سياسة CSP التي كانت في app.js — الصفحات تعتمد على unsafe-inline
// وعلى font-awesome/جوجل فونتس من CDN.
app.use(
	'*',
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'self'"],
			scriptSrc: [
				"'self'",
				"'unsafe-inline'",
				"'unsafe-eval'",
				'https://cdnjs.cloudflare.com',
				'https://cdn.jsdelivr.net',
			],
			scriptSrcAttr: ["'unsafe-inline'"],
			styleSrc: [
				"'self'",
				"'unsafe-inline'",
				'https://cdnjs.cloudflare.com',
				'https://fonts.googleapis.com',
				'https://cdn.jsdelivr.net',
			],
			fontSrc: [
				"'self'",
				'https://fonts.gstatic.com',
				'https://cdnjs.cloudflare.com',
				'https://cdn.jsdelivr.net',
			],
			imgSrc: ["'self'", 'data:', 'blob:'],
			connectSrc: ["'self'"],
			objectSrc: ["'none'"],
			frameAncestors: ["'none'"],
		},
		crossOriginEmbedderPolicy: false,
	})
);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (c) =>
	c.json({
		success: true,
		message: 'منصة الأطفال تعمل بخير 🌟',
		timestamp: new Date().toISOString(),
	})
);

// ── بوابة admin.html ─────────────────────────────────────────
// المفتاح يصل عبر ?key= في أول زيارة، ثم عبر كوكي httpOnly.
// بدون مفتاح صحيح: 404 وليس 403 — حتى لا نكشف وجود الصفحة أصلاً.
app.get('/admin.html', async (c) => {
	const key = c.req.query('key') ?? getCookie(c, 'admin_key');
	const secret = c.env.INTERNAL_ADMIN_API_KEY;

	let valid = false;
	if (key && secret && key.length === secret.length) {
		let diff = 0;
		for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ secret.charCodeAt(i);
		valid = diff === 0;
	}

	if (!valid) return c.text('Not found', 404);

	// الكوكي يُضاف على الردّ النهائي مباشرة: serveAsset يبني Response جديداً،
	// فأي كوكي يُضبط على c.res قبل ذلك يضيع.
	const url = new URL(c.req.url);
	const res = await serveAsset(c.env.ASSETS, url, '/admin.html');
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	res.headers.append(
		'Set-Cookie',
		`admin_key=${encodeURIComponent(key!)}; Max-Age=3600; Path=/; HttpOnly; SameSite=Strict${secure}`
	);
	return res;
});

// ── الجذر → الصفحة الرئيسية ──────────────────────────────────
app.get('/', (c) => serveAsset(c.env.ASSETS, new URL(c.req.url), '/home.html'));

// ── مسارات الـ API ───────────────────────────────────────────
app.route('/api/auth', authRoutes);
app.route('/api/parents', parentRoutes);
app.route('/api/children', childRoutes);
app.route('/api/activities', activityRoutes);
app.route('/api/internal', internalRoutes);
app.route('/api/ai', aiRoutes);

// ── 404 ──────────────────────────────────────────────────────
app.notFound((c) => {
	if (new URL(c.req.url).pathname.startsWith('/api/')) {
		return c.json({ success: false, error: 'المسار غير موجود', code: 'NOT_FOUND' }, 404);
	}
	return c.html(
		`<html dir="rtl"><head><meta charset="UTF-8"><title>404</title></head>
		<body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a0040;color:#fff;">
		<h1>🔍 الصفحة غير موجودة</h1>
		<p><a href="/home.html" style="color:#00E676;">← الصفحة الرئيسية</a> |
		   <a href="/login.html" style="color:#FFD700;">تسجيل الدخول</a></p>
		</body></html>`,
		404
	);
});

// ── معالج الأخطاء العام ──────────────────────────────────────
app.onError((err, c) => {
	console.error('🔥 Unhandled error:', err.message, err.stack);
	return c.json({ success: false, error: 'خطأ داخلي في الخادم', code: 'INTERNAL_ERROR' }, 500);
});

export default app;
