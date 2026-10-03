import { googlePost } from './http';

export class PlacesDestinationResolver {
  async resolve(query, near) {
    const data = await googlePost(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery: query,
        maxResultCount: 3,
        locationBias: {
          circle: {
            center: { latitude: near.lat, longitude: near.lng },
            radius: 20000,
          },
        },
      },
      'places.displayName,places.formattedAddress,places.location'
    );

    return (data.places ?? []).map((p) => ({
      name: p.displayName?.text ?? query,
      address: p.formattedAddress ?? '',
      location: {
        lat: p.location.latitude,
        lng: p.location.longitude,
      },
    }));
  }
}
