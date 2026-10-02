import React from 'react';
import {
  Compass,
  MapPin,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  Navigation,
  Clock,
  Route as RouteIcon,
} from 'lucide-react';

function getManeuverIcon(text = '') {
  const t = text.toLowerCase();
  if (t.includes('sharp left') || t.includes('turn left') || t.includes('left')) {
    return <ArrowLeft size={28} />;
  }
  if (t.includes('sharp right') || t.includes('turn right') || t.includes('right')) {
    return <ArrowRight size={28} />;
  }
  if (t.includes('slight left')) {
    return <ArrowUpLeft size={28} />;
  }
  if (t.includes('slight right')) {
    return <ArrowUpRight size={28} />;
  }
  if (t.includes('u-turn') || t.includes('turn around')) {
    return <RotateCcw size={28} />;
  }
  return <ArrowUp size={28} />;
}

export function NavigationCard({
  navState,
  instruction,
  destination,
  remainingM,
  stepRemainingM,
  stepIndex,
  totalSteps,
}) {
  const isNavigating = navState === 'navigating';
  const etaMinutes = remainingM ? Math.max(1, Math.round(remainingM / 1.3 / 60)) : 0;

  return (
    <div className="glass-panel" role="region" aria-label="Navigation guidance">
      <div className="panel-header">
        <div className="panel-title">
          <Navigation size={18} color="var(--accent-cyan)" />
          <span>Active Guidance</span>
        </div>
        <span className="dest-label" style={{ fontSize: '0.75rem' }}>
          {isNavigating ? `Step ${stepIndex + 1} of ${totalSteps || 1}` : navState.toUpperCase()}
        </span>
      </div>

      {/* Main Instruction Display */}
      <div
        className="nav-instruction-banner"
        role="status"
        aria-live="assertive"
      >
        <div className="nav-turn-icon">
          {getManeuverIcon(instruction)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.2rem' }}>
            Current Instruction
          </div>
          <div className="instruction-text">
            {instruction || (
              navState === 'idle'
                ? 'Ready to navigate. Press "Start Navigation" or say "Open navigation".'
                : navState === 'asking'
                  ? 'Listening... Say your destination.'
                  : navState === 'confirming'
                    ? 'Confirming destination... Say Yes to begin or No to change.'
                    : navState === 'routing'
                      ? 'Finding safe walking route...'
                      : 'Preparing navigation...'
            )}
          </div>
        </div>
      </div>

      {/* Destination Card if available */}
      {destination && (
        <div className="dest-details">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <MapPin size={16} color="var(--accent-rose)" />
            <span className="dest-label">Destination</span>
          </div>
          <div className="dest-title">{destination.name}</div>
          {destination.address && (
            <div className="dest-address">{destination.address}</div>
          )}
        </div>
      )}

      {/* Progress & Metrics */}
      {isNavigating && (
        <div className="nav-metrics-row">
          <div className="metric-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <RouteIcon size={14} color="var(--accent-cyan)" />
              <span className="metric-title">Remaining</span>
            </div>
            <div className="metric-value">
              {remainingM !== null ? `${Math.round(remainingM)} m` : '—'}
            </div>
          </div>

          <div className="metric-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Clock size={14} color="#fbbf24" />
              <span className="metric-title">Est. Time</span>
            </div>
            <div className="metric-value">
              {etaMinutes > 0 ? `~${etaMinutes} min` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
