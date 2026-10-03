import React, { useEffect, useState } from 'react';
import { Camera, CameraOff, Eye, Maximize2, Minimize2 } from 'lucide-react';

export function MiniCameraPip({
  videoRef,
  canvasRef,
  isRunning,
  detections = [],
  onToggleCamera,
}) {
  const [isMinimized, setIsMinimized] = useState(false);

  // Draw AI bounding boxes onto the canvas overlay
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
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';

    for (const d of detections) {
      const { x, y, w, h } = d.box;
      const isVehicle = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.label);
      const isPerson = d.label === 'person';
      const color = isVehicle ? '#ef4444' : isPerson ? '#00e5ff' : '#10b981';

      ctx.strokeStyle = color;
      ctx.strokeRect(x * W, y * H, w * W, h * H);

      const labelText = `${d.label} ${Math.round(d.score * 100)}%`;
      const textWidth = ctx.measureText(labelText).width;
      const badgeY = y * H - 22 > 0 ? y * H - 22 : y * H;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x * W, badgeY, textWidth + 12, 20);

      ctx.fillStyle = color;
      ctx.fillText(labelText, x * W + 6, badgeY + 14);
    }
  }, [detections, isRunning, canvasRef, videoRef]);

  if (isMinimized) {
    return (
      <div className="mini-camera-collapsed" onClick={() => setIsMinimized(false)}>
        <Eye size={16} color="var(--accent-cyan)" />
        <span>Camera Demo</span>
        <Maximize2 size={13} color="#94a3b8" />
      </div>
    );
  }

  return (
    <div className="mini-camera-card" role="region" aria-label="AI Obstacle Detection Camera Preview">
      {/* Header Bar */}
      <div className="mini-camera-header">
        <div className="mini-camera-title">
          <Eye size={14} color="var(--accent-cyan)" />
          <span>AI Vision</span>
          {isRunning && (
            <span className="mini-camera-badge">
              <span className="live-dot" />
              {detections.length} {detections.length === 1 ? 'obj' : 'objs'}
            </span>
          )}
        </div>

        <div className="mini-camera-controls">
          <button
            onClick={onToggleCamera}
            className="mini-cam-btn"
            title={isRunning ? 'Turn Off Camera' : 'Turn On Camera Preview'}
            aria-label={isRunning ? 'Turn off camera' : 'Turn on camera preview'}
          >
            {isRunning ? (
              <CameraOff size={13} color="#f87171" />
            ) : (
              <Camera size={13} color="#34d399" />
            )}
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="mini-cam-btn"
            title="Minimize Camera Window"
            aria-label="Minimize camera preview"
          >
            <Minimize2 size={13} color="#94a3b8" />
          </button>
        </div>
      </div>

      {/* Video & AI Canvas Stream Viewport */}
      <div className="mini-camera-viewport" onClick={!isRunning ? onToggleCamera : undefined}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`mini-camera-video ${!isRunning ? 'is-hidden' : ''}`}
        />
        <canvas
          ref={canvasRef}
          className={`mini-camera-canvas ${!isRunning ? 'is-hidden' : ''}`}
        />

        {!isRunning && (
          <div className="mini-camera-idle">
            <Camera size={26} color="var(--text-subtle)" />
            <span className="idle-text">Camera Idle</span>
            <span className="idle-hint">Tap to open camera</span>
          </div>
        )}
      </div>
    </div>
  );
}
