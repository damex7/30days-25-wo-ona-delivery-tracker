import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { newFleetCodeAction, pauseRiderAction, unpauseRiderAction } from "@/app/actions/business";
import { CopyButton } from "@/components/copy-button";
import { ActionButton } from "@/components/form";
import { CodePlate, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { vehicleLabel } from "@/lib/constants";
import { link } from "@/lib/email";
import { formatNgPhone } from "@/lib/phone";
import { getMyBusiness, listMyRiders } from "@/lib/services/fleet";

export const metadata: Metadata = { title: "Riders" };

export default function RidersPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your riders" />}>
      <Riders />
    </Suspense>
  );
}

async function Riders() {
  const me = await requireActor("business");
  const [business, riders] = await Promise.all([getMyBusiness(me), listMyRiders(me)]);
  const invite = link(`/signup?role=rider&code=${business.fleet_code}`);
  const inviteText = `Join ${business.name} on Wo Ọ̀nà as a rider. Sign up here: ${invite}\nOur fleet code is ${business.fleet_code}.`;

  return (
    <div className="container-page py-8">
      <PageHeader eyebrow={business.name} title="Riders" subtitle="Everyone who delivers for you. Riders join with your fleet code." />

      <section aria-labelledby="fleet-code" className="mb-8 grid gap-4 rounded-2xl bg-brand p-5 text-on-brand sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <div>
          <h2 id="fleet-code" className="eyebrow !text-current opacity-80">Your fleet code</h2>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.25em]" aria-label={`Fleet code ${business.fleet_code.split("").join(" ")}`}>
            {business.fleet_code}
          </p>
        </div>
        <div className="space-y-3 sm:pl-6">
          <p className="text-sm text-white/90">
            A new rider signs up with this code and joins your fleet. Only share it with people who ride for you. If it leaks, make a new one: the old code stops working (riders who already joined stay).
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-sm bg-white text-[#0B0B0C] hover:bg-blue-soft" href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer">Invite on WhatsApp</a>
            <CopyButton text={invite} label="Copy invite link" className="btn btn-sm border-white text-white hover:bg-white/10" />
            <ActionButton
              action={newFleetCodeAction}
              label="Make a new code"
              pendingLabel="Making…"
              confirm="Make a new fleet code? The current code will stop working for new sign-ups."
              className="btn btn-sm text-white underline hover:bg-white/10"
            />
          </div>
        </div>
      </section>

      {riders.length === 0 ? (
        <EmptyState title="No riders yet">Send your riders the invite link. Once they sign up, they appear here and can take your deliveries.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {riders.map((r) => (
            <li key={r.id} className={`card p-4 ${r.suspended ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">{r.name}</p>
                  <p className="text-sm text-ink-muted">
                    {vehicleLabel(r.vehicle)}{r.plate ? ` · ${r.plate}` : ""} · <a className="link" href={`tel:${r.phone}`}>{formatNgPhone(r.phone)}</a>
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.suspended ? "bg-danger-bg text-danger" : r.live_delivery_id ? "bg-brand text-on-brand" : r.on_duty ? "bg-blue-soft text-on-blue-soft" : "border border-line-strong text-ink-muted"}`}>
                  {r.suspended ? "Paused" : r.live_delivery_id ? "On a trip" : r.on_duty ? "On duty" : "Off duty"}
                </span>
              </div>
              <p className="mt-3 text-sm">
                <span className="tabular font-semibold">{r.delivered_today}</span> delivered today ·{" "}
                <span className="tabular font-semibold">{r.queued}</span> waiting to collect
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.live_delivery_id && r.live_code && (
                  <Link href={`/business/deliveries/${r.live_delivery_id}`} className="btn btn-primary btn-sm">
                    Watch trip <CodePlate code={r.live_code} className="ml-1 !text-xs" />
                  </Link>
                )}
                {r.suspended ? (
                  <ActionButton action={unpauseRiderAction.bind(null, r.id)} label="Unpause" pendingLabel="Unpausing…" className="btn btn-secondary btn-sm" />
                ) : (
                  <ActionButton
                    action={pauseRiderAction.bind(null, r.id)}
                    label="Pause rider"
                    pendingLabel="Pausing…"
                    confirm={`Pause ${r.name}? They'll be logged out and can't take jobs. Jobs they haven't collected go back to the job board.`}
                    className="btn btn-ghost btn-sm"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
