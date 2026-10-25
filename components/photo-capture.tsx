"use client";
// Proof-of-delivery photo. capture="environment" opens the back camera on a
// phone. Before uploading we shrink the photo in the browser (canvas → JPEG,
// at most 1200 px), turning a 4 MB camera photo into ~150 KB: faster on mobile
// data and cheaper to store.
import { useState } from "react";

async function shrink(file: File, max = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.72));
}

export function PhotoCapture({ tripId, onUploaded }: { tripId: string; onUploaded: (url: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    onUploaded(null);
    setError(null);
    setStatus("uploading");
    try {
      const small = await shrink(file);
      setPreview(URL.createObjectURL(small));
      const fd = new FormData();
      fd.append("photo", new File([small], "proof.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/rider/trips/${tripId}/photo`, { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      onUploaded(data.url);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    }
  }

  return (
    <div>
      <label htmlFor="proof-photo" className="label">Photo of the parcel at the door</label>
      <input
        id="proof-photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handle(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:font-semibold file:text-on-blue-soft"
        aria-describedby="proof-photo-status"
      />
      <p id="proof-photo-status" className="hint" aria-live="polite">
        {status === "uploading" && "Uploading…"}
        {status === "done" && "✓ Photo saved."}
        {status === "idle" && "Required. It's shown to the customer and the business."}
      </p>
      {error && <p role="alert" className="field-error">{error}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img src={preview} alt="The photo you just took" className="mt-2 max-h-40 rounded-lg object-cover" />}
    </div>
  );
}
