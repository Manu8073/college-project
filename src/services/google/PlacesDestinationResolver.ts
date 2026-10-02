import type { Destination, DestinationResolver, LatLng } from '../../core/ports';
import { googlePost } from './http';

interface PlacesResp {
  places?: { displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }[];
}

export class PlacesDestinationResolver implements DestinationResolver {
  async resolve(query: string, near: LatLng): Promise<Destination[]> {
    const data = await googlePost<PlacesResp>(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery: query,
        maxResultCount: 3,
        locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 20000 } },
      },
      'places.displayName,places.formattedAddress,places.location',
    );
    return (data.places ?? []).map((p) => ({
      name: p.displayName?.text ?? query,
      address: p.formattedAddress ?? '',
      location: { lat: p.location.latitude, lng: p.location.longitude },
    }));
  }
}