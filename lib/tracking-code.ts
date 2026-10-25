// Tracking codes are stored as 8 characters ("K7QM4P2X") and shown in two groups
// ("K7QM-4P2X") so they're easier to read out. This file has no Node imports,
// so the browser can use it too.

export function displayCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What a person typed ("k7qm 4p2x", "WO-K7QM-4P2X") → "K7QM4P2X", or null. */
export function parseTrackingCode(input: string): string | null {
  const s = input.toUpperCase().replace(/^WO-?/, "").replace(/[\s-]/g, "");
  return /^[A-HJ-KM-NP-Z2-9]{8}$/.test(s) ? s : null;
}
