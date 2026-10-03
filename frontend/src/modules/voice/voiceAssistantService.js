/**
 * NETRA — Voice Assistant Engine
 * ─────────────────────────────────────────────────────────────
 * Wraps the browser's SpeechRecognition API (Web Speech API) — this
 * is the SPEECH-TO-TEXT half; useSpeech.js is the separate TEXT-TO-
 * SPEECH half. They are unrelated browser APIs that happen to have
 * similar names.
 *
 * Browser support: Chrome and Edge (desktop + Android) only.
 * Safari/Firefox do not implement SpeechRecognition as of this
 * writing — isVoiceRecognitionSupported() reports that up-front so
 * the UI can explain instead of silently failing.
 *
 * IMPORTANT — this uses Chrome's cloud speech recognition, not an
 * on-device model: audio is sent to Google's servers to transcribe,
 * the same as it would be for Alexa's own STT. There is no offline
 * mode in-browser.
 *
 * Two modes:
 *   listenOnce()              — push-to-talk. Records one utterance,
 *                                resolves with the transcript.
 *   startWakeWordListening()  — hands-free. Listens continuously for
 *                                a wake word ("netra" by default), then
 *                                treats what follows as a command.
 *                                Chrome silently ends a continuous
 *                                recognition session after a pause, so
 *                                this transparently restarts itself
 *                                until stopWakeWordListening() is called.
 */

export const VOICE_CONFIG = {
    lang: 'en-US',
    wakeWord: 'netra',
    commandTimeoutMs: 6000,   // how long to wait for a command after the wake word
    restartDelayMs: 250,      // pause before auto-restarting a dropped session
};

export class VoiceAssistantError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VoiceAssistantError';
    }
}

function getRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isVoiceRecognitionSupported() {
    return Boolean(getRecognitionCtor());
}

function describeRecognitionError(code) {
    switch (code) {
        case 'not-allowed':
        case 'service-not-allowed':
            return 'Microphone access was denied. Allow microphone access to use voice commands.';
        case 'no-speech':
            return 'No speech was heard.';
        case 'audio-capture':
            return 'No microphone was found.';
        case 'network':
            return 'A network error interrupted speech recognition.';
        default:
            return `Speech recognition error: ${code}`;
    }
}

export class VoiceAssistantEngine {
    /**
     * @param {object} handlers
     * @param {Function} [handlers.onWake]            — called once the wake word is heard
     * @param {Function} [handlers.onCommand]          — called with (transcript: string)
     * @param {Function} [handlers.onInterim]          — called with (transcript, isFinal) on every result
     * @param {Function} [handlers.onError]             — called with a VoiceAssistantError
     * @param {Function} [handlers.onListeningChange]  — called with (isListening: boolean)
     * @param {string}   [handlers.wakeWord]
     * @param {string}   [handlers.lang]
     */
    constructor({
        onWake,
        onCommand,
        onInterim,
        onError,
        onListeningChange,
        wakeWord = VOICE_CONFIG.wakeWord,
        lang = VOICE_CONFIG.lang,
    } = {}) {
        this.onWake = onWake;
        this.onCommand = onCommand;
        this.onInterim = onInterim;
        this.onError = onError;
        this.onListeningChange = onListeningChange;
        this.wakeWord = wakeWord.toLowerCase();
        this.lang = lang;

        this.recognition = null;
        this.shouldRestart = false; // wake-word mode only
        this.awake = false;         // wake-word heard, waiting for the command
        this.awakeTimer = null;
    }

    get supported() {
        return isVoiceRecognitionSupported();
    }

    _createRecognition({ continuous, interimResults }) {
        const Ctor = getRecognitionCtor();
        if (!Ctor) {
            throw new VoiceAssistantError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
        }
        const recognition = new Ctor();
        recognition.lang = this.lang;
        recognition.continuous = continuous;
        recognition.interimResults = interimResults;
        recognition.maxAlternatives = 1;
        return recognition;
    }

    // ── Push-to-talk ─────────────────────────────────────────

    /** Records a single utterance. Resolves with the transcript (may be ''). */
    listenOnce() {
        return new Promise((resolve, reject) => {
            let settled = false;
            let recognition;
            try {
                recognition = this._createRecognition({ continuous: false, interimResults: false });
            } catch (err) {
                reject(err);
                return;
            }
            this.recognition = recognition;
            this.onListeningChange?.(true);

            recognition.onresult = (event) => {
                const transcript = event.results[0]?.[0]?.transcript ?? '';
                settled = true;
                resolve(transcript.trim());
            };
            recognition.onerror = (event) => {
                if (settled) return;
                settled = true;
                reject(new VoiceAssistantError(describeRecognitionError(event.error)));
            };
            recognition.onend = () => {
                this.onListeningChange?.(false);
                if (!settled) {
                    settled = true;
                    resolve(''); // e.g. user tapped the button but said nothing
                }
            };

            try {
                recognition.start();
            } catch (err) {
                reject(new VoiceAssistantError('Could not start the microphone.'));
            }
        });
    }

    // ── Wake-word mode ───────────────────────────────────────

    startWakeWordListening() {
        if (!this.supported) {
            this.onError?.(new VoiceAssistantError('Speech recognition is not supported in this browser. Try Chrome or Edge.'));
            return;
        }
        this.shouldRestart = true;
        this._runWakeCycle();
    }

    stopWakeWordListening() {
        this.shouldRestart = false;
        this.awake = false;
        clearTimeout(this.awakeTimer);
        try { this.recognition?.stop(); } catch { /* already stopped */ }
    }

    /** Hard stop for both modes, e.g. on component unmount. */
    stop() {
        this.shouldRestart = false;
        clearTimeout(this.awakeTimer);
        try { this.recognition?.abort(); } catch { /* already stopped */ }
    }

    _runWakeCycle() {
        if (!this.shouldRestart) return;

        let recognition;
        try {
            recognition = this._createRecognition({ continuous: true, interimResults: true });
        } catch (err) {
            this.shouldRestart = false;
            this.onError?.(err);
            return;
        }
        this.recognition = recognition;

        recognition.onstart = () => this.onListeningChange?.(true);

        recognition.onresult = (event) => {
            const lastResult = event.results[event.results.length - 1];
            const transcript = lastResult[0].transcript.trim();
            const isFinal = lastResult.isFinal;
            this.onInterim?.(transcript, isFinal);

            const lower = transcript.toLowerCase();

            if (!this.awake) {
                if (lower.includes(this.wakeWord)) {
                    this.awake = true;
                    this.onWake?.();
                    // Anything spoken after the wake word in the SAME utterance
                    // ("netra, read this") counts as the command immediately.
                    const after = lower.split(this.wakeWord).slice(1).join(' ').trim();
                    if (isFinal && after) {
                        this._deliverCommand(after);
                    } else if (isFinal) {
                        this._armCommandTimeout();
                    }
                }
            } else if (isFinal) {
                this._deliverCommand(transcript);
            }
        };

        recognition.onerror = (event) => {
            // "no-speech" and "aborted" happen constantly in continuous mode
            // (every natural pause) — not real errors, just let onend restart.
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            this.onError?.(new VoiceAssistantError(describeRecognitionError(event.error)));
        };

        recognition.onend = () => {
            this.onListeningChange?.(false);
            if (this.shouldRestart) {
                setTimeout(() => this._runWakeCycle(), VOICE_CONFIG.restartDelayMs);
            }
        };

        try {
            recognition.start();
        } catch {
            // start() throws if a session is already active; the existing
            // session's onend will trigger the next restart, so ignore.
        }
    }

    _armCommandTimeout() {
        clearTimeout(this.awakeTimer);
        this.awakeTimer = setTimeout(() => {
            this.awake = false;
        }, VOICE_CONFIG.commandTimeoutMs);
    }

    _deliverCommand(text) {
        clearTimeout(this.awakeTimer);
        this.awake = false;
        if (text) this.onCommand?.(text);
    }
}
