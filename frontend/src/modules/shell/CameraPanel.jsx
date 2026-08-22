/**
 * NETRA — Camera Panel Component
 * ─────────────────────────────────────────────────────────────
 * Part of the Shell module.
 * Uses the camera service hook. Camera permission is only requested
 * when the user clicks "Start Camera".
 *
 * The detection module will later attach to videoRef to read frames.
 */

import { useCamera } from '../../services/camera/useCamera.js';

export default function CameraPanel() {
  const { videoRef, status, error, startCamera, stopCamera } = useCamera();

  const isActive = status === 'active';

  return (
    <section className="module-card camera-card" aria-labelledby="camera-heading">
      <div className="module-header">
        <h2 id="camera-heading" className="module-title">Camera</h2>
        <span className={`badge ${isActive ? 'badge--active' : 'badge--placeholder'}`}>
          {isActive ? 'CAMERA ACTIVE' : status === 'error' ? 'ERROR' : 'IDLE'}
        </span>
      </div>

      <p className="module-desc">
        Live camera feed via WebRTC. Detection module will read frames from this stream.
      </p>

      {/* Live video element — hidden when camera is inactive */}
      <div className="video-wrapper" aria-label="Camera feed">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`video-feed ${isActive ? 'video-feed--active' : ''}`}
          aria-hidden={!isActive}
          aria-label="Live camera feed"
        />
        {!isActive && (
          <div className="video-placeholder" aria-hidden="true">
            <span className="video-placeholder-icon" role="img" aria-label="Camera off">📷</span>
            <span>Camera inactive</span>
          </div>
        )}
      </div>

      {error && (
        <p className="error-text" role="alert">{error}</p>
      )}

      <div className="btn-group">
        <button
          id="btn-start-camera"
          className="btn btn--primary"
          onClick={startCamera}
          disabled={isActive || status === 'requesting' || status === 'unsupported'}
          aria-busy={status === 'requesting'}
        >
          {status === 'requesting' ? 'Requesting…' : 'Start Camera'}
        </button>

        <button
          id="btn-stop-camera"
          className="btn btn--danger"
          onClick={stopCamera}
          disabled={!isActive}
        >
          Stop Camera
        </button>
      </div>

      {status === 'unsupported' && (
        <p className="notice" role="status">Camera API is not supported in this browser.</p>
      )}
    </section>
  );
}
