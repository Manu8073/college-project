/**
 * NETRA — Speech Service
 * ─────────────────────────────────────────────────────────────
 * Wraps the Web Speech API (SpeechSynthesis) with a simple queue
 * so audio messages never overlap.
 *
 * Usage:
 *   const { speak, stop, isSpeaking, isSupported } = useSpeech();
 *   speak('NETRA system initialized');
 *
 * Architecture note:
 *   The internal queue is consumed one message at a time.
 *   Future modules should call `speak()` from the Shell's audio
 *   manager, not directly, so priority ordering can be applied.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { SPEECH_DEFAULTS } from '../../shared/constants/index.js';
import { isSpeechSupported } from '../../shared/utils/index.js';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(isSpeechSupported);

  // Internal FIFO queue of { text, priority } objects
  const queue   = useRef([]);
  const busy    = useRef(false);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  /** Processes the next item in the queue */
  const processQueue = useCallback(() => {
    if (busy.current || queue.current.length === 0) return;

    busy.current = true;
    setIsSpeaking(true);

    const { text } = queue.current.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang   = SPEECH_DEFAULTS.lang;
    utterance.rate   = SPEECH_DEFAULTS.rate;
    utterance.pitch  = SPEECH_DEFAULTS.pitch;
    utterance.volume = SPEECH_DEFAULTS.volume;

    utterance.onend = () => {
      busy.current = false;
      setIsSpeaking(queue.current.length > 0);
      processQueue();
    };

    utterance.onerror = (event) => {
      console.warn('[NETRA Speech] Utterance error:', event.error);
      busy.current = false;
      setIsSpeaking(queue.current.length > 0);
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Queues text to be spoken.
   * @param {string} text - The message to speak.
   */
  const speak = useCallback((text) => {
    if (!isSupported || !text) return;
    queue.current.push({ text });
    processQueue();
  }, [isSupported, processQueue]);

  /**
   * Immediately cancels all speech and clears the queue.
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    queue.current = [];
    busy.current  = false;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
  };
}
