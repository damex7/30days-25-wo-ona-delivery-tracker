// Small geography helpers, shared by the server and the browser.
// No library needed: everything here is a few lines of trigonometry.

export type LatLng = { lat: number; lng: number };

const R = 6_371_000; // Earth's mean radius in metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Straight-line ("as the crow flies") distance in metres between two points on
 * the Earth's surface: the haversine formula. Accurate to well under 1% for the
 * distances a delivery covers.
 */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass direction from a to b, 0–359° (0 = north, 90 = east). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point a fraction t (0–1) of the way from a to b. Fine for short hops. */
export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9_950 ? 1 : 0)} km`;
}

// Typical moving speeds in Nigerian city traffic, in metres per second.
const CITY_SPEED: Record<string, number> = {
  motorbike: 22 / 3.6, // okadas weave through traffic
  bicycle: 12 / 3.6,
  tricycle: 16 / 3.6,
  car: 18 / 3.6,
  van: 16 / 3.6,
};
// Roads wind; the real distance is usually about a third longer than the straight line.
const ROAD_FACTOR = 1.35;

/**
 * A rough arrival estimate in whole minutes. Honest about being rough: it uses
 * the straight-line distance times a road factor, and the rider's recent speed
 * when they're clearly moving (otherwise a typical speed for their vehicle).
 */
export function etaMinutes(from: LatLng, to: LatLng, vehicle: string, speedMps?: number | null): number {
  const remaining = distanceM(from, to) * ROAD_FACTOR;
  const typical = CITY_SPEED[vehicle] ?? CITY_SPEED.car!;
  // Blend: a rider stopped at a light shouldn't make the ETA jump to "forever".
  const speed = speedMps && speedMps > 2 ? (speedMps + typical) / 2 : typical;
  return Math.max(1, Math.round(remaining / speed / 60));
}

/**
 * Walk along a polyline and return points spaced `stepM` metres apart. The
 * simulator uses this to turn a route's corners into a smooth stream of GPS
 * fixes, the same shape a real phone produces.
 */
export function resample(path: LatLng[], stepM: number): LatLng[] {
  if (path.length < 2) return [...path];
  const out: LatLng[] = [path[0]!];
  let carry = 0; // metres already walked since the last emitted point
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = distanceM(a, b);
    let pos = stepM - carry;
    while (pos <= seg) {
      out.push(lerp(a, b, pos / seg));
      pos += stepM;
    }
    carry = seg - (pos - stepM);
  }
  const last = path[path.length - 1]!;
  if (distanceM(out[out.length - 1]!, last) > 1) out.push(last);
  return out;
}

/**
 * When no road route is available, a gently bending line looks far more like a
 * real journey than a ruler-straight one. The bend is deterministic, so the
 * same trip always draws the same way.
 */
export function curvedPath(a: LatLng, b: LatLng, segments = 24): LatLng[] {
  const mid = lerp(a, b, 0.5);
  // Push the midpoint sideways by 12% of the trip length.
  const offset = 0.12;
  const control = { lat: mid.lat + (b.lng - a.lng) * offset, lng: mid.lng - (b.lat - a.lat) * offset };
  const out: LatLng[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Quadratic Bézier curve through the control point.
    out.push({
      lat: (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * control.lat + t ** 2 * b.lat,
      lng: (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * control.lng + t ** 2 * b.lng,
    });
  }
  return out;
}

export function pathLength(path: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1]!, path[i]!);
  return m;
}
