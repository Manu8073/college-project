import express from 'express';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = express.Router();
let ai = null;
if (config.geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

// Circuit Breaker State
const cb = {
    failures: 0,
    lastFailureTime: 0,
    openUntil: 0,
    isOpen() { return Date.now() < this.openUntil; },
    recordFailure() {
        const now = Date.now();
        if (now - this.lastFailureTime > 30000) this.failures = 0; // Reset after 30s of peace
        this.failures++;
        this.lastFailureTime = now;
        if (this.failures >= 3) {
            this.openUntil = now + 20000; // Open for 20s
            this.failures = 0; // Reset for next cycle
            console.warn('[CIRCUIT BREAKER] Opened for 20s due to consecutive Gemini failures.');
        }
    },
    recordSuccess() {
        this.failures = 0;
    }
};

// LRU Cache
class SimpleCache {
    constructor(maxSize, ttlMs) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const item = this.cache.get(key);
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }
    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
    }
}
const routeCache = new SimpleCache(50, 60000); // 60s TTL
const polishCache = new SimpleCache(50, 30000); // 30s TTL

const MODEL_FAST = 'gemini-2.5-flash-lite';
const MODEL_MAIN = 'gemini-2.5-flash';

router.post('/route', async (req, res, next) => {
    try {
        const { query } = req.body;
        if (!query) throw new ApiError(400, 'MISSING_QUERY', 'Query is required.');
        
        const cacheKey = query.toLowerCase().trim();
        const cached = routeCache.get(cacheKey);
        if (cached) return res.json(cached);

        if (!ai || cb.isOpen()) {
            return res.json({ intent: 'general_question', confidence: 0, cleaned_query: query, needs_camera: false, parameters: {} });
        }

        const schema = {
            type: Type.OBJECT,
            properties: {
                intent: { type: Type.STRING, enum: ['read_text', 'detect_objects', 'check_money', 'navigate', 'describe_scene', 'general_question', 'chit_chat', 'stop', 'repeat', 'help'] },
                confidence: { type: Type.NUMBER },
                cleaned_query: { type: Type.STRING },
                needs_camera: { type: Type.BOOLEAN },
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        target_object: { type: Type.STRING },
                        destination: { type: Type.STRING },
                        language: { type: Type.STRING }
                    }
                }
            },
            required: ['intent', 'confidence', 'cleaned_query', 'needs_camera']
        };

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: [{ role: 'user', parts: [{ text: `Map this query to an intent: "${query}"` }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                temperature: 0,
                maxOutputTokens: 150
            }
        });

        cb.recordSuccess();
        const result = JSON.parse(response.text);
        routeCache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        cb.recordFailure();
        console.error('Route error:', error);
        res.json({ intent: 'general_question', confidence: 0, cleaned_query: req.body.query, needs_camera: false, parameters: {} });
    }
});

router.post('/polish', async (req, res, next) => {
    try {
        const { raw_data, cleaned_query } = req.body;
        if (!raw_data) throw new ApiError(400, 'MISSING_DATA', 'Raw data is required.');

        const cacheKey = JSON.stringify({ raw_data, cleaned_query });
        const cached = polishCache.get(cacheKey);
        if (cached) return res.json(cached);

        if (!ai || cb.isOpen()) {
            // Local fallback
            const fallback = { spoken: String(raw_data).substring(0, 100), display: String(raw_data).substring(0, 100), priority: 'normal' };
            return res.json(fallback);
        }

        const schema = {
            type: Type.OBJECT,
            properties: {
                spoken: { type: Type.STRING },
                display: { type: Type.STRING },
                follow_up: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['normal', 'warning'] }
            },
            required: ['spoken', 'display', 'priority']
        };

        const systemPrompt = `You are NETRA, a calm, concise voice assistant for a blind user. Convert the raw data into a spoken answer. Rules: max 2 short sentences unless reading text aloud; lead with the most important/safety info; use clock positions or left/right/ahead and approximate distances; never mention confidence scores, models, JSON or technical terms; for money say denomination and currency clearly; for navigation give one clear action first; if unsure, say so honestly. No markdown, no emojis, no lists.`;

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nQuery: ${cleaned_query}\nRaw Data: ${JSON.stringify(raw_data)}` }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                temperature: 0,
                maxOutputTokens: 200
            }
        });

        cb.recordSuccess();
        const result = JSON.parse(response.text);
        polishCache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        cb.recordFailure();
        console.error('Polish error:', error);
        res.json({ spoken: String(req.body.raw_data).substring(0, 100), display: String(req.body.raw_data).substring(0, 100), priority: 'normal' });
    }
});

router.post('/ask', async (req, res, next) => {
    // Keeping this for backward compatibility or general questions
    try {
        const { query, imageBase64 } = req.body;
        if (!query) throw new ApiError(400, 'MISSING_QUERY', 'Query is required.');
        if (!ai || cb.isOpen()) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Backend offline.');

        const parts = [{ text: `Answer concisely for a blind user: ${query}` }];
        if (imageBase64) {
            parts.push({
                inlineData: {
                    data: imageBase64.split(',')[1] || imageBase64,
                    mimeType: imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
                }
            });
        }

        const response = await ai.models.generateContentStream({
            model: MODEL_MAIN,
            contents: [{ role: 'user', parts }]
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of response.stream) {
            cb.recordSuccess();
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
    } catch (error) {
        cb.recordFailure();
        console.error('Ask error:', error);
        next(error);
    }
});

export default router;
