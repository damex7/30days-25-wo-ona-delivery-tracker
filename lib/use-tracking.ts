"use client";
// Keeps one delivery's tracking data live in the browser. Used by the
// customer's tracking page AND the business's delivery page, so both always
// show exactly the same thing.
//
//  1. Start from the data the server rendered into the page (instant first paint).
//  2. Listen on the delivery's channel: each GPS point moves the rider at once;
//     a status change triggers a fresh fetch.
//  3. Poll /api/track/:code as a safety net: every 3 s when there's no live
//     connection, every 30 s when there is (in case a message was missed).
import { useCallback, useRef, useState } from "react";
import { type PointMessage, trackChannel } from "./channels";
import type { PublicTracking, TrailPoint } from "./services/tracking";
import { useChannel, usePolling } from "./use-live";

export function useTracking(initial: PublicTracking) {
  const [t, setT] = useState(initial);
  const [lastSync, setLastSync] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  // The highest trail id we got from the SERVER. Points pushed by Pusher have
  // no id yet, so they get negative stand-in ids and are replaced on the next fetch.
  const lastId = useRef(initial.trail.reduce((m, p) => Math.max(m, p.id), 0));

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${initial.code}?after=${lastId.current}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as PublicTracking;
      setT((prev) => {
        const live = next.status === "picked_up" || next.status === "arrived";
        const kept = live ? prev.trail.filter((p) => p.id > 0) : [];
        return { ...next, trail: live ? [...kept, ...next.trail] : [] };
      });
      lastId.current = next.trail.reduce((m, p) => Math.max(m, p.id), lastId.current);
      setLastSync(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [initial.code]);

  const fake = useRef(-1);
  const mode = useChannel(trackChannel(initial.code), {
    point: (data) => {
      const p = data as PointMessage;
      setT((prev) => {
        if (prev.status !== "picked_up" && prev.status !== "arrived") return prev;
        const point: TrailPoint = { id: fake.current--, lat: p.lat, lng: p.lng };
        return {
          ...prev,
          position: { lat: p.lat, lng: p.lng, heading: p.heading, speed: p.speed, at: p.at, accuracy: p.accuracy },
          trail: [...prev.trail, point],
        };
      });
      setLastSync(Date.now());
    },
    status: () => void refetch(),
  });

  const done = t.status === "delivered" || t.status === "failed" || t.status === "cancelled";
  // A finished delivery barely changes; check once a minute just in case.
  usePolling(refetch, done ? 60_000 : mode === "live" ? 30_000 : 3_000);

  return { t, mode, lastSync, offline, refetch };
}
