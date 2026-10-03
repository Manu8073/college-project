// W3C compass-heading formula: direction the back of the device points, valid at any tilt.
function headingFromEuler(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const x = beta * r;
  const y = gamma * r;
  const z = alpha * r;
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(Vx / Vy);
  if (Vy < 0) h += Math.PI;
  else if (Vx < 0) h += 2 * Math.PI;
  return (h * 180) / Math.PI;
}

export class WebCompass {
  constructor() {
    this.deg = null;
    this.smooth = null;
    this.on = (e) => {
      let raw = null;
      if (typeof e.webkitCompassHeading === 'number') {
        raw = e.webkitCompassHeading; // iOS: assumes flat, unreliable upright
      } else if (
        e.absolute &&
        e.alpha != null &&
        e.beta != null &&
        e.gamma != null
      ) {
        raw = headingFromEuler(e.alpha, e.beta, e.gamma);
      }
      if (raw == null) return;
      // circular low-pass filter
      const a = (raw * Math.PI) / 180;
      const k = 0.2;
      const s = this.smooth ?? { x: Math.cos(a), y: Math.sin(a) };
      s.x += k * (Math.cos(a) - s.x);
      s.y += k * (Math.sin(a) - s.y);
      this.smooth = s;
      this.deg = ((Math.atan2(s.y, s.x) * 180) / Math.PI + 360) % 360;
    };
  }

  async start() {
    if (typeof window === 'undefined') return;
    const DOE = window.DeviceOrientationEvent;
    if (
      typeof DOE?.requestPermission === 'function' &&
      (await DOE.requestPermission()) !== 'granted'
    ) {
      throw new Error('orientation permission denied');
    }
    window.addEventListener('deviceorientationabsolute', this.on, true);
    window.addEventListener('deviceorientation', this.on, true);
  }

  stop() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('deviceorientationabsolute', this.on, true);
    window.removeEventListener('deviceorientation', this.on, true);
    this.deg = null;
    this.smooth = null;
  }

  get() {
    return this.deg == null ? null : { deg: this.deg };
  }
}
