import type { Metadata } from "next";
import { Suspense } from "react";
import { suspendBusinessAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { EmptyState, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { formatDate, timeAgo } from "@/lib/format";
import { adminOverview } from "@/lib/services/admin";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the admin panel" />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  const me = await requireActor("admin");
  const { totals, businesses, log } = await adminOverview(me);
  return (
    <div className="container-page py-8">
      <PageHeader eyebrow="Admin" title="All businesses" subtitle="Admins can pause a business. They don't see customers' details or live locations." />
      <dl className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Businesses" value={totals.businesses} tone="black" />
        <Stat label="Riders" value={totals.riders} tone="black" />
        <Stat label="On the road now" value={totals.live} />
        <Stat label="Delivered today" value={totals.delivered_today} />
        <Stat label="Demo worlds" value={totals.demo_worlds} tone="black" />
      </dl>

      {businesses.length === 0 ? (
        <EmptyState title="No businesses yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Businesses, newest first</caption>
            <thead className="border-b border-line bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Business</th>
                <th scope="col" className="p-3">Location</th>
                <th scope="col" className="p-3 text-right">Riders</th>
                <th scope="col" className="p-3 text-right">Open</th>
                <th scope="col" className="p-3 text-right">Delivered</th>
                <th scope="col" className="p-3">Joined</th>
                <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {businesses.map((b) => (
                <tr key={b.id} className={b.suspended ? "bg-danger-bg/50" : ""}>
                  <td className="p-3">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-xs text-ink-muted">{b.owner} · {b.email}</p>
                  </td>
                  <td className="p-3">{b.city}, {b.state}</td>
                  <td className="p-3 text-right tabular">{b.riders}</td>
                  <td className="p-3 text-right tabular">{b.active}</td>
                  <td className="p-3 text-right tabular">{b.delivered}</td>
                  <td className="p-3">{formatDate(b.created_at)}</td>
                  <td className="p-3 text-right">
                    <ActionButton
                      action={suspendBusinessAction.bind(null, b.id, !b.suspended)}
                      label={b.suspended ? "Unpause" : "Pause"}
                      pendingLabel="Saving…"
                      confirm={b.suspended ? undefined : `Pause ${b.name}? They'll be logged out and can't log in.`}
                      className={b.suspended ? "btn btn-secondary btn-sm" : "btn btn-danger btn-sm"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="log" className="mt-10">
        <h2 id="log" className="mb-3 text-xl">Audit log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-ink-muted">No admin actions yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {log.map((l) => (
              <li key={l.id}>
                <span className="text-ink-muted">{timeAgo(l.created_at)}</span> · <strong>{l.admin ?? "An admin"}</strong>{" "}
                {l.action === "suspend" ? "paused" : "unpaused"} <strong>{l.target ?? "a deleted account"}</strong>
                {l.note && <span className="text-ink-muted"> ({l.note})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
