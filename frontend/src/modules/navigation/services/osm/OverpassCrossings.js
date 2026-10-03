import { projectOnPath } from '../../core/geo';

const MAX_OFFSET_M = 15;
const BUF = 0.0003; // ~30 m

const kindOf = (t) =>
  t.crossing === 'traffic_signals' || t.highway === 'traffic_signals'
    ? 'signal'
    : t.crossing === 'zebra' || t.crossing_ref === 'zebra'
      ? 'zebra'
      : t.crossing === 'marked'
        ? 'marked'
        : 'unmarked';

export class OverpassCrossings {
  async forRoute(route) {
    const path =
      route.path && route.path.length > 1
        ? route.path
        : (route.steps || []).flatMap((s) => [s.start, s.end]);

    if (!path.length) return [];

    const lats = path.map((p) => p.lat);
    const lngs = path.map((p) => p.lng);
    const bbox = [
      Math.min(...lats) - BUF,
      Math.min(...lngs) - BUF,
      Math.max(...lats) + BUF,
      Math.max(...lngs) + BUF,
    ].join(',');

    const q = `[out:json][timeout:15];(node["highway"="crossing"](${bbox});node["highway"="traffic_signals"](${bbox});node["crossing"="traffic_signals"](${bbox}););out body;`;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
    });

    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const j = await res.json();

    return (j.elements || [])
      .map((e) => ({
        location: { lat: e.lat, lng: e.lon },
        kind: kindOf(e.tags ?? {}),
      }))
      .filter((c) => projectOnPath(c.location, path).distM <= MAX_OFFSET_M);
  }
}
