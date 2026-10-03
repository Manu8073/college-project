import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  Navigation,
  Clock,
  MapPin,
  ShieldCheck,
  Radio,
} from 'lucide-react';

function getManeuverIcon(text = '') {
  const t = text.toLowerCase();
  if (t.includes('sharp left') || t.includes('turn left') || t.includes('left')) {
    return <ArrowLeft size={24} />;
  }
  if (t.includes('sharp right') || t.includes('turn right') || t.includes('right')) {
    return <ArrowRight size={24} />;
  }
  if (t.includes('slight left')) {
    return <ArrowUpLeft size={24} />;
  }
  if (t.includes('slight right')) {
    return <ArrowUpRight size={24} />;
  }
  if (t.includes('u-turn') || t.includes('turn around')) {
    return <RotateCcw size={24} />;
  }
  return <ArrowUp size={24} />;
}

export function CompanionHUD({
  navState,
  instruction,
  destination,
  remainingM,
  gpsFix,
}) {
  const isNavigating = navState === 'navigating';
  const etaMinutes = remainingM ? Math.max(1, Math.round(remainingM / 1.3 / 60)) : 0;
  const accuracy = gpsFix?.accuracyM ? Math.round(gpsFix.accuracyM) : null;

  return (
    <header className="companion-hud-card" role="region" aria-label="Visual Navigation Status for Assistant">
      <div className="companion-hud-main">
        {/* Brand / Mode badge */}
        <div className="companion-brand-row">
          <div className="companion-brand-tag">
            <Radio size={14} className={isNavigating ? 'text-emerald animate-pulse' : 'text-cyan'} />
            <span className="companion-brand-title">Netra Assist</span>
          </div>

          <div className="companion-status-tag">
            <span className={`status-dot status-${navState}`} />
            <span className="status-label">{navState.toUpperCase()}</span>
            {accuracy !== null && (
              <span className="gps-accuracy-chip">GPS ±{accuracy}m</span>
            )}
          </div>
        </div>

        {/* Turn-by-Turn Instruction for Assisting Person */}
        {isNavigating ? (
          <div className="companion-turn-instruction">
            <div className="maneuver-icon-box">
              {getManeuverIcon(instruction)}
            </div>
            <div className="instruction-content">
              <div className="instruction-step-text">
                {instruction || 'Follow the highlighted route'}
              </div>
            </div>
          </div>
        ) : (
          <div className="companion-idle-banner">
            <span className="idle-heading">
              {navState === 'idle'
                ? 'Ready to Navigate'
                : navState === 'asking'
                  ? 'Listening for Destination...'
                  : navState === 'confirming'
                    ? 'Confirming Destination...'
                    : 'Finding Optimal Walking Route...'}
            </span>
          </div>
        )}

        {/* Navigation Summary Row (Destination, Distance, ETA) */}
        {destination && (
          <div className="companion-dest-metrics">
            <div className="dest-info-cell">
              <MapPin size={14} color="var(--accent-rose)" />
              <span className="dest-name" title={destination.name}>
                {destination.name}
              </span>
            </div>

            {isNavigating && remainingM !== null && (
              <div className="metrics-group">
                <span className="metric-pill">
                  <Navigation size={12} color="var(--accent-cyan)" />
                  <strong>{Math.round(remainingM)} m</strong>
                </span>

                <span className="metric-pill">
                  <Clock size={12} color="#fbbf24" />
                  <strong>~{etaMinutes} min</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
