"use client";
// Demo only: become another person in your demo world (the owner or a rider),
// so one visitor can play every part from one browser.
import { useActionState } from "react";
import { switchDemoPerson } from "@/app/actions/auth";
import { idle } from "@/lib/action-state";
import type { DemoMember } from "@/lib/services/demo";

export function DemoSwitcher({ members }: { members: DemoMember[] }) {
  const [state, action, pending] = useActionState(switchDemoPerson, idle);
  if (members.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor="demo-switch" className="font-semibold">Switch to</label>
      <select id="demo-switch" name="userId" className="min-h-9 rounded-lg border-0 bg-white px-2 py-1 text-sm font-semibold text-[#0B0B0C]">
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.role === "business" ? `${m.name} (business)` : `${m.name.replace(" (demo)", "")} (rider)`}
          </option>
        ))}
      </select>
      <button className="btn btn-sm bg-bar text-on-bar hover:bg-surface hover:text-ink" disabled={pending}>
        {pending ? "Switching…" : "Go"}
      </button>
      {state.status === "error" && <span role="alert" className="font-semibold">{state.message}</span>}
    </form>
  );
}
