// Random codes people read and type: tracking codes, fleet codes and OTPs.
// crypto.randomInt is a secure random source; Math.random() is predictable.
import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: they look alike on a phone screen and when read aloud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function code(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const newTrackingCode = () => code(8);
export const newFleetCode = () => code(6);
/** A 4-digit delivery code, 0000–9999, leading zeros kept. */
export const newOtp = () => String(randomInt(10_000)).padStart(4, "0");
