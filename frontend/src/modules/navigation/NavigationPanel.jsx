import React, { useState, useEffect, useRef, useCallback } from 'react';
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

import { LiveMap } from './components/LiveMap';
import { PrimaryMicButton } from './components/PrimaryMicButton';
import { CompanionHUD } from './components/CompanionHUD';
import { MiniCameraPip } from './components/MiniCameraPip';

import './NavigationPanel.css';

export default function NavigationPanel() {
  const [navState, setNavState] = useState('idle');
  const [instruction, setInstruction] = useState('');
  const [destination, setDestination] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [remainingM, setRemainingM] = useState(null);
  const [gpsFix, setGpsFix] = useState(null);
  const [compassHeading, setCompassHeading] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCamRunning, setIsCamRunning] = useState(false);
  const [detections, setDetections] = useState([]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navRef = useRef(null);
  const detectorRef = useRef(null);
  const analyzerRef = useRef(null);
  const camRunningRef = useRef(false);
  const wantCamRef = useRef(false);
  const modelLoadedRef = useRef(false);

  // Background vision loop for obstacle & hazard detection
  const runVisionLoop = useCallback(async () => {
    if (!camRunningRef.current) return;

    const t0 = performance.now();

    try {
      if (detectorRef.current && videoRef.current) {
        const dets = await detectorRef.current.detect();
        setDetections(dets);

        if (analyzerRef.current && navRef.current) {
          const detectedHazards = analyzerRef.current.analyze(dets, t0);
          navRef.current.onHazards(detectedHazards);
        }
      }
    } catch {
      // Vision loop continues silently in background without disrupting navigation
    }

    if (camRunningRef.current) {
      setTimeout(runVisionLoop, Math.max(0, 180 - (performance.now() - t0)));
    }
  }, []);

  // Camera management
  const startCamera = useCallback(async () => {
    if (camRunningRef.current) return;
    wantCamRef.current = true;

    try {
      const stream = await navigator.mediaDevices?.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (!stream) return;
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (canvasRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth || 640;
          canvasRef.current.height = videoRef.current.videoHeight || 480;
        }
      }

      if (!detectorRef.current && videoRef.current) {
        detectorRef.current = new CocoDetector(videoRef.current);
      }

      if (!modelLoadedRef.current && detectorRef.current) {
        await detectorRef.current.load();
        modelLoadedRef.current = true;
      }

      if (!wantCamRef.current) {
        stopCamera();
        return;
      }

      camRunningRef.current = true;
      setIsCamRunning(true);
      runVisionLoop();
    } catch (e) {
      console.warn('Camera obstacle detection unavailable:', e.message);
    }
  }, [runVisionLoop]);

  const stopCamera = useCallback(() => {
    wantCamRef.current = false;
    camRunningRef.current = false;
    setIsCamRunning(false);
    setDetections([]);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (camRunningRef.current) {
      stopCamera();
    } else {
      void startCamera();
    }
  }, [startCamera, stopCamera]);

  // Initialize Core Services & Navigation Controller
  useEffect(() => {
    const speaker = new WebSpeaker((speaking) => setIsSpeaking(speaking));
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
      log: (s) => console.log(`[Netra] ${s}`),
      onState: (s) => {
        setNavState(s);
        if (s === 'idle') {
          stopCamera();
          setRemainingM(null);
          setDestination(null);
          setCurrentRoute(null);
          setInstruction('');
        }
      },
      onDestination: (dest) => setDestination(dest),
      onRoute: (route) => {
        setCurrentRoute(route);
        setRemainingM(route.distanceM);
      },
      onInstruction: (text) => {
        setInstruction(text);
      },
      onProgress: (p) => {
        setRemainingM(p.totalRemainingM);
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
  }, [stopCamera]);

  // Primary Single Mic Button Action (Voice Start, Barge-In, Interruption)
  const handleMicClick = useCallback(async () => {
    void startCamera();
    if (navRef.current) {
      await navRef.current.handleMicClick();
    }
  }, [startCamera]);

  // Stop Action (via long press on mic button or Escape key)
  const handleStop = useCallback(() => {
    if (navRef.current) {
      navRef.current.stop();
    }
    stopCamera();
  }, [stopCamera]);

  return (
    <div className="netra-minimal-app navigation-panel-wrapper">
      {/* Visual Live Map for Accompanying Assistant */}
      <LiveMap
        userLocation={gpsFix}
        compassHeading={compassHeading}
        route={currentRoute}
        destination={destination}
        navState={navState}
      />

      {/* Floating Guidance HUD for Accompanying Assistant */}
      <CompanionHUD
        navState={navState}
        instruction={instruction}
        destination={destination}
        remainingM={remainingM}
        gpsFix={gpsFix}
      />

      {/* The Single Primary Microphone Button for the Blind User */}
      <PrimaryMicButton
        navState={navState}
        onMicClick={handleMicClick}
        onStop={handleStop}
        isSpeaking={isSpeaking}
      />

      {/* Minimalistic Corner Camera Preview for Demo */}
      <MiniCameraPip
        videoRef={videoRef}
        canvasRef={canvasRef}
        isRunning={isCamRunning}
        detections={detections}
        onToggleCamera={toggleCamera}
      />
    </div>
  );
}
