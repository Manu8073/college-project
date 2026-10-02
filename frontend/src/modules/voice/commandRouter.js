/**
 * NETRA — Voice Command Router
 * ─────────────────────────────────────────────────────────────
 * Maps a spoken transcript to an intent. Deliberately simple
 * substring matching rather than an ML intent classifier — at this
 * vocabulary size (a handful of commands) that would add latency and
 * a dependency for no real accuracy gain. Extend the pattern lists
 * as new commands are needed; don't rewrite the mechanism.
 */

export const INTENT = {
    READ_TEXT: 'read_text',
    CHECK_CURRENCY: 'check_currency',
    REPEAT: 'repeat',
    STOP: 'stop',
    UNKNOWN: 'unknown',
};

const COMMANDS = [
    {
        intent: INTENT.READ_TEXT,
        patterns: ['read this', 'read the text', 'read text', "what's this say", 'what does this say', 'what is this'],
    },
    {
        intent: INTENT.CHECK_CURRENCY,
        patterns: ['what currency', 'what note', 'how much is this', 'what money', 'check currency', 'currency'],
    },
    {
        intent: INTENT.REPEAT,
        patterns: ['repeat', 'say that again', 'say again', 'what did you say'],
    },
    {
        intent: INTENT.STOP,
        patterns: ['stop', 'cancel', 'quiet', 'be quiet', 'shut up'],
    },
];

/**
 * @param {string} transcript
 * @returns {{ intent: string, raw: string }}
 */
export function routeCommand(transcript) {
    const lower = (transcript || '').toLowerCase().trim();
    if (!lower) return { intent: INTENT.UNKNOWN, raw: transcript };

    const match = COMMANDS.find((c) => c.patterns.some((pattern) => lower.includes(pattern)));
    return { intent: match ? match.intent : INTENT.UNKNOWN, raw: transcript };
}
