import { randomBytes } from "node:crypto";

/** Random, URL-safe id for file names (not guessable). */
export const createId = () => randomBytes(12).toString("base64url");

const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L

/** Short reference customers can read over the phone, e.g. "RDV-7KQ2MX". */
export function createReference(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[bytes[i]! % REF_ALPHABET.length];
  return `${prefix}-${out}`;
}
