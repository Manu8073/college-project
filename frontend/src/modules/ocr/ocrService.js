/**
 * NETRA — OCR Service (PLACEHOLDER)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Member 3
 *
 * Future responsibilities:
 *  - Accept an image (canvas capture / blob / file) as input
 *  - Run Tesseract.js text recognition
 *  - Return recognized text and confidence score
 *  - Later: currency note recognition
 *
 * Current state:
 *  - Returns a hardcoded dummy OCR result after a simulated delay
 *
 * TODO (Member 3):
 *  1. npm install tesseract.js
 *  2. Import createWorker from 'tesseract.js'
 *  3. Replace recognizeText() with real Tesseract worker
 *  4. Map Tesseract output to OcrResult typedef
 */

/**
 * @typedef {object} OcrResult
 * @property {string} text       — recognized text
 * @property {number} confidence — 0.0–1.0
 * @property {string} language   — language code, e.g. "en"
 */

const DUMMY_OCR_SAMPLES = [
  { text: 'STOP',                          confidence: 0.97, language: 'en' },
  { text: 'No Parking 8am–6pm Mon–Fri',    confidence: 0.88, language: 'en' },
  { text: '₹500 Reserve Bank of India',    confidence: 0.91, language: 'en' },
  { text: 'EMERGENCY EXIT',                confidence: 0.95, language: 'en' },
];

/**
 * Simulates OCR text recognition from an image source.
 * @returns {Promise<OcrResult>}
 */
export async function recognizeText(/* imageSource */) {
  await new Promise(resolve => setTimeout(resolve, 500));
  return DUMMY_OCR_SAMPLES[Math.floor(Math.random() * DUMMY_OCR_SAMPLES.length)];
}

/**
 * Returns a readable string for an OcrResult.
 * @param {OcrResult} result
 * @returns {string}
 */
export function describeOcrResult(result) {
  return `Text detected: "${result.text}". Confidence: ${Math.round(result.confidence * 100)}%.`;
}
