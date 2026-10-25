"use client";
import { findParcel } from "@/app/actions/auth";
import { Field, Form } from "./form";

export function TrackForm({ compact = false }: { compact?: boolean }) {
  return (
    <Form action={findParcel} submitLabel="Track parcel" pendingLabel="Finding…" submitClassName={`btn btn-primary ${compact ? "" : "w-full sm:w-auto"}`}>
      <Field
        name="code"
        label="Tracking code"
        hint="It's in the SMS or WhatsApp message from the business, like K7QM-4P2X."
        autoComplete="off"
        placeholder="K7QM-4P2X"
        maxLength={14}
      />
    </Form>
  );
}
