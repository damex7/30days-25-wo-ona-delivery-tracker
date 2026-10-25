"use client";
// The map, used on the tracking page, the rider's trip screen, the business's
// live map and the pin picker.
//
// Leaflet is a plain JavaScript library that draws on a real DOM element and
// needs `window`, so it can't run on the server. We load it inside useEffect
// (browser only) and drive it imperatively from React props: React decides
// WHAT to show, this component tells Leaflet HOW.
//
// Map tiles come from OpenStreetMap (free, no API key). CSS in globals.css
// turns them grey (and dark in dark mode), so the blue route and black rider
// stand out. For heavy real-world traffic, switch TILE_URL to a tile provider
// with its own key (MapTiler, Stadia Maps), as OpenStreetMap's servers are
// meant for light use.
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";

export type MapRider = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
  stale?: boolean;
  onClick?: () => void;
};

type Props = {
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  riders?: MapRider[];
  /** The road already driven: a solid blue line. */
  trail?: LatLng[];
  /** The road still to drive (simulator): a dashed line. */
  plan?: LatLng[];
  /** Keep this rider in view as they move. */
  followId?: string | null;
  /** Click on the map to choose a point (the pin picker). */
  onPick?: (p: LatLng) => void;
  picked?: LatLng | null;
  label: string;
  className?: string;
};

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Marker shapes, drawn with HTML and CSS (styles in globals.css).
const PIN_SVG = `<svg class="wo-pin" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 2 23.5 2 14a13 13 0 0 1 26 0c0 9.5-13 25-13 25z" fill="var(--black)" stroke="var(--surface)" stroke-width="2.5"/><circle cx="15" cy="14" r="5" fill="var(--surface)"/></svg>`;

export default function DeliveryMap({ pickup, dropoff, riders = [], trail = [], plan = [], followId, onPick, picked, label, className = "" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{
    pickup?: Leaflet.Marker; dropoff?: Leaflet.Marker; picked?: Leaflet.Marker;
    trail?: Leaflet.Polyline; plan?: Leaflet.Polyline;
    riders: Map<string, { marker: Leaflet.Marker; from: LatLng; to: LatLng; anim?: number }>;
  }>({ riders: new Map() });
  const fitted = useRef(false);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      L.current = lib;
      const m = lib.map(box.current, { zoomControl: true, attributionControl: true, center: [6.5244, 3.3792], zoom: 12 });
      lib.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      // If the person drags the map themselves, stop snapping back to the rider.
      m.on("dragstart", () => setFollow(false));
      map.current = m;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      for (const r of layers.current.riders.values()) if (r.anim) cancelAnimationFrame(r.anim);
      // Stop any pan/zoom animation first: removing a map mid-animation makes
      // Leaflet's next animation frame read a position that no longer exists.
      map.current?.stop();
      map.current?.off();
      map.current?.remove();
      map.current = null;
      layers.current = { riders: new Map() };
    };
  }, []);

  // Pickup, drop-off and the picked point.
  useEffect(() => {
    const lib = L.current, m = map.current;
    if (!ready || !lib || !m) return;
    const l = layers.current;
    const place = (key: "pickup" | "dropoff" | "picked", p: LatLng | null | undefined, icon: Leaflet.DivIcon, tip: string) => {
      if (!p) { l[key]?.remove(); l[key] = undefined; return; }
      if (l[key]) l[key]!.setLatLng([p.lat, p.lng]);
      else l[key] = lib.marker([p.lat, p.lng], { icon, keyboard: false, title: tip }).addTo(m).bindTooltip(tip, { className: "wo-tip", direction: "top", offset: [0, -14] });
    };
    place("pickup", pickup, lib.divIcon({ className: "", html: '<div class="wo-pickup">P</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), "Pickup");
    place("dropoff", dropoff, lib.divIcon({ className: "", html: PIN_SVG, iconSize: [30, 40], iconAnchor: [15, 39] }), "Drop-off");
    place("picked", picked, lib.divIcon({ className: "", html: PIN_SVG, iconSize: [30, 40], iconAnchor: [15, 39] }), "Chosen point");
  }, [ready, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, picked?.lat, picked?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // The trail (driven) and the plan (still to drive).
  useEffect(() => {
    const lib = L.current, m = map.current;
    if (!ready || !lib || !m) return;
    const l = layers.current;
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#1446C8";
    const pts = trail.map((p) => [p.lat, p.lng] as [number, number]);
    if (l.trail) l.trail.setLatLngs(pts);
    else l.trail = lib.polyline(pts, { color: brand, weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(m);
    const planPts = plan.map((p) => [p.lat, p.lng] as [number, number]);
    if (l.plan) l.plan.setLatLngs(planPts);
    else l.plan = lib.polyline(planPts, { color: brand, weight: 3, opacity: 0.55, dashArray: "2 9", lineCap: "round" }).addTo(m);
  }, [ready, trail, plan]);

  // Rider markers, gliding smoothly to each new position instead of jumping.
  useEffect(() => {
    const lib = L.current, m = map.current;
    if (!ready || !lib || !m) return;
    const live = layers.current.riders;
    const seen = new Set<string>();
    for (const r of riders) {
      seen.add(r.id);
      const html = `<div class="wo-rider${r.stale ? " stale" : ""}"><span class="pulse"></span>${
        r.heading != null ? `<span class="heading" style="transform: rotate(${Math.round(r.heading)}deg)"></span>` : ""
      }<span class="dot"></span></div>`;
      const icon = lib.divIcon({ className: "", html, iconSize: [22, 22], iconAnchor: [11, 11] });
      const existing = live.get(r.id);
      if (!existing) {
        const marker = lib.marker([r.lat, r.lng], { icon, title: r.label ?? "Rider", zIndexOffset: 1000, keyboard: Boolean(r.onClick) }).addTo(m);
        if (r.label) marker.bindTooltip(r.label, { className: "wo-tip", direction: "top", offset: [0, -14], permanent: riders.length > 1 });
        if (r.onClick) marker.on("click", r.onClick);
        live.set(r.id, { marker, from: r, to: r });
        continue;
      }
      existing.marker.setIcon(icon);
      if (existing.to.lat === r.lat && existing.to.lng === r.lng) continue;
      // Animate from wherever the marker is now to the new point over ~0.9 s.
      if (existing.anim) cancelAnimationFrame(existing.anim);
      const start = existing.marker.getLatLng();
      const from = { lat: start.lat, lng: start.lng };
      existing.from = from;
      existing.to = { lat: r.lat, lng: r.lng };
      const t0 = performance.now();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = (now: number) => {
        const t = reduce ? 1 : Math.min(1, (now - t0) / 900);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
        existing.marker.setLatLng([from.lat + (r.lat - from.lat) * e, from.lng + (r.lng - from.lng) * e]);
        if (t < 1) existing.anim = requestAnimationFrame(step);
      };
      existing.anim = requestAnimationFrame(step);
    }
    for (const [id, r] of live) {
      if (!seen.has(id)) {
        r.marker.remove();
        live.delete(id);
      }
    }
  }, [ready, riders]);

  // Frame everything once, then keep the followed rider in view.
  useEffect(() => {
    const lib = L.current, m = map.current;
    if (!ready || !lib || !m) return;
    const pts: [number, number][] = [];
    if (pickup) pts.push([pickup.lat, pickup.lng]);
    if (dropoff) pts.push([dropoff.lat, dropoff.lng]);
    if (picked) pts.push([picked.lat, picked.lng]);
    for (const r of riders) pts.push([r.lat, r.lng]);
    if (!fitted.current && pts.length) {
      if (pts.length === 1) m.setView(pts[0]!, 15);
      else m.fitBounds(lib.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
      fitted.current = true;
      return;
    }
    const target = followId ? riders.find((r) => r.id === followId) : null;
    if (follow && target) {
      // Keep the rider AND where they're heading in view, but only re-frame
      // when the rider nears the edge, so the map isn't constantly jerking.
      const inner = m.getBounds().pad(-0.2);
      const destinationHidden = dropoff && !m.getBounds().contains([dropoff.lat, dropoff.lng]);
      if (!inner.contains([target.lat, target.lng]) || destinationHidden) {
        if (dropoff) m.fitBounds(lib.latLngBounds([[target.lat, target.lng], [dropoff.lat, dropoff.lng]]), { padding: [50, 50], maxZoom: 16, animate: true });
        else m.panTo([target.lat, target.lng], { animate: true, duration: 0.8 });
      }
    }
  }, [ready, riders, followId, follow, pickup, dropoff, picked]);

  // When the picked point changes from outside (a landmark was chosen), centre on it.
  useEffect(() => {
    if (ready && picked && map.current && fitted.current) map.current.setView([picked.lat, picked.lng], Math.max(map.current.getZoom(), 15));
  }, [ready, picked?.lat, picked?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={box} className="absolute inset-0" role="region" aria-label={label} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 text-sm text-ink-muted" aria-hidden="true">
          Loading map…
        </div>
      )}
      {followId && !follow && (
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            const r = riders.find((x) => x.id === followId);
            if (r) map.current?.panTo([r.lat, r.lng]);
          }}
          className="btn btn-black btn-sm absolute right-3 bottom-8 z-[500] shadow-lg"
        >
          <span aria-hidden="true">⌖</span> Follow rider
        </button>
      )}
    </div>
  );
}
