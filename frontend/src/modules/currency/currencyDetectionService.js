import { captureFrame, TextDetectionError } from '../detection/textDetectionService.js';

export { captureFrame };

export const CURRENCY_DETECTION_CONFIG = {
    apiUrl: import.meta.env.VITE_CURRENCY_DETECTION_API_URL || '/api/currency-detection',
    mockMode: import.meta.env.VITE_CURRENCY_DETECTION_MOCK !== 'false',
    timeoutMs: 15000,
    fieldName: 'image',
};

export class CurrencyDetectionError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'CurrencyDetectionError';
        this.code = code;
    }
}

/**
 * @typedef {object} CurrencyDetectionResult
 * @property {boolean} found
 * @property {string|null} currency
 * @property {string|null} denomination
 * @property {number|null} confidence
 * @property {boolean} isMock
 */

export async function detectCurrency(image, { signal, mock = CURRENCY_DETECTION_CONFIG.mockMode } = {}) {
    if (mock) return mockDetectCurrency(signal);
    return requestCurrencyDetection(image, signal);
}

// ─── Indian-English spoken names for INR denominations ─────────
/**
 * Maps INR denomination strings to their natural spoken-English form.
 * This makes the voice announcement sound natural and clear for
 * a blind Indian user ("Two thousand rupees note" vs "INR 2000").
 */
const INR_SPOKEN = {
    '1':    'One rupee',
    '2':    'Two rupees',
    '5':    'Five rupees',
    '10':   'Ten rupees',
    '20':   'Twenty rupees',
    '50':   'Fifty rupees',
    '100':  'One hundred rupees',
    '200':  'Two hundred rupees',
    '500':  'Five hundred rupees',
    '2000': 'Two thousand rupees',
};

/**
 * Returns a natural, Indian-English spoken announcement for a detected note.
 * Examples:
 *   INR 500   → "Five hundred rupees Indian note"
 *   USD 20    → "Twenty US dollars note"
 *   EUR 10    → "Ten euro note"
 *
 * @param {CurrencyDetectionResult|null} result
 * @returns {string}
 */
export function describeCurrencyDetection(result) {
    if (!result?.found) return '';

    const { currency, denomination, isMock } = result;

    let spoken;
    if (currency === 'INR' && INR_SPOKEN[denomination]) {
        spoken = `${INR_SPOKEN[denomination]} Indian note`;
    } else if (currency === 'USD') {
        spoken = `${denomination} US dollars note`;
    } else {
        // Generic fallback for other currencies
        spoken = `${denomination} ${currency} note`;
    }

    return spoken;
}

async function requestCurrencyDetection(image, externalSignal) {
    if (!(image instanceof Blob)) {
        throw new CurrencyDetectionError('NO_IMAGE', 'No image was provided for currency detection.');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, CURRENCY_DETECTION_CONFIG.timeoutMs);

    const forwardAbort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener('abort', forwardAbort);

    try {
        const body = new FormData();
        body.append(CURRENCY_DETECTION_CONFIG.fieldName, image, 'frame.jpg');

        const response = await fetch(CURRENCY_DETECTION_CONFIG.apiUrl, {
            method: 'POST',
            body,
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new CurrencyDetectionError(
                'HTTP', `The currency detection service returned an error (HTTP ${response.status}).`
            );
        }

        const raw = await response.json();
        return {
            found: Boolean(raw.found),
            currency: raw.currency ?? null,
            denomination: raw.denomination ?? null,
            confidence: raw.confidence ?? null,
            isMock: false,
        };
    } catch (err) {
        if (err instanceof CurrencyDetectionError) throw err;
        if (err.name === 'AbortError') {
            throw timedOut
                ? new CurrencyDetectionError('TIMEOUT', 'The currency detection service took too long to respond.')
                : new CurrencyDetectionError('ABORTED', 'Currency detection was cancelled.');
        }
        throw new CurrencyDetectionError('NETWORK', 'Could not reach the currency detection service.');
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', forwardAbort);
    }
}

// ─── MOCK MODE ─────────────────────────────────────────────────
const MOCK_DELAY_MS = 500;

/**
 * Indian banknote mock samples — covers all commonly circulating INR
 * denominations plus a couple of international notes for completeness.
 * Cycles through the list so the user sees variety in test mode.
 */
const MOCK_SAMPLES = [
    // Common Indian notes
    { currency: 'INR', denomination: '500',  confidence: 0.95 },
    { currency: 'INR', denomination: '100',  confidence: 0.93 },
    { currency: 'INR', denomination: '2000', confidence: 0.91 },
    { currency: 'INR', denomination: '200',  confidence: 0.90 },
    { currency: 'INR', denomination: '50',   confidence: 0.89 },
    { currency: 'INR', denomination: '20',   confidence: 0.87 },
    { currency: 'INR', denomination: '10',   confidence: 0.86 },
    // International (for BankNote-Net's multi-currency support)
    { currency: 'USD', denomination: '20',   confidence: 0.88 },
    { currency: 'EUR', denomination: '10',   confidence: 0.85 },
];
let mockIndex = 0;

async function mockDetectCurrency(signal) {
    await new Promise((resolve, reject) => {
        const abort = () => reject(new CurrencyDetectionError('ABORTED', 'Currency detection was cancelled.'));
        const timeoutId = setTimeout(resolve, MOCK_DELAY_MS);
        if (signal?.aborted) { clearTimeout(timeoutId); abort(); }
        else signal?.addEventListener('abort', () => { clearTimeout(timeoutId); abort(); }, { once: true });
    });
    const sample = MOCK_SAMPLES[mockIndex % MOCK_SAMPLES.length];
    mockIndex += 1;
    return { ...sample, found: true, isMock: true };
}