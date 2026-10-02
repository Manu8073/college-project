import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = express.Router();

let ai = null;
if (config.geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/**
 * Detect from phrasing if user wants a brief or detailed answer.
 * Examples: "briefly", "in short", "quick" → short
 *           "explain", "tell me more", "describe", "in detail" → detailed
 */
function detectResponseStyle(query) {
    const lower = query.toLowerCase();
    const wantsShort = /\b(brief|briefly|quick|quickly|short|in short|just tell me|summary|simple|simply|one line|tldr)\b/.test(lower);
    const wantsDetailed = /\b(explain|describe|detail|detailed|tell me more|elaborate|in depth|full|fully|why|how does|what is the reason)\b/.test(lower);
    if (wantsShort) return 'short';
    if (wantsDetailed) return 'detailed';
    // Default: medium — 1-3 sentences, natural spoken length
    return 'medium';
}

router.post('/ask', async (req, res, next) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== 'string' || !query.trim()) {
            throw new ApiError(400, 'MISSING_QUERY', 'Query is required.');
        }

        if (!ai) {
            throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Gemini AI is not configured. Please add your GEMINI_API_KEY.');
        }

        const style = detectResponseStyle(query);

        const lengthInstruction = {
            short:    'Give a single concise sentence answer. No filler, no preamble.',
            medium:   'Give a clear answer in 1 to 3 sentences. Be direct and natural.',
            detailed: 'Give a thorough explanation in 3 to 6 sentences. Cover the key points clearly.',
        }[style];

        const systemPrompt = `You are NETRA, a smart voice assistant built for visually impaired users in India.
Rules you must follow strictly:
- ${lengthInstruction}
- Never start with filler phrases like "Certainly!", "Of course!", "Sure!", "Great question!", "Absolutely!" or similar.
- Do not repeat the user's question back to them.
- Answer directly. Start immediately with the answer content.
- Use natural spoken language — avoid bullet points, markdown, asterisks, hashtags, or formatted lists.
- Numbers should be spoken naturally (e.g., "twenty-three" not "23") when they appear in short answers.
- If you don't know something or it requires real-time data (live weather, stock prices), say so briefly and suggest how the user can find out.
- Keep a warm, calm, helpful tone.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: systemPrompt + '\n\nUser asked: ' + query.trim() }] },
            ],
        });

        // Clean up any accidental markdown that Gemini might still sneak in
        let answer = (response.text ?? '').trim();
        answer = answer
            .replace(/\*\*/g, '')      // remove bold markers
            .replace(/\*/g, '')        // remove italic markers
            .replace(/#{1,6}\s/g, '')  // remove headings
            .replace(/`/g, '')         // remove code ticks
            .replace(/\n{2,}/g, ' ')   // collapse double newlines
            .replace(/\n/g, ' ')       // collapse single newlines
            .trim();

        if (!answer) {
            throw new ApiError(500, 'EMPTY_RESPONSE', 'No answer was generated.');
        }

        res.json({
            success: true,
            answer,
            style, // expose for frontend debug if needed
        });
    } catch (error) {
        next(error);
    }
});

export default router;
