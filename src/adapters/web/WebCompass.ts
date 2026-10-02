import type { HeadingProvider } from '../../core/ports';

// W3C compass-heading formula: direction the back of the device points, valid at any tilt.
function headingFromEuler(alpha: number, beta: number, gamma: number): number {
  const r = Math.PI / 180;
  const x = beta * r, y = gamma * r, z = alpha * r;
  const cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(Vx / Vy);
  if (Vy < 0) h += Math.PI; else if (Vx < 0) h += 2 * Math.PI;
  return (h * 180) / Math.PI;
}

export class WebCompass implements HeadingProvider {
  private deg: number | null = null;
  private smooth: { x: number; y: number } | null = null;
  private on = (e: Event) => {
    const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let raw: number | null = null;
    if (typeof o.webkitCompassHeading === 'number') raw = o.webkitCompassHeading; // iOS: assumes flat, unreliable upright
    else if (o.absolute && o.alpha != null && o.beta != null && o.gamma != null) raw = headingFromEuler(o.alpha, o.beta, o.gamma);
    if (raw == null) return;
    // circular low-pass filter
    const a = (raw * Math.PI) / 180, k = 0.2;
    const s = this.smooth ?? { x: Math.cos(a), y: Math.sin(a) };
    s.x += k * (Math.cos(a) - s.x); s.y += k * (Math.sin(a) - s.y);
    this.smooth = s;
    this.deg = ((Math.atan2(s.y, s.x) * 180) / Math.PI + 360) % 360;
  };

  async start() {
    const DOE = (window as any).DeviceOrientationEvent;
    if (typeof DOE?.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted')
      throw new Error('orientation permission denied');
    window.addEventListener('deviceorientationabsolute', this.on, true);
    window.addEventListener('deviceorientation', this.on, true);
  }
  stop() {
    window.removeEventListener('deviceorientationabsolute', this.on, true);
    window.removeEventListener('deviceorientation', this.on, true);
    this.deg = null; this.smooth = null;
  }
  get() { return this.deg == null ? null : { deg: this.deg }; }
}
