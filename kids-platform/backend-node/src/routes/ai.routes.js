// src/routes/ai.routes.js — بروكسي نجّوم للذكاء الاصطناعي

const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const { authenticate } = require('../middleware/auth');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

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
        const GROQ_API_KEY = process.env.GROQ_API_KEY;

        if (!GROQ_API_KEY) {
            console.error('GROQ_API_KEY is not set in environment variables');
            return res.status(500).json({ success: false, error: 'API key not configured on server' });
        }

        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, error: 'messages مطلوب كمصفوفة' });
        }

        const groqRes = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model:       MODEL,
                messages:    messages,
                max_tokens:  1024,
                temperature: 0.7,
                top_p:       0.9
            })
        });

        if (!groqRes.ok) {
            const err = await groqRes.json().catch(() => ({}));
            console.error('Groq API error:', groqRes.status, err);
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