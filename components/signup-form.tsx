"use client";
// One sign-up form for both roles. Picking "rider" or "business" shows the
// fields that role needs; the server validates the matching set (a Zod
// discriminated union on "role").
import { useState } from "react";
import { signup } from "@/app/actions/auth";
import { STATES, VEHICLES } from "@/lib/constants";
import { Field, Form, RadioGroup, Select } from "./form";

export function SignupForm({ defaultRole, fleetCode }: { defaultRole?: "business" | "rider"; fleetCode?: string }) {
  const [role, setRole] = useState<string | undefined>(defaultRole);
  return (
    <Form action={signup} submitLabel="Create account" pendingLabel="Creating your account…" submitClassName="btn btn-primary w-full">
      <div onChange={(e) => setRole((e.target as HTMLInputElement).value)}>
        <RadioGroup
          name="role"
          legend="I am…"
          defaultValue={defaultRole}
          options={[
            { value: "business", label: "A business", description: "I send parcels and manage riders." },
            { value: "rider", label: "A rider", description: "I deliver for a business. I have its fleet code." },
          ]}
        />
      </div>
      <Field name="name" label="Your full name" autoComplete="name" />
      <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
      <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." />
      {role === "business" && (
        <fieldset className="space-y-5 border-t border-line pt-5">
          <legend className="eyebrow mb-3">Your business</legend>
          <Field name="businessName" label="Business name" autoComplete="organization" placeholder="e.g. Swift Errands" />
          <Field name="phone" label="Business phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" hint="Customers see this number to call you." />
          <div className="grid gap-5 sm:grid-cols-2">
            <Select name="state" label="State" placeholder="Choose…" options={STATES.map((s) => ({ value: s, label: s }))} />
            <Field name="city" label="City or area" autoComplete="address-level2" placeholder="e.g. Yaba" />
          </div>
        </fieldset>
      )}
      {role === "rider" && (
        <fieldset className="space-y-5 border-t border-line pt-5">
          <legend className="eyebrow mb-3">Riding</legend>
          <Field
            name="fleetCode"
            label="Fleet code"
            defaultValue={fleetCode}
            autoComplete="off"
            placeholder="e.g. SWFT24"
            maxLength={8}
            hint="6 letters and numbers. Your business finds it on its Riders page."
          />
          <Field name="phone" label="Your phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" hint="Your business sees this. Customers don't." />
          <div className="grid gap-5 sm:grid-cols-2">
            <Select name="vehicle" label="Vehicle" placeholder="Choose…" options={VEHICLES} />
            <Field name="plate" label="Plate number" optional autoComplete="off" placeholder="LND-482-KJ" maxLength={12} />
          </div>
        </fieldset>
      )}
    </Form>
  );
}
