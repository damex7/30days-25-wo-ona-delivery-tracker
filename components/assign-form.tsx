"use client";
import { useActionState } from "react";
import { idle, type ActionState } from "@/lib/action-state";
import { vehicleLabel } from "@/lib/constants";

type Rider = { id: string; name: string; vehicle: string; on_duty: boolean; busy: boolean };

export function AssignForm({ action, riders, current }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  riders: Rider[];
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="assign-rider" className="label">{current ? "Move to another rider" : "Assign a rider"}</label>
      <div className="flex flex-wrap gap-2">
        <select id="assign-rider" name="riderId" defaultValue="" className="input min-w-0 flex-1 basis-48">
          <option value="" disabled>Choose a rider…</option>
          {riders.filter((r) => r.id !== current).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {vehicleLabel(r.vehicle)}{r.busy ? " · on a trip" : r.on_duty ? "" : " · off duty"}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Assigning…" : "Assign"}</button>
      </div>
      {state.status === "error" && <p role="alert" className="field-error">{state.message}</p>}
      {state.status === "success" && <p role="status" className="text-sm font-semibold text-ok">✓ {state.message}</p>}
    </form>
  );
}
