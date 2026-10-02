import { NavigationEngine } from './NavigationEngine';
import { RANK, SpeechArbiter, hazardToUtterance } from './DecisionLogic';
import { CrossingAdvisor } from './CrossingAdvisor';
import { angleDiff, bearing, pointAt, routePath } from './geo';
import { DirectionGuard } from './DirectionGuard';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const turnPhrase = (d) => {
  const a = Math.abs(d);
  const dir = d > 0 ? 'right' : 'left';

  return a > 135
    ? 'Turn around'
    : a > 60
      ? `Turn ${dir}`
      : `Turn slightly ${dir}`;
};

const YES = /\b(yes|yeah|yep|yup|ok|okay|start|go|sure|haan|ha)\b/i;
const NO = /\b(no|nope|nah|cancel|stop|wrong|nahi)\b/i;
const MAX_ATTEMPTS = 3;

export class NavigationController {
  constructor(deps) {
    this.d = deps;
    this.state = 'idle';
    this.arbiter = new SpeechArbiter(deps.speaker);
    this.unwatch = null;
    this.session = 0;
    this.lastFix = null;
    this.engine = null;
    this.lastInstruction = '';
    this.currentDestination = null;
    this.currentRoute = null;
  }

  set(s) {
    this.state = s;
    this.d.onState?.(s);
  }

  log(s) {
    this.d.log?.(s);
  }

  getState() {
    return this.state;
  }

  getLastFix() {
    return this.lastFix;
  }

  getLastInstruction() {
    return this.lastInstruction;
  }

  getCurrentDestination() {
    return this.currentDestination;
  }

  getCurrentRoute() {
    return this.currentRoute;
  }

  isMuted() {
    return this.arbiter.muted;
  }

  setMuted(m) {
    this.arbiter.setMuted(m);
  }

  /**
   * Entry point: called after "Hey Netra" + "Open navigation", click, or preselected query.
   */
  async open(preselectedQuery = null) {
    if (this.state !== 'idle') return;

    const sid = ++this.session;
    const alive = () => sid === this.session;

    /*
     * iOS requires compass permission/start to happen inside
     * the user gesture. Start it immediately here.
     */
    const headingReady = this.d.heading?.start().then(
      () => true,
      (e) => {
        this.log(`compass: ${e.message}`);
        return false;
      }
    );

    try {
      const picked = preselectedQuery
        ? await this.resolveDestinationDirectly(preselectedQuery, alive)
        : await this.askDestination(alive);

      if (!picked || !alive()) {
        if (alive()) this.end();
        return;
      }

      this.set('routing');
      this.currentDestination = picked.dest;
      this.d.onDestination?.(picked.dest);

      await this.d.speaker.speak('Finding a walking route.');

      const route = await this.d.planner.plan(
        picked.fix,
        picked.dest.location
      );

      if (!alive()) return;

      this.currentRoute = route;
      this.d.onRoute?.(route);

      const min = Math.max(1, Math.round(route.durationS / 60));

      await this.d.speaker.speak(
        `Route found. ${Math.round(route.distanceM)} meters, about ${min} minutes.`
      );

      if (!alive()) return;

      /*
       * Orient the user toward the first section of the route
       * before navigation starts.
       */
      if (headingReady && (await headingReady) && alive()) {
        await this.orient(route, alive);
      }

      if (!alive()) return;

      // Load crossings before starting navigation
      this.run(
        route,
        await this.loadCrossings(route),
        picked.dest,
        sid
      );
    } catch (e) {
      this.log(`error: ${e.message}`);

      if (alive()) {
        await this.d.speaker.speak(
          'Something went wrong. Say open navigation to try again.'
        );
        this.end();
      }
    }
  }

  stop() {
    this.session++;

    this.d.stt.abort();
    this.d.speaker.stop();

    /*
     * Stop compass if one is active.
     */
    this.d.heading?.stop();

    this.end();

    void this.d.speaker.speak('Navigation stopped.');
  }

  /**
   * Feed from the vision loop.
   */
  onHazards(hazards) {
    if (this.state !== 'navigating') return;

    this.d.onHazardsDetected?.(hazards);

    hazards
      .map(hazardToUtterance)
      .filter((u) => !!u)
      .sort((a, b) => RANK[b.priority] - RANK[a.priority])
      .slice(0, 2)
      .forEach((u) => this.arbiter.say(u));
  }

  // ---- dialog ----

  async askDestination(alive) {
    const { speaker, stt, loc, resolver } = this.d;

    this.set('asking');

    const fixP = loc.getCurrent();
    fixP.catch(() => {});

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      this.set('asking');

      await speaker.speak(
        i === 0
          ? 'Where do you want to go?'
          : 'Please say the destination again.'
      );

      if (!alive()) return null;

      let query;

      try {
        query = await stt.listenOnce();
      } catch (e) {
        const m = e.message;
        this.log(`stt: ${m}`);

        if (!alive()) return null;

        if (
          m === 'not-allowed' ||
          m === 'service-not-allowed' ||
          m === 'audio-capture'
        ) {
          await speaker.speak(
            'The microphone is not available. Please check microphone permissions.'
          );
          return null;
        }

        await speaker.speak("I didn't catch that.");
        continue;
      }

      this.log(`heard: ${query}`);
      this.d.onQueryHeard?.(query);

      let fix;

      try {
        fix = await fixP;
      } catch (e) {
        this.log(`location: ${e.message}`);
        await speaker.speak(
          "I can't get your location. Please check location permission."
        );
        return null;
      }

      let dest;

      try {
        const results = await resolver.resolve(query, fix);
        dest = results[0];
      } catch (e) {
        this.log(`resolve: ${e.message}`);
        await speaker.speak('I had trouble searching. Please try again.');
        continue;
      }

      if (!dest) {
        await speaker.speak(`I couldn't find ${query}.`);
        continue;
      }

      if (!alive()) return null;

      if (await this.confirm(dest)) {
        return {
          dest,
          fix,
        };
      }
    }

    if (alive()) {
      await speaker.speak(
        'Sorry, I could not set a destination. Say open navigation to try again.'
      );
    }

    return null;
  }

  async confirm(dest) {
    this.set('confirming');

    const addr = (dest.address || '')
      .split(',')
      .slice(0, 2)
      .join(',');

    await this.d.speaker.speak(
      `${dest.name}, ${addr}. Say yes to start, or no to change.`
    );

    try {
      const a = await this.d.stt.listenOnce({
        timeoutMs: 8000,
      });

      this.log(`confirm: ${a}`);

      if (NO.test(a)) return false;

      return YES.test(a);
    } catch {
      return false;
    }
  }

  async resolveDestinationDirectly(query, alive) {
    const { speaker, loc, resolver } = this.d;
    this.set('routing');

    let fix;
    try {
      fix = await loc.getCurrent();
    } catch (e) {
      this.log(`location: ${e.message}`);
      await speaker.speak("I can't get your location. Please check location permission.");
      return null;
    }

    try {
      const results = await resolver.resolve(query, fix);
      const dest = results[0];
      if (!dest) {
        await speaker.speak(`I couldn't find ${query}.`);
        return null;
      }
      return { dest, fix };
    } catch (e) {
      this.log(`resolve: ${e.message}`);
      await speaker.speak('I had trouble searching. Please try again.');
      return null;
    }
  }

  // ---- orientation ----

  async orient(route, alive) {
    const h = this.d.heading;
    if (!h) return;

    const path = routePath(route);
    if (!path.length) {
      this.log('compass: route has no path');
      return;
    }

    const target = bearing(path[0], pointAt(path, 15));
    const t0 = Date.now();
    let okSince = 0;

    try {
      while (alive() && Date.now() - t0 < 25000) {
        const cur = h.get();

        if (!cur) {
          if (Date.now() - t0 > 3000) {
            this.log('no compass data, skipping orientation');
            return;
          }
          await sleep(300);
          continue;
        }

        const d = angleDiff(cur.deg, target);

        if (Math.abs(d) <= 25) {
          okSince ||= Date.now();

          if (Date.now() - okSince >= 1000) {
            await this.d.speaker.speak('Facing the route. Start walking.');
            return;
          }
        } else {
          okSince = 0;
          await this.d.speaker.speak(turnPhrase(d));
          await sleep(1200);
        }

        await sleep(250);
      }
    } finally {
      h.stop();
    }
  }

  // ---- navigation ----

  run(route, crossings, dest, sid) {
    this.set('navigating');

    const engine = new NavigationEngine(route, (e) =>
      this.onNav(e, dest, sid)
    );

    const advisor = new CrossingAdvisor(route, crossings, (text, key) => {
      this.d.onCrossing?.({ text, key });
      this.arbiter.say({
        text,
        priority: 'warning',
        key,
        cooldownMs: 30000,
      });
    });

    const guard = new DirectionGuard(routePath(route), (text, key) =>
      this.arbiter.say({
        text,
        priority: 'warning',
        key,
        cooldownMs: 20000,
      })
    );

    this.engine = engine;
    engine.start();

    this.unwatch = this.d.loc.watch(
      (f) => {
        this.lastFix = f;
        this.d.onFix?.(f);

        engine.update(f);

        if (f.accuracyM <= 40) {
          advisor.update(f);
        }

        guard.update(f);
      },
      (err) => this.log(`gps error: ${err.message}`)
    );
  }

  async onNav(e, dest, sid) {
    if (sid !== this.session) {
      return;
    }

    switch (e.type) {
      case 'instruction':
        this.log(`SAY: ${e.text}`);
        this.lastInstruction = e.text;
        this.d.onInstruction?.(e.text, e.stepIndex);

        this.arbiter.say({
          text: e.text,
          priority: 'instruction',
        });
        break;

      case 'progress':
        this.d.onProgress?.({
          stepIndex: e.stepIndex,
          stepRemainingM: e.stepRemainingM,
          totalRemainingM: this.engine?.remainingM() ?? e.stepRemainingM,
        });
        break;

      case 'low-accuracy':
        this.log(`GPS accuracy ${Math.round(e.accuracyM)} m`);
        this.arbiter.say({
          text: 'Waiting for a better GPS signal',
          priority: 'info',
          key: 'gps',
          cooldownMs: 20000,
        });
        break;

      case 'off-route':
        this.unwatch?.();
        this.unwatch = null;

        this.arbiter.say({
          text: 'Recalculating',
          priority: 'warning',
        });

        try {
          const route = await this.d.planner.plan(
            this.lastFix,
            dest.location
          );

          if (sid === this.session) {
            this.currentRoute = route;
            this.d.onRoute?.(route);
            this.run(
              route,
              await this.loadCrossings(route),
              dest,
              sid
            );
          }
        } catch (err) {
          this.log(`reroute failed: ${err.message}`);

          if (sid === this.session) {
            await this.d.speaker.speak('I could not find a new route.');
            this.end();
          }
        }
        break;

      case 'arrived':
        this.unwatch?.();
        this.unwatch = null;

        await this.d.speaker.speak(`You have arrived at ${dest.name}.`);

        if (sid === this.session) {
          this.end();
        }
        break;
    }
  }

  end() {
    this.unwatch?.();
    this.unwatch = null;
    this.engine = null;
    this.arbiter.clear();
    this.set('idle');
  }

  // ---- crossings ----

  async loadCrossings(route) {
    if (!this.d.crossings) {
      return [];
    }

    try {
      const c = await this.d.crossings.forRoute(route);
      this.log(`crossings on route: ${c.length}`);
      return c;
    } catch (e) {
      this.log(`crossings: ${e.message}`);
      return [];
    }
  }

  /**
   * Wake-word module calls this for in-navigation commands.
   */
  async listenForCommand() {
    if (this.state !== 'navigating') {
      return;
    }

    const sid = this.session;
    const alive = () => sid === this.session;

    this.arbiter.setMuted(true);

    try {
      await this.d.speaker.speak('Listening.');

      const cmd = await this.d.stt.listenOnce({
        timeoutMs: 6000,
      });

      this.log(`command: ${cmd}`);

      if (alive()) {
        await this.handle(cmd);
      }
    } catch (e) {
      this.log(`command: ${e.message}`);

      if (alive()) {
        await this.d.speaker.speak("I didn't catch that.");
      }
    } finally {
      if (alive()) {
        this.arbiter.setMuted(false);
      }
    }
  }

  async handle(cmd) {
    const sp = (t) => this.d.speaker.speak(t);

    // Stop navigation
    if (/\b(stop|cancel|end|exit)\b/i.test(cmd)) {
      return this.stop();
    }

    // Repeat last instruction
    if (/\b(repeat|again|say that)\b/i.test(cmd)) {
      return sp(this.lastInstruction || 'No instruction yet.');
    }

    // Current location
    if (/where am i|which street|my location/i.test(cmd)) {
      if (!this.lastFix) {
        return sp('I do not have a GPS fix yet.');
      }

      if (!this.d.geocoder) {
        return sp('Location lookup is not available.');
      }

      try {
        return sp(`You are near ${await this.d.geocoder.describe(this.lastFix)}.`);
      } catch {
        return sp("I couldn't look up your location.");
      }
    }

    // Remaining distance/time
    if (/how far|distance|how long|remaining|time left/i.test(cmd)) {
      const m = this.engine?.remainingM();

      if (m === undefined) {
        return sp('No route is active.');
      }

      return sp(
        `${Math.round(m)} meters remaining, about ${Math.max(
          1,
          Math.round(m / 1.3 / 60)
        )} minutes.`
      );
    }

    return sp('You can say repeat, where am I, how far, or stop.');
  }
}
