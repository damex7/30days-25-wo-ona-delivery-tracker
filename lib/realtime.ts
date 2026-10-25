// Publishing real-time events with Pusher Channels.
//
// Why a service at all? A Vercel function lives for one request and then
// stops, so it can't hold a WebSocket open to every customer's browser. Pusher
// holds those connections for us: our function makes one quick HTTPS call
// ("send this to channel X") and Pusher pushes it to everyone listening.
//
// Without the four PUSHER variables nothing breaks: publish() does nothing and
// the pages fall back to asking the server every few seconds (polling).
import Pusher from "pusher";

let client: Pusher | null | undefined;

function pusher(): Pusher | null {
  if (client === undefined) {
    const appId = process.env.PUSHER_APP_ID;
    const secret = process.env.PUSHER_SECRET;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    client = appId && secret && key && cluster ? new Pusher({ appId, key, secret, cluster, useTLS: true }) : null;
  }
  return client;
}

export const realtimeEnabled = () => pusher() !== null;

/**
 * Send an event without making the person wait: inside a request, Next's
 * after() runs it once the response has gone out. A failure is logged, never
 * thrown; the polling fallback will catch the change a few seconds later.
 */
export async function publish(channel: string, event: string, data: unknown): Promise<void> {
  const p = pusher();
  if (!p) return;
  const job = () => p.trigger(channel, event, data).then(() => undefined).catch((e: unknown) => console.error("[realtime]", e));
  try {
    const { after } = await import("next/server");
    after(job);
  } catch {
    await job();
  }
}

/** Pusher's signature that lets one browser connection join one private channel. */
export function authorizeChannel(socketId: string, channel: string) {
  const p = pusher();
  if (!p) return null;
  return p.authorizeChannel(socketId, channel);
}
