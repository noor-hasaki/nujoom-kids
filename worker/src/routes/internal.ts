// src/routes/internal.ts — مسارات الإدارة، محمية بـ Admin API Key
// منقول عن internal.routes.js

import { Hono } from 'hono';
import { getAll, getOne, prep, run, type SqlParam } from '../db';
import { requireAdminKey } from '../middleware/auth';
import type { AppEnv } from '../types';

const internal = new Hono<AppEnv>();

internal.use('*', requireAdminKey);

const AUDIT_LIMIT = 200;

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string | null {
	return c.req.header('cf-connecting-ip') ?? null;
}

async function logAudit(
	db: D1Database,
	ip: string | null,
	action: string,
	targetType: string | null,
	targetId: number | null,
	details: unknown
): Promise<void> {
	try {
		await run(
			db,
			'INSERT INTO admin_audit (ts, ip, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
			[Date.now(), ip, action, targetType, targetId, JSON.stringify(details ?? {})]
		);
	} catch (e) {
		// سجلّ التدقيق لا يجب أن يُفشل العملية نفسها
		console.error('audit log error:', (e as Error).message);
	}
}

// التوقيع يقبل string|undefined لأن Hono لا يستنتج المعاملات في المسارات
// المُسجَّلة من متغيّر نصّي (حلقة freezeRoutes أدناه)
function idParam(c: { req: { param: (k: string) => string | undefined } }): number | null {
	const n = parseInt(c.req.param('id') ?? '', 10);
	return Number.isInteger(n) ? n : null;
}

/** جمل حذف كل بيانات طفل — تُستعمل في حذف الطفل وحذف ولي الأمر */
function childCleanupStatements(db: D1Database, childId: number) {
	return [
		prep(
			db,
			'DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE child_id = ?)',
			[childId]
		),
		prep(db, 'DELETE FROM ai_chat_sessions   WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM achievements       WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM activity_logs      WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM child_progress     WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM drawings           WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM parent_permissions WHERE child_id = ?', [childId]),
		prep(db, 'DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [childId, 'child']),
		prep(db, 'DELETE FROM children           WHERE id = ?', [childId]),
	];
}

// ── GET /api/internal/parents ─────────────────────────────────
internal.get('/parents', async (c) => {
	const parents = await getAll(
		c.env.DB,
		`SELECT p.id, p.name, p.email, p.is_frozen, p.created_at,
		        COUNT(c.id) AS children_count
		   FROM parents p
		   LEFT JOIN children c ON c.parent_id = p.id
		  GROUP BY p.id
		  ORDER BY p.created_at DESC`
	);
	return c.json({ success: true, data: parents });
});

// ── GET /api/internal/children ────────────────────────────────
internal.get('/children', async (c) => {
	const children = await getAll(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender, c.is_frozen, c.join_date,
		        c.parent_id, p.name AS parent_name, p.email AS parent_email,
		        COALESCE(cp.total_stars, 0)    AS total_stars,
		        COALESCE(cp.total_time_min, 0) AS total_time_min
		   FROM children c
		   LEFT JOIN parents p ON p.id = c.parent_id
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  ORDER BY c.created_at DESC`
	);
	return c.json({ success: true, data: children });
});

// ── GET /api/internal/relationships ──────────────────────────
internal.get('/relationships', async (c) => {
	const rels = await getAll(
		c.env.DB,
		`SELECT pp.parent_id, p.name AS parent_name, p.email AS parent_email,
		        pp.child_id,  c.name AS child_name, c.age, c.gender,
		        pp.can_view_stats, pp.can_edit_child, pp.can_enter_mode
		   FROM parent_permissions pp
		   JOIN parents  p ON p.id = pp.parent_id
		   JOIN children c ON c.id = pp.child_id`
	);
	return c.json({ success: true, data: rels });
});

// ── GET /api/internal/stats ──────────────────────────────────
// النسخة القديمة: 6 استعلامات منفصلة. هنا استعلامان.
internal.get('/stats', async (c) => {
	const [counts, activity] = await Promise.all([
		getOne<{
			total_parents: number;
			frozen_parents: number;
			total_children: number;
			frozen_children: number;
		}>(
			c.env.DB,
			`SELECT (SELECT COUNT(*) FROM parents)                      AS total_parents,
			        (SELECT COUNT(*) FROM parents  WHERE is_frozen = 1) AS frozen_parents,
			        (SELECT COUNT(*) FROM children)                     AS total_children,
			        (SELECT COUNT(*) FROM children WHERE is_frozen = 1) AS frozen_children`
		),
		getOne<{ total_stars: number; total_activities: number }>(
			c.env.DB,
			`SELECT (SELECT COALESCE(SUM(total_stars), 0) FROM child_progress) AS total_stars,
			        (SELECT COUNT(*) FROM activity_logs)                       AS total_activities`
		),
	]);

	return c.json({
		success: true,
		data: {
			totalParents: counts?.total_parents ?? 0,
			totalChildren: counts?.total_children ?? 0,
			frozenParents: counts?.frozen_parents ?? 0,
			frozenChildren: counts?.frozen_children ?? 0,
			totalStars: activity?.total_stars ?? 0,
			totalActivities: activity?.total_activities ?? 0,
		},
	});
});

// ── PUT /api/internal/parents/:id ────────────────────────────
internal.put('/parents/:id', async (c) => {
	const id = idParam(c);
	if (id === null) return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const updates: string[] = [];
	const params: SqlParam[] = [];
	if (body.name !== undefined) {
		updates.push('name = ?');
		params.push(String(body.name));
	}
	if (body.email !== undefined) {
		updates.push('email = ?');
		params.push(String(body.email));
	}
	if (body.is_frozen !== undefined) {
		updates.push('is_frozen = ?');
		params.push(body.is_frozen ? 1 : 0);
	}

	if (!updates.length) {
		return c.json({ success: false, error: 'لا توجد بيانات', code: 'NO_UPDATE' }, 400);
	}

	updates.push("updated_at = datetime('now')");
	params.push(id);

	await run(c.env.DB, `UPDATE parents SET ${updates.join(', ')} WHERE id = ?`, params);
	await logAudit(c.env.DB, clientIp(c), 'update_parent', 'parent', id, {
		fields: Object.keys(body),
	});
	return c.json({ success: true, message: 'تم التحديث' });
});

// ── PUT /api/internal/children/:id ───────────────────────────
internal.put('/children/:id', async (c) => {
	const id = idParam(c);
	if (id === null) return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const updates: string[] = [];
	const params: SqlParam[] = [];
	if (body.name !== undefined) {
		updates.push('name = ?');
		params.push(String(body.name));
	}
	if (body.age !== undefined) {
		updates.push('age = ?');
		params.push(parseInt(String(body.age), 10));
	}
	if (body.is_frozen !== undefined) {
		updates.push('is_frozen = ?');
		params.push(body.is_frozen ? 1 : 0);
	}

	if (!updates.length) {
		return c.json({ success: false, error: 'لا توجد بيانات', code: 'NO_UPDATE' }, 400);
	}

	updates.push("updated_at = datetime('now')");
	params.push(id);

	await run(c.env.DB, `UPDATE children SET ${updates.join(', ')} WHERE id = ?`, params);
	await logAudit(c.env.DB, clientIp(c), 'update_child', 'child', id, { fields: Object.keys(body) });
	return c.json({ success: true, message: 'تم التحديث' });
});

// ── DELETE /api/internal/parents/:id ────────────────────────
internal.delete('/parents/:id', async (c) => {
	const parentId = idParam(c);
	if (parentId === null) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const parent = await getOne<{ id: number; name: string }>(
		c.env.DB,
		'SELECT id, name FROM parents WHERE id = ?',
		[parentId]
	);
	if (!parent) {
		return c.json({ success: false, error: 'ولي الأمر غير موجود', code: 'NOT_FOUND' }, 404);
	}

	const children = await getAll<{ id: number; name: string }>(
		c.env.DB,
		'SELECT id, name FROM children WHERE parent_id = ?',
		[parentId]
	);

	await c.env.DB.batch([
		...children.flatMap((child) => childCleanupStatements(c.env.DB, child.id)),
		prep(c.env.DB, 'DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [
			parentId,
			'parent',
		]),
		prep(c.env.DB, 'DELETE FROM parent_permissions WHERE parent_id = ?', [parentId]),
		prep(c.env.DB, 'DELETE FROM parents            WHERE id = ?', [parentId]),
	]);

	const childInfo = children.length
		? ` وأطفاله: ${children.map((ch) => ch.name).join(', ')}`
		: ' (لا يوجد أطفال)';

	await logAudit(c.env.DB, clientIp(c), 'delete_parent', 'parent', parentId, {
		name: parent.name,
		children_count: children.length,
	});

	return c.json({
		success: true,
		message: `✅ تم حذف ولي الأمر "${parent.name}"${childInfo}. المحذوفات: ${children.length} طفل وجميع إحصائياتهم.`,
	});
});

// ── DELETE /api/internal/children/:id ───────────────────────
internal.delete('/children/:id', async (c) => {
	const childId = idParam(c);
	if (childId === null) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const child = await getOne<{ id: number; name: string }>(
		c.env.DB,
		'SELECT id, name FROM children WHERE id = ?',
		[childId]
	);
	if (!child) {
		return c.json({ success: false, error: 'الطفل غير موجود', code: 'NOT_FOUND' }, 404);
	}

	await c.env.DB.batch(childCleanupStatements(c.env.DB, childId));
	await logAudit(c.env.DB, clientIp(c), 'delete_child', 'child', childId, { name: child.name });

	return c.json({
		success: true,
		message: `✅ تم حذف الطفل "${child.name}" وجميع بياناته وإحصائياته`,
	});
});

// ── تجميد / رفع التجميد ──────────────────────────────────────
const freezeRoutes: [string, string, number, string, string][] = [
	['/parents/:id/freeze', 'parents', 1, 'freeze_parent', 'تم تجميد الحساب'],
	['/parents/:id/unfreeze', 'parents', 0, 'unfreeze_parent', 'تم رفع التجميد'],
	['/children/:id/freeze', 'children', 1, 'freeze_child', 'تم تجميد حساب الطفل'],
	['/children/:id/unfreeze', 'children', 0, 'unfreeze_child', 'تم رفع تجميد الطفل'],
];

for (const [path, table, value, action, message] of freezeRoutes) {
	internal.put(path, async (c) => {
		const id = idParam(c);
		if (id === null) {
			return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
		}
		await run(c.env.DB, `UPDATE ${table} SET is_frozen = ? WHERE id = ?`, [value, id]);
		await logAudit(c.env.DB, clientIp(c), action, table === 'parents' ? 'parent' : 'child', id, {});
		return c.json({ success: true, message });
	});
}

// ── GET /api/internal/audit ──────────────────────────────────
internal.get('/audit', async (c) => {
	const logs = await getAll(
		c.env.DB,
		`SELECT * FROM admin_audit ORDER BY ts DESC LIMIT ${AUDIT_LIMIT}`
	);
	return c.json({ success: true, data: logs });
});

export default internal;
