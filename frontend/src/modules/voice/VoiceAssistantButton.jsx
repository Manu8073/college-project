/**
 * NETRA — Voice Assistant (Central Controller)
 * ─────────────────────────────────────────────────────────────
 * OWNER: Shell (Member 4) integration
 *
 * Push-to-Talk and "Hey Netra" wake-word modes.
 * All voice commands are routed here; general questions go to Gemini.
 *
 * Key design principles:
 *  - No repetitive phrases: acknowledgements drawn from a varied pool
 *  - Stop any current speech before starting a new command
 *  - Show real-time status (listening / thinking / speaking)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    VoiceAssistantEngine,
    isVoiceRecognitionSupported,
    VoiceAssistantError,
} from './voiceAssistantService.js';
import { routeCommand, INTENT } from './commandRouter.js';
import { createEvent, SOURCE, EVENT_TYPE, PRIORITY } from '../../shared/types/events.js';
import { askAssistant } from '../../services/assistantService.js';

const RESULT_POLL_MS = 300;
const RESULT_WAIT_TIMEOUT_MS = 7000;

// ── Varied acknowledgement pools ─────────────────────────────
// Rotate through these so responses never sound repetitive.
const WAKE_ACKS     = ['Yes?', 'Listening.', 'Go ahead.', "I'm here.", 'Tell me.'];
const THINKING_ACKS = ['', 'One moment.', 'On it.', 'Let me check.'];
const READ_ACKS     = ['Reading.', 'On it.', ''];
const CURRENCY_ACKS = ['Checking.', 'On it.', ''];

let _wakeIdx = 0, _thinkIdx = 0, _readIdx = 0, _currencyIdx = 0;
const pickWake     = () => WAKE_ACKS[_wakeIdx++       % WAKE_ACKS.length];
const pickThink    = () => THINKING_ACKS[_thinkIdx++  % THINKING_ACKS.length];
const pickRead     = () => READ_ACKS[_readIdx++        % READ_ACKS.length];
const pickCurrency = () => CURRENCY_ACKS[_currencyIdx++ % CURRENCY_ACKS.length];

/** Polls a module ref's hasResult() until true, or times out. */
function waitForResult(moduleRef, timeoutMs = RESULT_WAIT_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
            if (moduleRef?.current?.hasResult?.()) { resolve(true); return; }
            if (Date.now() - startedAt >= timeoutMs) { resolve(false); return; }
            setTimeout(tick, RESULT_POLL_MS);
        };
        tick();
    });
}

export default function VoiceAssistantButton({
    speak,
    stop,
    isSpeaking,
    isSupported,
    lastSpokenText,
    onEvent,
    textReaderRef,
    currencyReaderRef,
}) {
    const [isListening, setIsListening] = useState(false);
    const [wakeWordOn, setWakeWordOn]   = useState(false);
    const [heard, setHeard]             = useState('');
    const [status, setStatus]           = useState('Idle.');
    const [isThinking, setIsThinking]   = useState(false);
    const [error, setError]             = useState(null);

    const engineRef = useRef(null);
    const recognitionSupported = isVoiceRecognitionSupported();

    const handleCommand = useCallback(async (transcript) => {
        if (!transcript?.trim()) return;
        setHeard(transcript);
        setError(null);
        stop(); // always stop current speech before a new command

        const { intent } = routeCommand(transcript);
        onEvent?.(createEvent({
            source:   SOURCE.SHELL,
            type:     EVENT_TYPE.SYSTEM,
            priority: PRIORITY.LOW,
            payload:  { message: `Voice: "${transcript}" → ${intent}` },
        }));

        switch (intent) {
            case INTENT.READ_TEXT: {
                if (!textReaderRef?.current) { speak('Text reader is not available right now.'); break; }
                setStatus('Reading text…');
                const ack = pickRead(); if (ack) speak(ack);
                textReaderRef.current.startDetection();
                const found = await waitForResult(textReaderRef);
                if (found) textReaderRef.current.readAloud();
                else speak("Couldn't find text. Hold the camera steady and closer to the text.");
                setStatus('Idle.');
                break;
            }
            case INTENT.CHECK_CURRENCY: {
                if (!currencyReaderRef?.current) { speak('Currency reader is not available right now.'); break; }
                setStatus('Checking currency…');
                const ack = pickCurrency(); if (ack) speak(ack);
                currencyReaderRef.current.startDetection();
                const found = await waitForResult(currencyReaderRef);
                if (found) currencyReaderRef.current.readAloud();
                else speak("Couldn't recognise the note. Hold it flat in good light.");
                setStatus('Idle.');
                break;
            }
            case INTENT.REPEAT: {
                if (lastSpokenText) speak(lastSpokenText);
                else speak('Nothing to repeat yet.');
                break;
            }
            case INTENT.STOP: {
                stop();
                textReaderRef?.current?.stopDetection();
                currencyReaderRef?.current?.stopDetection();
                setStatus('Idle.');
                break;
            }
            default: {
                setStatus('Thinking…');
                setIsThinking(true);
                const ack = pickThink();
                if (ack) speak(ack);
                try {
                    const answer = await askAssistant(transcript);
                    stop(); // clear ack if still playing
                    speak(answer);
                    setStatus('Idle.');
                } catch (err) {
                    stop();
                    speak("Couldn't reach the assistant right now.");
                    console.error('[VoiceAssistant] Gemini error:', err);
                    setStatus('Idle.');
                } finally {
                    setIsThinking(false);
                }
                break;
            }
        }
    }, [speak, stop, lastSpokenText, onEvent, textReaderRef, currencyReaderRef]);

    const ensureEngine = useCallback(() => {
        if (engineRef.current) return engineRef.current;
        engineRef.current = new VoiceAssistantEngine({
            onWake:            () => { setStatus('Go ahead…'); speak(pickWake()); },
            onCommand:         (t) => handleCommand(t),
            onInterim:         (t) => setHeard(t),
            onError:           (err) => {
                setError(err instanceof VoiceAssistantError ? err.message : 'Voice recognition error.');
                setIsListening(false);
                setIsThinking(false);
            },
            onListeningChange: (l) => setIsListening(l),
        });
        return engineRef.current;
    }, [handleCommand, speak]);

    useEffect(() => () => engineRef.current?.stop(), []);

    async function handlePushToTalk() {
        setError(null); setHeard(''); setIsThinking(false);
        const engine = ensureEngine();
        setStatus('Listening…');
        try {
            const transcript = await engine.listenOnce();
            if (transcript) await handleCommand(transcript);
            else setStatus('Idle.');
        } catch (err) {
            setStatus('Idle.');
            setError(err instanceof VoiceAssistantError ? err.message : 'Voice recognition error.');
        }
    }

    function toggleWakeWord() {
        const engine = ensureEngine();
        if (wakeWordOn) {
            engine.stopWakeWordListening();
            setWakeWordOn(false); setStatus('Idle.');
        } else {
            setError(null);
            engine.startWakeWordListening();
            setWakeWordOn(true); setStatus('Waiting for "Netra"…');
        }
    }

    const statusEmoji = isThinking ? '🤔' : isListening ? '🎙️' : isSpeaking ? '🔊' : '💤';
    const badgeClass  = isListening ? 'badge--active' : isThinking ? 'badge--thinking' : isSpeaking ? 'badge--speaking' : 'badge--placeholder';

    return (
        <section className="module-card voice-assistant-card" aria-labelledby="voice-assistant-heading">
            <div className="module-header">
                <h2 id="voice-assistant-heading" className="module-title">Voice Assistant</h2>
                <span className={`badge ${badgeClass}`}>
                    {isListening ? 'LISTENING' : isThinking ? 'THINKING' : isSpeaking ? 'SPEAKING' : 'IDLE'}
                </span>
            </div>

            <p className="module-desc">
                Tap and speak, or say <strong>"Netra"</strong> hands-free.
                Try: <strong>"read this"</strong>, <strong>"what currency"</strong>, <strong>"stop"</strong>,
                or ask anything — <strong>"what is AI?"</strong>, <strong>"briefly explain photosynthesis"</strong>
            </p>

            {!recognitionSupported && (
                <p className="notice" role="alert">⚠️ Voice recognition requires Chrome or Edge.</p>
            )}

            <div className="btn-group" role="group" aria-label="Voice assistant controls">
                <button
                    className={`btn btn--primary${isListening ? ' btn--pulsing' : ''}`}
                    onClick={handlePushToTalk}
                    disabled={!recognitionSupported || isListening || isThinking}
                    aria-busy={isListening}
                    id="voice-push-to-talk-btn"
                >
                    🎙️ {isListening ? 'Listening…' : 'Push to Talk'}
                </button>
                <button
                    className={`btn ${wakeWordOn ? 'btn--danger' : 'btn--secondary'}`}
                    onClick={toggleWakeWord}
                    disabled={!recognitionSupported}
                    id="voice-wake-word-toggle-btn"
                >
                    {wakeWordOn ? '🔴 Stop "Hey Netra"' : '🟢 "Hey Netra" Mode'}
                </button>
            </div>

            <p className="voice-status" role="status" aria-live="polite">
                {statusEmoji} {status}
            </p>

            {heard && (
                <div className="result-box" role="status" aria-live="polite">
                    <p className="result-label">You said</p>
                    <p className="result-text">"{heard}"</p>
                </div>
            )}

            {isThinking && (
                <div className="thinking-indicator" role="status" aria-live="polite">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-label">Asking Gemini…</span>
                </div>
            )}

            {error && <p className="error-text" role="alert">⚠️ {error}</p>}

            {!isSupported && (
                <p className="notice" role="alert">
                    ⚠️ Text-to-speech not supported — responses won't be spoken aloud.
                </p>
            )}
        </section>
    );
}
