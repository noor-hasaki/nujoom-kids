// src/db.ts — طبقة D1، بديلة لـ database/db.js القديمة
//
// فرق مقصود عن النسخة القديمة: هذه الدوال **لا تبتلع الأخطاء**.
// القديمة كانت ترجع null/[] عند أي خطأ SQL، فتظهر المشكلة كـ "لا توجد بيانات"
// بدل أن تُرفع كخطأ — وهذا بالضبط نوع الصمت الذي أخفى ضياع البيانات سابقاً.
// هنا نترك الخطأ يصعد إلى معالج الأخطاء العام في index.ts.

export type SqlParam = string | number | null;

function stmt(db: D1Database, sql: string, params: SqlParam[]): D1PreparedStatement {
	const prepared = db.prepare(sql);
	return params.length ? prepared.bind(...params) : prepared;
}

/** صف واحد أو null */
export async function getOne<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	params: SqlParam[] = []
): Promise<T | null> {
	return await stmt(db, sql, params).first<T>();
}

/** كل الصفوف */
export async function getAll<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	params: SqlParam[] = []
): Promise<T[]> {
	const { results } = await stmt(db, sql, params).all<T>();
	return results ?? [];
}

/** تنفيذ INSERT/UPDATE/DELETE — يعيد معرّف آخر إدراج وعدد الصفوف المتأثرة */
export async function run(
	db: D1Database,
	sql: string,
	params: SqlParam[] = []
): Promise<{ lastInsertRowid: number | null; changes: number }> {
	const { meta } = await stmt(db, sql, params).run();
	return {
		lastInsertRowid: meta.last_row_id ?? null,
		changes: meta.changes ?? 0,
	};
}

/**
 * بديل transaction() القديمة.
 * D1 لا يدعم المعاملات التفاعلية (لا BEGIN/COMMIT حول منطق JS) — البديل هو
 * batch() الذي ينفّذ قائمة جاهزة من الجمل في معاملة ضمنية واحدة.
 * لذلك أي منطق كان يقرأ *داخل* المعاملة ليقرر ماذا يكتب، يجب أن يقرأ أولاً
 * ثم يبني القائمة، ثم يستدعي هذه الدالة.
 */
export async function batch(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
	if (!statements.length) return;
	await db.batch(statements);
}

/** مساعد لبناء جملة جاهزة تُمرَّر إلى batch() */
export function prep(db: D1Database, sql: string, params: SqlParam[] = []): D1PreparedStatement {
	return stmt(db, sql, params);
}
