import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BusinessLiveMap } from "@/components/business-live-map";
import { CodePlate, EmptyState, Notice, PageHeader, PageSkeleton, Stat, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import { businessCounts, listBusinessDeliveries } from "@/lib/services/deliveries";
import { getMyBusiness } from "@/lib/services/fleet";
import { businessLive } from "@/lib/services/tracking";
import { hrefWith } from "@/lib/url";
import { deliveryListSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Deliveries" };

export default function BusinessHome(props: PageProps<"/business">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your deliveries" />}>
      <Dashboard {...props} />
    </Suspense>
  );
}

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Waiting for rider" },
  { value: "done", label: "Finished" },
  { value: "all", label: "All" },
] as const;

async function Dashboard({ searchParams }: PageProps<"/business">) {
  const me = await requireActor("business");
  const sp = await searchParams;
  const list = deliveryListSchema.parse({ view: sp.view, q: sp.q });
  const [business, counts, live, deliveries] = await Promise.all([
    getMyBusiness(me),
    businessCounts(me),
    businessLive(me),
    listBusinessDeliveries(me, list),
  ]);
  const shop = business.pickup_lat !== null && business.pickup_lng !== null ? { lat: business.pickup_lat, lng: business.pickup_lng } : null;
  const current = { view: list.view === "active" ? undefined : list.view, q: list.q };

  return (
    <div className="container-page py-8">
      <PageHeader eyebrow={business.name} title="Deliveries" />

      {sp.demo === "1" && (
        <div className="mb-6">
          <Notice title="Your demo is ready. Try this:">
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Open a delivery that&apos;s <strong>on the way</strong> and press <strong>Open tracking page</strong>: that&apos;s what the customer sees.</li>
              <li>Use <strong>Switch to</strong> (in the blue bar) to become <strong>Musa</strong>. Start his trip and press <strong>Simulate ride</strong>.</li>
              <li>Watch the tracking page in another tab: Musa moves on the map, live. Finish with the customer&apos;s 4-digit code.</li>
            </ol>
          </Notice>
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting for rider" value={counts.pending} tone="black" />
        <Stat label="Assigned" value={counts.assigned} />
        <Stat label="On the road" value={counts.live} />
        <Stat label="Delivered today" value={counts.delivered_today} />
      </dl>

      <BusinessLiveMap businessId={me.id} initial={live} shop={shop} />

      <section aria-labelledby="list" className="mt-10">
        <h2 id="list" className="sr-only">Delivery list</h2>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter deliveries" className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => {
              const active = list.view === v.value;
              return (
                <Link
                  key={v.value}
                  href={hrefWith("/business", current, { view: v.value === "active" ? undefined : v.value })}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${active ? "bg-black text-on-black" : "bg-surface-2 text-ink hover:bg-blue-soft"}`}
                >
                  {v.label}
                </Link>
              );
            })}
          </nav>
          <form role="search" action="/business" className="flex gap-2">
            {list.view !== "active" && <input type="hidden" name="view" value={list.view} />}
            <label htmlFor="q" className="sr-only">Search deliveries</label>
            <input id="q" name="q" defaultValue={list.q} placeholder="Customer, code or parcel" className="input min-h-10 w-56" />
            <button className="btn btn-secondary btn-sm">Search</button>
          </form>
        </div>

        {deliveries.length === 0 ? (
          <EmptyState
            title={list.q ? "Nothing matches that search" : list.view === "done" ? "No finished deliveries yet" : "No deliveries here"}
            action={<Link href="/business/deliveries/new" className="btn btn-primary">Create a delivery</Link>}
          >
            {list.q ? "Try a customer's name, a tracking code or what's in the parcel." : "Create a delivery, then send the customer their tracking link."}
          </EmptyState>
        ) : (
          <ul className="space-y-2.5">
            {deliveries.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/business/deliveries/${d.id}`}
                  className={`card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:border-brand ${d.status === "picked_up" || d.status === "arrived" ? "border-l-4 border-l-brand" : ""}`}
                >
                  <CodePlate code={d.tracking_code} />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-semibold">{d.customer_name} <span className="font-normal text-ink-muted">· {d.package}</span></p>
                    <p className="truncate text-sm text-ink-muted">To {d.dropoff_address}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-ink-muted">{d.rider_name ?? "No rider yet"}</span>
                    {d.fee_kobo !== null && <span className="tabular">{naira(d.fee_kobo)}</span>}
                    <span className="text-ink-muted">{timeAgo(d.finished_at ?? d.created_at)}</span>
                    <StatusBadge status={d.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
