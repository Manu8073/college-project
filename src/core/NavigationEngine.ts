import type { GeoFix, LatLng, Route, RouteStep } from './ports';
import { projectOnPath } from './geo';

export type NavEvent =
  | { type: 'instruction'; text: string; stepIndex: number }
  | { type: 'progress'; stepIndex: number; stepRemainingM: number }
  | { type: 'low-accuracy'; accuracyM: number }
  | { type: 'off-route' }
  | { type: 'arrived' };

const MAX_ACCURACY_M = 40;
const PRE_ALERTS_M = [20, 50];
const ADVANCE_M = 8;
const ARRIVE_M = 15;

const round5 = (n: number) =>
  Math.max(5, Math.round(n / 5) * 5);

const stepPath = (s: RouteStep): LatLng[] =>
  s.path.length > 1 ? s.path : [s.start, s.end];

export class NavigationEngine {
  private route: Route;
  private emit: (e: NavEvent) => void;

  // Added
  private stepRemaining = 0;

  private i = 0;
  private fired = new Set<string>();
  private offCount = 0;
  private stopped = false;
  private lowAcc = false;
  private readonly path: LatLng[];

  constructor(route: Route, emit: (e: NavEvent) => void) {
    this.route = route;
    this.emit = emit;

    this.path =
      route.path.length > 1
        ? route.path
        : route.steps.flatMap(stepPath);
  }

  start() {
    this.announceStep(0);
  }

  update(fix: GeoFix) {
    if (this.stopped) return;

    // Ignore inaccurate GPS fixes
    if (fix.accuracyM > MAX_ACCURACY_M) {
      if (!this.lowAcc) {
        this.lowAcc = true;

        this.emit({
          type: 'low-accuracy',
          accuracyM: fix.accuracyM
        });
      }

      return;
    }

    this.lowAcc = false;

    // Check whether user is off-route
    const onRoute = projectOnPath(fix, this.path);

    if (onRoute.distM > Math.max(30, fix.accuracyM * 1.5)) {
      if (++this.offCount >= 3) {
        this.stopped = true;
        this.emit({ type: 'off-route' });
      }

      return;
    }

    this.offCount = 0;

    const steps = this.route.steps;
    const step = steps[this.i];

    const p = projectOnPath(fix, stepPath(step));

    const remaining = Math.max(
      0,
      p.totalM - p.alongM
    );

    // Added
    this.stepRemaining = remaining;

    this.emit({
      type: 'progress',
      stepIndex: this.i,
      stepRemainingM: remaining
    });

    // Final step / arrival
    if (this.i === steps.length - 1) {
      if (remaining <= ARRIVE_M) {
        this.stopped = true;
        this.emit({ type: 'arrived' });
      }

      return;
    }

    // Move to next step
    if (remaining <= ADVANCE_M) {
      this.i++;
      this.announceStep(this.i);
      return;
    }

    // Advance warnings
    const next = steps[this.i + 1];

    for (const t of PRE_ALERTS_M) {
      if (
        remaining <= t &&
        step.distanceM > t + 10 &&
        !this.fired.has(`${this.i}:${t}`)
      ) {
        PRE_ALERTS_M
          .filter((x) => x >= t)
          .forEach((x) => {
            this.fired.add(`${this.i}:${x}`);
          });

        this.emit({
          type: 'instruction',
          stepIndex: this.i,
          text: `In ${round5(remaining)} meters, ${next.instruction}`
        });

        break;
      }
    }
  }

  // Added
  remainingM() {
    return (
      this.stepRemaining +
      this.route.steps
        .slice(this.i + 1)
        .reduce((s, x) => s + x.distanceM, 0)
    );
  }

  private announceStep(i: number) {
    const s = this.route.steps[i];
    const last = i === this.route.steps.length - 1;

    const text =
      !last && s.distanceM >= 20
        ? `${s.instruction}, then continue ${round5(s.distanceM)} meters`
        : s.instruction;

    this.emit({
      type: 'instruction',
      stepIndex: i,
      text
    });
  }
}