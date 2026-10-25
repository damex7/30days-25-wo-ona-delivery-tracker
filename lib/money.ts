// Money is always integer kobo (₦1 = 100 kobo), never a float, so ₦0.10 + ₦0.20
// is exactly ₦0.30. Formatting to naira happens only at the edge, for display.

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "2,500" or "2500.50" → 250050 kobo. Works on the string, so no float rounding. */
export function parseNairaToKobo(input: string): number | null {
  const s = input.replace(/[₦,\s]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
