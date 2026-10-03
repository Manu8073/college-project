import React, { useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Square, Volume2, Navigation, Loader2 } from 'lucide-react';

export function PrimaryMicButton({
  navState,
  onMicClick,
  onStop,
  isSpeaking,
}) {
  const [isPressing, setIsPressing] = useState(false);
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const pressTimerRef = useRef(null);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });

  const isNavigating = navState === 'navigating';
  const isAsking = navState === 'asking' || navState === 'confirming';
  const isRouting = navState === 'routing';
  const isIdle = navState === 'idle';

  // Get descriptive status text
  const getStatusText = () => {
    switch (navState) {
      case 'idle':
        return 'Tap to Speak Destination';
      case 'asking':
        return 'Listening... Speak Destination';
      case 'confirming':
        return 'Say Yes to Start, or No';
      case 'routing':
        return 'Calculating Route...';
      case 'navigating':
        return isSpeaking ? 'Speaking... (Tap to Interrupt)' : 'Tap to Speak (or Hold to Stop)';
      default:
        return 'Voice Navigation';
    }
  };

  // Get ARIA label for screen readers
  const getAriaLabel = () => {
    switch (navState) {
      case 'idle':
        return 'Start navigation. Tap to speak your destination.';
      case 'asking':
        return 'Listening for destination. Please speak your destination now, or tap to restart.';
      case 'confirming':
        return 'Confirming destination. Say yes to start navigation, or no to change.';
      case 'routing':
        return 'Finding walking route. Please wait.';
      case 'navigating':
        return 'Navigation active. Tap to interrupt speech instructions and give voice command. Press and hold to stop navigation.';
      default:
        return 'Primary microphone button';
    }
  };

  // Long-press handling for tactile stopping of navigation
  const handlePointerDown = (e) => {
    // Only primary button
    if (e.button !== undefined && e.button !== 0) return;

    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    setIsPressing(true);
    setLongPressTriggered(false);

    if (isNavigating || isAsking || isRouting) {
      pressTimerRef.current = setTimeout(() => {
        setLongPressTriggered(true);
        if (navigator.vibrate) navigator.vibrate(100);
        onStop?.();
      }, 1200);
    }
  };

  const handlePointerUp = (e) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsPressing(false);

    // If long press was triggered, don't execute regular click
    if (longPressTriggered) {
      setLongPressTriggered(false);
      return;
    }

    // Check if pointer moved significantly (drag instead of tap)
    const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);
    if (dx > 20 || dy > 20) return;

    onMicClick?.();
  };

  const handlePointerCancel = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsPressing(false);
    setLongPressTriggered(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onMicClick?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onStop?.();
    }
  };

  const buttonStateClass = isAsking
    ? 'mic-btn-asking'
    : isNavigating
      ? 'mic-btn-navigating'
      : isRouting
        ? 'mic-btn-routing'
        : 'mic-btn-idle';

  return (
    <div className="primary-mic-wrapper" role="region" aria-label="Voice Controls">
      {/* Ripple Rings */}
      <div className={`mic-ripple-container ${buttonStateClass}`}>
        <div className="mic-ring ring-1" />
        <div className="mic-ring ring-2" />
        <div className="mic-ring ring-3" />
      </div>

      {/* The Single Primary Microphone Button */}
      <button
        id="primary-mic-btn"
        className={`primary-mic-btn ${buttonStateClass} ${isPressing ? 'is-pressing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        aria-label={getAriaLabel()}
        title={getStatusText()}
        tabIndex={0}
      >
        <div className="mic-btn-content">
          {isRouting ? (
            <Loader2 className="mic-icon animate-spin" size={42} />
          ) : isAsking ? (
            <Mic className="mic-icon mic-pulse" size={44} />
          ) : isNavigating ? (
            <Mic className="mic-icon" size={44} />
          ) : (
            <Mic className="mic-icon" size={44} />
          )}
        </div>
      </button>

      {/* Dynamic Status Pill */}
      <div className={`mic-status-pill ${buttonStateClass}`} aria-hidden="true">
        <span className="status-indicator-dot" />
        <span className="status-text">{getStatusText()}</span>
      </div>

      {/* Subtle accessible helper hint */}
      <div className="mic-shortcut-hint" aria-hidden="true">
        {isNavigating
          ? 'Tap to speak commands • Hold or say "Stop" to exit'
          : 'Tap mic or press Space to begin'}
      </div>
    </div>
  );
}
