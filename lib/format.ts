// Dates are shown in Lagos time, whatever timezone the server runs in.
const TZ = "Africa/Lagos";

export function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-NG", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}

export function formatTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(d: Date | string): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} day${s < 2 * 86400 ? "" : "s"} ago`;
  return formatDate(d);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
