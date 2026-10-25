"use client";
// "Live · updated 4 s ago". Tells the viewer how fresh the dot on the map is,
// and whether updates are pushed (live) or fetched every few seconds.
import { useEffect, useState } from "react";
import type { LiveMode } from "@/lib/use-live";

export function LiveStatus({ mode, lastSync, offline, pointAt }: { mode: LiveMode; lastSync: number; offline: boolean; pointAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const since = pointAt ? Math.max(0, Math.round((now - new Date(pointAt).getTime()) / 1000)) : null;
  const ago = (s: number) => (s < 5 ? "just now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : "over an hour ago");

  let label: string;
  let dot: string;
  if (offline) {
    label = "Reconnecting…";
    dot = "bg-danger";
  } else if (mode === "live") {
    label = "Live";
    dot = "bg-brand animate-pulse";
  } else {
    label = "Updating every few seconds";
    dot = "bg-ink-muted";
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      {since !== null && <span>· rider seen {ago(since)}</span>}
      {since === null && <span>· checked {ago(Math.round((now - lastSync) / 1000))}</span>}
    </p>
  );
}
