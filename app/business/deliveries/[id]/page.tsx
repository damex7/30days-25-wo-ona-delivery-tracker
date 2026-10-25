import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { assignAction, businessFailAction, cancelAction, resetOtpAction, unassignAction } from "@/app/actions/business";
import { AssignForm } from "@/components/assign-form";
import { BusinessDeliveryLive } from "@/components/business-delivery-live";
import { CopyButton } from "@/components/copy-button";
import { ActionButton } from "@/components/form";
import { ReasonForm } from "@/components/reason-form";
import { CodePlate, Notice, PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { MAX_OTP_ATTEMPTS, vehicleLabel } from "@/lib/constants";
import { link } from "@/lib/email";
import { formatDate, formatTime } from "@/lib/format";
import { naira } from "@/lib/money";
import { formatNgPhone, whatsappLink } from "@/lib/phone";
import { getBusinessDelivery, statusLabel } from "@/lib/services/deliveries";
import { NotFoundError } from "@/lib/services/errors";
import { listAssignableRiders } from "@/lib/services/fleet";
import { getPublicTracking } from "@/lib/services/tracking";
import { displayCode } from "@/lib/tracking-code";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Delivery" };

export default function DeliveryPage(props: PageProps<"/business/deliveries/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the delivery" />}>
      <Delivery {...props} />
    </Suspense>
  );
}

async function Delivery({ params, searchParams }: PageProps<"/business/deliveries/[id]">) {
  const me = await requireActor("business");
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  let data;
  try {
    data = await getBusinessDelivery(me, id.data);
  } catch (e) {
    // Not found AND not yours look the same (404), so ids can't be probed.
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { delivery: d, events } = data;
  const [tracking, riders] = await Promise.all([getPublicTracking(d.tracking_code), listAssignableRiders(me)]);
  const created = (await searchParams).created === "1";

  const trackUrl = link(`/track/${d.tracking_code}`);
  const first = d.customer_name.split(" ")[0];
  const waText = `Hello ${first}, your parcel (${d.package}) is on its way to you. Track it live here: ${trackUrl}\n\nWhen it arrives, give the rider the delivery code shown on that page.`;
  const open = d.finished_at === null;
  const live = d.status === "picked_up" || d.status === "arrived";

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <Link href="/business" className="link text-sm">← Deliveries</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CodePlate code={d.tracking_code} className="text-base" />
          <StatusBadge status={d.status} />
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl">{d.customer_name}</h1>
        <p className="mt-1 text-ink-muted">{d.package} · created {formatDate(d.created_at)}, {formatTime(d.created_at)}</p>
      </div>

      {created && (
        <div className="mb-6">
          <Notice tone="ok" title="Delivery created">
            Now send {first} the tracking link below. They&apos;ll see their delivery code on it.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <BusinessDeliveryLive initial={tracking} />

          <section aria-labelledby="history" className="card p-5">
            <h2 id="history" className="text-xl">History</h2>
            <ol className="mt-4 space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 text-ink-muted tabular">{formatTime(e.created_at)}</span>
                  <span>
                    <span className="font-semibold">{statusLabel(e.status)}</span>
                    {e.note && <span className="text-ink-muted"> · {e.note}</span>}
                    {e.actor_name && <span className="block text-xs text-ink-muted">by {e.actor_name}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="details" className="card p-5">
            <h2 id="details" className="text-xl">Details</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="eyebrow">Customer phone</dt><dd><a className="link" href={`tel:${d.customer_phone}`}>{formatNgPhone(d.customer_phone)}</a></dd></div>
              <div><dt className="eyebrow">Fee</dt><dd className="tabular">{d.fee_kobo === null ? "Not set" : naira(d.fee_kobo)}</dd></div>
              <div><dt className="eyebrow">Pickup</dt><dd>{d.pickup_address}</dd></div>
              <div><dt className="eyebrow">Drop-off</dt><dd>{d.dropoff_address}</dd></div>
              {d.notes && <div className="sm:col-span-2"><dt className="eyebrow">Notes for the rider</dt><dd>{d.notes}</dd></div>}
              {d.reason && <div className="sm:col-span-2"><dt className="eyebrow">{d.status === "cancelled" ? "Why it was cancelled" : "Why it failed"}</dt><dd>{d.reason}</dd></div>}
            </dl>
            {d.proof_photo_url && (
              <figure className="mt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.proof_photo_url} alt={`Photo the rider took when delivering to ${d.customer_name}`} className="max-h-72 rounded-xl object-cover" />
                <figcaption className="mt-1 text-xs text-ink-muted">Proof of delivery photo</figcaption>
              </figure>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby="share" className="card p-5">
            <h2 id="share" className="text-xl">Customer&apos;s tracking link</h2>
            <p className="mt-2 rounded-lg bg-surface-2 p-2 font-mono text-xs break-all">{trackUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={whatsappLink(d.customer_phone, waText)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Send on WhatsApp</a>
              <CopyButton text={trackUrl} label="Copy link" />
              <a href={`/track/${d.tracking_code}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Open tracking page ↗</a>
            </div>
          </section>

          {open && (
            <section aria-labelledby="otp" className="rounded-2xl bg-black p-5 text-on-black">
              <h2 id="otp" className="eyebrow !text-current opacity-75">Customer&apos;s delivery code</h2>
              <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.3em]" aria-label={`Delivery code ${d.otp.split("").join(" ")}`}>{d.otp}</p>
              <p className="mt-2 text-sm opacity-85">
                It&apos;s on the customer&apos;s tracking page. The rider never sees it.
                {d.otp_attempts > 0 && <> Wrong tries: {d.otp_attempts} of {MAX_OTP_ATTEMPTS}.</>}
              </p>
              <div className="mt-3">
                <ActionButton
                  action={resetOtpAction.bind(null, d.id)}
                  label={d.otp_attempts >= MAX_OTP_ATTEMPTS ? "Unlock: issue a new code" : "Issue a new code"}
                  pendingLabel="Issuing…"
                  confirm="Issue a new code? The old one stops working; the customer sees the new one on their tracking page."
                  className="btn btn-sm bg-surface text-ink hover:bg-blue-soft"
                />
              </div>
            </section>
          )}

          <section aria-labelledby="rider" className="card p-5">
            <h2 id="rider" className="text-xl">Rider</h2>
            {d.rider_name ? (
              <div className="mt-3">
                <p className="font-semibold">{d.rider_name}</p>
                <p className="text-sm text-ink-muted">
                  {vehicleLabel(d.rider_vehicle ?? "")}{d.rider_plate ? ` · ${d.rider_plate}` : ""}
                </p>
                {d.rider_phone && <a className="link text-sm" href={`tel:${d.rider_phone}`}>Call {formatNgPhone(d.rider_phone)}</a>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">On the job board. The first free rider can take it, or assign someone.</p>
            )}
            {(d.status === "pending" || d.status === "assigned") && (
              <div className="mt-4 space-y-3">
                {riders.length > 0 ? (
                  <AssignForm action={assignAction.bind(null, d.id)} riders={riders} current={d.rider_id} />
                ) : (
                  <p className="text-sm">You have no riders yet. <Link href="/business/riders" className="link">Invite one</Link>.</p>
                )}
                {d.status === "assigned" && (
                  <ActionButton action={unassignAction.bind(null, d.id)} label="Take back (put on job board)" pendingLabel="Taking back…" className="btn btn-ghost btn-sm" />
                )}
              </div>
            )}
            {live && <p className="mt-3 text-sm text-ink-muted">The parcel is with the rider, so the rider can&apos;t change now.</p>}
          </section>

          {(d.status === "pending" || d.status === "assigned") && (
            <ReasonForm action={cancelAction.bind(null, d.id)} summary="Cancel this delivery" button="Cancel delivery" placeholder="e.g. Customer changed their mind" />
          )}
          {live && (
            <ReasonForm action={businessFailAction.bind(null, d.id)} summary="Mark as failed" button="Mark as failed" placeholder="e.g. Customer not reachable" />
          )}
          <p className="text-xs text-ink-muted">Tracking code: {displayCode(d.tracking_code)} · {statusLabel(d.status)}</p>
        </aside>
      </div>
    </div>
  );
}
