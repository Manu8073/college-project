import type { SpeechRecognizer } from '../../core/ports';

const Ctor: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export class WebSpeechRecognizer implements SpeechRecognizer {
  private rec: any = null;

  listenOnce({ lang = 'en-IN', timeoutMs = 10000 } = {}): Promise<string> {
    if (!Ctor) return Promise.reject(new Error('SpeechRecognition not supported (use Chrome)'));
    return new Promise((resolve, reject) => {
      const rec = (this.rec = new Ctor());
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let done = false;
      const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(t); fn(); } };
      const t = setTimeout(() => { rec.abort(); finish(() => reject(new Error('timeout'))); }, timeoutMs);

      rec.onresult = (e: any) => finish(() => resolve(e.results[0][0].transcript.trim()));
      rec.onerror = (e: any) => finish(() => reject(new Error(e.error)));
      rec.onend = () => finish(() => reject(new Error('no-speech')));
      rec.start();
    });
  }
  abort() { this.rec?.abort(); }
}