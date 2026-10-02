

// ─── Configuration ─────────────────────────────────────────────

export const TEXT_DETECTION_CONFIG = {
    /** Full URL (or path) of the future PaddleOCR endpoint. Placeholder path until agreed. */
    apiUrl: import.meta.env.VITE_TEXT_DETECTION_API_URL || '/api/text-detection',

    /** Mock mode stays ON unless VITE_TEXT_DETECTION_MOCK is exactly "false". */
    mockMode: import.meta.env.VITE_TEXT_DETECTION_MOCK !== 'false',

    /** Give up on a request after this many milliseconds. */
    timeoutMs: 15000,

    /** Name of the multipart form field that carries the image. */
    fieldName: 'image',

    /** How captured frames are encoded before upload. */
    frame: {
        maxWidth: 1280,          // larger frames are scaled down (smaller upload)
        mimeType: 'image/jpeg',
        quality: 0.85,
    },
};

// ─── Types ─────────────────────────────────────────────────────

/**
 * @typedef {object} TextLine
 * @property {string}          text
 * @property {number|null}     confidence — 0.0–1.0, or null if the API gave none
 * @property {number[][]|null} box        — bounding polygon [[x,y],…], or null
 */

/**
 * The clean result every caller works with. `text`, `confidence` and
 * `language` match the shared OCR event payload in shared/contracts.
 *
 * @typedef {object} TextDetectionResult
 * @property {string}      text       — all lines joined with "\n" ('' if no text found)
 * @property {TextLine[]}  lines
 * @property {number|null} confidence — average of line confidences, or null
 * @property {string|null} language   — e.g. "en", or null if unknown
 * @property {boolean}     isMock     — true when this is sample data, NOT real OCR
 * @property {string}      timestamp  — ISO 8601
 */

// ─── Errors ────────────────────────────────────────────────────

/**
 * Error thrown by every function in this file. `message` is written
 * for the end user; `code` is for logic.
 *
 * codes: CAMERA_NOT_READY | CAPTURE_FAILED | NO_IMAGE | NETWORK |
 *        TIMEOUT | HTTP | SERVICE | BAD_RESPONSE | ABORTED
 */
export class TextDetectionError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = 'TextDetectionError';
        this.code = code;
    }
}

// ─── Frame capture ─────────────────────────────────────────────

/**
 * Grabs the current frame of a playing <video> element as an image Blob.
 * The video element comes from the existing useCamera() hook.
 *
 * @param {HTMLVideoElement|null} video
 * @param {Partial<typeof TEXT_DETECTION_CONFIG.frame>} [options]
 * @returns {Promise<Blob>}
 * @throws {TextDetectionError} CAMERA_NOT_READY | CAPTURE_FAILED
 */
export function captureFrame(video, options = {}) {
    const { maxWidth, mimeType, quality } = { ...TEXT_DETECTION_CONFIG.frame, ...options };

    return new Promise((resolve, reject) => {
        // readyState 2 = the video has at least one frame to draw
        if (!video || video.readyState < 2 || !video.videoWidth) {
            reject(new TextDetectionError(
                'CAMERA_NOT_READY',
                'The camera is not ready. Start the camera and try again.'
            ));
            return;
        }

        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new TextDetectionError('CAPTURE_FAILED', 'Could not capture an image from the camera.'));
            },
            mimeType,
            quality
        );
    });
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Detects text in an image.
 * Uses the mock in mock mode, otherwise calls the PaddleOCR API.
 *
 * Loading state is handled by the caller (show a spinner while this
 * promise is pending). Failures are thrown as TextDetectionError.
 *
 * @param {Blob} image — usually the result of captureFrame()
 * @param {object}      [options]
 * @param {AbortSignal} [options.signal] — abort to cancel an in-flight request
 * @param {boolean}     [options.mock]   — override TEXT_DETECTION_CONFIG.mockMode
 * @returns {Promise<TextDetectionResult>}
 * @throws {TextDetectionError}
 */
export async function detectText(image, { signal, mock = TEXT_DETECTION_CONFIG.mockMode } = {}) {
    if (mock) return mockDetectText(signal);
    return requestTextDetection(image, signal);
}

/**
 * Returns the string that should be read aloud for a result.
 * Produces natural, Indian-English announcements suitable for a blind user.
 *
 * @param {TextDetectionResult|null} result
 * @returns {string} '' when there is nothing to read
 */
export function describeTextDetection(result) {
    if (!result?.text) return '';

    // Join lines with a natural pause separator
    const lines = result.lines
        ?.filter(l => l.text)
        .map(l => l.text.trim())
        ?? [result.text.trim()];

    // Read each line with a short comma-pause between them
    const spoken = lines.join(', ');
    return spoken;
}

// ─── Real API call (PaddleOCR — not connected yet) ─────────────

/**
 * POSTs the image to the configured API and normalizes the response.
 * @param {Blob} image
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<TextDetectionResult>}
 */
async function requestTextDetection(image, externalSignal) {
    if (!(image instanceof Blob)) {
        throw new TextDetectionError('NO_IMAGE', 'No image was provided for text detection.');
    }

    // One controller handles both the timeout and the caller's abort signal
    const controller = new AbortController();
    let timedOut = false;

    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, TEXT_DETECTION_CONFIG.timeoutMs);

    const forwardAbort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener('abort', forwardAbort);

    try {
        const response = await fetch(
            TEXT_DETECTION_CONFIG.apiUrl,
            buildRequest(image, controller.signal)
        );

        if (!response.ok) {
            throw new TextDetectionError(
                'HTTP',
                `The text detection service returned an error (HTTP ${response.status}).`
            );
        }

        let raw;
        try {
            raw = await response.json();
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            throw new TextDetectionError('BAD_RESPONSE', 'The text detection service sent an unreadable response.');
        }

        return normalizeResponse(raw);
    } catch (err) {
        if (err instanceof TextDetectionError) throw err;

        if (err.name === 'AbortError') {
            throw timedOut
                ? new TextDetectionError('TIMEOUT', 'The text detection service took too long to respond.')
                : new TextDetectionError('ABORTED', 'Text detection was cancelled.');
        }

        throw new TextDetectionError(
            'NETWORK',
            'Could not reach the text detection service. Check your connection and the API URL.'
        );
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', forwardAbort);
    }
}

/**
 * Builds the fetch() options. Change ONLY this function if the real
 * API expects something other than a multipart upload.
 *
 * No Content-Type header on purpose: the browser must set it so the
 * multipart boundary is included. Do not hardcode auth tokens here.
 *
 * @param {Blob} image
 * @param {AbortSignal} signal
 * @returns {RequestInit}
 */
function buildRequest(image, signal) {
    const body = new FormData();
    body.append(TEXT_DETECTION_CONFIG.fieldName, image, 'frame.jpg');
    return { method: 'POST', body, signal };
}

// ─── Response normalization ────────────────────────────────────

/**
 * Turns the API response into a TextDetectionResult.
 * Change ONLY this function if the real PaddleOCR API responds
 * differently.
 *
 * Accepted shapes (either may be wrapped in { success, data }):
 *   { lines: [{ text, confidence, box }], language }
 *   { text: "…", confidence, language }
 *
 * @param {any} raw
 * @returns {TextDetectionResult}
 */
function normalizeResponse(raw) {
    if (raw?.success === false) {
        throw new TextDetectionError('SERVICE', raw.message || 'The text detection service reported a failure.');
    }

    const payload = raw?.data ?? raw;

    if (Array.isArray(payload?.lines)) {
        return buildResult({
            lines: payload.lines.map(normalizeLine).filter(line => line.text),
            language: payload.language,
        });
    }

    if (typeof payload?.text === 'string') {
        return buildResult({
            lines: payload.text
                .split(/\r?\n/)
                .map(text => ({ text: text.trim(), confidence: null, box: null }))
                .filter(line => line.text),
            confidence: toConfidence(payload.confidence),
            language: payload.language,
        });
    }

    throw new TextDetectionError('BAD_RESPONSE', 'The text detection service sent an unexpected response.');
}

/**
 * @param {string|object} line
 * @returns {TextLine}
 */
function normalizeLine(line) {
    const item = typeof line === 'string' ? { text: line } : (line ?? {});
    return {
        text: String(item.text ?? '').trim(),
        confidence: toConfidence(item.confidence),
        box: Array.isArray(item.box) ? item.box : null,
    };
}

/** @returns {number|null} a number clamped to 0–1, or null */
function toConfidence(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : null;
}

/**
 * Assembles the final result object.
 * @param {object}      params
 * @param {TextLine[]}  params.lines
 * @param {number|null} [params.confidence] — overrides the line average
 * @param {string}      [params.language]
 * @param {boolean}     [params.isMock=false]
 * @returns {TextDetectionResult}
 */
function buildResult({ lines, confidence, language, isMock = false }) {
    const scored = lines.filter(line => line.confidence !== null);
    const average = scored.length
        ? scored.reduce((sum, line) => sum + line.confidence, 0) / scored.length
        : null;

    return {
        text: lines.map(line => line.text).join('\n'),
        lines,
        confidence: confidence ?? average,
        language: language ?? null,
        isMock,
        timestamp: new Date().toISOString(),
    };
}

// ─── MOCK MODE ─────────────────────────────────────────────────
// Everything below exists only so the UI can be built and tested
// before PaddleOCR is connected. It ignores the image completely.
// To go live: set VITE_TEXT_DETECTION_MOCK=false. Nothing else in
// this section needs to change or be deleted.

const MOCK_DELAY_MS = 600;

/**
 * Indian-context text samples — realistic signs, boards, and labels
 * a user might encounter in India. Used when the PaddleOCR backend is
 * not connected (VITE_TEXT_DETECTION_MOCK=true).
 */
const MOCK_SAMPLES = [
    // Railway / metro
    [{ text: 'Platform No. 5', confidence: 0.95 }, { text: 'Bengaluru City Junction', confidence: 0.92 }],
    [{ text: 'EMERGENCY EXIT', confidence: 0.97 }],
    [{ text: 'Bandra Terminus', confidence: 0.93 }, { text: 'Coach No. S4', confidence: 0.89 }],
    // Road / traffic
    [{ text: 'STOP', confidence: 0.98 }],
    [{ text: 'No Parking', confidence: 0.91 }, { text: 'Tow Away Zone', confidence: 0.87 }],
    [{ text: 'Speed Limit 40', confidence: 0.94 }],
    // Retail / shops
    [{ text: 'Minimum Balance ₹500', confidence: 0.90 }],
    [{ text: 'Auto Fare ₹25 per km', confidence: 0.88 }],
    [{ text: 'Open 9 AM to 9 PM', confidence: 0.86 }, { text: 'Sunday Holiday', confidence: 0.83 }],
    // Government / public
    [{ text: 'Government Hospital', confidence: 0.95 }, { text: 'OPD Timings 8 AM to 2 PM', confidence: 0.91 }],
    [{ text: 'Swachh Bharat Abhiyan', confidence: 0.89 }],
    [{ text: 'Fire Exit', confidence: 0.96 }, { text: 'Do Not Block', confidence: 0.93 }],
];

let mockIndex = 0;

/**
 * Returns the next sample result after a short simulated delay.
 * @param {AbortSignal} [signal]
 * @returns {Promise<TextDetectionResult>}
 */
async function mockDetectText(signal) {
    await new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timeoutId);
            reject(new TextDetectionError('ABORTED', 'Text detection was cancelled.'));
        };
        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, MOCK_DELAY_MS);

        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
    });

    const sample = MOCK_SAMPLES[mockIndex % MOCK_SAMPLES.length];
    mockIndex += 1;

    return buildResult({
        lines: sample.map(line => ({ ...line, box: null })),
        language: 'en',
        isMock: true,
    });
}