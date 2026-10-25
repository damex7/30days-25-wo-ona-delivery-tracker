"use client";
// The rider's phone side of live tracking.
//
//  GPS ──► thin the points ──► queue (also saved in localStorage) ──► POST /api/rider/location
//
//  - Real GPS comes from the browser's watchPosition(), which calls us every
//    time the phone's position changes.
//  - We don't send every fix: only when the rider has moved 8+ metres, or
//    every 15 seconds while standing still (so the customer knows they're alive).
//  - Points wait in a queue and go up in batches every 3 seconds. If the
//    network drops (a Lagos underpass, a dead zone), they stay queued, even
//    across a page reload, and are sent when the connection is back.
//  - The simulator feeds the SAME queue with points walked along a road route,
//    so a demo exercises exactly the same path through the code as a real ride.
//  - A Screen Wake Lock keeps the screen on, because a web page can't track
//    reliably while the phone is locked.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bearing, distanceM, type LatLng, resample } from "./geo";

export type Fix = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null; at: number };
export type GpsState = "idle" | "asking" | "on" | "denied" | "unavailable" | "weak" | "simulating" | "arrived-sim";

const SEND_EVERY_MS = 3_000;
const MIN_MOVE_M = 8;
const KEEPALIVE_MS = 15_000;
const MAX_QUEUE = 300;
const WEAK_M = 250; // matches the server's MAX_ACCURACY_M
const SIM_TICK_MS = 2_000;
const SIM_SPEED_MPS = 8.3; // about 30 km/h

type Options = {
  deliveryId: string;
  /** True while the trip is under way (picked up or arrived). */
  active: boolean;
  /** Called when the server says the trip is no longer live (finished elsewhere). */
  onStopped?: () => void;
};

// Feature checks that are stable for the life of the page. On the server we
// assume "supported", so the first render matches and nothing flickers.
const noSubscribe = () => () => {};
const useSupported = (check: () => boolean) => useSyncExternalStore(noSubscribe, check, () => true);

export function useLocationSharing({ deliveryId, active, onStopped }: Options) {
  const storageKey = `woona-queue-${deliveryId}`;
  const geoSupported = useSupported(() => "geolocation" in navigator);
  const wakeSupported = useSupported(() => "wakeLock" in navigator);
  // What the GPS last told us (set only from its callbacks).
  const [gpsEvent, setGpsEvent] = useState<"on" | "weak" | "denied" | "unavailable" | null>(null);
  const [simDone, setSimDone] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [wakeHeld, setWakeHeld] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(8);
  const [plan, setPlan] = useState<LatLng[]>([]);

  const queue = useRef<Fix[]>([]);
  const lastQueued = useRef<Fix | null>(null);
  const sending = useRef(false);
  const backoffUntil = useRef(0);
  const simulated = useRef(false);
  const onStoppedRef = useRef(onStopped);
  useEffect(() => {
    onStoppedRef.current = onStopped;
  });

  const persist = useCallback(() => {
    setQueued(queue.current.length);
    try {
      if (queue.current.length) localStorage.setItem(storageKey, JSON.stringify(queue.current));
      else localStorage.removeItem(storageKey);
    } catch {
      // private mode or full storage: the in-memory queue still works
    }
  }, [storageKey]);

  // Restore points that were queued before a reload.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Fix[];
      if (Array.isArray(saved) && saved.length) {
        queue.current = saved.slice(-MAX_QUEUE);
        setQueued(queue.current.length);
      }
    } catch {
      // ignore a corrupt entry
    }
  }, [storageKey]);

  /** Add a fix to the queue if it's worth sending. */
  const take = useCallback((f: Fix) => {
    setFix(f);
    if (f.accuracy > WEAK_M) return; // the server would drop it anyway
    const prev = lastQueued.current;
    if (prev && distanceM(prev, f) < MIN_MOVE_M && f.at - prev.at < KEEPALIVE_MS) return;
    // Phones often report no heading; work it out from the movement instead.
    const heading = f.heading ?? (prev && distanceM(prev, f) > 5 ? bearing(prev, f) : null);
    const point = { ...f, heading };
    lastQueued.current = point;
    queue.current.push(point);
    if (queue.current.length > MAX_QUEUE) queue.current.splice(0, queue.current.length - MAX_QUEUE);
    persist();
  }, [persist]);

  /** Send up to 20 queued points. */
  const flush = useCallback(async () => {
    if (sending.current || queue.current.length === 0 || Date.now() < backoffUntil.current) return;
    sending.current = true;
    const batch = queue.current.slice(0, 20);
    try {
      const res = await fetch("/api/rider/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId,
          simulated: simulated.current,
          points: batch.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, heading: p.heading, speed: p.speed, at: p.at })),
        }),
      });
      if (res.ok) {
        queue.current.splice(0, batch.length);
        persist();
        setLastSentAt(Date.now());
        setSendError(null);
      } else if (res.status === 400 || res.status === 403) {
        // Rejected as invalid or not allowed: retrying won't help, so drop it.
        queue.current.splice(0, batch.length);
        persist();
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSendError(body.error ?? "Some points were rejected.");
      } else if (res.status === 429) {
        backoffUntil.current = Date.now() + 10_000;
      } else if (res.status === 409 || res.status === 404) {
        // The trip ended (delivered, failed) somewhere else. Stop sharing.
        queue.current = [];
        persist();
        onStoppedRef.current?.();
      } else {
        throw new Error(String(res.status));
      }
    } catch {
      setSendError("No connection. Your location is saved and will send when you're back online.");
      backoffUntil.current = Date.now() + 5_000;
    } finally {
      sending.current = false;
    }
  }, [deliveryId, persist]);

  // The send loop runs while the trip is active (and once more to empty the queue).
  useEffect(() => {
    if (!active && queue.current.length === 0) return;
    const t = setInterval(() => void flush(), SEND_EVERY_MS);
    const online = () => {
      backoffUntil.current = 0;
      void flush();
    };
    window.addEventListener("online", online);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [active, flush]);

  // Real GPS.
  useEffect(() => {
    if (!active || simulating || !geoSupported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
          speed: p.coords.speed != null && !Number.isNaN(p.coords.speed) ? p.coords.speed : null,
          at: p.timestamp || Date.now(),
        };
        setGpsEvent(f.accuracy > WEAK_M ? "weak" : "on");
        take(f);
      },
      (err) => setGpsEvent(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, simulating, geoSupported, take]);

  // Keep the screen awake during the trip.
  useEffect(() => {
    if (!active || !wakeSupported) return;
    type Sentinel = { release(): Promise<void>; addEventListener(t: "release", fn: () => void): void };
    const nav = navigator as Navigator & { wakeLock: { request(type: "screen"): Promise<Sentinel> } };
    let sentinel: Sentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock.request("screen");
        if (stopped) return void sentinel.release();
        setWakeHeld(true);
        sentinel.addEventListener("release", () => setWakeHeld(false));
      } catch {
        setWakeHeld(false);
      }
    };
    void acquire();
    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active, wakeSupported]);

  // ── The simulator ─────────────────────────────────────────────────────────
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSimulation = useCallback(() => {
    if (simTimer.current) clearInterval(simTimer.current);
    simTimer.current = null;
    setSimulating(false);
    setPlan([]);
  }, []);

  /**
   * Drive along the road route from wherever the rider is now. `from` is the
   * rider's last known position, so a reload carries on instead of restarting.
   */
  const startSimulation = useCallback(async (from: LatLng | null) => {
    setSendError(null);
    const res = await fetch(`/api/rider/trips/${deliveryId}/route`, { cache: "no-store" });
    const data = (await res.json()) as { path?: LatLng[]; error?: string };
    if (!res.ok || !data.path) {
      setSendError(data.error ?? "Couldn't load a route to simulate.");
      return;
    }
    const step = SIM_SPEED_MPS * (SIM_TICK_MS / 1000) * simSpeed;
    const pts = resample(data.path, step);
    // Start from the route point closest to where the rider is now.
    let i = 0;
    if (from) {
      let best = Infinity;
      pts.forEach((p, k) => {
        const d = distanceM(p, from);
        if (d < best) { best = d; i = k; }
      });
    }
    simulated.current = true;
    setSimulating(true);
    setSimDone(false);
    setPlan(pts.slice(i));
    lastQueued.current = null;
    const tick = () => {
      const here = pts[i];
      if (!here) {
        stopSimulation();
        setSimDone(true);
        return;
      }
      const next = pts[i + 1];
      take({
        lat: here.lat,
        lng: here.lng,
        accuracy: 6,
        heading: next ? bearing(here, next) : null,
        speed: Math.min(SIM_SPEED_MPS * simSpeed, 60),
        at: Date.now(),
      });
      setPlan(pts.slice(i));
      i++;
    };
    tick();
    simTimer.current = setInterval(tick, SIM_TICK_MS);
  }, [deliveryId, simSpeed, stopSimulation, take]);

  useEffect(() => () => {
    if (simTimer.current) clearInterval(simTimer.current);
  }, []);

  // One status for the screen, worked out from the facts above.
  const gps: GpsState = simulating
    ? "simulating"
    : simDone
      ? "arrived-sim"
      : !active
        ? "idle"
        : !geoSupported
          ? "unavailable"
          : (gpsEvent ?? "asking");
  const wakeLock: "on" | "unsupported" | "off" = !wakeSupported ? "unsupported" : wakeHeld ? "on" : "off";

  return {
    gps, fix, lastSentAt, queued, sendError, wakeLock,
    simulating, simSpeed, setSimSpeed, startSimulation, stopSimulation, plan,
    flushNow: flush,
  };
}
