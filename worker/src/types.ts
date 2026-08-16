// src/types.ts — الأنواع المشتركة وربط البيئة (bindings)

export interface Env {
	DB: D1Database;
	ASSETS: Fetcher;

	// حدود المعدّل — تُعرَّف في wrangler.jsonc تحت ratelimits
	AUTH_LIMITER?: RateLimit;
	AI_LIMITER?: RateLimit;

	// أسرار — تُضبط عبر `wrangler secret put`
	JWT_SECRET: string;
	INTERNAL_ADMIN_API_KEY: string;
	GROQ_API_KEY?: string;

	// اختيارية — بروكسي AI بدل الاتصال المباشر بـ Groq
	AI_PROXY_URL?: string;
	AI_WORKER_KEY?: string;

	// متغيرات عادية (vars)
	JWT_EXPIRES_IN?: string;
	REFRESH_TOKEN_EXPIRES_IN?: string;
}

// حمولة الـ JWT — نفس الشكل الذي كان يولّده الخادم القديم
export type UserPayload =
	| { id: number; type: 'parent'; email: string }
	| { id: number; type: 'child'; parentId: number };

// متغيرات Hono التي تمرّرها الـ middleware للمعالجات
export type Variables = {
	user: UserPayload;
	childId: number;
};

export type AppEnv = { Bindings: Env; Variables: Variables };
