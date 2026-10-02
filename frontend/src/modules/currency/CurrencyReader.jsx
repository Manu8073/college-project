/**
 * NETRA — Currency Reader Component
 * ─────────────────────────────────────────────────────────────
 * Same architecture as TextReader.jsx: shares the useCamera() hook
 * and the App-level useSpeech() queue. Detects banknotes via the
 * BankNote-Net powered currency-service.
 *
 * Features:
 *  - Auto-Read: when ON, newly detected notes are spoken automatically.
 *  - Indian-English voice: natural rupee denomination announcements.
 *  - All common INR denominations supported in mock mode.
 *
 * IMPERATIVE HANDLE (for the Voice Assistant module):
 *   ref.current.startDetection()
 *   ref.current.stopDetection()
 *   ref.current.readAloud()
 *   ref.current.hasResult()
 *   ref.current.isDetecting()
 */

import { forwardRef, useImperativeHandle, useState, useEffect, useRef, useCallback } from 'react';
import { useCamera } from '../../services/camera/useCamera.js';
import {
    captureFrame,
    detectCurrency,
    describeCurrencyDetection,
    CurrencyDetectionError,
    CURRENCY_DETECTION_CONFIG,
} from './currencyDetectionService.js';
import { createEvent, SOURCE, EVENT_TYPE, PRIORITY } from '../../shared/types/events.js';
import { INDIAN_VOICE_MESSAGES } from '../../shared/constants/index.js';

const DETECTION_INTERVAL_MS = 3000;
const IS_MOCK = CURRENCY_DETECTION_CONFIG.mockMode;

const CurrencyReader = forwardRef(function CurrencyReader({
    onEvent,
    speak,
    stop,
    isSpeaking = false,
    isSupported = false,
    camera: sharedCamera,
}, ref) {
    const ownCamera = useCamera();
    const camera = sharedCamera ?? ownCamera;
    const usesSharedCamera = Boolean(sharedCamera);
    const { videoRef } = camera;
    const cameraActive = camera.status === 'active';

    const [isDetecting, setIsDetecting] = useState(false);
    const [isLoading,   setIsLoading]   = useState(false);
    const [result,      setResult]      = useState(null);
    const [notFound,    setNotFound]    = useState(false);
    const [error,       setError]       = useState(null);
    const [autoRead,    setAutoRead]    = useState(false);

    const lastLabelRef = useRef('');
    const onEventRef   = useRef(onEvent);
    const speakRef     = useRef(speak);
    const autoReadRef  = useRef(autoRead);

    useEffect(() => { onEventRef.current  = onEvent;   }, [onEvent]);
    useEffect(() => { speakRef.current    = speak;     }, [speak]);
    useEffect(() => { autoReadRef.current = autoRead;  }, [autoRead]);

    // Imperative-handle callers need fresh refs
    const resultRef = useRef(result);
    useEffect(() => { resultRef.current = result; }, [result]);
    const isDetectingRef = useRef(isDetecting);
    useEffect(() => { isDetectingRef.current = isDetecting; }, [isDetecting]);

    const { stopCamera: stopOwnCamera } = ownCamera;
    useEffect(() => {
        if (usesSharedCamera) return undefined;
        return () => stopOwnCamera();
    }, [usesSharedCamera, stopOwnCamera]);

    if (!cameraActive && (isDetecting || isLoading)) {
        setIsDetecting(false);
        setIsLoading(false);
    }

    useEffect(() => {
        if (!isDetecting) return undefined;
        let cancelled = false;
        let timerId = null;
        const controller = new AbortController();

        async function scan() {
            setIsLoading(true);
            try {
                const frame = await captureFrame(videoRef.current);
                const detected = await detectCurrency(frame, { signal: controller.signal });
                if (cancelled) return;

                setError(null);
                setIsLoading(false);

                if (!detected.found) {
                    setNotFound(true);
                } else {
                    setNotFound(false);
                    const label = `${detected.currency}_${detected.denomination}`;
                    if (label !== lastLabelRef.current) {
                        lastLabelRef.current = label;
                        setResult(detected);
                        onEventRef.current?.(createEvent({
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

                        // Auto-read: announce the new note if the toggle is on
                        if (autoReadRef.current && speakRef.current) {
                            speakRef.current(describeCurrencyDetection(detected));
                        }
                    }
                }
                timerId = setTimeout(scan, DETECTION_INTERVAL_MS);
            } catch (err) {
                if (cancelled) return;
                console.warn('[NETRA CurrencyReader]', err);
                setError(
                    err instanceof CurrencyDetectionError
                        ? err.message
                        : INDIAN_VOICE_MESSAGES.CURRENCY_ERROR
                );
                setIsLoading(false);
                setIsDetecting(false);
            }
        }

        scan();
        return () => { cancelled = true; clearTimeout(timerId); controller.abort(); };
    }, [isDetecting, videoRef]);

    function handleStart() {
        lastLabelRef.current = '';
        setResult(null);
        setNotFound(false);
        setError(null);
        setIsDetecting(true);
    }

    function handleStop() {
        setIsDetecting(false);
        setIsLoading(false);
    }

    function handleRead() {
        speak(describeCurrencyDetection(result));
    }

    const handleAutoReadToggle = useCallback(() => {
        setAutoRead(prev => {
            const next = !prev;
            if (speak && isSupported) {
                speak(next
                    ? INDIAN_VOICE_MESSAGES.CURRENCY_AUTO_ON
                    : INDIAN_VOICE_MESSAGES.CURRENCY_AUTO_OFF
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
        hasResult: () => Boolean(resultRef.current?.found),
        isDetecting: () => isDetectingRef.current,
    }));

    const speechConnected = typeof speak === 'function' && typeof stop === 'function';
    const speechReady = speechConnected && isSupported;
    const canRead = speechReady && Boolean(result?.found);

    let badge = { className: 'badge--placeholder', label: 'IDLE' };
    if (IS_MOCK)          badge = { className: 'badge--placeholder', label: 'MOCK MODE' };
    else if (error)       badge = { className: 'badge--error',       label: 'ERROR' };
    else if (isDetecting) badge = { className: 'badge--active',      label: 'DETECTING' };

    let statusText = 'Detection is off.';
    if (isDetecting) {
        if (isLoading)     statusText = 'Hold on, checking the note…';
        else if (notFound) statusText = 'No note found. Hold the note flat and steady in good light, yaar.';
        else               statusText = 'Detection is running. Point at a banknote.';
    }

    const currencySymbol = result?.currency === 'INR' ? '₹' : '';
    const denominationDisplay = result?.found
        ? `${currencySymbol}${result.denomination} ${result.currency}`
        : null;

    return (
        <section className="module-card" aria-labelledby="currency-reader-heading">
            <div className="module-header">
                <h2 id="currency-reader-heading" className="module-title">Currency Reader</h2>
                <span className={`badge ${badge.className}`}>{badge.label}</span>
            </div>

            <p className="module-desc">
                Point the camera at a banknote, start detection, then press Read Aloud — or turn on Auto-Read.
            </p>

            {IS_MOCK && (
                <p className="notice" role="status">
                    Test mode: cycling through Indian banknote samples. Backend not connected.
                </p>
            )}

            {usesSharedCamera ? (
                !cameraActive && (
                    <p className="notice" role="status">Start the camera in the Camera panel to begin.</p>
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
                        />
                        {!cameraActive && (
                            <div className="video-placeholder" aria-hidden="true">
                                <span className="video-placeholder-icon" role="img" aria-label="Camera off">📷</span>
                                <span>Camera inactive</span>
                            </div>
                        )}
                    </div>

                    {camera.error && <p className="error-text" role="alert">{camera.error}</p>}

                    <div className="btn-group" role="group" aria-label="Camera controls">
                        <button
                            className="btn btn--primary"
                            onClick={camera.startCamera}
                            disabled={cameraActive || camera.status === 'requesting' || camera.status === 'unsupported'}
                        >
                            {camera.status === 'requesting' ? 'Requesting…' : 'Start Camera'}
                        </button>
                        <button className="btn btn--danger" onClick={camera.stopCamera} disabled={!cameraActive}>
                            Stop Camera
                        </button>
                    </div>
                </>
            )}

            {/* ── Detection controls ── */}
            <div className="btn-group" role="group" aria-label="Currency detection controls">
                <button
                    className="btn btn--primary"
                    onClick={handleStart}
                    disabled={!cameraActive || isDetecting}
                    aria-busy={isLoading}
                >
                    {isDetecting ? 'Detecting…' : 'Start Detection'}
                </button>
                <button className="btn btn--danger" onClick={handleStop} disabled={!isDetecting}>
                    Stop Detection
                </button>
            </div>

            {/* ── Auto-Read toggle ── */}
            <div className="btn-group" role="group" aria-label="Auto-read controls">
                <button
                    id="btn-currency-auto-read"
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
            {error && <p className="error-text" role="alert">{error}</p>}

            {/* ── Result box ── */}
            <div className="result-box" role="status" aria-live="polite" aria-atomic="true">
                <p className="result-label">
                    Detected Currency
                    {result?.isMock ? ' (sample)' : ''}
                    {autoRead && result?.found ? ' · Auto-reading' : ''}
                </p>
                {result?.found ? (
                    <>
                        <p className="result-text" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                            {denominationDisplay}
                        </p>
                        <p className="result-text" style={{ fontSize: '1rem', opacity: 0.8 }}>
                            {describeCurrencyDetection(result)}
                        </p>
                        <p className="result-confidence">
                            Confidence: {result.confidence !== null ? `${Math.round(result.confidence * 100)}%` : 'not available'}
                        </p>
                    </>
                ) : (
                    <p className="notice">No currency detected yet.</p>
                )}
            </div>

            {/* ── Read aloud ── */}
            <div className="btn-group" role="group" aria-label="Read aloud controls">
                <button className="btn btn--secondary" onClick={handleRead} disabled={!canRead}>
                    🔊 Read Aloud
                </button>
                <button className="btn btn--danger" onClick={() => stop()} disabled={!speechReady || !isSpeaking}>
                    Stop Audio
                </button>
            </div>

            {isSpeaking && (
                <p className="speaking-indicator" role="status" aria-live="polite">🔊 Speaking…</p>
            )}
        </section>
    );
});

export default CurrencyReader;