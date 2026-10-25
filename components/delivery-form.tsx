"use client";
import { createDeliveryAction } from "@/app/actions/business";
import { vehicleLabel } from "@/lib/constants";
import { Field, Form, Select, TextArea } from "./form";
import { PlacePicker } from "./place-picker";

type Rider = { id: string; name: string; vehicle: string; on_duty: boolean; busy: boolean };

export function DeliveryForm({ riders, shop, city }: {
  riders: Rider[];
  shop: { address: string; lat: number; lng: number } | null;
  city: string;
}) {
  return (
    <Form action={createDeliveryAction} submitLabel="Create delivery" pendingLabel="Creating…" submitClassName="btn btn-primary btn-xl w-full sm:w-auto">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Customer</legend>
        <Field name="customerName" label="Customer's name" autoComplete="off" />
        <Field name="customerPhone" label="Customer's phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" hint="For the WhatsApp link. Only you and the assigned rider see it." />
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <legend className="eyebrow mb-3">Parcel</legend>
        <Field name="package" label="What's in the parcel" placeholder="e.g. 2 pairs of shoes" maxLength={120} />
        <Field name="fee" label="Delivery fee" optional prefix="₦" inputMode="decimal" placeholder="2500" hint="Shown to you only." />
        <div className="sm:col-span-2">
          <TextArea name="notes" label="Notes for the rider" optional rows={2} maxLength={300} placeholder="e.g. Call when you reach the gate" />
        </div>
      </fieldset>

      <PlacePicker prefix="pickup" label="Pickup" city={city} defaultAddress={shop?.address} defaultPin={shop} hint="Your shop, pre-filled from Settings." />
      <PlacePicker prefix="dropoff" label="Drop-off" city={city} hint="Search the address, choose a landmark, or tap the map." />

      <Select
        name="riderId"
        label="Rider"
        optional
        placeholder="Post it on the job board (any rider can take it)"
        options={riders.map((r) => ({
          value: r.id,
          label: `${r.name} · ${vehicleLabel(r.vehicle)}${r.busy ? " · on a trip" : r.on_duty ? "" : " · off duty"}`,
        }))}
        hint="Leave it on the job board and the first free rider takes it, or choose someone now."
      />
    </Form>
  );
}
