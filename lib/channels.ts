// Real-time channel names, shared by the server (which publishes) and the
// browser (which subscribes). Pusher has two kinds of channel:
//
//  - public channels: anyone who knows the name can listen. The customer's
//    tracking channel is public, named after the tracking code, which is
//    already the secret that opens the tracking page.
//  - private channels (names start with "private-"): before Pusher lets a
//    browser listen, it asks OUR server (/api/pusher/auth) whether this
//    logged-in person may. Business and rider channels are private.

export const trackChannel = (trackingCode: string) => `track-${trackingCode}`;
/** Live positions and status changes for one business's dashboard. */
export const businessChannel = (businessId: string) => `private-business-${businessId}`;
/** "A new job is available" for the riders of one fleet. No locations here. */
export const fleetChannel = (businessId: string) => `private-fleet-${businessId}`;

export type PointMessage = {
  deliveryId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  at: string; // ISO time the phone took the fix
};
