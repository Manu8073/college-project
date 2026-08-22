/**
 * NETRA — Camera Service Hook
 * ─────────────────────────────────────────────────────────────
 * Wraps navigator.mediaDevices.getUserMedia in a React hook.
 *
 * Usage:
 *   const { videoRef, status, error, startCamera, stopCamera } = useCamera();
 *
 * The `videoRef` should be attached to a <video> element.
 * The detection module can later use `videoRef.current` to read frames.
 */

import { useRef, useState, useCallback } from 'react';
import { CAMERA_CONSTRAINTS } from '../../shared/constants/index.js';
import { isCameraSupported } from '../../shared/utils/index.js';

/** @typedef {'idle'|'requesting'|'active'|'error'|'unsupported'} CameraStatus */

export function useCamera() {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);

  const [status, setStatus] = useState(
    /** @type {CameraStatus} */ (isCameraSupported() ? 'idle' : 'unsupported')
  );
  const [error, setError] = useState(/** @type {string|null} */ (null));

  /**
   * Requests camera permission and starts the live stream.
   * Permission prompt appears only when this is called.
   */
  const startCamera = useCallback(async () => {
    if (!isCameraSupported()) {
      setStatus('unsupported');
      setError('Camera API is not supported in this browser.');
      return;
    }

    setStatus('requesting');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStatus('active');
    } catch (err) {
      streamRef.current = null;
      setStatus('error');

      // Provide a user-friendly message for the most common error cases
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera device found on this device.');
      } else {
        setError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  /**
   * Stops all camera tracks and cleans up the stream.
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
    setError(null);
  }, []);

  return {
    videoRef,   // attach to <video ref={videoRef} autoPlay playsInline muted />
    status,     // CameraStatus string
    error,      // error message string or null
    startCamera,
    stopCamera,
  };
}
