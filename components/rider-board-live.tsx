"use client";
// Keeps the rider's job board fresh: a new job, or one taken by someone else,
// refreshes the page. Listens on the fleet's PRIVATE channel (only riders of
// this business may join), with a 15-second poll as the fallback.
import { useRouter } from "next/navigation";
import { fleetChannel } from "@/lib/channels";
import { useChannel, usePolling } from "@/lib/use-live";

export function RiderBoardLive({ businessId }: { businessId: string }) {
  const router = useRouter();
  const mode = useChannel(fleetChannel(businessId), { jobs: () => router.refresh() });
  usePolling(() => router.refresh(), mode === "live" ? 60_000 : 15_000);
  return (
    <p className="text-xs font-semibold text-ink-muted">
      <span className={`mr-1.5 inline-block size-2 rounded-full ${mode === "live" ? "animate-pulse bg-brand" : "bg-ink-muted"}`} aria-hidden="true" />
      {mode === "live" ? "New jobs appear instantly" : "Checking for new jobs every 15 s"}
    </p>
  );
}
