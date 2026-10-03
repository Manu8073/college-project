import { checkGoogleKey } from './http';

export class GoogleReverseGeocoder {
  async describe(p) {
    const key = checkGoogleKey();
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&result_type=route|street_address&key=${key}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j.status !== 'OK') throw new Error(`Geocode ${j.status}`);
    return (j.results[0]?.formatted_address || '')
      .split(',')
      .slice(0, 2)
      .join(',');
  }
}
