import type { GeoFix, LatLng } from './ports';
import { angleDiff, bearing, pointAt, projectOnPath } from './geo';

/** Warns when GPS course-over-ground points against the route. */
export class DirectionGuard {
  private bad = 0;
  constructor(private path: LatLng[], private say: (text: string, key: string) => void) {}

  update(fix: GeoFix) {
    if (fix.headingDeg == null || (fix.speedMps ?? 0) < 1 || fix.accuracyM > 25) return;
    const me = projectOnPath(fix, this.path);
    if (me.distM > 25 || me.totalM - me.alongM < 10) return; // off-route is the engine's job; near the end bearing is unstable
    const target = bearing(pointAt(this.path, me.alongM), pointAt(this.path, me.alongM + 15));
    if (Math.abs(angleDiff(fix.headingDeg, target)) > 110) {
      if (++this.bad >= 3) { this.bad = 0; this.say('You may be walking the wrong way. Turn around.', 'wrongway'); }
    } else this.bad = 0;
  }
}
