const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database.db');

let db;

async function initDB() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.run(schema);

    // Migrations for existing databases — safe to re-run (errors = column already exists)
    const migrations = [
        'ALTER TABLE children ADD COLUMN failed_pin_attempts INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE children ADD COLUMN locked_until INTEGER',
    ];
    for (const mig of migrations) {
        try { db.run(mig); } catch (_) {}
    }

    // M2: Add 'islamic' to activity_logs CHECK constraint if not already there
    try {
        const _stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activity_logs'");
        let _rowSql = null;
        if (_stmt.step()) _rowSql = _stmt.getAsObject().sql;
        _stmt.free();
        if (_rowSql && !_rowSql.includes("'islamic'")) {
            db.run(`CREATE TABLE activity_logs_v2 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
                activity_type TEXT NOT NULL CHECK(activity_type IN (
                                  'arabic_letters','english_letters','stories',
                                  'games','math','vocabulary','drawing','certificate','islamic'
                              )),
                stars_earned  INTEGER DEFAULT 0,
                score         INTEGER DEFAULT 0,
                duration_min  INTEGER DEFAULT 0,
                metadata      TEXT DEFAULT '{}',
                completed_at  TEXT DEFAULT (datetime('now'))
            )`);
            db.run('INSERT INTO activity_logs_v2 SELECT * FROM activity_logs');
            db.run('DROP TABLE activity_logs');
            db.run('ALTER TABLE activity_logs_v2 RENAME TO activity_logs');
            db.run('CREATE INDEX IF NOT EXISTS idx_activity_child ON activity_logs(child_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_activity_type  ON activity_logs(activity_type)');
            console.log("✅ Migration M2: activity_logs constraint updated ('islamic' added)");
        }
    } catch (e) {
        console.error('Migration M2 error:', e.message);
    }

    // حفظ تلقائي كل 5 ثوانٍ
    setInterval(saveDB, 5000);

    console.log('✅ SQLite متصل:', DB_PATH);
    return db;
}

function saveDB() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDB() { return db; }

function getOne(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    } catch(e) { console.error('getOne error:', e.message); return null; }
}

function getAll(sql, params = []) {
    try {
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
    } catch(e) { console.error('getAll error:', e.message); return []; }
}

function run(sql, params = []) {
    try {
        db.run(sql, params);
        const res = db.exec('SELECT last_insert_rowid()');
        return { lastInsertRowid: res[0]?.values[0][0] || null };
    } catch(e) { console.error('run error:', e.message); throw e; }
}

function transaction(fn) {
    db.run('BEGIN');
    try {
        const result = fn();
        db.run('COMMIT');
        saveDB();
        return result;
    } catch(e) {
        db.run('ROLLBACK');
        throw e;
    }
}

module.exports = { initDB, getDB, getOne, getAll, run, transaction, saveDB };