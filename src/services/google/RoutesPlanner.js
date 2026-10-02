import { googlePost } from './http';

const secs = (d) => (typeof d === 'string' ? parseInt(d, 10) || 0 : Number(d) || 0);
const pt = (p) => ({ lat: p.latitude, lng: p.longitude });
const line = (l) =>
  (l?.geoJsonLinestring?.coordinates ?? []).map(([lng, lat]) => ({
    lat,
    lng,
  }));
const wp = (p) => ({
  location: { latLng: { latitude: p.lat, longitude: p.lng } },
});

export class RoutesPlanner {
  async plan(from, to) {
    const data = await googlePost(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        origin: wp(from),
        destination: wp(to),
        travelMode: 'WALK',
        polylineEncoding: 'GEO_JSON_LINESTRING',
        languageCode: 'en-IN',
        units: 'METRIC',
      },
      [
        'routes.distanceMeters',
        'routes.duration',
        'routes.polyline.geoJsonLinestring',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.staticDuration',
        'routes.legs.steps.navigationInstruction',
        'routes.legs.steps.startLocation',
        'routes.legs.steps.endLocation',
        'routes.legs.steps.polyline.geoJsonLinestring',
      ].join(',')
    );

    const r = data.routes?.[0];
    if (!r) throw new Error('No walking route found');

    const steps = (r.legs || []).flatMap((l) =>
      (l.steps || []).map((s) => ({
        instruction: s.navigationInstruction?.instructions ?? 'Continue',
        maneuver: s.navigationInstruction?.maneuver ?? '',
        distanceM: s.distanceMeters,
        durationS: secs(s.staticDuration),
        start: pt(s.startLocation.latLng),
        end: pt(s.endLocation.latLng),
        path: line(s.polyline),
      }))
    );

    return {
      distanceM: r.distanceMeters,
      durationS: secs(r.duration),
      steps,
      path: line(r.polyline),
    };
  }
}
