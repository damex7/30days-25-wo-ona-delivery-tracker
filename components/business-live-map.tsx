"use client";
// The business's live map: every rider who's carrying a parcel right now.
// Updates come over the business's PRIVATE channel (only this business's
// logged-in account is allowed to join it), with polling as the fallback.
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { businessChannel, type PointMessage } from "@/lib/channels";
import { distanceM, etaMinutes, formatDistance } from "@/lib/geo";
import type { LiveTrip } from "@/lib/services/tracking";
import { displayCode } from "@/lib/tracking-code";
import { useChannel, usePolling } from "@/lib/use-live";
import { useNow } from "@/lib/use-now";
import { LiveStatus } from "./live-status";
import DeliveryMap from "./map";

export function BusinessLiveMap({ businessId, initial, shop }: { businessId: string; initial: LiveTrip[]; shop: { lat: number; lng: number } | null }) {
  const router = useRouter();
  const [trips, setTrips] = useState(initial);
  const [lastSync, setLastSync] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const now = useNow(15_000);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/business/live", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setTrips(((await res.json()) as { trips: LiveTrip[] }).trips);
      setLastSync(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const mode = useChannel(businessChannel(businessId), {
    point: (data) => {
      const p = data as PointMessage;
      setTrips((ts) => ts.map((t) => (t.id === p.deliveryId ? { ...t, last_lat: p.lat, last_lng: p.lng, last_heading: p.heading, last_speed_mps: p.speed, last_point_at: new Date(p.at) } : t)));
      setLastSync(Date.now());
    },
    // A status changed somewhere: refresh the map AND the list below it.
    status: () => {
      void refetch();
      router.refresh();
    },
  });
  usePolling(async () => {
    await refetch();
    if (mode !== "live") router.refresh();
  }, mode === "live" ? 30_000 : 5_000);

  const riders = useMemo(
    () =>
      trips
        .filter((t) => t.last_lat !== null && t.last_lng !== null)
        .map((t) => ({
          id: t.id,
          lat: t.last_lat!,
          lng: t.last_lng!,
          heading: t.last_heading,
          label: t.rider_name.split(" ")[0],
          stale: !t.last_point_at || now - new Date(t.last_point_at).getTime() > 120_000,
          onClick: () => router.push(`/business/deliveries/${t.id}`),
        })),
    [trips, router, now],
  );

  return (
    <section aria-labelledby="live-map" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="live-map" className="text-xl">On the road <span className="text-brand tabular">({trips.length})</span></h2>
        <LiveStatus mode={mode} lastSync={lastSync} offline={offline} />
      </div>
      <div className="grid md:grid-cols-[1fr_18rem]">
        <DeliveryMap label="Map of your riders who are carrying a parcel right now" riders={riders} pickup={shop} className="h-72 md:h-96" />
        <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line md:border-t-0 md:border-l" aria-label="Trips on the road">
          {trips.length === 0 && <li className="p-4 text-sm text-ink-muted">No rider is carrying a parcel right now. Trips appear here the moment a rider taps “Start trip”.</li>}
          {trips.map((t) => {
            const pos = t.last_lat !== null && t.last_lng !== null ? { lat: t.last_lat, lng: t.last_lng } : null;
            const to = { lat: t.dropoff_lat, lng: t.dropoff_lng };
            return (
              <li key={t.id}>
                <a href={`/business/deliveries/${t.id}`} className="block p-3 hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{t.rider_name}</span>
                    <span className="plate text-xs">{displayCode(t.tracking_code)}</span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    To {t.customer_name} ·{" "}
                    {t.status === "arrived"
                      ? "at the drop-off"
                      : pos
                        ? `${formatDistance(distanceM(pos, to))} away, ~${etaMinutes(pos, to, t.vehicle, t.last_speed_mps)} min`
                        : "waiting for GPS"}
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
