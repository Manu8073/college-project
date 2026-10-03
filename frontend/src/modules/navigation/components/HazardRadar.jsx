import React from 'react';
import { AlertTriangle, ShieldAlert, Car, User, Box, TrafficCone, Compass } from 'lucide-react';

function getHazardIcon(kind) {
  switch (kind) {
    case 'vehicle':
      return <Car size={18} />;
    case 'person':
      return <User size={18} />;
    case 'traffic-light':
      return <TrafficCone size={18} />;
    default:
      return <Box size={18} />;
  }
}

export function HazardRadar({ hazards = [], activeCrossing = null }) {
  return (
    <div className="glass-panel" role="region" aria-label="Hazard alerts">
      <div className="panel-header">
        <div className="panel-title">
          <ShieldAlert size={18} color="var(--accent-rose)" />
          <span>Safety & Hazard Radar</span>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            background: hazards.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            color: hazards.length > 0 ? '#f87171' : '#34d399',
            fontWeight: 600,
          }}
        >
          {hazards.length === 0 ? 'Path Clear' : `${hazards.length} Alert${hazards.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Active Crossing Alert */}
      {activeCrossing && (
        <div className="crossing-alert-card">
          <div className="crossing-icon">
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.95rem' }}>
              Pedestrian Crossing Ahead
            </div>
            <div style={{ fontSize: '0.825rem', color: '#fff' }}>
              {activeCrossing.text}
            </div>
          </div>
        </div>
      )}

      {/* Hazards Feed */}
      <div className="hazards-list">
        {hazards.length === 0 && !activeCrossing && (
          <div
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-subtle)',
            }}
          >
            No immediate obstacles or approaching vehicles detected.
          </div>
        )}

        {hazards.map((h, idx) => {
          const isCritical = h.approaching || h.proximity === 'close' && h.kind === 'vehicle';
          const isWarning = h.proximity === 'close' || h.proximity === 'near';
          const priorityClass = isCritical
            ? 'hazard-critical'
            : isWarning
              ? 'hazard-warning'
              : 'hazard-info';

          return (
            <div key={`${h.label}-${h.direction}-${idx}`} className={`hazard-item ${priorityClass}`}>
              <div className="hazard-main">
                {getHazardIcon(h.kind)}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'capitalize' }}>
                    {h.label}
                    {h.approaching && ' (Approaching!)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                    Position: <strong>{h.direction}</strong> • Distance:{' '}
                    <strong>{h.proximity}</strong>
                  </div>
                </div>
              </div>
              <span className="hazard-tag">
                {isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'INFO'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
