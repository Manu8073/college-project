import React from 'react';
import { Play, Square, Mic, Volume2, VolumeX, Sparkles } from 'lucide-react';

export function AccessibleControls({
  navState,
  isMuted,
  onStart,
  onStop,
  onVoiceCommand,
  onToggleMute,
}) {
  const isNavigating = navState !== 'idle';

  return (
    <div className="action-grid" role="group" aria-label="Primary navigation controls">
      {/* Start / Open Navigation Button */}
      <button
        id="go"
        onClick={onStart}
        disabled={isNavigating}
        className={`action-btn btn-primary-go`}
        style={{
          opacity: isNavigating ? 0.6 : 1,
          cursor: isNavigating ? 'not-allowed' : 'pointer',
        }}
        aria-label="Open Navigation. Press to speak destination and start route."
      >
        <Play size={24} fill="currentColor" />
        <span>Open Navigation</span>
        <span className="shortcut-hint">Key: N</span>
      </button>

      {/* Stop Button */}
      <button
        id="stop"
        onClick={onStop}
        disabled={!isNavigating}
        className={`action-btn btn-primary-stop`}
        style={{
          opacity: !isNavigating ? 0.5 : 1,
          cursor: !isNavigating ? 'not-allowed' : 'pointer',
        }}
        aria-label="Stop navigation and speech instructions"
      >
        <Square size={22} fill="currentColor" />
        <span>Stop Navigation</span>
        <span className="shortcut-hint">Esc</span>
      </button>

      {/* Voice Command Button */}
      <button
        id="cmd"
        onClick={onVoiceCommand}
        className={`action-btn btn-voice-cmd`}
        aria-label="Voice command. Say repeat, where am I, how far, or stop."
      >
        <Mic size={24} />
        <span>Voice Command</span>
        <span className="shortcut-hint">Space</span>
      </button>

      {/* Mute Audio Button */}
      <button
        id="mute"
        onClick={onToggleMute}
        className={`action-btn btn-secondary`}
        aria-label={isMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
      >
        {isMuted ? (
          <>
            <VolumeX size={22} color="#f87171" />
            <span>Unmute Voice</span>
          </>
        ) : (
          <>
            <Volume2 size={22} color="var(--accent-cyan)" />
            <span>Mute Voice</span>
          </>
        )}
        <span className="shortcut-hint">M</span>
      </button>
    </div>
  );
}
