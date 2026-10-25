// The shape every form's Server Action returns, and one function that turns any
// error into it. Field errors are shown next to each field and in a summary.
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isServiceError, RuleError } from "./services/errors";

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** What the person typed, so the form can be refilled after an error. */
  values?: Record<string, string | string[]>;
};

export const idle: ActionState = { status: "idle" };

export function valuesOf(fd: FormData, arrays: string[] = []): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION") || key === "password") continue; // never echo passwords
    out[key] = arrays.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? "");
  }
  return out;
}

export function toActionError(e: unknown, values?: ActionState["values"]): ActionState {
  // redirect() and notFound() work by throwing; let those through untouched.
  unstable_rethrow(e);
  if (e instanceof z.ZodError) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
      values,
    };
  }
  if (e instanceof RuleError) {
    return { status: "error", message: e.message, fieldErrors: e.field ? { [e.field]: [e.message] } : undefined, values };
  }
  if (isServiceError(e)) return { status: "error", message: e.message, values };
  console.error(e);
  return { status: "error", message: "Something went wrong on our side. Please try again.", values };
}
