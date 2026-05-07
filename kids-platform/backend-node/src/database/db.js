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