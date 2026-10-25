"use server";
// Thin Server Actions: parse with Zod, call a service, set the cookie, redirect.
import { redirect } from "next/navigation";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp, currentActor, endSession, homeFor, startSession } from "@/lib/auth/session";
import { checkLogin, registerUser } from "@/lib/services/accounts";
import { checkDemoSwitch, startDemo } from "@/lib/services/demo";
import { parseTrackingCode } from "@/lib/tracking-code";
import { formToObject, loginSchema, signupSchema } from "@/lib/validation";

/** Only allow redirects to our own pages (never to another site). */
function safeNext(v: FormDataEntryValue | null, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export async function signup(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  let home: string;
  try {
    if (!(await rateLimit(`signup:${await clientIp()}`, 10, 3600)))
      return { status: "error", message: "Too many sign-ups from this network. Try again in an hour.", values };
    const input = signupSchema.parse(formToObject(fd));
    const user = await registerUser(input);
    await startSession(user.id);
    home = user.role === "business" ? "/business/settings?welcome=1" : "/rider?welcome=1";
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(home);
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  let target: string;
  try {
    const input = loginSchema.parse(formToObject(fd));
    // Limit by email AND by network: slows down password guessing on one
    // account and spraying many accounts from one place.
    const okEmail = await rateLimit(`login:${input.email}`, 8, 900);
    const okIp = await rateLimit(`login-ip:${await clientIp()}`, 40, 900);
    if (!okEmail || !okIp) return { status: "error", message: "Too many attempts. Wait 15 minutes and try again.", values };
    const user = await checkLogin(input.email, input.password);
    await startSession(user.id);
    target = safeNext(fd.get("next"), homeFor(user.role));
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(target);
}

export async function logout(): Promise<ActionState> {
  await endSession();
  redirect("/");
}

export async function tryDemo(): Promise<ActionState> {
  try {
    if (!(await rateLimit(`demo:${await clientIp()}`, 10, 3600)))
      return { status: "error", message: "Too many demos from this network. Try again later." };
    const userId = await startDemo();
    await endSession();
    await startSession(userId);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/business?demo=1");
}

/** Demo only: continue as another person in the same demo world (owner ⇄ riders). */
export async function switchDemoPerson(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: { id: string; role: "business" | "rider" };
  try {
    target = await checkDemoSwitch(await currentActor(), String(fd.get("userId") ?? ""));
    await endSession();
    await startSession(target.id);
  } catch (e) {
    return toActionError(e);
  }
  redirect(homeFor(target.role));
}

/** The "Track a parcel" box: tidy up whatever was typed and go to its page. */
export async function findParcel(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = String(fd.get("code") ?? "");
  const code = parseTrackingCode(raw);
  if (!code) {
    return {
      status: "error",
      message: "That doesn't look like a tracking code.",
      fieldErrors: { code: ["Tracking codes have 8 letters and numbers, like K7QM-4P2X."] },
      values: { code: raw },
    };
  }
  redirect(`/track/${code}`);
}
