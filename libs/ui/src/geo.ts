/** Geo helpers shared by the store and staff maps. All free, keyless services. */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  /** Short name, e.g. "House 12, Road 5". */
  title: string;
  /** Area, city — the second line under the title. */
  subtitle: string;
}

/** Bangladesh, padded a little. Searches outside it are ignored. */
export const BD_BOUNDS = { minLat: 20.3, maxLat: 26.8, minLng: 88, maxLng: 92.8 } as const;
export const DHAKA: LatLng = { lat: 23.7808, lng: 90.4067 };

export const isInBangladesh = (p: LatLng) =>
  p.lat >= BD_BOUNDS.minLat && p.lat <= BD_BOUNDS.maxLat && p.lng >= BD_BOUNDS.minLng && p.lng <= BD_BOUNDS.maxLng;

export const hasPoint = (p: { lat?: number | null; lng?: number | null } | null | undefined): p is LatLng =>
  !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9_950 ? 1 : 0)} km`;
}

export function fmtDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** City bike speed with Dhaka traffic, ~18 km/h, plus a road-detour factor on the straight line. */
export const etaSeconds = (straightM: number) => (straightM * 1.35) / 5;

/** Turn-by-turn in Google Maps (installed app on phones), two-wheeler routing where supported. */
export function navLink(to: LatLng, from?: LatLng): string {
  const o = from ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${to.lat},${to.lng}&travelmode=two-wheeler`;
}

const PHOTON = 'https://photon.komoot.io';
const BBOX = `${BD_BOUNDS.minLng},${BD_BOUNDS.minLat},${BD_BOUNDS.maxLng},${BD_BOUNDS.maxLat}`;

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const title = p.name || street || p.district || p.locality || p.city || 'Dropped pin';
  const subtitle = [p.name && street ? street : '', p.district || p.locality, p.city, p.county]
    .filter((x, i, a): x is string => !!x && x !== title && a.indexOf(x) === i)
    .slice(0, 3)
    .join(', ');
  return { lat, lng, title, subtitle };
}

/** Place search, biased towards `near`. Empty on any failure — search is a convenience. */
export async function searchPlaces(q: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
  try {
    const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=7&bbox=${BBOX}${bias}`, { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return (json.features ?? []).map(toPlace).filter(isInBangladesh);
  } catch {
    return [];
  }
}

/** Nearest named place for a pin, or null when offline or nothing is mapped there. */
export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<Place | null> {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${p.lat}&lon=${p.lng}&limit=1`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    return f ? { ...toPlace(f), lat: p.lat, lng: p.lng } : null;
  } catch {
    return null;
  }
}

export interface Route {
  points: LatLng[];
  distanceM: number;
  durationS: number;
  /** False when the router was unreachable and this is a straight line. */
  routed: boolean;
}

const OSRM = 'https://router.project-osrm.org';
const routeCache = new Map<string, Route>();

/** Road route through the given points. Falls back to straight lines so a map always draws. */
export async function fetchRoute(points: LatLng[], signal?: AbortSignal): Promise<Route> {
  const straight = (): Route => {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += distanceM(points[i - 1]!, points[i]!);
    return { points, distanceM: d, durationS: etaSeconds(d), routed: false };
  };
  if (points.length < 2) return straight();
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const hit = routeCache.get(coords);
  if (hit) return hit;
  try {
    const res = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal });
    if (!res.ok) return straight();
    const json = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const r = json.routes?.[0];
    if (!r) return straight();
    // The demo router assumes a car; bikes filter through Dhaka traffic a bit faster.
    const route: Route = { points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), distanceM: r.distance, durationS: r.duration * 0.85, routed: true };
    if (routeCache.size > 40) routeCache.clear();
    routeCache.set(coords, route);
    return route;
  } catch {
    return straight();
  }
}

/** Greedy nearest-neighbour visiting order from `start`. Good enough for a handful of drops. */
export function suggestOrder<T extends { point: LatLng | null }>(start: LatLng, stops: T[]): T[] {
  const left = stops.filter((s) => s.point);
  const out: T[] = [];
  let at = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(at, left[i]!.point!) < distanceM(at, left[best]!.point!)) best = i;
    const [next] = left.splice(best, 1);
    out.push(next!);
    at = next!.point!;
  }
  return [...out, ...stops.filter((s) => !s.point)];
}

export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

/** One-shot position. Rejects with a GeoError string. */
export function currentPosition(timeout = 12_000): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject('unsupported' satisfies GeoError);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject((e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable') satisfies GeoError),
      { enableHighAccuracy: true, timeout, maximumAge: 15_000 },
    );
  });
}

export const geoErrorText: Record<GeoError, string> = {
  denied: 'Location is blocked. Allow it in your browser or phone settings.',
  unavailable: 'Couldn’t find your location. Try near a window or turn on GPS.',
  timeout: 'Finding your location took too long. Try again.',
  unsupported: 'This device can’t share its location.',
};
