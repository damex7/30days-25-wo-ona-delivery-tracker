"use client";
// The rider's trip screen, built for one hand on a phone in bright sun: a map,
// big buttons, and a clear GPS panel that says whether location is going out.
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { arrivedAction, confirmAction, releaseJobAction, riderFailAction, startTripAction } from "@/app/actions/rider";
import { idle } from "@/lib/action-state";
import { distanceM, formatDistance } from "@/lib/geo";
import { naira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import type { RiderTrip } from "@/lib/services/deliveries";
import { useLocationSharing } from "@/lib/use-location-sharing";
import { useNow } from "@/lib/use-now";
import { ActionButton } from "./form";
import DeliveryMap from "./map";
import { PhotoCapture } from "./photo-capture";
import { ReasonForm } from "./reason-form";
import { CodePlate, Notice, StatusBadge } from "./ui";

export function TripScreen({ trip, canSimulate, photoRequired }: { trip: RiderTrip; canSimulate: boolean; photoRequired: boolean }) {
  const router = useRouter();
  const live = trip.status === "picked_up" || trip.status === "arrived";
  const share = useLocationSharing({ deliveryId: trip.id, active: live, onStopped: () => router.refresh() });

  const last = trip.last_lat !== null && trip.last_lng !== null ? { lat: trip.last_lat, lng: trip.last_lng } : null;
  const here = share.fix ? { lat: share.fix.lat, lng: share.fix.lng } : last;
  const pickup = { lat: trip.pickup_lat, lng: trip.pickup_lng };
  const dropoff = { lat: trip.dropoff_lat, lng: trip.dropoff_lng };
  const toGo = here ? distanceM(here, dropoff) : null;

  const riders = useMemo(
    () => (here && live ? [{ id: "me", lat: here.lat, lng: here.lng, heading: share.fix?.heading ?? null, label: "You" }] : []),
    [here?.lat, here?.lng, live, share.fix?.heading], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const navTo = trip.status === "assigned" ? pickup : dropoff;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${navTo.lat},${navTo.lng}&travelmode=driving`;

  return (
    <div className="flex flex-1 flex-col">
      <DeliveryMap
        label="Trip map: your position, the pickup and the drop-off"
        pickup={trip.status === "assigned" || !live ? pickup : null}
        dropoff={dropoff}
        riders={riders}
        plan={share.plan}
        followId={live ? "me" : null}
        className="h-[38vh] min-h-64"
      />

      <div className="relative z-[600] -mt-5 flex-1 rounded-t-3xl bg-surface px-4 pt-5 pb-10 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]">
        <div className="mx-auto max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CodePlate code={trip.tracking_code} />
            <StatusBadge status={trip.status} />
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl">
            {trip.status === "assigned" && "Collect the parcel"}
            {trip.status === "picked_up" && <>To {trip.customer_name}{toGo !== null && <span className="text-brand"> · {formatDistance(toGo)}</span>}</>}
            {trip.status === "arrived" && "Hand it over"}
            {trip.status === "delivered" && "Delivered ✓"}
            {trip.status === "failed" && "Marked as failed"}
            {trip.status === "cancelled" && "Cancelled"}
            {trip.status === "pending" && "Back on the job board"}
          </h1>

          {live && <GpsPanel share={share} canSimulate={canSimulate} from={here} simulatedTrip={trip.simulated} />}

          {/* ── The main action for this step ─────────────────────────── */}
          <div className="mt-5 space-y-3">
            {trip.status === "assigned" && (
              <>
                <p className="text-ink-muted">
                  Go to <strong className="text-ink">{trip.pickup_address}</strong> and collect: <strong className="text-ink">{trip.package}</strong>.
                  When it&apos;s in your hands, start the trip. Your location is shared with the customer from then until the handover.
                </p>
                <ActionButton action={startTripAction.bind(null, trip.id)} label="I have the parcel · Start trip" pendingLabel="Starting…" className="btn btn-primary btn-xl w-full" />
              </>
            )}
            {trip.status === "picked_up" && (
              <ActionButton action={arrivedAction.bind(null, trip.id)} label="I've arrived" pendingLabel="Updating…" className="btn btn-black btn-xl w-full" />
            )}
            {(trip.status === "arrived" || trip.status === "picked_up") && (
              <ConfirmForm trip={trip} photoRequired={photoRequired} highlight={trip.status === "arrived"} />
            )}
            {(trip.status === "delivered" || trip.status === "failed" || trip.status === "cancelled" || trip.status === "pending") && (
              <a href="/rider" className="btn btn-primary btn-xl w-full">Back to my jobs</a>
            )}
          </div>

          {/* ── Who and where ────────────────────────────────────────── */}
          <dl className="mt-6 grid gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Customer</dt><dd className="text-right font-semibold">{trip.customer_name}</dd></div>
            {trip.customer_phone && (
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">Phone</dt><dd><a className="link" href={`tel:${trip.customer_phone}`}>{formatNgPhone(trip.customer_phone)}</a></dd></div>
            )}
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Parcel</dt><dd className="text-right font-semibold">{trip.package}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Pickup</dt><dd className="text-right">{trip.pickup_address}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Drop-off</dt><dd className="text-right">{trip.dropoff_address}</dd></div>
            {trip.notes && <div className="flex justify-between gap-4"><dt className="text-ink-muted">Notes</dt><dd className="text-right font-semibold">{trip.notes}</dd></div>}
            {trip.fee_kobo !== null && <div className="flex justify-between gap-4"><dt className="text-ink-muted">Fee</dt><dd className="tabular">{naira(trip.fee_kobo)}</dd></div>}
          </dl>
          {(trip.status === "assigned" || live) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={directions} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                Directions to {trip.status === "assigned" ? "pickup" : "drop-off"} ↗
              </a>
              <a href={`tel:${trip.business_phone}`} className="btn btn-ghost btn-sm">Call {trip.business_name}</a>
            </div>
          )}

          {/* ── Less common, more drastic ───────────────────────────── */}
          <div className="mt-8 space-y-3">
            {trip.status === "assigned" && (
              <ActionButton
                action={releaseJobAction.bind(null, trip.id)}
                label="Give this job back"
                pendingLabel="Giving back…"
                confirm="Give this job back to the job board?"
                className="btn btn-ghost btn-sm"
              />
            )}
            {live && (
              <ReasonForm action={riderFailAction.bind(null, trip.id)} summary="I can't deliver this" button="Report: can't deliver" placeholder="e.g. Customer not answering after 3 calls" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GpsPanel({ share, canSimulate, from, simulatedTrip }: {
  share: ReturnType<typeof useLocationSharing>;
  canSimulate: boolean;
  from: { lat: number; lng: number } | null;
  simulatedTrip: boolean;
}) {
  const [starting, setStarting] = useState(false);
  const now = useNow(1000);
  const msgs: Record<string, { text: string; tone: "info" | "warn" | "danger" | "ok" }> = {
    idle: { text: "Getting ready to share your location…", tone: "info" },
    asking: { text: "Allow location access when your phone asks, so the customer can see you coming.", tone: "info" },
    on: { text: "Sharing your location with the customer.", tone: "ok" },
    weak: { text: "Weak GPS signal. Move into the open; nothing is sent until it improves.", tone: "warn" },
    denied: { text: "Location is blocked. Allow it for this site in your browser settings, then reload. The customer can't see you until then.", tone: "danger" },
    unavailable: { text: "Your phone isn't giving a location right now. Check that location (GPS) is switched on.", tone: "danger" },
    simulating: { text: "Simulated ride: sending made-up GPS along the road.", tone: "info" },
    "arrived-sim": { text: "Simulation finished: you're at the drop-off. Tap “I've arrived”.", tone: "ok" },
  };
  const m = msgs[share.gps] ?? msgs.idle!;
  const ago = share.lastSentAt ? Math.max(0, Math.round((now - share.lastSentAt) / 1000)) : null;

  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      <Notice tone={m.tone}>
        <span className="font-semibold">{m.text}</span>
        <span className="mt-1 block text-xs opacity-80">
          {share.fix && share.gps !== "simulating" && <>Accuracy ±{Math.round(share.fix.accuracy)} m · </>}
          {ago !== null ? <>last sent {ago < 5 ? "just now" : `${ago} s ago`}</> : <>nothing sent yet</>}
          {share.queued > 0 && <> · {share.queued} waiting to send</>}
          {share.wakeLock === "on" && <> · screen stays on</>}
        </span>
      </Notice>
      {share.wakeLock === "unsupported" && (
        <p className="text-xs text-ink-muted">Keep this screen open while you ride: if the phone locks, your location stops updating.</p>
      )}
      {share.sendError && <p role="alert" className="text-sm font-semibold text-danger">{share.sendError}</p>}

      {canSimulate && (
        <div className="rounded-xl border border-dashed border-line-strong p-3">
          <p className="text-sm font-semibold">Demo: simulate the ride</p>
          <p className="text-xs text-ink-muted">
            Drives a road route from here to the drop-off and sends it as GPS, exactly like a real phone would.
            {simulatedTrip ? " The tracking page labels this trip as simulated." : " The tracking page will label the trip as simulated."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {share.simulating ? (
              <button type="button" onClick={share.stopSimulation} className="btn btn-black btn-sm">■ Stop simulation</button>
            ) : (
              <button
                type="button"
                disabled={starting}
                onClick={async () => {
                  setStarting(true);
                  await share.startSimulation(from);
                  setStarting(false);
                }}
                className="btn btn-primary btn-sm"
              >
                {starting ? "Loading route…" : "▶ Simulate ride"}
              </button>
            )}
            <label className="flex items-center gap-1.5 text-sm">
              Speed
              <select
                value={share.simSpeed}
                disabled={share.simulating}
                onChange={(e) => share.setSimSpeed(Number(e.target.value))}
                className="input min-h-9 w-auto py-1 text-sm"
              >
                <option value={1}>Real (30 km/h)</option>
                <option value={4}>4× faster</option>
                <option value={8}>8× faster</option>
                <option value={16}>16× faster</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** The handover: the customer's 4-digit code (and a photo, when photo proof is switched on). */
function ConfirmForm({ trip, photoRequired, highlight }: { trip: RiderTrip; photoRequired: boolean; highlight: boolean }) {
  const [state, action, pending] = useActionState(confirmAction.bind(null, trip.id), idle);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const err = state.fieldErrors?.otp?.[0] ?? state.fieldErrors?.photo?.[0];
  const content = (
    <form action={action} className="space-y-3">
      <label htmlFor="otp" className="label">Customer&apos;s 4-digit delivery code</label>
      <p id="otp-hint" className="hint -mt-2">Ask for it only once they have the parcel in their hands. It&apos;s on their tracking page.</p>
      <input
        id="otp"
        name="otp"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="off"
        required
        aria-invalid={err ? true : undefined}
        aria-describedby={`otp-hint${err ? " otp-err" : ""}`}
        className="input text-center font-mono text-3xl tracking-[0.5em]"
        placeholder="••••"
        defaultValue={typeof state.values?.otp === "string" ? state.values.otp : ""}
      />
      {photoRequired && <PhotoCapture tripId={trip.id} onUploaded={setPhotoUrl} />}
      <input type="hidden" name="photoUrl" value={photoUrl ?? ""} />
      {err && <p id="otp-err" role="alert" className="field-error"><span aria-hidden="true">⚠</span> {err}</p>}
      {state.status === "error" && !err && <p role="alert" className="field-error">{state.message}</p>}
      <button className="btn btn-primary btn-xl w-full" disabled={pending || (photoRequired && !photoUrl)}>
        {pending ? "Checking…" : "Confirm delivery"}
      </button>
    </form>
  );
  if (highlight) return <div className="rounded-2xl border-2 border-black p-4">{content}</div>;
  return (
    <details className="rounded-2xl border border-line">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-brand [&::-webkit-details-marker]:hidden">Already with the customer? Confirm the handover</summary>
      <div className="px-4 pb-4">{content}</div>
    </details>
  );
}
