"use server";
// Server Actions for the rider's phone. The services check that the rider is
// the one assigned (or in the right fleet) before anything changes.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { acceptJob, confirmDelivery, failDelivery, markArrived, releaseJob, startTrip } from "@/lib/services/deliveries";
import { setOnDuty } from "@/lib/services/fleet";
import { formToObject, otpSchema, reasonSchema, uuidSchema } from "@/lib/validation";

const id = (v: string) => uuidSchema.parse(v);

export async function acceptJobAction(deliveryId: string): Promise<ActionState> {
  try {
    await acceptJob(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function releaseJobAction(deliveryId: string): Promise<ActionState> {
  try {
    await releaseJob(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  redirect("/rider");
}

export async function startTripAction(deliveryId: string): Promise<ActionState> {
  try {
    await startTrip(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function arrivedAction(deliveryId: string): Promise<ActionState> {
  try {
    await markArrived(await currentActor(), id(deliveryId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function confirmAction(deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    const { otp } = otpSchema.parse(formToObject(fd));
    const photo = String(fd.get("photoUrl") ?? "").trim() || null;
    await confirmDelivery(await currentActor(), id(deliveryId), otp, photo);
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Delivered. Well done!" };
}

export async function riderFailAction(deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    const { reason } = reasonSchema.parse(formToObject(fd));
    await failDelivery(await currentActor(), id(deliveryId), reason);
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Reported. Bring the parcel back to the business." };
}

export async function dutyAction(onDuty: boolean): Promise<ActionState> {
  try {
    await setOnDuty(await currentActor(), onDuty);
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}
