"use client";
import { saveSettingsAction } from "@/app/actions/business";
import { STATES } from "@/lib/constants";
import type { Business } from "@/lib/services/fleet";
import { formatNgPhone } from "@/lib/phone";
import { Field, Form, Select } from "./form";
import { PlacePicker } from "./place-picker";

export function SettingsForm({ b }: { b: Business }) {
  return (
    <Form action={saveSettingsAction} submitLabel="Save settings" pendingLabel="Saving…">
      <Field name="name" label="Business name" defaultValue={b.name} autoComplete="organization" />
      <Field name="phone" label="Business phone" type="tel" inputMode="tel" defaultValue={formatNgPhone(b.phone)} hint="Shown on tracking pages so customers can call or WhatsApp you." />
      <div className="grid gap-5 sm:grid-cols-2">
        <Select name="state" label="State" defaultValue={b.state} options={STATES.map((s) => ({ value: s, label: s }))} />
        <Field name="city" label="City or area" defaultValue={b.city} />
      </div>
      <PlacePicker
        prefix="pickup"
        label="Usual pickup point"
        optional
        city={b.city}
        defaultAddress={b.pickup_address ?? ""}
        defaultPin={b.pickup_lat !== null && b.pickup_lng !== null ? { lat: b.pickup_lat, lng: b.pickup_lng } : null}
        hint="Your shop or office. It's pre-filled on every new delivery."
      />
    </Form>
  );
}
