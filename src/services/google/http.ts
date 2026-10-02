const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
if (!KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY missing (.env.local)');
export const googleKey = KEY;
export async function googlePost<T>(url: string, body: unknown, fieldMask: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}