import type { Queryable } from "../db";

/** Append one line to a delivery's status history (always inside the same transaction as the change). */
export async function recordEvent(db: Queryable, deliveryId: string, status: string, note: string, actorId: string | null) {
  await db.query(
    "INSERT INTO delivery_events (delivery_id, status, note, actor_id) VALUES ($1, $2, $3, $4)",
    [deliveryId, status, note, actorId],
  );
}
