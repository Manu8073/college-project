const VEHICLES = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle']);
const OBSTACLES = new Set([
  'bench',
  'chair',
  'potted plant',
  'fire hydrant',
  'parking meter',
  'dog',
  'cow',
  'horse',
]);

// Tunable: calibrate by testing with the real camera
const NEAR_H = 0.3; // box height / frame height
const CLOSE_H = 0.55;
const GROWTH = 1.25; // box height growth over the window => approaching
const WINDOW_MS = 1200;
const MIN_SPAN_MS = 400;

const kindOf = (label) =>
  VEHICLES.has(label)
    ? 'vehicle'
    : label === 'person'
      ? 'person'
      : label === 'traffic light'
        ? 'traffic-light'
        : OBSTACLES.has(label)
          ? 'obstacle'
          : null;

export class HazardAnalyzer {
  constructor() {
    this.hist = new Map();
  }

  analyze(dets, now) {
    const seen = new Map();
    const bestH = new Map();

    for (const d of dets) {
      const kind = kindOf(d.label);
      if (!kind) continue;
      const cx = d.box.x + d.box.w / 2;
      const direction = cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'ahead';
      const key = `${d.label}:${direction}`;
      if (d.box.h <= (bestH.get(key) ?? 0)) continue;
      bestH.set(key, d.box.h);
      const proximity =
        d.box.h >= CLOSE_H ? 'close' : d.box.h >= NEAR_H ? 'near' : 'far';
      seen.set(key, {
        kind,
        label: d.label,
        direction,
        proximity,
        approaching: false,
        score: d.score,
      });
    }

    for (const [key, h] of bestH) {
      const arr = (this.hist.get(key) ?? []).filter((s) => now - s.t <= WINDOW_MS);
      arr.push({ t: now, h });
      this.hist.set(key, arr);
      const first = arr[0];
      if (
        arr.length >= 3 &&
        now - first.t >= MIN_SPAN_MS &&
        h / first.h >= GROWTH
      ) {
        seen.get(key).approaching = true;
      }
    }
    for (const k of this.hist.keys()) {
      if (!bestH.has(k)) this.hist.delete(k);
    }

    return [...seen.values()].filter(
      (h) =>
        h.kind === 'traffic-light' || h.proximity !== 'far' || h.approaching
    );
  }
}
