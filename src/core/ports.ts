export interface Speaker {
  speak(text: string, opts?: { interrupt?: boolean }): Promise<void>;
  stop(): void;
}

export interface SpeechRecognizer {
  /** Resolves with the final transcript; rejects on no-speech/denied/error. */
  listenOnce(opts?: { lang?: string; timeoutMs?: number }): Promise<string>;
  abort(): void;
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null; // null when unavailable
  speedMps: number | null;
  timestamp: number;
}

export interface LocationProvider {
  getCurrent(): Promise<GeoFix>;
  watch(onFix: (f: GeoFix) => void, onError: (e: Error) => void): () => void; // returns unsubscribe
}
export interface LatLng { lat: number; lng: number }

export interface Destination {
  name: string;
  address: string;
  location: LatLng;
}

export interface RouteStep {
  instruction: string;      // Google's text, e.g. "Turn left onto MG Road"
  maneuver: string;         // e.g. TURN_LEFT, STRAIGHT, UTURN_RIGHT; may be ''
  distanceM: number;
  durationS: number;
  start: LatLng;
  end: LatLng;
  path: LatLng[];
}

export interface Route {
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
  path: LatLng[];
}

export interface DestinationResolver {
  resolve(query: string, near: LatLng): Promise<Destination[]>;
}

export interface RoutePlanner {
  plan(from: LatLng, to: LatLng): Promise<Route>;
}
 export interface Detection {
  label: string;
  score: number;
  box: { x: number; y: number; w: number; h: number }; // normalized 0..1, origin top-left
}

/** Android: replace with a TFLite/MediaPipe detector fed by CameraX frames. */
export interface ObjectDetector {
  load(): Promise<void>;
  detect(): Promise<Detection[]>;
}

export type HazardKind = 'vehicle' | 'person' | 'obstacle' | 'traffic-light';

export interface Hazard {
  kind: HazardKind;
  label: string;
  direction: 'left' | 'ahead' | 'right';
  proximity: 'far' | 'near' | 'close';
  approaching: boolean;
  score: number;
}
export interface ReverseGeocoder { describe(p: LatLng): Promise<string>; }

export type CrossingKind = 'signal' | 'zebra' | 'marked' | 'unmarked';
export interface Crossing { location: LatLng; kind: CrossingKind; }
export interface CrossingSource { forRoute(route: Route): Promise<Crossing[]>; }
export interface HeadingProvider {
  start(): Promise<void>;
  stop(): void;
  /** Direction the phone/camera points, degrees from true-ish north (compass). null if no data. */
  get(): { deg: number } | null;
}