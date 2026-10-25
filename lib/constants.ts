export const STATES = [
  "Abia", "Abuja (FCT)", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe",
  "Zamfara",
] as const;

export const VEHICLES = [
  { value: "motorbike", label: "Motorbike" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "tricycle", label: "Tricycle (keke)" },
  { value: "bicycle", label: "Bicycle" },
] as const;
export type Vehicle = (typeof VEHICLES)[number]["value"];
export const VEHICLE_VALUES = VEHICLES.map((v) => v.value) as [Vehicle, ...Vehicle[]];
export const vehicleLabel = (v: string) => VEHICLES.find((x) => x.value === v)?.label ?? v;

export const STATUSES = ["pending", "assigned", "picked_up", "arrived", "delivered", "failed", "cancelled"] as const;
export type DeliveryStatus = (typeof STATUSES)[number];

/** Statuses during which the rider's phone shares its location. */
export const LIVE_STATUSES: readonly DeliveryStatus[] = ["picked_up", "arrived"];
export const ACTIVE_STATUSES: readonly DeliveryStatus[] = ["pending", "assigned", "picked_up", "arrived"];
export const DONE_STATUSES: readonly DeliveryStatus[] = ["delivered", "failed", "cancelled"];

/** How each status reads to a customer (the tracking timeline). */
export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Waiting for a rider",
  assigned: "Rider assigned",
  picked_up: "On the way",
  arrived: "Rider has arrived",
  delivered: "Delivered",
  failed: "Couldn't be delivered",
  cancelled: "Cancelled",
};

/** The happy path shown as steps on the tracking page. */
export const TIMELINE: readonly DeliveryStatus[] = ["assigned", "picked_up", "arrived", "delivered"];

export const MAX_OTP_ATTEMPTS = 5;
export const PAGE_SIZE = 20;

/**
 * Quick-pick places, so a delivery can be created without typing an address
 * (and so the demo works even when the address search is unavailable).
 * Coordinates are approximate.
 */
export const LANDMARKS = [
  { city: "Lagos", name: "Ikeja City Mall, Alausa", lat: 6.6137, lng: 3.3581 },
  { city: "Lagos", name: "Computer Village, Ikeja", lat: 6.5966, lng: 3.3421 },
  { city: "Lagos", name: "Yaba Market (Tejuosho)", lat: 6.5085, lng: 3.3694 },
  { city: "Lagos", name: "University of Lagos, Akoka", lat: 6.5158, lng: 3.3896 },
  { city: "Lagos", name: "National Stadium, Surulere", lat: 6.4985, lng: 3.3653 },
  { city: "Lagos", name: "Balogun Market, Lagos Island", lat: 6.4566, lng: 3.3891 },
  { city: "Lagos", name: "Eko Hotel, Victoria Island", lat: 6.4268, lng: 3.4291 },
  { city: "Lagos", name: "Lekki Phase 1 Gate", lat: 6.4474, lng: 3.4721 },
  { city: "Lagos", name: "Ajah Roundabout", lat: 6.4677, lng: 3.5716 },
  { city: "Enugu", name: "Polo Park Mall, Enugu", lat: 6.4451, lng: 7.4985 },
  { city: "Enugu", name: "Ogbete Main Market, Enugu", lat: 6.4436, lng: 7.4901 },
  { city: "Enugu", name: "UNN Enugu Campus (UNEC)", lat: 6.4336, lng: 7.5141 },
  { city: "Enugu", name: "Independence Layout, Enugu", lat: 6.4302, lng: 7.5236 },
  { city: "Abuja", name: "Wuse Market, Abuja", lat: 9.0641, lng: 7.4746 },
  { city: "Abuja", name: "Jabi Lake Mall, Abuja", lat: 9.0705, lng: 7.4251 },
  { city: "Abuja", name: "Garki Area 11, Abuja", lat: 9.0420, lng: 7.4941 },
] as const;
