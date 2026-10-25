import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { acceptJobAction, dutyAction } from "@/app/actions/rider";
import { ActionButton } from "@/components/form";
import { RiderBoardLive } from "@/components/rider-board-live";
import { CodePlate, EmptyState, Notice, PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { formatTime, timeAgo } from "@/lib/format";
import { distanceM, formatDistance } from "@/lib/geo";
import { naira } from "@/lib/money";
import { riderBoard, type RiderJob } from "@/lib/services/deliveries";
import { getMyRider } from "@/lib/services/fleet";

export const metadata: Metadata = { title: "My jobs" };

export default function RiderHome(props: PageProps<"/rider">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your jobs" />}>
      <Board {...props} />
    </Suspense>
  );
}

const trip = (j: RiderJob) => formatDistance(distanceM({ lat: j.pickup_lat, lng: j.pickup_lng }, { lat: j.dropoff_lat, lng: j.dropoff_lng }));

async function Board({ searchParams }: PageProps<"/rider">) {
  const me = await requireActor("rider");
  const [rider, board] = await Promise.all([getMyRider(me), riderBoard(me)]);
  const welcome = (await searchParams).welcome === "1";

  return (
    <div className="container-page max-w-2xl py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{rider.business_name}</p>
          <h1 className="mt-1 text-3xl">Hello, {me.name.split(" ")[0]}</h1>
        </div>
        <ActionButton
          action={dutyAction.bind(null, !rider.on_duty)}
          label={rider.on_duty ? "● On duty · go off" : "○ Off duty · go on"}
          pendingLabel="Updating…"
          className={`btn btn-sm ${rider.on_duty ? "btn-primary" : "btn-secondary"}`}
        />
      </div>

      {welcome && (
        <div className="mb-5">
          <Notice tone="ok" title={`You've joined ${rider.business_name}`}>
            Jobs from your business show up below. Take one, collect the parcel, then tap “Start trip” and keep this screen open while you ride.
          </Notice>
        </div>
      )}

      {board.live && (
        <Link href={`/rider/trips/${board.live.id}`} className="mb-6 block rounded-2xl bg-brand p-5 text-on-brand shadow-lg">
          <p className="eyebrow !text-current opacity-80">You&apos;re on a trip</p>
          <p className="display mt-1 text-2xl">To {board.live.customer_name}</p>
          <p className="mt-1 text-white/90">{board.live.dropoff_address}</p>
          <span className="btn btn-on-bar mt-4">Continue trip →</span>
        </Link>
      )}

      <section aria-labelledby="mine" className="mb-8">
        <h2 id="mine" className="mb-3 text-xl">To collect <span className="text-brand tabular">({board.queued.length})</span></h2>
        {board.queued.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing assigned to you yet. Take a job from the board below.</p>
        ) : (
          <ul className="space-y-3">
            {board.queued.map((j) => (
              <li key={j.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CodePlate code={j.tracking_code} />
                  <StatusBadge status={j.status} />
                </div>
                <p className="mt-2 font-semibold">{j.package}</p>
                <p className="text-sm text-ink-muted">From {j.pickup_address}</p>
                <p className="text-sm text-ink-muted">To {j.dropoff_address} · {trip(j)}</p>
                <Link href={`/rider/trips/${j.id}`} className="btn btn-primary mt-3 w-full">Open job</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="board">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="board" className="text-xl">Job board <span className="text-brand tabular">({board.open.length})</span></h2>
          <RiderBoardLive businessId={rider.business_id} />
        </div>
        {!rider.on_duty && <div className="mb-3"><Notice tone="warn">You&apos;re off duty. Go on duty to take jobs.</Notice></div>}
        {board.open.length === 0 ? (
          <EmptyState title="No open jobs">New deliveries from {rider.business_name} appear here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {board.open.map((j) => (
              <li key={j.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{j.package}</span>
                  {j.fee_kobo !== null && <span className="chip tabular">{naira(j.fee_kobo)}</span>}
                </div>
                <p className="mt-1 text-sm text-ink-muted">From {j.pickup_address}</p>
                <p className="text-sm text-ink-muted">To {j.dropoff_address} · {trip(j)} · posted {timeAgo(j.created_at)}</p>
                <div className="mt-3">
                  <ActionButton action={acceptJobAction.bind(null, j.id)} label="Take this job" pendingLabel="Taking…" className="btn btn-black w-full" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {board.doneToday.length > 0 && (
        <section aria-labelledby="done" className="mt-8">
          <h2 id="done" className="mb-3 text-xl">Done today <span className="text-brand tabular">({board.doneToday.length})</span></h2>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {board.doneToday.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">{j.customer_name} · {j.package}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {j.finished_at && <span className="text-ink-muted tabular">{formatTime(j.finished_at)}</span>}
                  <StatusBadge status={j.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
