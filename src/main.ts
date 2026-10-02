import { WebSpeaker } from './adapters/web/WebSpeaker';
import { WebSpeechRecognizer } from './adapters/web/WebSpeechRecognizer';
import { WebLocationProvider } from './adapters/web/WebLocationProvider';
import { CocoDetector } from './adapters/web/CocoDetector';
import { PlacesDestinationResolver } from './services/google/PlacesDestinationResolver';
import { RoutesPlanner } from './services/google/RoutesPlanner';
import { OverpassCrossings } from './services/osm/OverpassCrossings';
import { GoogleReverseGeocoder } from './services/google/GoogleReverseGeocoder';
import { HazardAnalyzer } from './core/HazardAnalyzer';
import { NavigationController } from './core/NavigationController';
import { CameraView } from './ui/CameraView';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('#app not found in index.html');
}

const BTN =
  'font-size:2rem;padding:1.5rem 2rem;margin:0 1rem 1rem 0;min-width:14rem';

app.innerHTML = `
  <button id="go" style="${BTN}">Open navigation</button>
  <button id="stop" style="${BTN}">Stop</button>
  <button id="cmd" style="${BTN}">Command</button>

  <div
    id="status"
    role="status"
    aria-live="assertive"
    style="font-size:1.5rem;margin:1rem 0"
  ></div>

  <pre id="log"></pre>
`;

const statusEl = document.querySelector<HTMLElement>('#status')!;
const logEl = document.querySelector<HTMLElement>('#log')!;

const log = (s: string) => {
  logEl.textContent += s + '\n';
};

// Secure-context + microphone diagnostics
const speechRecognitionAvailable =
  'SpeechRecognition' in window ||
  'webkitSpeechRecognition' in window;

log(
  `secure=${window.isSecureContext} ` +
  `stt=${speechRecognitionAvailable ? 'available' : 'unavailable'}`
);

navigator.permissions
  ?.query({ name: 'microphone' as PermissionName })
  .then((p) => {
    log(`mic permission: ${p.state}`);
  })
  .catch(() => {
    log('mic permission: query unsupported');
  });

// Camera + vision
const cam = new CameraView(app);
const detector = new CocoDetector(cam.video);
const analyzer = new HazardAnalyzer();

let camRunning = false;
let wantCam = false;
let modelLoaded = false;

const nav = new NavigationController({
  speaker: new WebSpeaker(),
  stt: new WebSpeechRecognizer(),
  loc: new WebLocationProvider(),
  resolver: new PlacesDestinationResolver(),
  planner: new RoutesPlanner(),

  crossings: new OverpassCrossings(),
  geocoder: new GoogleReverseGeocoder(),

  log,

  onState: (s) => {
    statusEl.textContent = s;

    if (s === 'idle') {
      stopCamera();
    }
  },
});

async function visionLoop() {
  if (!camRunning) return;

  const t0 = performance.now();

  try {
    const dets = await detector.detect();

    cam.draw(dets);

    nav.onHazards(analyzer.analyze(dets, t0));
  } catch (e) {
    log(`vision: ${(e as Error).message}`);
  }

  setTimeout(
    visionLoop,
    Math.max(0, 200 - (performance.now() - t0))
  );
}

async function startCamera() {
  if (camRunning) return;

  wantCam = true;

  try {
    await cam.start();

    if (!modelLoaded) {
      await detector.load();
      modelLoaded = true;
    }

    if (!wantCam) {
      cam.stop();
      return;
    }

    camRunning = true;
    visionLoop();
  } catch (e) {
    log(`camera error: ${(e as Error).message}`);
  }
}

function stopCamera() {
  wantCam = false;
  camRunning = false;
  cam.stop();
}

document.querySelector('#go')!.addEventListener('click', () => {
  // Camera failure must not block navigation
  void startCamera();
  void nav.open();
});

document.querySelector('#stop')!.addEventListener('click', () => {
  nav.stop();
});

document.querySelector('#cmd')!.addEventListener('click', () => {
  void nav.listenForCommand();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    void nav.listenForCommand();
  }
});