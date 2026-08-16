// src/middleware/ratelimit.ts — بديل express-rate-limit
//
// المخزن القديم كان في ذاكرة العملية. على Workers لا توجد عملية واحدة طويلة
// العمر: كل طلب قد ينفَّذ في عزلة (isolate) مختلفة وفي مركز بيانات مختلف،
// فالعدّاد في الذاكرة يُصفَّر باستمرار ولا يحمي من شيء. ربط Rate Limiting
// يعدّ على مستوى شبكة Cloudflare بدلاً من ذلك.

import type { MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from '../types';

/** مفتاح العدّ: IP الحقيقي خلف Cloudflare */
function clientKey(c: { req: { header: (k: string) => string | undefined } }): string {
	return c.req.header('cf-connecting-ip') ?? 'unknown';
}

export function rateLimit(
	pick: (env: Env) => RateLimit | undefined,
	message: string
): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const limiter = pick(c.env);

		// في التطوير المحلي قد لا يكون الربط موجوداً — لا نُسقط الطلب لهذا السبب
		if (!limiter) return await next();

		const { success } = await limiter.limit({ key: clientKey(c) });
		if (!success) {
			return c.json({ success: false, error: message, code: 'RATE_LIMIT_EXCEEDED' }, 429);
		}
		await next();
	};
}

export const authRateLimit = rateLimit(
	(env) => env.AUTH_LIMITER,
	'محاولات كثيرة جداً، حاول مرة أخرى بعد قليل'
);

export const aiRateLimit = rateLimit(
	(env) => env.AI_LIMITER,
	'طلبات كثيرة جداً، حاول مرة أخرى بعد قليل'
);
