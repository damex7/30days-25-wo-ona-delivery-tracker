// GET /api/geocode?q=...  →  up to 5 matching places in Nigeria.
//
// We ask OpenStreetMap's Nominatim service from the SERVER, not the browser,
// because its usage policy asks every app to identify itself (User-Agent) and
// to send at most one request per second. Doing it here lets us do both, and
// keeps the search button-triggered (no search-as-you-type).
import { connection } from "next/server";
import { apiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { currentActor } from "@/lib/auth/session";
import { mustBe } from "@/lib/services/actor";
import { geocodeSchema } from "@/lib/validation";

type NominatimHit = { display_name: string; lat: string; lon: string };

export async function GET(req: Request) {
  await connection(); // per-request, never prerendered at build time
  try {
    const me = mustBe(await currentActor(), "business");
    const { q } = geocodeSchema.parse({ q: new URL(req.url).searchParams.get("q") ?? "" });
    if (!(await rateLimit(`geocode:${me.id}`, 30, 60))) return json({ error: "Too many searches. Wait a minute." }, 429);
    // Nominatim allows 1 request per second for the whole app.
    if (!(await rateLimit("geocode:global", 1, 1))) return json({ error: "Search is busy. Try again in a second." }, 429);

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q, format: "jsonv2", countrycodes: "ng", limit: "5", addressdetails: "0" }).toString();
    const res = await fetch(url, {
      headers: {
        "User-Agent": `WoOna-delivery-tracker/1.0 (${process.env.APP_URL ?? "portfolio demo"})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return json({ error: "Address search isn't available right now. Pick a landmark or tap the map instead." }, 502);
    const hits = (await res.json()) as NominatimHit[];
    return json({
      results: hits.map((h) => ({ label: h.display_name, lat: Number(h.lat), lng: Number(h.lon) })),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "TypeError"))
      return json({ error: "Address search isn't available right now. Pick a landmark or tap the map instead." }, 502);
    return apiError(e);
  }
}
