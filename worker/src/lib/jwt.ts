// src/lib/jwt.ts — توقيع والتحقق من JWT عبر jose
// (jsonwebtoken يعتمد على crypto الخاص بـ Node ولا يعمل على Workers)

import { SignJWT, jwtVerify, errors } from 'jose';
import type { UserPayload } from '../types';

function keyFrom(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export async function signAccessToken(
	payload: UserPayload,
	secret: string,
	expiresIn = '15m'
): Promise<string> {
	return await new SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(keyFrom(secret));
}

export type VerifyResult =
	| { ok: true; payload: UserPayload }
	| { ok: false; expired: boolean };

export async function verifyAccessToken(token: string, secret: string): Promise<VerifyResult> {
	try {
		const { payload } = await jwtVerify(token, keyFrom(secret), { algorithms: ['HS256'] });
		return { ok: true, payload: payload as unknown as UserPayload };
	} catch (err) {
		// نفرّق بين المنتهي وغير الصالح لأن الواجهة تعتمد على code=TOKEN_EXPIRED
		// لتشغيل مسار التجديد التلقائي في frontend/api.js
		const expired = err instanceof errors.JWTExpired;
		return { ok: false, expired };
	}
}

/** Refresh token عشوائي — 64 بايت hex، نفس طول النسخة القديمة */
export function generateRefreshToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(64));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function refreshTokenExpiry(days = 7): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString();
}
