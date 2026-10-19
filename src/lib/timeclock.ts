import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Garage time clock — pure helpers (no database).
 *
 * Proof of presence: the garage screen ("borne", /garage/pointage/borne) shows
 * a 6-digit code that changes every 30 seconds. An employee clocks in from
 * their own account by typing (or scanning) the code currently displayed, so
 * they must see the garage screen at that moment. A code is accepted for its
 * window and the previous one (≈ 30–60 s), and each person can use a given
 * window only once (unique index), so an old code or photo cannot be replayed.
 * Optional second factor: the request must come from the garage network
 * (garage hub server, or an allowed public IP on the online site).
 */

export const CODE_WINDOW_SECONDS = 30;
export type ClockMode = "CODE" | "NETWORK" | "CODE_AND_NETWORK";
export const CLOCK_MODES: ClockMode[] = ["CODE", "NETWORK", "CODE_AND_NETWORK"];

export const windowAt = (now: Date) => Math.floor(now.getTime() / 1000 / CODE_WINDOW_SECONDS);

export function kioskCode(secret: string, window: number): string {
  const mac = createHmac("sha256", secret).update(`garagepro-clock:${window}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** The window the code belongs to (current or previous), or null. Constant-time compare. */
export function verifyKioskCode(secret: string, code: string, now: Date): number | null {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return null;
  const w = windowAt(now);
  for (const candidate of [w, w - 1]) {
    const expected = Buffer.from(kioskCode(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(clean))) return candidate;
  }
  return null;
}

export function secondsLeft(now: Date): number {
  const s = now.getTime() / 1000;
  return Math.ceil(CODE_WINDOW_SECONDS - (s % CODE_WINDOW_SECONDS));
}

// ── Networks ─────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** "192.168.1.0/24, 41.226.10.5" → is `ip` inside one of them? (IPv4; "::ffff:" prefixes accepted). */
export function ipAllowed(ip: string, networks: string | null | undefined): boolean {
  const addr = ipv4ToInt(ip.trim().replace(/^::ffff:/i, ""));
  if (addr === null || !networks) return false;
  for (const raw of networks.split(/[\s,;]+/).filter(Boolean)) {
    const [base, bitsRaw] = raw.split("/");
    const net = ipv4ToInt(base ?? "");
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (net === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((addr & mask) === (net & mask)) return true;
  }
  return false;
}

/** Rejects malformed lists in the settings form. */
export function validNetworks(networks: string): boolean {
  return networks
    .split(/[\s,;]+/)
    .filter(Boolean)
    .every((raw) => {
      const [base, bits] = raw.split("/");
      return ipv4ToInt(base ?? "") !== null && (bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= 32));
    });
}

// ── Sequence of punches ──────────────────────────────────────────────────────

export type ClockKind = "IN" | "OUT" | "BREAK_START" | "BREAK_END";
export type ClockState = "OUT" | "IN" | "BREAK";

/** A punch left open for more than this is considered forgotten (new day starts OUT). */
export const FORGOTTEN_AFTER_HOURS = 16;

export function stateAfter(last: { kind: ClockKind; at: Date } | null, now: Date): ClockState {
  if (!last) return "OUT";
  if (now.getTime() - last.at.getTime() > FORGOTTEN_AFTER_HOURS * 3_600_000) return "OUT";
  if (last.kind === "IN" || last.kind === "BREAK_END") return "IN";
  if (last.kind === "BREAK_START") return "BREAK";
  return "OUT";
}

export const ALLOWED_NEXT: Record<ClockState, ClockKind[]> = {
  OUT: ["IN"],
  IN: ["BREAK_START", "OUT"],
  BREAK: ["BREAK_END", "OUT"],
};
