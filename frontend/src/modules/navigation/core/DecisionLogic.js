export const RANK = {
  info: 0,
  instruction: 1,
  warning: 2,
  critical: 3,
};

/**
 * Single speech channel.
 * Higher priority interrupts; a newer instruction replaces an older one;
 * info never queues.
 */
export class SpeechArbiter {
  constructor(speaker) {
    this.speaker = speaker;
    this.current = null;
    this.pending = null;
    this.lastSpoken = new Map();
    this.muted = false;
  }

  say(u) {
    // Cooldown / dedupe
    if (u.key && u.cooldownMs) {
      const last = this.lastSpoken.get(u.key);
      if (last !== undefined && Date.now() - last < u.cooldownMs) return;
    }

    // When muted, suppress non-critical speech unless it should
    // replace an existing pending item.
    if (this.muted && u.priority !== 'critical') {
      if (
        u.priority !== 'info' &&
        (!this.pending || RANK[u.priority] >= RANK[this.pending.priority])
      ) {
        return;
      }
    }

    if (!this.current) {
      void this.play(u);
      return;
    }

    const r = RANK[u.priority];
    const c = RANK[this.current.priority];

    if (r > c || (r === c && u.priority === 'instruction')) {
      // Don't lose a navigation instruction that got interrupted by a warning
      if (
        this.current.priority === 'instruction' &&
        u.priority !== 'instruction'
      ) {
        this.pending = this.current;
      }

      void this.play(u);
    } else if (u.priority !== 'info') {
      if (!this.pending || r >= RANK[this.pending.priority]) {
        this.pending = u;
      }
    }
  }

  clear() {
    this.current = null;
    this.pending = null;
    this.muted = false;
  }

  setMuted(m) {
    this.muted = m;

    if (m) {
      // Preserve an active navigation instruction so it can
      // resume after unmuting.
      if (this.current?.priority === 'instruction') {
        this.pending = this.current;
      }

      this.current = null;
      this.speaker.stop();
    } else if (this.pending) {
      const next = this.pending;
      this.pending = null;
      void this.play(next);
    }
  }

  async play(u) {
    this.current = u;

    if (u.key) {
      this.lastSpoken.set(u.key, Date.now());
    }

    await this.speaker.speak(u.text, { interrupt: true });

    if (this.current !== u) return; // preempted or cleared

    this.current = null;

    const next = this.pending;
    this.pending = null;

    if (next) {
      void this.play(next);
    }
  }
}

const side = (d) => (d === 'ahead' ? 'ahead' : `on your ${d}`);

export function hazardToUtterance(h) {
  const key = `${h.kind}:${h.direction}`;

  switch (h.kind) {
    case 'vehicle':
      if (h.approaching) {
        return {
          text: `Vehicle approaching ${side(h.direction)}`,
          priority: 'critical',
          key,
          cooldownMs: 4000,
        };
      }

      if (h.proximity === 'close') {
        return {
          text: `Vehicle close ${side(h.direction)}`,
          priority: 'warning',
          key,
          cooldownMs: 8000,
        };
      }

      return null;

    case 'person':
      if (h.direction === 'ahead' && h.proximity === 'close') {
        return {
          text: 'Person ahead',
          priority: 'warning',
          key,
          cooldownMs: 6000,
        };
      }

      return null;

    case 'obstacle':
      if (h.proximity !== 'far' && h.direction === 'ahead') {
        return {
          text: `Obstacle ahead, ${h.label}`,
          priority: 'warning',
          key,
          cooldownMs: 6000,
        };
      }

      return null;

    case 'traffic-light':
      // COCO can't read signal state. Announce presence only;
      // never imply it's safe to cross.
      return {
        text: 'Traffic signal ahead',
        priority: 'info',
        key,
        cooldownMs: 20000,
      };

    default:
      return null;
  }
}
