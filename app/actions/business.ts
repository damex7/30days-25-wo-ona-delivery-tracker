"use server";
// Server Actions for the business dashboard. Each one: validate the input with
// Zod, call a service (which checks the business OWNS the delivery or rider),
// then refresh the page or redirect.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import {
  assignDelivery, cancelDelivery, createDelivery, failDelivery, resetOtp, unassignDelivery,
} from "@/lib/services/deliveries";
import { pauseRider, regenerateFleetCode, unpauseRider, updateBusiness } from "@/lib/services/fleet";
import { businessSettingsSchema, deliverySchema, formToObject, reasonSchema, uuidSchema } from "@/lib/validation";

// Ids arrive via .bind() from a Server Component, but a Server Action is a
// public endpoint: anyone can call it with any id. So ids are validated, and
// every service checks ownership itself.
const id = (v: string) => uuidSchema.parse(v);

export async function createDeliveryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  let created: { id: string };
  try {
    created = await createDelivery(await currentActor(), deliverySchema.parse(formToObject(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(`/business/deliveries/${created.id}?created=1`);
}

export async function assignAction(deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const riderId = String(fd.get("riderId") ?? "");
    if (!riderId) return { status: "error", message: "Choose a rider first." };
    await assignDelivery(await currentActor(), id(deliveryId), id(riderId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success", message: "Rider assigned. They can see it on their phone now." };
}

export async function unassignAction(deliveryId: string): Promise<ActionState> {
  try {
    await unassignDelivery(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function cancelAction(deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    const { reason } = reasonSchema.parse(formToObject(fd));
    await cancelDelivery(await currentActor(), id(deliveryId), reason);
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Delivery cancelled." };
}

export async function businessFailAction(deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    const { reason } = reasonSchema.parse(formToObject(fd));
    await failDelivery(await currentActor(), id(deliveryId), reason);
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Marked as failed. Location sharing has stopped." };
}

export async function resetOtpAction(deliveryId: string): Promise<ActionState> {
  try {
    await resetOtp(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    await updateBusiness(await currentActor(), businessSettingsSchema.parse(formToObject(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Saved." };
}

export async function newFleetCodeAction(): Promise<ActionState> {
  try {
    await regenerateFleetCode(await currentActor());
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function pauseRiderAction(riderId: string): Promise<ActionState> {
  try {
    await pauseRider(await currentActor(), id(riderId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function unpauseRiderAction(riderId: string): Promise<ActionState> {
  try {
    await unpauseRider(await currentActor(), id(riderId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}
