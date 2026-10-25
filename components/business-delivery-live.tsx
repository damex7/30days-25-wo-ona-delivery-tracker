"use client";
// The live part of a business's delivery page: the same data and live updates
// as the customer's tracking page (useTracking), plus a refresh of the rest of
// the page whenever the status changes.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { distanceM, etaMinutes, formatDistance } from "@/lib/geo";
import type { PublicTracking } from "@/lib/services/tracking";
import { useTracking } from "@/lib/use-tracking";
import { LiveStatus } from "./live-status";
import DeliveryMap from "./map";
import { StatusBadge } from "./ui";

export function BusinessDeliveryLive({ initial }: { initial: PublicTracking }) {
  const router = useRouter();
  const { t, mode, lastSync, offline } = useTracking(initial);
  const status = useRef(t.status);
  useEffect(() => {
    if (status.current !== t.status) {
      status.current = t.status;
      router.refresh(); // buttons, history and rider card follow the new status
    }
  }, [t.status, router]);

  const live = t.status === "picked_up" || t.status === "arrived";
  const riders = useMemo(
    () => (t.position ? [{ id: "rider", lat: t.position.lat, lng: t.position.lng, heading: t.position.heading, label: t.rider?.firstName }] : []),
    [t.position, t.rider?.firstName],
  );
  const eta = t.position && t.status === "picked_up" ? etaMinutes(t.position, t.dropoff, t.rider?.vehicle ?? "motorbike", t.position.speed) : null;

  return (
    <div className="card overflow-hidden">
      <DeliveryMap
        label="Map of this delivery: pickup, drop-off and the rider's position"
        pickup={t.pickup}
        dropoff={t.dropoff}
        riders={riders}
        trail={t.trail}
        followId={live ? "rider" : null}
        className="h-80 sm:h-96"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
          {eta !== null && t.position && (
            <span className="text-sm font-semibold">
              ~{eta} min · {formatDistance(distanceM(t.position, t.dropoff))} to go
            </span>
          )}
          {t.simulated && live && <span className="text-xs text-ink-muted">◇ simulated GPS</span>}
        </div>
        <LiveStatus mode={mode} lastSync={lastSync} offline={offline} pointAt={live ? t.position?.at : null} />
      </div>
    </div>
  );
}
