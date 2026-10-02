import React from 'react';
import { Compass, Crosshair, Mic, ShieldCheck, Gauge } from 'lucide-react';

export function TelemetryBar({ fix, heading, micStatus, speechAvailable }) {
  return (
    <div className="glass-panel" role="region" aria-label="Device sensors & telemetry">
      <div className="panel-header">
        <div className="panel-title">
          <Crosshair size={18} color="var(--accent-cyan)" />
          <span>Device Telemetry & Sensors</span>
        </div>
      </div>

      <div className="telemetry-grid">
        {/* GPS Fix */}
        <div className="telemetry-cell">
          <span className="telemetry-label">GPS Accuracy</span>
          <span className="telemetry-val">
            {fix ? `±${Math.round(fix.accuracyM)} m` : 'Acquiring...'}
          </span>
        </div>

        {/* Latitude & Longitude */}
        <div className="telemetry-cell">
          <span className="telemetry-label">Coordinates</span>
          <span className="telemetry-val" style={{ fontSize: '0.75rem' }}>
            {fix ? `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : 'Waiting fix'}
          </span>
        </div>

        {/* Compass Heading */}
        <div className="telemetry-cell">
          <span className="telemetry-label">Orientation</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Compass
              size={15}
              color="var(--accent-cyan)"
              style={{
                transform: `rotate(${heading?.deg ? Math.round(heading.deg) : 0}deg)`,
                transition: 'transform 0.2s ease',
              }}
            />
            <span className="telemetry-val">
              {heading?.deg != null ? `${Math.round(heading.deg)}°` : 'Compass inactive'}
            </span>
          </div>
        </div>

        {/* Speed */}
        <div className="telemetry-cell">
          <span className="telemetry-label">Walking Speed</span>
          <span className="telemetry-val">
            {fix?.speedMps ? `${(fix.speedMps * 3.6).toFixed(1)} km/h` : '0 km/h'}
          </span>
        </div>

        {/* Voice Input */}
        <div className="telemetry-cell">
          <span className="telemetry-label">Voice / Mic</span>
          <span
            className="telemetry-val"
            style={{
              color: speechAvailable ? '#34d399' : '#f87171',
              fontSize: '0.8rem',
            }}
          >
            {speechAvailable ? (micStatus ? `Mic: ${micStatus}` : 'STT Ready') : 'Unsupported'}
          </span>
        </div>
      </div>
    </div>
  );
}
