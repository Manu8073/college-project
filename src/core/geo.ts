import type { LatLng } from './ports';
import type { Route } from './ports';
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Projects p onto the polyline. distM = perpendicular distance, alongM = distance travelled along path. */
export function projectOnPath(p: LatLng, path: LatLng[]) {
  const xy = (q: LatLng) => ({
    x: rad(q.lng - p.lng) * Math.cos(rad(p.lat)) * R,
    y: rad(q.lat - p.lat) * R,
  });
  let best = { distM: Infinity, alongM: 0 };
  let cum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = xy(path[i]), b = xy(path[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const segLen = Math.sqrt(len2);
    const t = len2 ? Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / len2)) : 0;
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (d < best.distM) best = { distM: d, alongM: cum + t * segLen };
    cum += segLen;
  }
  return { ...best, totalM: cum };
}


const deg = (r: number) => (r * 180) / Math.PI;

export function bearing(a: LatLng, b: LatLng): number {
  const f1 = rad(a.lat), f2 = rad(b.lat), dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed difference from heading a to heading b, in (-180, 180]. Positive = b is to the right of a. */
export const angleDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;

export function pointAt(path: LatLng[], d: number): LatLng {
  let cum = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = haversine(path[i], path[i + 1]);
    if (cum + seg >= d) {
      const t = seg ? (d - cum) / seg : 0;
      return { lat: path[i].lat + t * (path[i + 1].lat - path[i].lat), lng: path[i].lng + t * (path[i + 1].lng - path[i].lng) };
    }
    cum += seg;
  }
  return path[path.length - 1];
}

export const routePath = (r: Route): LatLng[] =>
  r.path.length > 1 ? r.path : r.steps.flatMap((s) => [s.start, s.end]);