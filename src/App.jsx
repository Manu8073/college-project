import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, Navigation, Shield, Compass, Volume2, Search, Sparkles } from 'lucide-react';
import { WebSpeaker } from './adapters/web/WebSpeaker';
import { WebSpeechRecognizer } from './adapters/web/WebSpeechRecognizer';
import { WebLocationProvider } from './adapters/web/WebLocationProvider';
import { CocoDetector } from './adapters/web/CocoDetector';
import { WebCompass } from './adapters/web/WebCompass';
import { PlacesDestinationResolver } from './services/google/PlacesDestinationResolver';
import { RoutesPlanner } from './services/google/RoutesPlanner';
import { OverpassCrossings } from './services/osm/OverpassCrossings';
import { GoogleReverseGeocoder } from './services/google/GoogleReverseGeocoder';
import { HazardAnalyzer } from './core/HazardAnalyzer';
import { NavigationController } from './core/NavigationController';

import { CameraFeed } from './components/CameraFeed';
import { NavigationCard } from './components/NavigationCard';
import { HazardRadar } from './components/HazardRadar';
import { TelemetryBar } from './components/TelemetryBar';
import { ActivityLog } from './components/ActivityLog';
import { AccessibleControls } from './components/AccessibleControls';
import { ManualDestinationModal } from './components/ManualDestinationModal';

export default function App() {
  const [navState, setNavState] = useState('idle');
  const [instruction, setInstruction] = useState('');
  const [destination, setDestination] = useState(null);
  const [remainingM, setRemainingM] = useState(null);
  const [stepRemainingM, setStepRemainingM] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [hazards, setHazards] = useState([]);
  const [activeCrossing, setActiveCrossing] = useState(null);
  const [gpsFix, setGpsFix] = useState(null);
  const [compassHeading, setCompassHeading] = useState(null);
  const [isCamRunning, setIsCamRunning] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [detections, setDetections] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [micStatus, setMicStatus] = useState('');
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navRef = useRef(null);
  const detectorRef = useRef(null);
  const analyzerRef = useRef(null);
  const camRunningRef = useRef(false);
  const wantCamRef = useRef(false);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  const addLog = useCallback((s) => {
    setLogs((prev) => [...prev.slice(-150), `[${new Date().toLocaleTimeString()}] ${s}`]);
  }, []);

  // Initialize Core Services & Controller
  useEffect(() => {
    const isSecure = typeof window !== 'undefined' && window.isSecureContext;
    const sttAvailable =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    setSpeechAvailable(Boolean(sttAvailable));

    addLog(`System ready. SecureContext=${isSecure} STT=${sttAvailable ? 'available' : 'unavailable'}`);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' })
        .then((p) => {
          setMicStatus(p.state);
          addLog(`Mic permission: ${p.state}`);
          p.onchange = () => setMicStatus(p.state);
        })
        .catch(() => {
          setMicStatus('unsupported');
        });
    }

    const speaker = new WebSpeaker();
    const stt = new WebSpeechRecognizer();
    const loc = new WebLocationProvider();
    const resolver = new PlacesDestinationResolver();
    const planner = new RoutesPlanner();
    const crossings = new OverpassCrossings();
    const geocoder = new GoogleReverseGeocoder();
    const heading = new WebCompass();
    const analyzer = new HazardAnalyzer();

    analyzerRef.current = analyzer;

    const controller = new NavigationController({
      speaker,
      stt,
      loc,
      resolver,
      planner,
      crossings,
      geocoder,
      heading,
      log: (s) => addLog(s),
      onState: (s) => {
        setNavState(s);
        if (s === 'idle') {
          stopCamera();
          setRemainingM(null);
          setStepRemainingM(null);
          setHazards([]);
          setActiveCrossing(null);
        }
      },
      onDestination: (dest) => setDestination(dest),
      onRoute: (route) => {
        setTotalSteps(route.steps?.length || 0);
        setRemainingM(route.distanceM);
      },
      onInstruction: (text, idx) => {
        setInstruction(text);
        if (idx !== undefined) setStepIndex(idx);
      },
      onProgress: (p) => {
        setStepIndex(p.stepIndex);
        setStepRemainingM(p.stepRemainingM);
        setRemainingM(p.totalRemainingM);
      },
      onCrossing: (c) => {
        setActiveCrossing(c);
        setTimeout(() => setActiveCrossing(null), 8000);
      },
      onHazardsDetected: (hz) => {
        setHazards(hz);
      },
      onFix: (fix) => {
        setGpsFix(fix);
        if (fix.headingDeg != null) {
          setCompassHeading({ deg: fix.headingDeg });
        }
      },
    });

    navRef.current = controller;

    return () => {
      controller.stop();
      stopCamera();
    };
  }, [addLog]);

  // Vision loop function
  const runVisionLoop = useCallback(async () => {
    if (!camRunningRef.current) return;

    const t0 = performance.now();

    try {
      if (detectorRef.current && videoRef.current) {
        const dets = await detectorRef.current.detect();
        setDetections(dets);

        // Frame rate calculation
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastTimeRef.current >= 1000) {
          setFps(Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current)));
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        }

        // Run hazard analyzer
        if (analyzerRef.current && navRef.current) {
          const detectedHazards = analyzerRef.current.analyze(dets, t0);
          navRef.current.onHazards(detectedHazards);
        }
      }
    } catch (e) {
      addLog(`Vision loop error: ${e.message}`);
    }

    if (camRunningRef.current) {
      setTimeout(runVisionLoop, Math.max(0, 180 - (performance.now() - t0)));
    }
  }, [addLog]);

  // Camera management
  const startCamera = async () => {
    if (camRunningRef.current) return;
    wantCamRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (canvasRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth || 640;
          canvasRef.current.height = videoRef.current.videoHeight || 480;
        }
      }

      if (!detectorRef.current) {
        detectorRef.current = new CocoDetector(videoRef.current);
      }

      if (!modelLoaded) {
        addLog('Loading COCO-SSD machine learning model...');
        await detectorRef.current.load();
        setModelLoaded(true);
        addLog('COCO-SSD model ready for real-time vision.');
      }

      if (!wantCamRef.current) {
        stopCamera();
        return;
      }

      camRunningRef.current = true;
      setIsCamRunning(true);
      runVisionLoop();
    } catch (e) {
      addLog(`Camera error: ${e.message}`);
    }
  };

  const stopCamera = () => {
    wantCamRef.current = false;
    camRunningRef.current = false;
    setIsCamRunning(false);
    setDetections([]);
    setFps(0);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleCamera = () => {
    if (isCamRunning) {
      stopCamera();
    } else {
      void startCamera();
    }
  };

  // User actions
  const handleStart = async () => {
    // Camera failure must never block audio navigation
    void startCamera();
    if (navRef.current) {
      await navRef.current.open();
    }
  };

  const handleStop = () => {
    if (navRef.current) {
      navRef.current.stop();
    }
    stopCamera();
  };

  const handleVoiceCommand = async () => {
    if (navRef.current) {
      await navRef.current.listenForCommand();
    }
  };

  const handleToggleMute = () => {
    if (navRef.current) {
      const nextMuted = !isMuted;
      navRef.current.setMuted(nextMuted);
      setIsMuted(nextMuted);
      addLog(nextMuted ? 'Voice output muted' : 'Voice output unmuted');
    }
  };

  const handleManualDestination = async (query) => {
    void startCamera();
    if (navRef.current) {
      addLog(`Manual destination set: "${query}"`);
      await navRef.current.open(query);
    }
  };

  // Keyboard accessibility shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleVoiceCommand();
      } else if (e.code === 'Escape') {
        handleStop();
      } else if ((e.key === 'n' || e.key === 'N') && navState === 'idle') {
        handleStart();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navState, isMuted]);

  return (
    <div className="netra-container">
      {/* Top Header */}
      <header className="netra-header">
        <div className="brand-section">
          <div className="brand-logo" aria-hidden="true">
            <Eye size={24} />
          </div>
          <div>
            <h1 className="brand-title">Netra Navigation</h1>
            <div className="brand-subtitle">AI Assistive Walking Guide (React)</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="action-btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', minHeight: 'auto', fontSize: '0.825rem' }}
            title="Set destination manually or use quick suggestions"
          >
            <Search size={14} color="var(--accent-cyan)" />
            <span>Search Destination</span>
          </button>

          <div className={`header-status-badge status-${navState}`}>
            <span className="status-dot"></span>
            <span>{navState}</span>
          </div>
        </div>
      </header>

      {/* Primary Accessible Control Bar */}
      <AccessibleControls
        navState={navState}
        isMuted={isMuted}
        onStart={handleStart}
        onStop={handleStop}
        onVoiceCommand={handleVoiceCommand}
        onToggleMute={handleToggleMute}
      />

      {/* Main Grid: Guidance + Vision */}
      <main className="main-dashboard">
        {/* Left Column: Guidance & Vision Feed */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <NavigationCard
            navState={navState}
            instruction={instruction}
            destination={destination}
            remainingM={remainingM}
            stepRemainingM={stepRemainingM}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
          />

          <CameraFeed
            isRunning={isCamRunning}
            onToggleCamera={toggleCamera}
            detections={detections}
            fps={fps}
            modelLoaded={modelLoaded}
            videoRef={videoRef}
            canvasRef={canvasRef}
          />
        </section>

        {/* Right Column: Hazards, Telemetry, and Activity Log */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <HazardRadar
            hazards={hazards}
            activeCrossing={activeCrossing}
          />

          <TelemetryBar
            fix={gpsFix}
            heading={compassHeading}
            micStatus={micStatus}
            speechAvailable={speechAvailable}
          />

          <ActivityLog
            logs={logs}
            onClearLogs={() => setLogs([])}
          />
        </section>
      </main>

      {/* Manual Destination Input Dialog */}
      <ManualDestinationModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmitDestination={handleManualDestination}
      />
    </div>
  );
}
