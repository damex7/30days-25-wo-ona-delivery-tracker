// Sign-up and login rules. Session cookies are handled by the caller.
import { pgCode, q1, tx, type Queryable } from "../db";
import { hashPassword, verifyPassword } from "../auth/password";
import { newFleetCode } from "../codes";
import type { SignupInput } from "../validation";
import type { Role } from "./actor";
import { ConflictError, RuleError } from "./errors";

/**
 * Creates the user and their business or rider row in ONE transaction, so there
 * is never a "rider" account that isn't attached to a fleet.
 */
export async function registerUser(input: SignupInput): Promise<{ id: string; role: Role }> {
  const hash = await hashPassword(input.password);
  try {
    return await tx(async (db) => {
      const { rows } = await db.query<{ id: string; role: Role }>(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, role",
        [input.name, input.email, hash, input.role],
      );
      const user = rows[0]!;
      if (input.role === "business") {
        await insertBusiness(db, user.id, input);
      } else {
        // The fleet code is how a rider proves they work for this business.
        // Demo fleets and suspended businesses don't accept new riders.
        const biz = await db.query<{ user_id: string }>(
          `SELECT b.user_id FROM businesses b JOIN users u ON u.id = b.user_id
            WHERE b.fleet_code = $1 AND NOT u.is_demo AND u.suspended_at IS NULL`,
          [input.fleetCode],
        );
        if (!biz.rows[0]) throw new RuleError("No business uses that fleet code. Check it with your business.", "fleetCode");
        await db.query(
          "INSERT INTO riders (user_id, business_id, phone, vehicle, plate) VALUES ($1, $2, $3, $4, $5)",
          [user.id, biz.rows[0].user_id, input.phone, input.vehicle, input.plate],
        );
      }
      return user;
    });
  } catch (e) {
    // The UNIQUE constraint on email is the real guard against duplicate
    // accounts, even if two sign-ups with the same email arrive together.
    if (pgCode(e) === "23505" && String((e as { constraint?: string }).constraint).includes("email"))
      throw new RuleError("An account with this email already exists.", "email");
    throw e;
  }
}

/** Insert a business with a fresh fleet code, retrying in the rare case the code is taken. */
async function insertBusiness(
  db: Queryable,
  userId: string,
  b: { businessName: string; phone: string; state: string; city: string },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await db.query("SAVEPOINT fleet_code");
    try {
      await db.query(
        "INSERT INTO businesses (user_id, name, phone, state, city, fleet_code) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, b.businessName, b.phone, b.state, b.city, newFleetCode()],
      );
      await db.query("RELEASE SAVEPOINT fleet_code");
      return;
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT fleet_code");
      if (pgCode(e) !== "23505") throw e;
    }
  }
  throw new Error("Could not generate a unique fleet code.");
}

export async function checkLogin(email: string, password: string): Promise<{ id: string; role: Role }> {
  const user = await q1<{ id: string; role: Role; password_hash: string | null; suspended_at: Date | null }>(
    "SELECT id, role, password_hash, suspended_at FROM users WHERE email = $1",
    [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  // Same message for "no such email" and "wrong password", so the form can't be
  // used to find out who has an account.
  if (!user || !ok) throw new RuleError("That email and password don't match.");
  if (user.suspended_at) throw new ConflictError("This account has been paused. Contact your business or support.");
  return { id: user.id, role: user.role };
}
