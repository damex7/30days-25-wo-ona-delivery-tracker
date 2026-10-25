"use client";
// Choosing a pickup or drop-off point: type an address, then pin it on the map
// in one of four ways: search the address, pick a landmark, use this phone's
// location, or tap the map. The form submits the address text plus the pin's
// latitude and longitude (hidden inputs), and the server validates all three.
import { useId, useState } from "react";
import { LANDMARKS } from "@/lib/constants";
import { useField } from "./form";
import DeliveryMap from "./map";

type Pin = { lat: number; lng: number };
type Hit = { label: string; lat: number; lng: number };

export function PlacePicker({ prefix, label, hint, defaultAddress = "", defaultPin = null, city, optional = false }: {
  prefix: "pickup" | "dropoff";
  label: string;
  hint?: string;
  defaultAddress?: string;
  defaultPin?: Pin | null;
  city?: string;
  optional?: boolean;
}) {
  const addr = useField(`${prefix}Address`, defaultAddress);
  const latF = useField(`${prefix}Lat`, defaultPin ? String(defaultPin.lat) : "");
  const lngF = useField(`${prefix}Lng`, defaultPin ? String(defaultPin.lng) : "");
  const startPin = latF.value && lngF.value ? { lat: Number(latF.value), lng: Number(lngF.value) } : null;

  const [address, setAddress] = useState(typeof addr.value === "string" ? addr.value : "");
  const [pin, setPin] = useState<Pin | null>(startPin && Number.isFinite(startPin.lat) ? startPin : null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState<"search" | "gps" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const listId = useId();
  const error = addr.error ?? latF.error ?? lngF.error;

  // Landmarks in the business's own city come first.
  const landmarks = [...LANDMARKS].sort((a, b) => Number(b.city === city) - Number(a.city === city));

  async function search() {
    if (address.trim().length < 3) {
      setNote("Type at least 3 characters of the address first.");
      return;
    }
    setBusy("search");
    setNote(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address.trim())}`);
      const data = (await res.json()) as { results?: Hit[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setHits(data.results ?? []);
      if (!data.results?.length) setNote("No matches. Try a nearby landmark or street, or tap the map.");
    } catch (e) {
      setHits(null);
      setNote(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(null);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setNote("This browser can't share its location.");
      return;
    }
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPin({ lat: p.coords.latitude, lng: p.coords.longitude });
        setNote(`Pinned your current location (accurate to about ${Math.round(p.coords.accuracy)} m).`);
        setBusy(null);
      },
      () => {
        setNote("Couldn't get your location. Check the browser's location permission, or tap the map.");
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <fieldset
      id={addr.id}
      tabIndex={-1}
      aria-describedby={[hint ? addr.hintId : "", error ? addr.errorId : ""].filter(Boolean).join(" ") || undefined}
      className="rounded-2xl border border-line p-4"
    >
      <legend className="label px-1">
        {label} {optional && <span className="font-normal text-ink-muted">(optional)</span>}
      </legend>
      <label htmlFor={`${addr.id}-text`} className="sr-only">{label}: address</label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${addr.id}-text`}
          name={`${prefix}Address`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Street, area or building"
          autoComplete="off"
          maxLength={200}
          aria-invalid={addr.error ? true : undefined}
          className="input min-w-0 flex-1 basis-56"
        />
        <button type="button" onClick={search} disabled={busy !== null} className="btn btn-secondary">
          {busy === "search" ? "Searching…" : "Find on map"}
        </button>
      </div>
      {hint && <p id={addr.hintId} className="hint">{hint}</p>}

      {hits && hits.length > 0 && (
        <ul id={listId} className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Search results">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lng}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-soft"
                onClick={() => {
                  setPin({ lat: h.lat, lng: h.lng });
                  setHits(null);
                  setNote("Pinned. Drag the map or tap to adjust.");
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={`${addr.id}-landmark`} className="sr-only">Or choose a landmark</label>
        <select
          id={`${addr.id}-landmark`}
          className="input min-h-10 w-auto max-w-full flex-1 text-sm"
          value=""
          onChange={(e) => {
            const l = landmarks[Number(e.target.value)];
            if (!l) return;
            setPin({ lat: l.lat, lng: l.lng });
            if (!address.trim()) setAddress(l.name);
            setNote(`Pinned ${l.name}.`);
          }}
        >
          <option value="">Or choose a landmark…</option>
          {landmarks.map((l, i) => (
            <option key={l.name} value={i}>{l.name}</option>
          ))}
        </select>
        <button type="button" onClick={useMyLocation} disabled={busy !== null} className="btn btn-ghost btn-sm">
          {busy === "gps" ? "Locating…" : "◎ Use my location"}
        </button>
      </div>

      <DeliveryMap
        label={`${label}: tap the map to place the pin`}
        picked={pin}
        onPick={(p) => {
          setPin(p);
          setNote("Pinned where you tapped.");
        }}
        className="mt-3 h-56 rounded-xl border border-line"
      />
      {/* Targets for the error summary's "jump to" links. */}
      <span id={latF.id} tabIndex={-1} />
      <span id={lngF.id} tabIndex={-1} />
      <input type="hidden" name={`${prefix}Lat`} value={pin ? pin.lat.toFixed(6) : ""} />
      <input type="hidden" name={`${prefix}Lng`} value={pin ? pin.lng.toFixed(6) : ""} />
      <p className="mt-2 text-sm" aria-live="polite">
        {pin ? (
          <span className="font-semibold text-ink"><span aria-hidden="true">📍 </span>Pin set ({pin.lat.toFixed(4)}, {pin.lng.toFixed(4)})</span>
        ) : (
          <span className="text-ink-muted">No pin yet: search, choose a landmark, or tap the map.</span>
        )}
        {note && <span className="block text-ink-muted">{note}</span>}
      </p>
      {error && (
        <p id={addr.errorId} className="field-error"><span aria-hidden="true">⚠</span> {error}</p>
      )}
    </fieldset>
  );
}
