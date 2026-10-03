
import { forwardRef, useImperativeHandle, useState, useEffect, useRef, useCallback } from 'react';
import { useCamera } from '../../services/camera/useCamera.js';
import {
    captureFrame,
    detectText,
    describeTextDetection,
    TextDetectionError,
    TEXT_DETECTION_CONFIG,
} from './textDetectionService.js';
import {
    createEvent, SOURCE, EVENT_TYPE, PRIORITY
} from '../../shared/types/events.js';
import { INDIAN_VOICE_MESSAGES } from '../../shared/constants/index.js';

/** Pause between one finished scan and the next, while detection is on */
const DETECTION_INTERVAL_MS = 3000;

const IS_MOCK = TEXT_DETECTION_CONFIG.mockMode;

/**
 * @param {object}   props
 * @param {Function} [props.onEvent]     — Shell callback to receive a NetraEvent
 * @param {Function} [props.speak]       — speak(text) from useSpeech
 * @param {Function} [props.stop]        — stop() from useSpeech
 * @param {boolean}  [props.isSpeaking]  — true while audio is playing
 * @param {boolean}  [props.isSupported] — true if speech synthesis works
 * @param {object}   [props.camera]      — optional shared useCamera() return value
 * @param {import('react').Ref} ref      — see IMPERATIVE HANDLE above
 */
const TextReader = forwardRef(function TextReader({
    onEvent,
    speak,
    stop,
    isSpeaking = false,
    isSupported = false,
    camera: sharedCamera,
}, ref) {
    // ── Camera: reuse the existing hook ───────────────────────
    const ownCamera = useCamera();
    const camera = sharedCamera ?? ownCamera;
    const usesSharedCamera = Boolean(sharedCamera);
    const { videoRef } = camera;
    const cameraActive = camera.status === 'active';

    // ── State ─────────────────────────────────────────────────
    const [isDetecting, setIsDetecting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);   // last non-empty TextDetectionResult
    const [noTextFound, setNoTextFound] = useState(false);  // last scan found nothing
    const [error, setError] = useState(null);
    const [autoRead, setAutoRead] = useState(false);  // auto-speak new results

    // Refs let the scan loop read fresh values without restarting
    const lastTextRef = useRef('');
    const onEventRef = useRef(onEvent);
    const speakRef = useRef(speak);
    const autoReadRef = useRef(autoRead);

    useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
    useEffect(() => { speakRef.current = speak; }, [speak]);
    useEffect(() => { autoReadRef.current = autoRead; }, [autoRead]);

    // Imperative-handle callers (e.g. the voice assistant) need the latest
    // result/isDetecting without re-subscribing
    const resultRef = useRef(result);
    useEffect(() => { resultRef.current = result; }, [result]);
    const isDetectingRef = useRef(isDetecting);
    useEffect(() => { isDetectingRef.current = isDetecting; }, [isDetecting]);

    // ── Release our own camera when the panel unmounts ────────
    const { stopCamera: stopOwnCamera } = ownCamera;
    useEffect(() => {
        if (usesSharedCamera) return undefined;
        return () => stopOwnCamera();
    }, [usesSharedCamera, stopOwnCamera]);

    // ── Stop detecting if the camera goes away ────────────────
    if (!cameraActive && (isDetecting || isLoading)) {
        setIsDetecting(false);
        setIsLoading(false);
    }

    // ── Detection loop ────────────────────────────────────────
    useEffect(() => {
        if (!isDetecting) return undefined;

        let cancelled = false;
        let timerId = null;
        const controller = new AbortController();

        async function scan() {
            setIsLoading(true);
            try {
                const frame = await captureFrame(videoRef.current);
                const detected = await detectText(frame, { signal: controller.signal });
                if (cancelled) return;

                setError(null);
                setIsLoading(false);

                if (!detected.text) {
                    setNoTextFound(true);
                } else {
                    setNoTextFound(false);

                    // Only update (and emit/speak) when the text actually changed
                    if (detected.text !== lastTextRef.current) {
                        lastTextRef.current = detected.text;
                        setResult(detected);

                        onEventRef.current?.(createEvent({
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

                        // Auto-read: speak new text if the toggle is on
                        if (autoReadRef.current && speakRef.current) {
                            speakRef.current(describeTextDetection(detected));
                        }
                    }
                }

                timerId = setTimeout(scan, DETECTION_INTERVAL_MS);
            } catch (err) {
                if (cancelled) return;
                console.warn('[NETRA TextReader]', err);
                setError(
                    err instanceof TextDetectionError
                        ? err.message
                        : INDIAN_VOICE_MESSAGES.TEXT_ERROR
                );
                setIsLoading(false);
                setIsDetecting(false);
            }
        }

        scan();

        return () => {
            cancelled = true;
            clearTimeout(timerId);
            controller.abort();
        };
    }, [isDetecting, videoRef]);

    // ── Handlers ──────────────────────────────────────────────
    function handleStart() {
        lastTextRef.current = '';
        setResult(null);
        setNoTextFound(false);
        setError(null);
        setIsDetecting(true);
    }

    function handleStop() {
        setIsDetecting(false);
        setIsLoading(false);
    }

    function handleRead() {
        speak(describeTextDetection(result));
    }

    const handleAutoReadToggle = useCallback(() => {
        setAutoRead(prev => {
            const next = !prev;
            if (speak && isSupported) {
                speak(next
                    ? INDIAN_VOICE_MESSAGES.TEXT_AUTO_ON
                    : INDIAN_VOICE_MESSAGES.TEXT_AUTO_OFF
                );
            }
            return next;
        });
    }, [speak, isSupported]);

    // ── Imperative handle — what the Voice Assistant can call ──
    useImperativeHandle(ref, () => ({
        startDetection: handleStart,
        stopDetection: handleStop,
        readAloud: handleRead,
        hasResult: () => Boolean(resultRef.current?.text),
        isDetecting: () => isDetectingRef.current,
    }));

    // ── Derived UI values ─────────────────────────────────────
    const speechConnected = typeof speak === 'function' && typeof stop === 'function';
    const speechReady = speechConnected && isSupported;
    const canRead = speechReady && Boolean(result?.text);

    let badge = { className: 'badge--placeholder', label: 'IDLE' };
    if (IS_MOCK) badge = { className: 'badge--placeholder', label: 'MOCK MODE' };
    else if (error) badge = { className: 'badge--error', label: 'ERROR' };
    else if (isDetecting) badge = { className: 'badge--active', label: 'DETECTING' };

    let statusText = 'Detection is off.';
    if (isDetecting) {
        if (isLoading) statusText = 'Hold on, reading the text…';
        else if (noTextFound) statusText = 'No text found. Hold the camera steady on the text, yaar.';
        else statusText = 'Detection is running. Point at any text.';
    }

    return (
        <section className="module-card" aria-labelledby="text-reader-heading">
            <div className="module-header">
                <h2 id="text-reader-heading" className="module-title">
                    Text Reader
                </h2>
                <span className={`badge ${badge.className}`}>{badge.label}</span>
            </div>

            <p className="module-desc">
                Point the camera at text, start detection, then press Read Aloud — or turn on Auto-Read.
            </p>

            {IS_MOCK && (
                <p className="notice" role="status">
                    Test mode: showing sample Indian-context signs. PaddleOCR not connected.
                </p>
            )}

            {/* ── Camera ── standalone preview, or the Shell's shared feed ── */}
            {usesSharedCamera ? (
                !cameraActive && (
                    <p className="notice" role="status">
                        Start the camera in the Camera panel to begin.
                    </p>
                )
            ) : (
                <>
                    <div className="video-wrapper" aria-label="Camera feed">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`video-feed ${cameraActive ? 'video-feed--active' : ''}`}
                            aria-hidden={!cameraActive}
                            aria-label="Live camera feed"
                        />
                        {!cameraActive && (
                            <div className="video-placeholder" aria-hidden="true">
                                <span className="video-placeholder-icon" role="img" aria-label="Camera off">📷</span>
                                <span>Camera inactive</span>
                            </div>
                        )}
                    </div>

                    {camera.error && (
                        <p className="error-text" role="alert">{camera.error}</p>
                    )}

                    <div className="btn-group" role="group" aria-label="Camera controls">
                        <button
                            id="btn-text-start-camera"
                            className="btn btn--primary"
                            onClick={camera.startCamera}
                            disabled={cameraActive || camera.status === 'requesting' || camera.status === 'unsupported'}
                            aria-busy={camera.status === 'requesting'}
                        >
                            {camera.status === 'requesting' ? 'Requesting…' : 'Start Camera'}
                        </button>
                        <button
                            id="btn-text-stop-camera"
                            className="btn btn--danger"
                            onClick={camera.stopCamera}
                            disabled={!cameraActive}
                        >
                            Stop Camera
                        </button>
                    </div>

                    {camera.status === 'unsupported' && (
                        <p className="notice" role="status">Camera API is not supported in this browser.</p>
                    )}
                </>
            )}

            {/* ── Detection controls ── */}
            <div className="btn-group" role="group" aria-label="Text detection controls">
                <button
                    id="btn-text-start"
                    className="btn btn--primary"
                    onClick={handleStart}
                    disabled={!cameraActive || isDetecting}
                    aria-busy={isLoading}
                >
                    {isDetecting ? 'Detecting…' : 'Start Detection'}
                </button>
                <button
                    id="btn-text-stop"
                    className="btn btn--danger"
                    onClick={handleStop}
                    disabled={!isDetecting}
                >
                    Stop Detection
                </button>
            </div>

            {/* ── Auto-Read toggle ── */}
            <div className="btn-group" role="group" aria-label="Auto-read controls">
                <button
                    id="btn-text-auto-read"
                    className={`btn ${autoRead ? 'btn--secondary' : 'btn--outline'}`}
                    onClick={handleAutoReadToggle}
                    disabled={!speechReady}
                    aria-pressed={autoRead}
                    title={autoRead ? 'Auto-Read is ON — click to turn off' : 'Auto-Read is OFF — click to turn on'}
                >
                    {autoRead ? '🔊 Auto-Read: ON' : '🔇 Auto-Read: OFF'}
                </button>
            </div>

            <p className="notice">{statusText}</p>

            {error && (
                <p className="error-text" role="alert">{error}</p>
            )}

            {/* ── Detected text ── */}
            <div className="result-box" role="status" aria-live="polite" aria-atomic="true">
                <p className="result-label">
                    Detected Text
                    {result?.isMock ? ' (sample)' : ''}
                    {autoRead && result?.text ? ' · Auto-reading' : ''}
                </p>
                {result ? (
                    <>
                        <p
                            className="result-text"
                            style={{ fontSize: '1.25rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}
                        >
                            {result.text}
                        </p>
                        <p className="result-confidence">
                            Confidence: {result.confidence !== null ? `${Math.round(result.confidence * 100)}%` : 'not available'}
                            {result.language ? ` — Language: ${result.language}` : ''}
                            {result.lines?.length > 1 ? ` — ${result.lines.length} lines` : ''}
                        </p>
                    </>
                ) : (
                    <p className="notice">No text detected yet.</p>
                )}
            </div>

            {/* ── Read aloud ── */}
            <div className="btn-group" role="group" aria-label="Read aloud controls">
                <button
                    id="btn-text-read"
                    className="btn btn--secondary"
                    onClick={handleRead}
                    disabled={!canRead}
                >
                    🔊 Read Aloud
                </button>
                <button
                    id="btn-text-stop-audio"
                    className="btn btn--danger"
                    onClick={() => stop()}
                    disabled={!speechReady || !isSpeaking}
                >
                    Stop Audio
                </button>
            </div>

            {!speechConnected && (
                <p className="notice" role="status">
                    Speech is not connected to this panel yet.
                </p>
            )}
            {speechConnected && !isSupported && (
                <p className="notice" role="status">
                    Speech synthesis is not supported in this browser.
                </p>
            )}
            {isSpeaking && (
                <p className="speaking-indicator" role="status" aria-live="polite">
                    🔊 Speaking…
                </p>
            )}
        </section>
    );
});

export default TextReader;
