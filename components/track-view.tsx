"use client";
// The customer's tracking page: a big map with the rider moving on it, and a
// sheet with the status, the arrival estimate and the delivery code.
import { useMemo } from "react";
import { vehicleLabel } from "@/lib/constants";
import { distanceM, etaMinutes, formatDistance } from "@/lib/geo";
import { formatTime } from "@/lib/format";
import { formatNgPhone, whatsappLink } from "@/lib/phone";
import type { PublicTracking } from "@/lib/services/tracking";
import { displayCode } from "@/lib/tracking-code";
import { useTracking } from "@/lib/use-tracking";
import { LiveStatus } from "./live-status";
import DeliveryMap from "./map";
import { Timeline } from "./timeline";

export function TrackView({ initial }: { initial: PublicTracking }) {
  const { t, mode, lastSync, offline } = useTracking(initial);
  const live = t.status === "picked_up" || t.status === "arrived";

  const riders = useMemo(
    () => (t.position ? [{ id: "rider", lat: t.position.lat, lng: t.position.lng, heading: t.position.heading, label: t.rider?.firstName }] : []),
    [t.position, t.rider?.firstName],
  );
  // Recomputed in the browser on every new point, so it updates between fetches.
  const eta = t.position && t.status === "picked_up" ? etaMinutes(t.position, t.dropoff, t.rider?.vehicle ?? "motorbike", t.position.speed) : null;
  const away = t.position ? distanceM(t.position, t.dropoff) : null;

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_26rem]">
      <DeliveryMap
        label={`Map: ${live ? "the rider's position, " : ""}the pickup point and your drop-off address`}
        pickup={t.status === "delivered" ? null : t.pickup}
        dropoff={t.dropoff}
        riders={riders}
        trail={t.trail}
        followId={live ? "rider" : null}
        className="h-[46vh] min-h-72 lg:h-auto lg:min-h-[calc(100dvh-4rem)]"
      />

      {/* The sheet: slides up over the map on phones, a side panel on big screens. */}
      <section aria-labelledby="track-status" className="relative z-[600] -mt-6 rounded-t-3xl bg-surface px-4 pt-5 pb-8 shadow-[0_-8px_24px_rgb(0_0_0/0.12)] sm:px-6 lg:mt-0 lg:rounded-none lg:border-l lg:border-line lg:shadow-none">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line lg:hidden" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="plate" aria-label={`Tracking code ${t.code.split("").join(" ")}`}>{displayCode(t.code)}</span>
          <LiveStatus mode={mode} lastSync={lastSync} offline={offline} pointAt={live ? t.position?.at : null} />
        </div>

        <div aria-live="polite" className="mt-4">
          <p className="eyebrow">Hello {t.customerFirstName}, your parcel is</p>
          <h1 id="track-status" className="mt-1 text-3xl sm:text-4xl">
            {t.status === "picked_up" && eta !== null ? (
              <>On the way · <span className="text-brand">about {eta} min</span></>
            ) : (
              t.statusLabel
            )}
          </h1>
          {t.status === "picked_up" && away !== null && (
            <p className="mt-1 text-ink-muted">{formatDistance(away)} away in a straight line. A rough estimate; traffic decides the rest.</p>
          )}
          {t.status === "picked_up" && !t.position && <p className="mt-1 text-ink-muted">Waiting for the rider&apos;s first GPS fix…</p>}
          {t.status === "arrived" && <p className="mt-1 text-ink-muted">Your rider is at the drop-off. Have your delivery code ready.</p>}
          {t.status === "assigned" && <p className="mt-1 text-ink-muted">{t.rider?.firstName ?? "A rider"} will collect it from {t.business.name} soon. You&apos;ll see them move on the map once they set off.</p>}
          {t.status === "pending" && <p className="mt-1 text-ink-muted">{t.business.name} is finding a rider for your parcel.</p>}
          {t.status === "delivered" && t.finishedAt && <p className="mt-1 text-ink-muted">Handed over at {formatTime(t.finishedAt)}. Thank you!</p>}
          {(t.status === "failed" || t.status === "cancelled") && (
            <p className="mt-1 text-ink-muted">
              {t.reason ? <>Reason: {t.reason}. </> : null}Please contact {t.business.name} to arrange another time.
            </p>
          )}
        </div>

        {t.simulated && live && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-muted">
            <span aria-hidden="true">◇</span> Demo trip: this rider&apos;s movement is simulated
          </p>
        )}

        {/* The delivery code: black, the most important thing on the page. */}
        {t.otp && !t.otpLocked && (
          <div className="mt-6 rounded-2xl bg-black p-4 text-on-black">
            <p className="eyebrow !text-current opacity-75">Your delivery code</p>
            <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.35em] tabular" aria-label={`Delivery code ${t.otp.split("").join(" ")}`}>
              {t.otp}
            </p>
            <p className="mt-2 text-sm opacity-85">Give it to the rider <strong>only when the parcel is in your hands</strong>. Never share it before.</p>
          </div>
        )}
        {t.otp && t.otpLocked && (
          <div className="mt-6 rounded-2xl border-2 border-black p-4">
            <p className="font-bold">Your code is locked</p>
            <p className="mt-1 text-sm text-ink-muted">Too many wrong codes were entered. Ask {t.business.name} to send you a new one; it will appear here.</p>
          </div>
        )}

        {t.status === "delivered" && (
          <div className="mt-6 rounded-2xl bg-black p-5 text-on-black">
            <p className="display text-2xl"><span aria-hidden="true">✓ </span>Delivered</p>
            <p className="mt-1 text-sm opacity-85">Confirmed with your code{t.finishedAt ? ` at ${formatTime(t.finishedAt)}` : ""}.</p>
            {t.proofPhotoUrl && (
              // A Vercel Blob URL: next/image would need its host configured, a plain img is enough here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.proofPhotoUrl} alt="Photo the rider took of your parcel at the door" className="mt-4 max-h-64 w-full rounded-xl object-cover" />
            )}
          </div>
        )}

        <div className="lane my-6" aria-hidden="true" />

        <h2 className="eyebrow mb-3">Progress</h2>
        <Timeline steps={t.steps} />

        <dl className="mt-6 grid gap-3 text-sm">
          {t.rider && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Rider</dt>
              <dd className="text-right font-semibold">
                {t.rider.firstName} · {vehicleLabel(t.rider.vehicle)}
                {t.rider.plate && <span className="ml-2 font-mono text-xs">{t.rider.plate}</span>}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Parcel</dt>
            <dd className="text-right font-semibold">{t.package}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Delivering to</dt>
            <dd className="text-right font-semibold">{t.dropoff.address}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">From</dt>
            <dd className="text-right font-semibold">{t.business.name}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`tel:${t.business.phone}`} className="btn btn-secondary btn-sm">Call {formatNgPhone(t.business.phone)}</a>
          <a
            href={whatsappLink(t.business.phone, `Hello ${t.business.name}, I'm asking about my parcel ${displayCode(t.code)}.`)}
            className="btn btn-soft btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp the business
          </a>
        </div>
        <p className="mt-6 text-xs text-ink-muted">
          The rider&apos;s location is only shared while your parcel is on its way, and only on this page.
        </p>
      </section>
    </div>
  );
}
