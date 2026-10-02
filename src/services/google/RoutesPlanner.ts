import type { LatLng, Route, RoutePlanner, RouteStep } from '../../core/ports';
import { googlePost } from './http';

type Pt = { latitude: number; longitude: number };
type Line = { geoJsonLinestring?: { coordinates: [number, number][] } };
interface RoutesResp {
  routes?: {
    distanceMeters: number;
    duration: string;
    polyline?: Line;
    legs: {
      steps: {
        distanceMeters: number;
        staticDuration: string;
        navigationInstruction?: { maneuver?: string; instructions?: string };
        startLocation: { latLng: Pt };
        endLocation: { latLng: Pt };
        polyline?: Line;
      }[];
    }[];
  }[];
}

const secs = (d: string) => parseInt(d, 10) || 0; // "123s"
const pt = (p: Pt): LatLng => ({ lat: p.latitude, lng: p.longitude });
const line = (l?: Line): LatLng[] =>
  (l?.geoJsonLinestring?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

export class RoutesPlanner implements RoutePlanner {
  async plan(from: LatLng, to: LatLng): Promise<Route> {
    const data = await googlePost<RoutesResp>(
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
        'routes.distanceMeters', 'routes.duration', 'routes.polyline.geoJsonLinestring',
        'routes.legs.steps.distanceMeters', 'routes.legs.steps.staticDuration',
        'routes.legs.steps.navigationInstruction', 'routes.legs.steps.startLocation',
        'routes.legs.steps.endLocation', 'routes.legs.steps.polyline.geoJsonLinestring',
      ].join(','),
    );
    const r = data.routes?.[0];
    if (!r) throw new Error('No walking route found');

    const steps: RouteStep[] = r.legs.flatMap((l) =>
      l.steps.map((s) => ({
        instruction: s.navigationInstruction?.instructions ?? 'Continue',
        maneuver: s.navigationInstruction?.maneuver ?? '',
        distanceM: s.distanceMeters,
        durationS: secs(s.staticDuration),
        start: pt(s.startLocation.latLng),
        end: pt(s.endLocation.latLng),
        path: line(s.polyline),
      })),
    );
    return { distanceM: r.distanceMeters, durationS: secs(r.duration), steps, path: line(r.polyline) };
  }
}