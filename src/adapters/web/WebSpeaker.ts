import type { Speaker } from '../../core/ports';

export class WebSpeaker implements Speaker {
  speak(text: string, opts: { interrupt?: boolean } = {}): Promise<void> {
    return new Promise((resolve) => {
      if (opts.interrupt ?? true) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve(); // never block the pipeline on TTS errors
      speechSynthesis.speak(u);
    });
  }
  stop() { speechSynthesis.cancel(); }
}