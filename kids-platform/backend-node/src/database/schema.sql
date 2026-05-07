-- =============================================
-- schema.sql — قاعدة بيانات منصة الأطفال التعليمية
-- =============================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─── جدول الأهل ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,          -- bcrypt hash (saltRounds: 12)
    is_frozen   INTEGER DEFAULT 0,      -- 0 = نشط, 1 = مجمّد بواسطة Admin
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── جدول الأطفال ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS children (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    age         INTEGER NOT NULL CHECK(age >= 3 AND age <= 12),
    gender      TEXT CHECK(gender IN ('boy', 'girl')) NOT NULL,
    pin                 TEXT NOT NULL,  -- bcrypt hash لـ PIN من 4 أرقام
    avatar_id           INTEGER DEFAULT 1,
    join_date           TEXT DEFAULT (date('now')),
    is_frozen           INTEGER DEFAULT 0,
    failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until        INTEGER,        -- unix ms, NULL = unlocked
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- ─── جدول تقدم الطفل ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS child_progress (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER UNIQUE NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    total_stars     INTEGER DEFAULT 0,
    stories_read    INTEGER DEFAULT 0,
    words_learned   INTEGER DEFAULT 0,
    games_score     INTEGER DEFAULT 0,
    drawings_saved  INTEGER DEFAULT 0,
    math_stars      INTEGER DEFAULT 0,
    total_time_min  INTEGER DEFAULT 0,
    last_active     TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ─── جدول سجل الأنشطة ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    activity_type   TEXT NOT NULL CHECK(activity_type IN (
                        'arabic_letters','english_letters','stories',
                        'games','math','vocabulary','drawing','certificate'
                    )),
    stars_earned    INTEGER DEFAULT 0,
    score           INTEGER DEFAULT 0,
    duration_min    INTEGER DEFAULT 0,
    metadata        TEXT DEFAULT '{}',
    completed_at    TEXT DEFAULT (datetime('now'))
);

-- ─── جدول الإنجازات ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id        INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    achievement_id  TEXT NOT NULL,
    earned_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(child_id, achievement_id)
);

-- ─── جدول صلاحيات الأهل ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_permissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    child_id        INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    can_view_stats  INTEGER DEFAULT 1,
    can_edit_child  INTEGER DEFAULT 1,
    can_enter_mode  INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(parent_id, child_id)
);

-- ─── جدول Refresh Tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    user_type   TEXT NOT NULL CHECK(user_type IN ('parent', 'child')),
    token       TEXT UNIQUE NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── جدول رسومات الأطفال (إضافة جديدة) ──────────────────────
CREATE TABLE IF NOT EXISTS drawings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id    INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    title       TEXT DEFAULT 'رسمة جديدة',
    image_data  TEXT NOT NULL,          -- Base64 PNG
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── جدول سجل أعمال الأدمين ──────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    ip          TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   INTEGER,
    details     TEXT
);

-- ─── Indexes للأداء ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_children_parent    ON children(parent_id);
CREATE INDEX IF NOT EXISTS idx_activity_child     ON activity_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_activity_type      ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_achievements_child ON achievements(child_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token      ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_drawings_child     ON drawings(child_id);
