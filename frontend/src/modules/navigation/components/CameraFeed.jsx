import React, { useRef, useEffect } from 'react';
import { Camera, CameraOff, Eye, AlertTriangle } from 'lucide-react';

export function CameraFeed({
  isRunning,
  onToggleCamera,
  detections = [],
  fps = 0,
  modelLoaded = false,
  videoRef,
  canvasRef,
}) {
  // Whenever detections update, draw them to the overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !isRunning) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    const W = canvas.width || 640;
    const H = canvas.height || 480;
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 3;
    ctx.font = 'bold 15px sans-serif';

    for (const d of detections) {
      const { x, y, w, h } = d.box;
      const isVehicle = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.label);
      const isPerson = d.label === 'person';
      const color = isVehicle ? '#ef4444' : isPerson ? '#00e5ff' : '#10b981';

      ctx.strokeStyle = color;
      ctx.strokeRect(x * W, y * H, w * W, h * H);

      const labelText = `${d.label} ${Math.round(d.score * 100)}%`;
      const textWidth = ctx.measureText(labelText).width;
      const badgeY = y * H - 24 > 0 ? y * H - 24 : y * H;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x * W, badgeY, textWidth + 14, 22);

      ctx.fillStyle = color;
      ctx.fillText(labelText, x * W + 6, badgeY + 16);
    }
  }, [detections, isRunning, canvasRef, videoRef]);

  return (
    <div className="glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Eye size={18} color="var(--accent-cyan)" />
          <span>Real-time Vision & Hazard AI</span>
        </div>
        <button
          onClick={onToggleCamera}
          className={`action-btn btn-secondary`}
          style={{ padding: '0.4rem 0.8rem', minHeight: 'auto', fontSize: '0.85rem' }}
          aria-label={isRunning ? 'Turn off camera' : 'Turn on camera'}
        >
          {isRunning ? (
            <>
              <CameraOff size={15} color="#f87171" />
              <span>Disable Camera</span>
            </>
          ) : (
            <>
              <Camera size={15} color="#34d399" />
              <span>Enable Camera</span>
            </>
          )}
        </button>
      </div>

      <div className="camera-wrapper">
        {isRunning && (
          <>
            <div className="camera-live-badge">
              <span className="status-dot" style={{ background: '#fff' }}></span>
              <span>LIVE</span>
            </div>
            <div className="camera-stats-badge">
              {fps > 0 ? `${fps} FPS` : 'AI ACTIVE'} • {detections.length} objects
            </div>
          </>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="camera-video"
          aria-label="Obstacle detection camera view"
        />
        <canvas ref={canvasRef} className="camera-canvas" />

        {!isRunning && (
          <div className="camera-empty-state">
            <Camera size={44} color="var(--text-subtle)" />
            <p style={{ fontWeight: 600 }}>Camera Stream Inactive</p>
            <p style={{ fontSize: '0.825rem', maxWidth: '320px' }}>
              Camera starts automatically when you start navigation to detect vehicles,
              pedestrians, traffic signals, and obstacles.
            </p>
            <button
              onClick={onToggleCamera}
              className="action-btn btn-primary-go"
              style={{ padding: '0.6rem 1.2rem', minHeight: 'auto', fontSize: '0.9rem', marginTop: '0.5rem' }}
            >
              Start Camera Preview
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>
          Model:{' '}
          <strong style={{ color: modelLoaded ? '#34d399' : '#fbbf24' }}>
            {modelLoaded ? 'COCO-SSD Lite (Ready)' : 'Loading on demand...'}
          </strong>
        </span>
        <span>Objects in view: <strong style={{ color: '#fff' }}>{detections.length}</strong></span>
      </div>
    </div>
  );
}
