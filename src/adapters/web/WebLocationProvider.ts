import type { GeoFix, LocationProvider } from '../../core/ports';

const toFix = (p: GeolocationPosition): GeoFix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  headingDeg: p.coords.heading,
  speedMps: p.coords.speed,
  timestamp: p.timestamp,
});

const OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};

const OPTS_COARSE: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 30000,
  timeout: 20000,
};

const CODES: Record<number, string> = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

const toErr = (e: GeolocationPositionError): Error =>
  new Error(`${CODES[e.code] ?? e.code}: ${e.message}`);

export class WebLocationProvider implements LocationProvider {
  getCurrent(): Promise<GeoFix> {
    const once = (opts: PositionOptions): Promise<GeoFix> =>
      new Promise<GeoFix>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(toFix(p)),
          (e) => reject(e),
          opts
        );
      });

    return once(OPTS).catch((e: GeolocationPositionError) => {
      // Permission denied: retrying won't help
      if (e.code === 1) {
        throw toErr(e);
      }

      // Retry with coarse location
      return once(OPTS_COARSE).catch(
        (e2: GeolocationPositionError) => {
          throw toErr(e2);
        }
      );
    });
  }

  watch(
    onFix: (f: GeoFix) => void,
    onError: (e: Error) => void
  ) {
    const id = navigator.geolocation.watchPosition(
      (p) => onFix(toFix(p)),
      (e) => onError(toErr(e)),
      OPTS
    );

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }
}