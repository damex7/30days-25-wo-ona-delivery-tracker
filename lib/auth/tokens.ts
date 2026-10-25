import { createHash, randomBytes } from "node:crypto";

/** A random, URL-safe secret with 256 bits of entropy. */
export const newToken = () => randomBytes(32).toString("base64url");

/** We store only the hash, so a database leak doesn't leak working tokens. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
