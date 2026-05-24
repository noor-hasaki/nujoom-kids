// src/controllers/chat.controller.js — قراءة محادثات نجوم (للأهل وللطفل)

const { getOne, getAll } = require('../database/db');

const MAX_SESSIONS_PER_LIST = 100;
const MAX_MESSAGES_PER_SESSION = 500;

// ── يجلب جلسات طفل معين (مع معاينة أول سؤال) ───────────────
function listSessionsForChild(childId) {
    return getAll(
        `SELECT s.id,
                s.started_at,
                s.last_message_at,
                s.message_count,
                (SELECT COUNT(*) FROM ai_chat_messages m
                  WHERE m.session_id = s.id AND m.role = 'user')      AS user_message_count,
                (SELECT m.content
                   FROM ai_chat_messages m
                  WHERE m.session_id = s.id AND m.role = 'user'
                  ORDER BY m.id ASC LIMIT 1)                          AS first_user_message
           FROM ai_chat_sessions s
          WHERE s.child_id = ?
          ORDER BY s.last_message_at DESC
          LIMIT ${MAX_SESSIONS_PER_LIST}`,
        [childId]
    );
}

function listMessagesForSession(sessionId) {
    return getAll(
        `SELECT id, role, content, created_at
           FROM ai_chat_messages
          WHERE session_id = ?
          ORDER BY id ASC
          LIMIT ${MAX_MESSAGES_PER_SESSION}`,
        [sessionId]
    );
}

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children/:childId/chats
// (passed requireChildOwnership → parent owns the child)
// ══════════════════════════════════════════════════════════════
function listChildSessionsForParent(req, res) {
    const childId = req.childId; // set by requireChildOwnership
    const sessions = listSessionsForChild(childId);
    return res.json({ success: true, data: sessions });
}

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children/:childId/chats/:sessionId
// ══════════════════════════════════════════════════════════════
function getSessionMessagesForParent(req, res) {
    const childId   = req.childId;
    const sessionId = parseInt(req.params.sessionId);

    if (!Number.isInteger(sessionId)) {
        return res.status(400).json({ success: false, error: 'sessionId غير صالح', code: 'BAD_REQUEST' });
    }

    const session = getOne(
        'SELECT id, child_id, started_at, last_message_at, message_count FROM ai_chat_sessions WHERE id = ?',
        [sessionId]
    );
    if (!session || session.child_id !== childId) {
        return res.status(404).json({ success: false, error: 'الجلسة غير موجودة', code: 'NOT_FOUND' });
    }

    const messages = listMessagesForSession(sessionId);
    return res.json({ success: true, data: { session, messages } });
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/me/chats   (طفل يقرأ جلساته)
// ══════════════════════════════════════════════════════════════
function listMyChildSessions(req, res) {
    const childId = req.user.id;
    const sessions = listSessionsForChild(childId);
    return res.json({ success: true, data: sessions });
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/me/chats/:sessionId   (طفل يقرأ رسائل جلسة)
// ══════════════════════════════════════════════════════════════
function getMySessionMessages(req, res) {
    const childId   = req.user.id;
    const sessionId = parseInt(req.params.sessionId);

    if (!Number.isInteger(sessionId)) {
        return res.status(400).json({ success: false, error: 'sessionId غير صالح', code: 'BAD_REQUEST' });
    }

    const session = getOne(
        'SELECT id, child_id, started_at, last_message_at, message_count FROM ai_chat_sessions WHERE id = ?',
        [sessionId]
    );
    if (!session || session.child_id !== childId) {
        return res.status(404).json({ success: false, error: 'الجلسة غير موجودة', code: 'NOT_FOUND' });
    }

    const messages = listMessagesForSession(sessionId);
    return res.json({ success: true, data: { session, messages } });
}

module.exports = {
    listChildSessionsForParent,
    getSessionMessagesForParent,
    listMyChildSessions,
    getMySessionMessages,
};
