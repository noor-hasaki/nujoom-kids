// src/routes/ai.routes.js — بروكسي نجّوم للذكاء الاصطناعي

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const { authenticate } = require('../middleware/auth');

const GROQ_URL      = 'https://api.groq.com/openai/v1/chat/completions';
const AI_PROXY_URL  = process.env.AI_PROXY_URL || GROQ_URL;
const AI_WORKER_KEY = process.env.AI_WORKER_KEY || '';
const MODEL         = 'llama-3.3-70b-versatile';

// Rate limit: 30 طلبات لكل IP كل 15 دقيقة
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: {
        success: false,
        error: 'طلبات كثيرة جداً، حاول مرة أخرى بعد قليل',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// POST /api/ai/chat — يتطلب تسجيل دخول + rate limit
router.post('/chat', aiLimiter, authenticate, async (req, res) => {
    try {
        // Read key at request time so dotenv is guaranteed to be loaded
        const usingProxy = !!process.env.AI_PROXY_URL;
        const GROQ_API_KEY = process.env.GROQ_API_KEY;

        if (!usingProxy && !GROQ_API_KEY) {
            console.error('Neither AI_PROXY_URL nor GROQ_API_KEY is set');
            return res.status(500).json({ success: false, error: 'AI not configured on server' });
        }

        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, error: 'messages مطلوب كمصفوفة' });
        }

        const headers = { 'Content-Type': 'application/json' };
        if (usingProxy) {
            headers['X-Worker-Key'] = AI_WORKER_KEY;
        } else {
            headers['Authorization'] = `Bearer ${GROQ_API_KEY}`;
        }

        const groqRes = await fetch(AI_PROXY_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model:       MODEL,
                messages:    messages,
                max_tokens:  1024,
                temperature: 0.7,
                top_p:       0.9
            })
        });

        if (!groqRes.ok) {
            const rawBody = await groqRes.text().catch(() => '');
            console.error('Groq API error:', groqRes.status, 'body:', rawBody);
            const err = (() => { try { return JSON.parse(rawBody); } catch { return {}; } })();
            return res.status(groqRes.status).json({
                success: false,
                error:   err?.error?.message || `HTTP ${groqRes.status}`
            });
        }

        const data = await groqRes.json();
        return res.json({ success: true, data });

    } catch (e) {
        console.error('AI proxy error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;