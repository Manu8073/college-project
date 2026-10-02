const toFix = (p) => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  headingDeg: p.coords.heading,
  speedMps: p.coords.speed,
  timestamp: p.timestamp,
});

const OPTS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};

const OPTS_COARSE = {
  enableHighAccuracy: false,
  maximumAge: 30000,
  timeout: 20000,
};

const CODES = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

const toErr = (e) => new Error(`${CODES[e.code] ?? e.code}: ${e.message}`);

export class WebLocationProvider {
  getCurrent() {
    const once = (opts) =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported by this browser'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(toFix(p)),
          (e) => reject(e),
          opts
        );
      });

    return once(OPTS).catch((e) => {
      // Permission denied: retrying won't help
      if (e.code === 1) {
        throw toErr(e);
      }

      // Retry with coarse location
      return once(OPTS_COARSE).catch((e2) => {
        throw toErr(e2);
      });
    });
  }

  watch(onFix, onError) {
    if (!navigator.geolocation) {
      onError?.(new Error('Geolocation not supported'));
      return () => {};
    }

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
