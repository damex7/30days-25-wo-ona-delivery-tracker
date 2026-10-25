// Every form, route handler and URL parameter is parsed here with Zod.
// The browser's own checks are only a convenience: anyone can send a request by
// hand, so the server always validates again.
import { z } from "zod";
import { STATES, VEHICLE_VALUES } from "./constants";
import { distanceM } from "./geo";
import { parseNairaToKobo } from "./money";
import { normalizeNgPhone } from "./phone";

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} can be at most ${max} characters.`);

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

/** Any common way of typing a Nigerian mobile number, stored as +234XXXXXXXXXX. */
const ngPhone = (label = "Phone number") =>
  z.string().transform((v, ctx) => {
    const p = normalizeNgPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: `${label} must be a Nigerian mobile number, like 0803 123 4567.` });
      return z.NEVER;
    }
    return p;
  });

const lat = z.coerce.number({ error: "Choose a point on the map." }).min(-90).max(90);
const lng = z.coerce.number({ error: "Choose a point on the map." }).min(-180).max(180);

// ── Auth ─────────────────────────────────────────────────────────────────────
const account = {
  name: text(2, 80, "Your name"),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Use at most 128 characters."),
};

/** One sign-up form; the role decides which extra fields are required. */
export const signupSchema = z.discriminatedUnion(
  "role",
  [
    z.object({
      role: z.literal("business"),
      ...account,
      businessName: text(2, 80, "Business name"),
      phone: ngPhone("Business phone"),
      state: z.enum(STATES, { error: "Choose your state." }),
      city: text(2, 60, "City"),
    }),
    z.object({
      role: z.literal("rider"),
      ...account,
      phone: ngPhone(),
      vehicle: z.enum(VEHICLE_VALUES, { error: "Choose your vehicle." }),
      plate: z
        .string()
        .trim()
        .toUpperCase()
        .transform((v) => v.replace(/\s+/g, "-") || null)
        .pipe(z.string().regex(/^[A-Z0-9-]{5,12}$/, "Plate numbers look like LND-123-AB.").nullable()),
      fleetCode: z
        .string()
        .trim()
        .toUpperCase()
        .transform((v) => v.replace(/[\s-]/g, ""))
        .pipe(z.string().regex(/^[A-HJ-KM-NP-Z2-9]{6}$/, "Fleet codes are 6 letters and numbers. Ask your business for theirs.")),
    }),
  ],
  { error: "Choose whether you're a business or a rider." },
);
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

// ── Business settings ────────────────────────────────────────────────────────
export const businessSettingsSchema = z
  .object({
    name: text(2, 80, "Business name"),
    phone: ngPhone("Business phone"),
    state: z.enum(STATES, { error: "Choose your state." }),
    city: text(2, 60, "City"),
    pickupAddress: z.string().trim().max(200, "At most 200 characters."),
    pickupLat: z.string().trim(),
    pickupLng: z.string().trim(),
  })
  .transform((v, ctx) => {
    // The default pickup point is optional, but it's all or nothing.
    const hasPin = v.pickupLat !== "" && v.pickupLng !== "";
    if (!hasPin && !v.pickupAddress) return { ...v, pickupAddress: null, pickupLat: null, pickupLng: null };
    const la = lat.safeParse(v.pickupLat);
    const ln = lng.safeParse(v.pickupLng);
    if (!hasPin || !la.success || !ln.success) {
      ctx.addIssue({ code: "custom", path: ["pickupAddress"], message: "Set the pickup point on the map, or clear the address." });
      return z.NEVER;
    }
    if (v.pickupAddress.length < 3) {
      ctx.addIssue({ code: "custom", path: ["pickupAddress"], message: "Describe the pickup address." });
      return z.NEVER;
    }
    return { ...v, pickupLat: la.data, pickupLng: ln.data };
  });
export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;

// ── Deliveries ───────────────────────────────────────────────────────────────
export const deliverySchema = z
  .object({
    customerName: text(2, 80, "Customer name"),
    customerPhone: ngPhone("Customer phone"),
    package: text(2, 120, "Package"),
    notes: z.string().trim().max(300, "Notes can be at most 300 characters."),
    fee: z.string().transform((v, ctx) => {
      if (!v.trim()) return null;
      const kobo = parseNairaToKobo(v);
      if (kobo === null || kobo > 50_000_000) {
        ctx.addIssue({ code: "custom", message: "Enter the fee in naira, like 2500." });
        return z.NEVER;
      }
      return kobo;
    }),
    pickupAddress: text(3, 200, "Pickup address"),
    pickupLat: lat,
    pickupLng: lng,
    dropoffAddress: text(3, 200, "Drop-off address"),
    dropoffLat: lat,
    dropoffLng: lng,
    riderId: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.uuid("Choose a rider from the list.").nullable()),
  })
  .superRefine((v, ctx) => {
    const d = distanceM({ lat: v.pickupLat, lng: v.pickupLng }, { lat: v.dropoffLat, lng: v.dropoffLng });
    if (d < 50) ctx.addIssue({ code: "custom", path: ["dropoffAddress"], message: "The drop-off is the same place as the pickup." });
    // Wo Ọ̀nà is for deliveries within a city or between nearby towns.
    if (d > 200_000) ctx.addIssue({ code: "custom", path: ["dropoffAddress"], message: "That's over 200 km away. Wo Ọ̀nà is for city deliveries." });
  });
export type DeliveryInput = z.infer<typeof deliverySchema>;

export const reasonSchema = z.object({ reason: text(3, 300, "Reason") });
export const otpSchema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, "The code is 4 digits."),
});

// ── GPS points sent by the rider's phone ─────────────────────────────────────
export const MAX_POINTS_PER_BATCH = 20;
export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10_000),
  heading: z.number().min(0).max(360).nullable().optional().transform((v) => (v == null ? null : v % 360)),
  speed: z.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
  at: z.number().int().positive(), // milliseconds since 1970, from the phone's clock
});
export const locationBatchSchema = z.object({
  deliveryId: z.uuid(),
  points: z.array(pointSchema).min(1).max(MAX_POINTS_PER_BATCH, `At most ${MAX_POINTS_PER_BATCH} points at a time.`),
  simulated: z.boolean().optional().default(false),
});
export type LocationBatch = z.infer<typeof locationBatchSchema>;

export const uuidSchema = z.uuid();
export const geocodeSchema = z.object({ q: z.string().trim().min(3, "Type at least 3 characters.").max(120) });

// ── Lists (from the URL) ─────────────────────────────────────────────────────
// .catch() means a bad value in the URL falls back to the default instead of
// crashing the page: /business?view=banana just shows active deliveries.
export const deliveryListSchema = z.object({
  view: z.enum(["active", "pending", "done", "all"]).default("active").catch("active"),
  q: z.string().trim().max(60).optional().catch(undefined),
});
export type DeliveryList = z.infer<typeof deliveryListSchema>;

/** FormData → plain object. */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = String(fd.get(key) ?? "");
  }
  return out;
}
