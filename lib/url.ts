/** Build a URL from the current search params with some keys changed or removed. */
export function hrefWith(path: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** Next.js searchParams values can be string | string[]; keep the first string. */
export function firstValues(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}
