import type { LatLng, ReverseGeocoder } from '../../core/ports';
import { googleKey } from './http';

export class GoogleReverseGeocoder implements ReverseGeocoder {
  async describe(p: LatLng): Promise<string> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&result_type=route|street_address&key=${googleKey}`;
    const j = await (await fetch(url)).json();
    if (j.status !== 'OK') throw new Error(`Geocode ${j.status}`);
    return (j.results[0].formatted_address as string).split(',').slice(0, 2).join(',');
  }
}