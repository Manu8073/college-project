import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Navigation as NavIcon } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
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

import './NavigationPanel.css';

export default function NavigationPanel() {
  const [navState, setNavState] = useState('idle');
  const [instruction, setInstruction] = useState('');
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
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

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

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
          setRoute(null);
        }
      },
      onDestination: (dest) => setDestination(dest),
      onRoute: (route) => {
        setRoute(route);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#111', borderRadius: '16px', overflow: 'hidden' }}>
      
      {/* Map Section for Visual Helpers */}
      <div style={{ flexGrow: 1, position: 'relative' }}>
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={gpsFix ? { lat: gpsFix.latitude, lng: gpsFix.longitude } : { lat: 20.5937, lng: 78.9629 }}
            zoom={18}
            options={{ disableDefaultUI: true }}
          >
            {gpsFix && (
              <Marker position={{ lat: gpsFix.latitude, lng: gpsFix.longitude }} icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
            )}
            {destination && (
               <Marker position={{ lat: destination.latitude, lng: destination.longitude }} />
            )}
            {route && route.path && (
               <Polyline path={route.path} options={{ strokeColor: '#00BFFF', strokeWeight: 6 }} />
            )}
          </GoogleMap>
        ) : (
          <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>Loading Map...</div>
        )}

        {/* Small Camera Preview for Vision System (Kept for functional requirements but visually minimal) */}
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>

      {/* Voice-First Interaction Area */}
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
         <button 
           onClick={() => {
              if (navState === 'idle') handleStart();
              else handleVoiceCommand();
           }}
           style={{ 
             width: '120px', 
             height: '120px', 
             borderRadius: '50%', 
             backgroundColor: navState !== 'idle' ? '#E91E63' : '#2196F3',
             border: 'none',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
             cursor: 'pointer'
           }}
           aria-label="Microphone Button"
         >
            <Mic size={56} color="#fff" />
         </button>
         <h2 style={{ color: '#fff', marginTop: '1.5rem', fontSize: '1.5rem', fontWeight: '500' }}>
            {navState === 'idle' ? 'Tap to Navigate' : 'Tap to Speak'}
         </h2>
         {instruction && (
            <p style={{ color: '#aaa', marginTop: '0.75rem', textAlign: 'center', maxWidth: '90%', fontSize: '1.1rem' }}>
               {instruction}
            </p>
         )}
      </div>
    </div>
  );
}
