import type { Crossing, CrossingKind, LatLng, Route } from './ports';
import { projectOnPath } from './geo';

const RANK: Record<CrossingKind, number> = { signal: 3, zebra: 2, marked: 1, unmarked: 0 };
const MERGE_M = 15, FAR_M = 40, NEAR_M = 12;
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

interface Item { alongM: number; kind: CrossingKind; fired: Set<'far' | 'near'> }

export class CrossingAdvisor {
  private items: Item[] = [];
  private path: LatLng[];

  private say: (text: string, key: string) => void;

constructor(
  route: Route,
  crossings: Crossing[],
  say: (text: string, key: string) => void
) {
  this.say = say; 
    this.path = route.path.length > 1 ? route.path : route.steps.flatMap((s) => [s.start, s.end]);
    const sorted = crossings
      .map((c) => ({ alongM: projectOnPath(c.location, this.path).alongM, kind: c.kind }))
      .sort((a, b) => a.alongM - b.alongM);
    for (const c of sorted) {
      const last = this.items[this.items.length - 1];
      if (last && c.alongM - last.alongM <= MERGE_M) { // OSM often has one node per carriageway
        if (RANK[c.kind] > RANK[last.kind]) last.kind = c.kind;
      } else this.items.push({ ...c, fired: new Set() });
    }
  }

  update(fix: LatLng) {
    const me = projectOnPath(fix, this.path);
    if (me.distM > 30) return;
    this.items.forEach((c, i) => {
      const ahead = c.alongM - me.alongM;
      const label = c.kind === 'zebra' ? 'zebra crossing' : c.kind === 'signal' ? 'signal crossing' : 'road crossing';
      if (ahead <= NEAR_M && ahead > -8 && !c.fired.has('near')) {
        c.fired.add('near'); c.fired.add('far');
        this.say(`Stop. ${label[0].toUpperCase() + label.slice(1)}. Check for traffic before crossing.`, `crossing:${i}:near`);
      } else if (ahead <= FAR_M && ahead > NEAR_M && !c.fired.has('far')) {
        c.fired.add('far');
        this.say(`${label[0].toUpperCase() + label.slice(1)} ahead in ${round5(ahead)} meters.`, `crossing:${i}:far`);
      }
    });
  }
}