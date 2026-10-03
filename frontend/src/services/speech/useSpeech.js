/**
 * NETRA — Speech Service
 * ─────────────────────────────────────────────────────────────
 * Wraps the Web Speech API (SpeechSynthesis) with a simple queue
 * so audio messages never overlap.
 *
 * Usage:
 *   const { speak, stop, isSpeaking, isSupported, lastSpokenText } = useSpeech();
 *   speak('NETRA system initialized');
 *
 * Architecture note:
 *   The internal queue is consumed one message at a time.
 *   Future modules should call `speak()` from the Shell's audio
 *   manager, not directly, so priority ordering can be applied.
 *
 * `lastSpokenText` (added for the Voice Assistant's "repeat" command):
 *   Tracks the most recent text passed to speak(), so any module can
 *   ask the user to hear it again without keeping its own copy.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { SPEECH_DEFAULTS } from '../../shared/constants/index.js';
import { isSpeechSupported } from '../../shared/utils/index.js';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(isSpeechSupported);
  const [lastSpokenText, setLastSpokenText] = useState('');

  // Internal FIFO queue of { text, priority } objects
  const queue   = useRef([]);
  const busy    = useRef(false);

  // FIX 1: Prevent garbage collection of the active utterance.
  // Chrome/Safari aggressively garbage collects local SpeechSynthesisUtterance
  // variables, which causes the 'onend' event to never fire, permanently
  // locking the queue in a "busy=true" state.
  const activeUtterance = useRef(null);

  // FIX 2: Watchdog timer in case speech gets permanently stuck anyway
  // (e.g., due to an OS-level audio routing issue).
  const watchdog = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
      clearTimeout(watchdog.current);
    };
  }, [isSupported]);

  /** Pick the best available voice for natural-sounding speech */
  const pickVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Priority 1: Google/Microsoft natural/neural voices in en-IN
    const naturalIN = voices.find(v =>
      v.lang === 'en-IN' && /google|microsoft|natural|neural/i.test(v.name)
    );
    if (naturalIN) return naturalIN;

    // Priority 2: Any en-IN voice
    const anyIN = voices.find(v => v.lang === 'en-IN');
    if (anyIN) return anyIN;

    // Priority 3: Google/Microsoft natural en-US/en-GB voices
    const naturalEN = voices.find(v =>
      v.lang.startsWith('en') && /google|microsoft|natural|neural/i.test(v.name)
    );
    if (naturalEN) return naturalEN;

    // Priority 4: Any English voice
    return voices.find(v => v.lang.startsWith('en')) ?? null;
  }, []);

  /** Processes the next item in the queue */
  const processQueue = useCallback(() => {
    if (busy.current || queue.current.length === 0) return;

    busy.current = true;
    setIsSpeaking(true);

    const { text } = queue.current.shift();
    const utterance = new SpeechSynthesisUtterance(text);

    // Store in ref to prevent garbage collection
    activeUtterance.current = utterance;

    utterance.lang   = SPEECH_DEFAULTS.lang;
    utterance.rate   = SPEECH_DEFAULTS.rate;
    utterance.pitch  = SPEECH_DEFAULTS.pitch;
    utterance.volume = SPEECH_DEFAULTS.volume;

    // Apply best available voice
    const bestVoice = pickVoice();
    if (bestVoice) utterance.voice = bestVoice;

    const cleanup = () => {
        clearTimeout(watchdog.current);
        activeUtterance.current = null;
        busy.current = false;
        
        // Check if there are more items in the queue
        if (queue.current.length > 0) {
            setIsSpeaking(true);
            processQueue();
        } else {
            setIsSpeaking(false);
        }
    };

    utterance.onend = () => {
      cleanup();
    };

    utterance.onerror = (event) => {
      console.warn('[NETRA Speech] Utterance error:', event.error);
      cleanup();
    };

    // Watchdog: scale timeout to text length (min 15s, max 60s) in case speech stalls
    const watchdogMs = Math.min(60000, Math.max(15000, text.length * 80));
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
        console.warn('[NETRA Speech] Watchdog timeout: unblocking stuck speech queue.');
        if (isSupported) window.speechSynthesis.cancel();
        cleanup();
    }, watchdogMs);

    // FIX 3: Wake up suspended audio context right before speaking
    try {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    } catch (e) {
        // ignore
    }

    window.speechSynthesis.speak(utterance);
  }, [isSupported, pickVoice]);

  /**
   * Queues text to be spoken.
   * @param {string} text - The message to speak.
   */
  const speak = useCallback((text) => {
    if (!isSupported || !text) return;
    queue.current.push({ text });
    setLastSpokenText(text);
    
    // Explicitly try to resume before processing queue to fix Chrome silent audio
    try {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    } catch (e) {
        // ignore
    }
    
    processQueue();
  }, [isSupported, processQueue]);

  /**
   * Immediately cancels all speech and clears the queue.
   */
  const stop = useCallback(() => {
    if (!isSupported) return;
    queue.current = [];
    busy.current  = false;
    activeUtterance.current = null;
    clearTimeout(watchdog.current);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    lastSpokenText,
  };
}
