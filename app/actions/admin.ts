"use server";
import { refresh } from "next/cache";
import { toActionError, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { setBusinessSuspended } from "@/lib/services/admin";
import { uuidSchema } from "@/lib/validation";

export async function suspendBusinessAction(userId: string, suspend: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const note = String(fd.get("note") ?? "").trim().slice(0, 200);
    await setBusinessSuspended(await currentActor(), uuidSchema.parse(userId), suspend, note);
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}
