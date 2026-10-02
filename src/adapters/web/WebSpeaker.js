export class WebSpeaker {
  speak(text, opts = {}) {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      if (opts.interrupt ?? true) {
        speechSynthesis.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = opts.rate ?? 1.0;
      u.pitch = opts.pitch ?? 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve(); // never block the pipeline on TTS errors
      speechSynthesis.speak(u);
    });
  }

  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }
}
