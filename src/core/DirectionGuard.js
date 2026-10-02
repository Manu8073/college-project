import { angleDiff, bearing, pointAt, projectOnPath } from './geo';

/** Warns when GPS course-over-ground points against the route. */
export class DirectionGuard {
  constructor(path, say) {
    this.path = path;
    this.say = say;
    this.bad = 0;
  }

  update(fix) {
    if (
      fix.headingDeg == null ||
      (fix.speedMps ?? 0) < 1 ||
      fix.accuracyM > 25
    ) {
      return;
    }

    const me = projectOnPath(fix, this.path);
    if (me.distM > 25 || me.totalM - me.alongM < 10) {
      // off-route is the engine's job; near the end bearing is unstable
      return;
    }

    const target = bearing(
      pointAt(this.path, me.alongM),
      pointAt(this.path, me.alongM + 15)
    );

    if (Math.abs(angleDiff(fix.headingDeg, target)) > 110) {
      if (++this.bad >= 3) {
        this.bad = 0;
        this.say(
          'You may be walking the wrong way. Turn around.',
          'wrongway'
        );
      }
    } else {
      this.bad = 0;
    }
  }
}
