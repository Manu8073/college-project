/**
 * NETRA — Frontend Assistant Service
 * ─────────────────────────────────────────────────────────────
 * Sends a free-form text query to the NETRA backend, which
 * forwards it to Gemini AI and returns a spoken-friendly answer.
 *
 * Used by VoiceAssistantButton for any command that doesn't match
 * a local intent (READ_TEXT, CHECK_CURRENCY, etc.) — i.e. general
 * questions like "what's the weather?", "who is the PM?", etc.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:5001';

/**
 * Ask Gemini AI a free-form question via the NETRA backend.
 * @param {string} query - The user's spoken query text
 * @returns {Promise<string>} - The AI answer text
 * @throws {Error} - If the network or backend fails
 */
export async function askAssistant(query) {
    const response = await fetch(`${BACKEND_URL}/api/assistant/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        let message = `Assistant error (${response.status})`;
        try {
            const data = await response.json();
            if (data.message) message = data.message;
        } catch { /* ignore JSON parse errors */ }
        throw new Error(message);
    }

    const data = await response.json();
    if (!data.success || !data.answer) {
        throw new Error('No answer received from the assistant.');
    }
    return data.answer;
}
