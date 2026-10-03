const Ctor =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export class WebSpeechRecognizer {
  constructor() {
    this.rec = null;
  }

  listenOnce({ lang = 'en-IN', timeoutMs = 10000 } = {}) {
    if (!Ctor) {
      return Promise.reject(
        new Error('SpeechRecognition not supported (use Chrome/Safari)')
      );
    }

    return new Promise((resolve, reject) => {
      const rec = (this.rec = new Ctor());
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let done = false;

      const finish = (fn) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          fn();
        }
      };

      const t = setTimeout(() => {
        rec.abort();
        finish(() => reject(new Error('timeout')));
      }, timeoutMs);

      rec.onresult = (e) =>
        finish(() => resolve(e.results[0][0].transcript.trim()));

      rec.onerror = (e) => finish(() => reject(new Error(e.error)));

      rec.onend = () => finish(() => reject(new Error('no-speech')));

      try {
        rec.start();
      } catch (err) {
        finish(() => reject(err));
      }
    });
  }

  abort() {
    this.rec?.abort();
  }
}
