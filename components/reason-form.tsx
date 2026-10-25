"use client";
// A small form with a required reason, for "Cancel delivery" and "Mark as failed".
// Tucked inside <details> so a destructive action takes two deliberate taps.
import { useActionState } from "react";
import { idle, type ActionState } from "@/lib/action-state";

export function ReasonForm({ action, summary, button, placeholder, tone = "danger" }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  summary: string;
  button: string;
  placeholder: string;
  tone?: "danger" | "black";
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <details className="group rounded-xl border border-line">
      <summary className="cursor-pointer list-none rounded-xl px-4 py-3 font-semibold text-danger hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mr-1 inline-block transition group-open:rotate-90">›</span> {summary}
      </summary>
      <form action={formAction} className="space-y-3 px-4 pb-4">
        <label className="label" htmlFor={`reason-${summary}`}>Reason</label>
        <input
          id={`reason-${summary}`}
          name="reason"
          required
          minLength={3}
          maxLength={300}
          placeholder={placeholder}
          defaultValue={typeof state.values?.reason === "string" ? state.values.reason : ""}
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={state.status === "error" ? `reason-${summary}-err` : undefined}
          className="input"
        />
        {state.status === "error" && (
          <p id={`reason-${summary}-err`} role="alert" className="field-error">{state.fieldErrors?.reason?.[0] ?? state.message}</p>
        )}
        <button className={tone === "danger" ? "btn btn-danger" : "btn btn-black"} disabled={pending}>
          {pending ? "Saving…" : button}
        </button>
      </form>
    </details>
  );
}
