export const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export function checkGoogleKey() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('VITE_GOOGLE_MAPS_API_KEY missing in .env or .env.local');
  }
  return key;
}

export async function googlePost(url, body, fieldMask) {
  const key = checkGoogleKey();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Google API ${res.status}: ${await res.text()}`);
  }

  return res.json();
}
