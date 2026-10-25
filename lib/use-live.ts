"use client";
// Two hooks that keep a page up to date without refreshing.
//
// useChannel: listen to a Pusher channel. When Pusher is configured and
// connected, updates arrive the moment the server publishes them (a WebSocket
// that Pusher holds open for us). It reports "live" or "polling" so the page
// knows whether it also needs to ask the server itself.
//
// usePolling: ask the server every N milliseconds, pausing while the tab is
// hidden (no point using a customer's data plan for a page nobody is looking at).
import { useEffect, useRef, useState } from "react";

export type LiveMode = "connecting" | "live" | "polling";

type PusherLike = {
  subscribe(name: string): { bind(event: string, fn: (data: unknown) => void): void; unbind_all(): void };
  unsubscribe(name: string): void;
  connection: { state: string; bind(event: string, fn: (s: { current: string }) => void): void; unbind(event: string, fn: unknown): void };
};

const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
let shared: Promise<PusherLike> | null = null;

/** One Pusher connection per browser tab, however many channels the page uses. */
function client(): Promise<PusherLike> {
  shared ??= import("pusher-js").then(
    ({ default: Pusher }) =>
      new Pusher(KEY!, {
        cluster: CLUSTER!,
        // Private channels ask our server for permission here first.
        channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
      }) as unknown as PusherLike,
  );
  return shared;
}

export const realtimeConfigured = Boolean(KEY && CLUSTER);

export function useChannel(channel: string | null, handlers: Record<string, (data: unknown) => void>): LiveMode {
  const [mode, setMode] = useState<LiveMode>(realtimeConfigured ? "connecting" : "polling");
  // Keep the latest handlers without re-subscribing every render.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!realtimeConfigured || !channel) return;
    let p: PusherLike | null = null;
    let cancelled = false;
    const onState = (s: { current: string }) => setMode(s.current === "connected" ? "live" : "polling");
    client().then((pusher) => {
      if (cancelled) return;
      p = pusher;
      const sub = pusher.subscribe(channel);
      for (const event of Object.keys(ref.current)) sub.bind(event, (data) => ref.current[event]?.(data));
      pusher.connection.bind("state_change", onState);
      setMode(pusher.connection.state === "connected" ? "live" : "connecting");
    }).catch(() => setMode("polling"));
    return () => {
      cancelled = true;
      if (p) {
        p.connection.unbind("state_change", onState);
        p.unsubscribe(channel);
      }
    };
  }, [channel]);

  return mode;
}

export function usePolling(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          await ref.current();
        } catch {
          // a failed poll just tries again next time
        }
      }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    timer = setTimeout(tick, ms);
    // Catch up straight away when the person comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled]);
}
