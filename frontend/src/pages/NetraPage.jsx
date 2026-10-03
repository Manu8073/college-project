/**
 * NETRA — Single-Page Redesign
 * ─────────────────────────────────────────────────────────────
 * One cohesive page that replaces the multi-panel dashboard.
 *
 * Architecture notes:
 *  - ONE useCamera() instance, owned here. videoRef is passed down
 *    to the <video> element rendered by this component only.
 *  - ONE useCamera() — no camera inside mode-specific logic.
 *  - activeMode ('text' | 'currency') determines which detection
 *    service receives the captured frame; the camera itself is mode-agnostic.
 *  - Detection loop is lifted to this component (same pattern as
 *    TextReader.jsx's scan() loop).
 *  - Voice commands bypass tabs entirely; they use the same
 *    routeCommand() → intent → action pattern from VoiceAssistantButton.
 *
 * FIXES vs v1:
 *  - handleCommandRef pattern: engine always calls the LATEST handleCommand,
 *    never a stale closure. This is the root cause of voice not working.
 *  - Engine is created ONCE in a useEffect, not lazily, so wake-word state
 *    is never destroyed by state changes.
 *  - Camera is auto-started by voice commands (camera not required to be on
 *    before saying "read this").
 *  - speechSynthesis.resume() called before every speak() so suspended audio
 *    context (after browser inactivity) never silently drops speech.
 *  - Immediate verbal feedback before async detection wait.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import './NetraPage.css';

// ── Services / hooks (not modified) ───────────────────────────
import { useCamera } from '../services/camera/useCamera.js';
import { useSpeech } from '../services/speech/useSpeech.js';
import {
    captureFrame,
    detectText,
    describeTextDetection,
} from '../modules/detection/textDetectionService.js';
import {
    detectObjects,
    describeObjectDetection,
    getDetectionSignature,
} from '../modules/detection/detectionService.js';
import {
    detectCurrency,
    describeCurrencyDetection,
} from '../modules/currency/currencyDetectionService.js';
import {
    VoiceAssistantEngine,
    isVoiceRecognitionSupported,
    VoiceAssistantError,
} from '../modules/voice/voiceAssistantService.js';
import { routeCommand, INTENT } from '../modules/voice/commandRouter.js';
import { checkHealth, askAssistant } from '../services/api/netraApi.js';
import {
    createEvent, SOURCE, EVENT_TYPE, PRIORITY,
} from '../shared/types/events.js';
import { MAX_LOG_EVENTS } from '../shared/constants/index.js';
import { formatTimestamp } from '../shared/utils/index.js';
import NavigationPanel from '../modules/navigation/NavigationPanel.jsx';

// ── Constants ─────────────────────────────────────────────────
const DETECTION_INTERVAL_MS = 3000;
const VOICE_RESULT_TIMEOUT_MS = 8000;
const VOICE_RESULT_POLL_MS = 300;

// ── Helper: resume suspended speech synthesis ─────────────────
// Chrome suspends speechSynthesis after a period of inactivity.
// Calling resume() before speak() ensures it's never silently dropped.
function resumeSpeech() {
    try {
        if (window.speechSynthesis?.paused) window.speechSynthesis.resume();
    } catch { /* ignore */ }
}

// ── Helper: wait for a ref condition to become true ───────────
function waitForRef(predicate, timeoutMs = VOICE_RESULT_TIMEOUT_MS) {
    return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs;
        function poll() {
            if (predicate()) { resolve(true); return; }
            if (Date.now() >= deadline) { resolve(false); return; }
            setTimeout(poll, VOICE_RESULT_POLL_MS);
        }
        poll();
    });
}

// ─── Inline SVG mic icon (no external dependency) ─────────────
function MicIcon({ size = 40, color = 'currentColor' }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <rect x="9" y="2" width="6" height="12" rx="3" fill={color} />
            <path
                d="M5 10a7 7 0 0 0 14 0"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
            />
            <line x1="12" y1="17" x2="12" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <line x1="9" y1="21" x2="15" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export default function NetraPage() {
    // ── Speech ────────────────────────────────────────────────
    const { speak, stop: stopSpeech, isSpeaking, isSupported, lastSpokenText } = useSpeech();

    // ── Camera — exactly ONE instance ─────────────────────────
    const camera = useCamera();
    const { videoRef, status: cameraStatus, startCamera, stopCamera, error: cameraError } = camera;
    const cameraActive = cameraStatus === 'active';

    // ── Active mode ───────────────────────────────────────────
    const [activeMode, setActiveMode] = useState('text'); // 'text' | 'currency' | 'detect'

    // ── Detection state ───────────────────────────────────────
    const [isDetecting, setIsDetecting] = useState(false);
    const [isDetectingLoading, setIsDetectingLoading] = useState(false);
    const [textResult, setTextResult] = useState(null);
    const [currencyResult, setCurrencyResult] = useState(null);
    const [detectionResult, setDetectionResult] = useState(null);
    const lastTextRef = useRef('');
    const lastCurrencyLabelRef = useRef('');
    const lastDetectionSummaryRef = useRef('');

    // ── Voice assistant ───────────────────────────────────────
    const [isListening, setIsListening] = useState(false);
    const [wakeWordOn, setWakeWordOn] = useState(false);
    const [voiceError, setVoiceError] = useState(null);
    const engineRef = useRef(null);
    const recognitionSupported = isVoiceRecognitionSupported();

    // ── Backend health ────────────────────────────────────────
    const [backendStatus, setBackendStatus] = useState('idle');

    // ── Event log ─────────────────────────────────────────────
    const [events, setEvents] = useState([]);

    // ── aria-live announcer ───────────────────────────────────
    const [announcement, setAnnouncement] = useState('');

    // ─────────────────────────────────────────────────────────
    // STABLE REFS — always reflect the latest values so that the
    // VoiceAssistantEngine (created once) never captures stale closures.
    // This is the key fix: the engine calls handleCommandRef.current,
    // not a captured handleCommand that was frozen at creation time.
    // ─────────────────────────────────────────────────────────
    const activeModeRef       = useRef(activeMode);
    const speakRef            = useRef(speak);
    const stopSpeechRef       = useRef(stopSpeech);
    const lastSpokenTextRef   = useRef(lastSpokenText);
    const textResultRef       = useRef(textResult);
    const currencyResultRef   = useRef(currencyResult);
    const detectionResultRef  = useRef(detectionResult);
    const isDetectingRef      = useRef(isDetecting);
    const cameraActiveRef     = useRef(cameraActive);
    const startCameraRef      = useRef(startCamera);
    const stopCameraRef       = useRef(stopCamera);
    const handleCommandRef    = useRef(null); // set below, before engine creation

    useEffect(() => { activeModeRef.current     = activeMode;    }, [activeMode]);
    useEffect(() => { speakRef.current          = speak;         }, [speak]);
    useEffect(() => { stopSpeechRef.current     = stopSpeech;    }, [stopSpeech]);
    useEffect(() => { lastSpokenTextRef.current = lastSpokenText;}, [lastSpokenText]);
    useEffect(() => { textResultRef.current     = textResult;    }, [textResult]);
    useEffect(() => { currencyResultRef.current = currencyResult;}, [currencyResult]);
    useEffect(() => { detectionResultRef.current = detectionResult;}, [detectionResult]);
    useEffect(() => { isDetectingRef.current    = isDetecting;   }, [isDetecting]);
    useEffect(() => { cameraActiveRef.current   = cameraActive;  }, [cameraActive]);
    useEffect(() => { startCameraRef.current    = startCamera;   }, [startCamera]);
    useEffect(() => { stopCameraRef.current     = stopCamera;    }, [stopCamera]);

    // ── Log helper ────────────────────────────────────────────
    const logEvent = useCallback((event) => {
        setEvents(prev => {
            const updated = [...prev, event];
            return updated.length > MAX_LOG_EVENTS
                ? updated.slice(updated.length - MAX_LOG_EVENTS)
                : updated;
        });
    }, []);

    // ── Announce to aria-live ─────────────────────────────────
    const announce = useCallback((msg) => {
        setAnnouncement('');
        requestAnimationFrame(() => setAnnouncement(msg));
    }, []);

    // ── Safe speak: always resume suspended synthesis first ───
    const safeSpeakRef = useRef((text) => {
        resumeSpeech();
        speakRef.current?.(text);
    });
    // Keep safeSpeakRef stable but ensure it calls the latest speak
    useEffect(() => {
        safeSpeakRef.current = (text) => {
            resumeSpeech();
            speakRef.current?.(text);
        };
    }, []); // intentionally empty — speakRef handles the live reference

    // ── Stop detecting if camera goes away ────────────────────
    useEffect(() => {
        if (!cameraActive && isDetecting) {
            setIsDetecting(false);
            setIsDetectingLoading(false);
            announce('Camera stopped. Detection paused.');
        }
    }, [cameraActive, isDetecting, announce]);

    // ── Detection loop ────────────────────────────────────────
    // Mirrors TextReader.jsx's scan() / setTimeout / AbortController pattern.
    useEffect(() => {
        if (!isDetecting) return undefined;

        let cancelled = false;
        let timerId = null;
        const controller = new AbortController();

        async function scan() {
            setIsDetectingLoading(true);
            try {
                const frame = await captureFrame(videoRef.current);
                const mode = activeModeRef.current;

                if (mode === 'text') {
                    const detected = await detectText(frame, { signal: controller.signal });
                    if (cancelled) return;
                    setIsDetectingLoading(false);

                    if (detected.text && detected.text !== lastTextRef.current) {
                        lastTextRef.current = detected.text;
                        setTextResult(detected);
                        announce(`Text detected: ${detected.text}`);
                        
                        // Auto-speak new detections
                        safeSpeakRef.current(describeTextDetection(detected));

                        logEvent(createEvent({
                            source: SOURCE.DETECTION,
                            type: EVENT_TYPE.TEXT,
                            priority: PRIORITY.LOW,
                            payload: {
                                text: detected.text,
                                confidence: detected.confidence,
                                language: detected.language,
                                mock: detected.isMock,
                            },
                        }));
                    }
                } else if (mode === 'currency') {
                    const detected = await detectCurrency(frame, { signal: controller.signal });
                    if (cancelled) return;
                    setIsDetectingLoading(false);

                    if (detected.found) {
                        const label = `${detected.currency}_${detected.denomination}`;
                        if (label !== lastCurrencyLabelRef.current) {
                            lastCurrencyLabelRef.current = label;
                            setCurrencyResult(detected);
                            announce(`Currency detected: ${describeCurrencyDetection(detected)}`);
                            
                            // Auto-speak new detections
                            safeSpeakRef.current(describeCurrencyDetection(detected));

                            logEvent(createEvent({
                                source: SOURCE.CURRENCY,
                                type: EVENT_TYPE.CURRENCY,
                                priority: PRIORITY.LOW,
                                payload: {
                                    currency: detected.currency,
                                    denomination: detected.denomination,
                                    confidence: detected.confidence,
                                    mock: detected.isMock,
                                },
                            }));
                        }
                    }
                } else if (mode === 'detect') {
                    const video = videoRef.current;
                    let frameWidth = 1280;
                    let frameHeight = 720;
                    if (video && video.videoWidth && video.videoHeight) {
                        const scale = Math.min(1, 1280 / video.videoWidth);
                        frameWidth = Math.round(video.videoWidth * scale);
                        frameHeight = Math.round(video.videoHeight * scale);
                    }

                    const detected = await detectObjects(frame, {
                        signal: controller.signal,
                        frameWidth,
                        frameHeight,
                    });
                    if (cancelled) return;
                    setIsDetectingLoading(false);

                    if (detected.count > 0) {
                        const signature = getDetectionSignature(detected);
                        if (signature !== lastDetectionSummaryRef.current) {
                            lastDetectionSummaryRef.current = signature;
                            setDetectionResult(detected);
                            const desc = describeObjectDetection(detected);
                            announce(desc);
                            safeSpeakRef.current(desc);

                            logEvent(createEvent({
                                source: SOURCE.DETECTION,
                                type: EVENT_TYPE.OBSTACLE,
                                priority: detected.detections.some(d => d.confidence > 0.85)
                                    ? PRIORITY.HIGH : PRIORITY.MEDIUM,
                                payload: {
                                    count: detected.count,
                                    objects: detected.detections.map(d => ({
                                        label: d.label,
                                        confidence: d.confidence,
                                        direction: d.direction,
                                        distance: d.distance,
                                    })),
                                },
                            }));
                        }
                    }
                }

                timerId = setTimeout(scan, DETECTION_INTERVAL_MS);
            } catch (err) {
                if (cancelled) return;
                console.error('[NETRA scan error]', err);
                setIsDetectingLoading(false);
                setIsDetecting(false);

                let userMsg = 'Detection stopped due to an error.';
                if (err?.name === 'TextDetectionError' && err.code === 'CAMERA_NOT_READY') {
                    userMsg = 'Camera is not ready. Please start the camera and try again.';
                } else if (err?.message) {
                    userMsg = err.message;
                }
                announce(userMsg);
            }
        }

        scan();

        return () => {
            cancelled = true;
            clearTimeout(timerId);
            controller.abort();
        };
    }, [isDetecting, videoRef, logEvent, announce]);

    // ── Backend health check on mount ─────────────────────────
    useEffect(() => {
        async function pingBackend() {
            setBackendStatus('checking');
            try {
                await checkHealth();
                setBackendStatus('ok');
            } catch {
                setBackendStatus('error');
            }
        }
        pingBackend();
        // NOTE: do NOT call speak() here — browsers block speech synthesis
        // before a user gesture (click/tap). The first speak() will work
        // after the user interacts with the page.
    }, []);

    // ─────────────────────────────────────────────────────────
    // VOICE COMMAND HANDLER
    //
    // KEY DESIGN: this function is stored in handleCommandRef so the
    // engine (created once) always calls the latest version via
    //   handleCommandRef.current(transcript)
    // rather than capturing a snapshot at engine-creation time.
    // This is what makes wake-word + push-to-talk actually work.
    // ─────────────────────────────────────────────────────────
    const handleCommand = useCallback(async (transcript) => {
        const { intent } = routeCommand(transcript);
        const safeSpeak = safeSpeakRef.current;

        logEvent(createEvent({
            source: SOURCE.SHELL,
            type: EVENT_TYPE.SYSTEM,
            priority: PRIORITY.LOW,
            payload: { message: `Voice: "${transcript}" → ${intent}` },
        }));

        // ── Helper: ensure camera is running before detection ─
        async function ensureCameraAndDetect(mode) {
            // Switch mode immediately
            setActiveMode(mode);
            activeModeRef.current = mode;
            const modeName = mode === 'text' ? 'Read Text' : mode === 'detect' ? 'Detect Objects' : 'Check Money';
            announce(`Mode: ${modeName}.`);

            // Start camera if it's off
            if (!cameraActiveRef.current) {
                safeSpeak('Starting camera.');
                startCameraRef.current();
                // Wait up to 5s for camera to become active
                const cameraReady = await waitForRef(() => cameraActiveRef.current, 5000);
                if (!cameraReady) {
                    safeSpeak("Camera didn't start. Please allow camera access and try again.");
                    return false;
                }
                // Small buffer for the first video frame to populate
                await new Promise(r => setTimeout(r, 600));
            }

            // Start (or reset) detection
            if (mode === 'text') {
                lastTextRef.current = '';
                setTextResult(null);
                textResultRef.current = null;
            } else if (mode === 'currency') {
                lastCurrencyLabelRef.current = '';
                setCurrencyResult(null);
                currencyResultRef.current = null;
            } else if (mode === 'detect') {
                lastDetectionSummaryRef.current = '';
                setDetectionResult(null);
                detectionResultRef.current = null;
            }

            if (!isDetectingRef.current) {
                setIsDetecting(true);
            }
            return true;
        }

        switch (intent) {
            case INTENT.READ_TEXT: {
                safeSpeak('Reading text. Please hold the camera steady.');
                const ready = await ensureCameraAndDetect('text');
                if (!ready) break;

                const found = await waitForRef(() => Boolean(textResultRef.current?.text));
                if (found) {
                    safeSpeak(describeTextDetection(textResultRef.current));
                } else {
                    safeSpeak("I couldn't find any text. Try holding the camera closer and in good light.");
                }
                break;
            }
            case INTENT.CHECK_CURRENCY: {
                safeSpeak('Checking the note. Hold it flat in front of the camera.');
                const ready = await ensureCameraAndDetect('currency');
                if (!ready) break;

                const found = await waitForRef(() => Boolean(currencyResultRef.current?.found));
                if (found) {
                    safeSpeak(describeCurrencyDetection(currencyResultRef.current));
                } else {
                    safeSpeak("I couldn't recognize a banknote. Hold it flat and in better light.");
                }
                break;
            }
            case INTENT.DETECT_OBJECTS: {
                safeSpeak('Looking around. Hold the camera steady.');
                const readyD = await ensureCameraAndDetect('detect');
                if (!readyD) break;

                const foundD = await waitForRef(() => Boolean(detectionResultRef.current?.count > 0));
                if (foundD) {
                    safeSpeak(describeObjectDetection(detectionResultRef.current));
                } else {
                    safeSpeak("I couldn't detect any objects. Try pointing the camera at your surroundings.");
                }
                break;
            }
            case INTENT.START_NAVIGATION: {
                safeSpeak('Opening Navigation Mode.');
                setActiveMode('navigate');
                activeModeRef.current = 'navigate';
                if (cameraActiveRef.current) {
                    stopCameraRef.current();
                }
                announce('Mode: Navigation.');
                break;
            }
            case INTENT.REPEAT: {
                const last = lastSpokenTextRef.current;
                if (last) safeSpeak(last);
                else safeSpeak('There is nothing to repeat yet.');
                break;
            }
            case INTENT.STOP: {
                stopSpeechRef.current();
                setIsDetecting(false);
                setIsDetectingLoading(false);
                announce('Stopped.');
                break;
            }
            default: {
                safeSpeak("Let me check that for you.");
                try {
                    const response = await askAssistant(transcript);
                    if (response.success && response.answer) {
                        safeSpeak(response.answer);
                    } else {
                        safeSpeak("Sorry, I didn't understand that and the assistant couldn't help.");
                    }
                } catch (err) {
                    safeSpeak("Sorry, I didn't understand that, and I couldn't reach the assistant. Try saying 'read this' or 'what currency'.");
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logEvent, announce]);

    // Keep handleCommandRef always pointing to the latest version
    useEffect(() => { handleCommandRef.current = handleCommand; }, [handleCommand]);

    // ── Create the engine ONCE (useEffect, not lazily) ────────
    // All callbacks go through stable refs, so the engine never
    // needs to be destroyed and recreated when state changes.
    useEffect(() => {
        if (!recognitionSupported) return;

        const engine = new VoiceAssistantEngine({
            onWake: () => {
                announce('Wake word heard. Say your command now.');
                resumeSpeech();
                speakRef.current?.('Yes?');
            },
            // ↓ This is the key fix: always delegate to the ref,
            //   never close over a stale handleCommand snapshot.
            onCommand: (transcript) => handleCommandRef.current?.(transcript),
            onInterim: () => {},
            onError: (err) => {
                const msg = err instanceof VoiceAssistantError ? err.message : 'Voice recognition error.';
                setVoiceError(msg);
                setIsListening(false);
            },
            onListeningChange: (listening) => setIsListening(listening),
        });

        engineRef.current = engine;

        return () => {
            engine.stop();
            engineRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recognitionSupported]); // only recreate if support changes (never in practice)

    // ── Push-to-talk ──────────────────────────────────────────
    async function handlePushToTalk() {
        if (!engineRef.current) return;
        setVoiceError(null);
        resumeSpeech();
        try {
            announce('Listening…');
            const transcript = await engineRef.current.listenOnce();
            if (transcript) {
                await handleCommandRef.current?.(transcript);
            } else {
                announce('No speech heard. Try again.');
            }
        } catch (err) {
            const msg = err instanceof VoiceAssistantError ? err.message : 'Voice recognition error.';
            setVoiceError(msg);
            announce('Voice error. ' + msg);
        }
    }

    // ── Wake-word toggle ──────────────────────────────────────
    function toggleWakeWord() {
        if (!engineRef.current) return;
        if (wakeWordOn) {
            engineRef.current.stopWakeWordListening();
            setWakeWordOn(false);
            announce('Hands-free mode off.');
        } else {
            setVoiceError(null);
            engineRef.current.startWakeWordListening();
            setWakeWordOn(true);
            announce('Hands-free mode on. Say "Hey Netra" followed by your command.');
        }
    }

    // ── Camera toggle ─────────────────────────────────────────
    function handleCameraToggle() {
        if (cameraActive) {
            if (isDetecting) {
                setIsDetecting(false);
                setIsDetectingLoading(false);
            }
            stopCamera();
            announce('Camera stopped.');
        } else {
            startCamera();
            announce('Starting camera.');
        }
    }

    // ── Detect toggle ─────────────────────────────────────────
    function handleDetectToggle() {
        if (isDetecting) {
            setIsDetecting(false);
            setIsDetectingLoading(false);
            announce('Detection stopped.');
        } else {
            if (activeMode === 'text') {
                lastTextRef.current = '';
                setTextResult(null);
                textResultRef.current = null;
            } else if (activeMode === 'currency') {
                lastCurrencyLabelRef.current = '';
                setCurrencyResult(null);
                currencyResultRef.current = null;
            } else if (activeMode === 'detect') {
                lastDetectionSummaryRef.current = '';
                setDetectionResult(null);
                detectionResultRef.current = null;
            }
            setIsDetecting(true);
            const modeLabel = activeMode === 'text' ? 'Text' : activeMode === 'currency' ? 'Currency' : 'Object';
            announce(`${modeLabel} detection started.`);
        }
    }

    // ── Tab switch ────────────────────────────────────────────
    function handleTabSwitch(mode) {
        if (mode === activeMode) return;
        setActiveMode(mode);
        activeModeRef.current = mode;
        if (isDetecting) {
            setIsDetecting(false);
            setIsDetectingLoading(false);
        }
        if (mode === 'navigate' && cameraActive) {
            stopCamera();
        }
        const modeName = mode === 'text' ? 'Read Text' : mode === 'detect' ? 'Detect Objects' : mode === 'currency' ? 'Check Money' : 'Navigation';
        announce(`Mode: ${modeName}.`);
    }

    // ── Repeat result ─────────────────────────────────────────
    function handleRepeat() {
        resumeSpeech();
        if (activeMode === 'text' && textResult?.text) {
            speakRef.current?.(describeTextDetection(textResult));
        } else if (activeMode === 'currency' && currencyResult?.found) {
            speakRef.current?.(describeCurrencyDetection(currencyResult));
        } else if (activeMode === 'detect' && detectionResult?.count > 0) {
            speakRef.current?.(describeObjectDetection(detectionResult));
        }
    }

    // ── Derived display values ────────────────────────────────
    const activeResult = activeMode === 'text'
        ? textResult
        : activeMode === 'currency'
        ? (currencyResult?.found ? currencyResult : null)
        : (detectionResult?.count > 0 ? detectionResult : null);
    const hasResult = activeMode === 'text'
        ? Boolean(textResult?.text)
        : activeMode === 'currency'
        ? Boolean(currencyResult?.found)
        : Boolean(detectionResult?.count > 0);

    function renderResultMain() {
        if (activeMode === 'text') return textResult?.text ?? null;
        if (activeMode === 'currency' && currencyResult?.found) {
            const sym = currencyResult.currency === 'INR' ? '₹' : '';
            return `${sym}${currencyResult.denomination} ${currencyResult.currency}`;
        }
        if (activeMode === 'detect' && detectionResult?.count > 0) {
            return detectionResult.detections
                .map(d => `${d.label} (${d.direction}, ${d.distance})`)
                .join(' · ');
        }
        return null;
    }

    const resultMain = renderResultMain();
    const resultConf = activeMode === 'detect'
        ? (detectionResult?.count != null ? `${detectionResult.count} object${detectionResult.count !== 1 ? 's' : ''} found` : null)
        : activeResult?.confidence != null
        ? `Confidence: ${Math.round(activeResult.confidence * 100)}%`
        : null;

    const backendDotClass =
        backendStatus === 'ok'       ? 'netra-status-dot netra-status-dot--green' :
        backendStatus === 'error'    ? 'netra-status-dot netra-status-dot--red'   :
        'netra-status-dot netra-status-dot--checking';

    const backendLabel =
        backendStatus === 'ok'    ? 'Backend connected' :
        backendStatus === 'error' ? 'Backend unreachable' : 'Checking…';

    return (
        <div className="netra-page" id="netra-app">
            {/* ── Skip to content — first focusable element ─── */}
            <a href="#netra-main" className="netra-skip-link">Skip to main content</a>

            {/* ── Hidden aria-live announcer for state changes ── */}
            <div
                className="netra-sr-announcer"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {announcement}
            </div>

            {/* ════════════════════════════════════════════════
                1. HEADER
            ══════════════════════════════════════════════════ */}
            <header className="netra-header" role="banner">
                <h1 className="netra-header__name">NETRA</h1>
                <div className="netra-header__status" aria-label={`Backend status: ${backendLabel}`}>
                    <span
                        className={backendDotClass}
                        role="img"
                        aria-label={backendStatus === 'ok' ? 'Backend healthy' : 'Backend unreachable'}
                    />
                    <span aria-hidden="true">{backendLabel}</span>
                </div>
            </header>

            {/* ════════════════════════════════════════════════
                MAIN CONTENT COLUMN
            ══════════════════════════════════════════════════ */}
            <main id="netra-main" className="netra-column">

                {/* ════════════════════════════════════════════
                    2. PRIMARY MIC BUTTON
                ══════════════════════════════════════════════ */}
                <div className="netra-mic-wrap">
                    <button
                        id="netra-mic-btn"
                        className={`netra-mic-btn${isListening ? ' netra-mic-btn--listening' : ''}`}
                        onClick={handlePushToTalk}
                        disabled={!recognitionSupported || isListening}
                        aria-busy={isListening}
                        aria-label={isListening ? 'Listening, please speak' : 'Tap to speak a command'}
                        aria-pressed={isListening}
                    >
                        <span className="netra-mic-icon">
                            <MicIcon size={40} color="white" />
                        </span>
                        <span className="netra-mic-label">
                            {isListening ? 'Listening…' : 'Tap to Speak'}
                        </span>
                    </button>

                    {!recognitionSupported && (
                        <p className="netra-mic-error" role="alert">
                            Voice recognition is not supported in this browser. Use Chrome or Edge.
                        </p>
                    )}
                    {voiceError && (
                        <p className="netra-mic-error" role="alert">{voiceError}</p>
                    )}
                    {isSpeaking && (
                        <p
                            role="status"
                            aria-live="polite"
                            style={{ fontSize: '0.9rem', color: 'var(--np-accent)', fontWeight: 600 }}
                        >
                            🔊 Speaking…
                        </p>
                    )}

                    {/* ════════════════════════════════════════
                        3. WAKE-WORD TOGGLE
                    ════════════════════════════════════════ */}
                    <div className="netra-wakeword">
                        <label className="netra-toggle" htmlFor="netra-wakeword-toggle">
                            <input
                                id="netra-wakeword-toggle"
                                type="checkbox"
                                role="switch"
                                checked={wakeWordOn}
                                onChange={toggleWakeWord}
                                disabled={!recognitionSupported}
                                aria-label='"Hey Netra" hands-free mode'
                            />
                            <span className="netra-toggle__track" aria-hidden="true">
                                <span className="netra-toggle__thumb" />
                            </span>
                        </label>
                        <span className="netra-wakeword__label" aria-hidden="true">
                            "Hey Netra" hands-free
                            {wakeWordOn ? ' — ON' : ' — OFF'}
                        </span>
                    </div>
                </div>

                {/* ════════════════════════════════════════════
                    4. MODE TABS
                ══════════════════════════════════════════════ */}
                <div role="tablist" aria-label="Detection mode" className="netra-tabs">
                    <button
                        id="netra-tab-text"
                        role="tab"
                        className="netra-tab"
                        aria-selected={activeMode === 'text'}
                        aria-controls="netra-main"
                        onClick={() => handleTabSwitch('text')}
                    >
                        <span className="netra-tab__icon" aria-hidden="true">📄</span>
                        <span className="netra-tab__label">Read Text</span>
                    </button>
                    <button
                        id="netra-tab-detect"
                        role="tab"
                        className="netra-tab"
                        aria-selected={activeMode === 'detect'}
                        aria-controls="netra-main"
                        onClick={() => handleTabSwitch('detect')}
                    >
                        <span className="netra-tab__icon" aria-hidden="true">🔍</span>
                        <span className="netra-tab__label">Detect Objects</span>
                    </button>
                    <button
                        id="netra-tab-currency"
                        role="tab"
                        className="netra-tab"
                        aria-selected={activeMode === 'currency'}
                        aria-controls="netra-main"
                        onClick={() => handleTabSwitch('currency')}
                    >
                        <span className="netra-tab__icon" aria-hidden="true">💵</span>
                        <span className="netra-tab__label">Check Money</span>
                    </button>
                    <button
                        id="netra-tab-navigate"
                        role="tab"
                        className="netra-tab"
                        aria-selected={activeMode === 'navigate'}
                        aria-controls="netra-main"
                        onClick={() => handleTabSwitch('navigate')}
                    >
                        <span className="netra-tab__icon" aria-hidden="true">🧭</span>
                        <span className="netra-tab__label">Navigate</span>
                    </button>
                </div>

                {activeMode === 'navigate' ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <NavigationPanel />
                    </div>
                ) : (
                    <>
                        {/* ════════════════════════════════════════════
                            5. CAMERA PREVIEW — ONE <video> element
                        ══════════════════════════════════════════════ */}
                <section className="netra-camera-section" aria-labelledby="netra-camera-heading">
                    <h2 id="netra-camera-heading" className="netra-sr-announcer">
                        Camera and Detection
                    </h2>

                    {/* Single video element — never conditionally unmounted */}
                    <div className="netra-video-wrapper" aria-label="Camera preview">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`netra-video${cameraActive ? ' netra-video--active' : ''}`}
                            aria-label="Live camera feed"
                            aria-hidden={!cameraActive}
                        />
                        {!cameraActive && (
                            <div className="netra-video-placeholder" aria-hidden="true">
                                <span
                                    className="netra-video-placeholder__icon"
                                    role="img"
                                    aria-label="Camera is off"
                                >
                                    📷
                                </span>
                                <span>Camera is off</span>
                            </div>
                        )}
                    </div>

                    {cameraError && (
                        <p className="netra-camera-error" role="alert">{cameraError}</p>
                    )}
                    {cameraStatus === 'unsupported' && (
                        <p role="status" style={{ color: 'var(--np-error)', fontSize: '0.9rem' }}>
                            Camera API is not supported in this browser.
                        </p>
                    )}

                    <div className="netra-camera-controls" role="group" aria-label="Camera and detection controls">
                        <button
                            id="netra-camera-toggle"
                            className={`np-btn ${cameraActive ? 'np-btn--error' : 'np-btn--accent'}`}
                            onClick={handleCameraToggle}
                            disabled={cameraStatus === 'requesting' || cameraStatus === 'unsupported'}
                            aria-busy={cameraStatus === 'requesting'}
                            aria-label={cameraActive ? 'Stop camera' : 'Start camera'}
                        >
                            {cameraStatus === 'requesting'
                                ? 'Requesting…'
                                : cameraActive ? '⏹ Stop Camera' : '▶ Start Camera'}
                        </button>
                        <button
                            id="netra-detect-toggle"
                            className={`np-btn ${isDetecting ? 'np-btn--detecting' : 'np-btn--outline-accent'}`}
                            onClick={handleDetectToggle}
                            disabled={!cameraActive}
                            aria-busy={isDetectingLoading}
                            aria-label={isDetecting ? 'Stop detecting' : 'Start detecting'}
                        >
                            {isDetecting
                                ? `⏹ Stop Detecting${isDetectingLoading ? '…' : ''}`
                                : '🔍 Detect'}
                        </button>
                    </div>
                </section>

                {/* ════════════════════════════════════════════
                    6. RESULT CARD — always mounted, stable aria-live region
                ══════════════════════════════════════════════ */}
                <section
                    className="netra-result-card"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    aria-labelledby="netra-result-eyebrow"
                >
                    <p id="netra-result-eyebrow" className="netra-result-card__eyebrow">
                        {activeMode === 'text' ? 'Detected Text' : activeMode === 'currency' ? 'Detected Currency' : 'Detected Objects'}
                        {isDetecting && isDetectingLoading && ' — scanning…'}
                        {isDetecting && !isDetectingLoading && ' — running'}
                    </p>

                    {resultMain ? (
                        <>
                            <p className="netra-result-card__main">{resultMain}</p>
                            {resultConf && (
                                <p className="netra-result-card__confidence">{resultConf}</p>
                            )}
                        </>
                    ) : (
                        <p className="netra-result-card__empty">Nothing detected yet.</p>
                    )}

                    <div className="netra-result-card__actions">
                        <button
                            id="netra-repeat-btn"
                            className="np-btn np-btn--accent"
                            onClick={handleRepeat}
                            disabled={!hasResult || !isSupported}
                            aria-label="Repeat last detection result aloud"
                        >
                            🔊 Repeat
                        </button>
                        <button
                            id="netra-stop-audio-btn"
                            className="np-btn np-btn--neutral"
                            onClick={stopSpeech}
                            disabled={!isSpeaking}
                            aria-label="Stop audio playback"
                        >
                            ⏹ Stop Audio
                        </button>
                    </div>
                </section>
                    </>
                )}

                {/* ════════════════════════════════════════════
                    7. COLLAPSIBLE EVENT LOG (developer only)
                ══════════════════════════════════════════════ */}
                <details className="netra-details" aria-label="Developer event log, not announced">
                    <summary>
                        Details (event log — {events.length} event{events.length !== 1 ? 's' : ''})
                    </summary>
                    {events.length === 0 ? (
                        <p className="netra-log-empty">No events yet.</p>
                    ) : (
                        <ol className="netra-log-list" aria-label="Event log" reversed>
                            {[...events].reverse().map((ev) => (
                                <li key={ev.id} className="netra-log-item">
                                    <span style={{ opacity: 0.6 }}>{formatTimestamp(ev.timestamp)}</span>
                                    {' '}
                                    <strong>[{ev.source}/{ev.type}]</strong>
                                    {' '}
                                    {ev.payload?.text ?? ev.payload?.message ?? ev.payload?.denomination ?? ''}
                                    {ev.payload?.confidence != null
                                        ? ` (${Math.round(ev.payload.confidence * 100)}%)`
                                        : ''}
                                </li>
                            ))}
                        </ol>
                    )}
                </details>

            </main>
        </div>
    );
}
