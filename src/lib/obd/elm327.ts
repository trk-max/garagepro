/**
 * OBD-II through an ELM327-compatible adapter (pure functions, no I/O).
 *
 * What exists on a given car depends on its year, its ECU and the adapter:
 * every reader below returns `null` / "unsupported" instead of guessing.
 * Mode 04 (clear trouble codes) is deliberately NOT implemented.
 *
 * References: SAE J1979 / ISO 15031-5 (modes 01, 03, 07, 09, 0A) and the
 * ELM327 data sheet (AT commands, "NO DATA", "SEARCHING...", CAN formatting).
 */

export type DtcKind = "stored" | "pending" | "permanent";
export type Dtc = { code: string; kind: DtcKind };
export type LiveValue = { pid: string; name: string; value: number; unit: string };

/** Answers that mean "no usable data" — never turned into values. */
const NO_DATA = /NO DATA|UNABLE TO CONNECT|CAN ERROR|BUS INIT|BUS ERROR|BUFFER FULL|STOPPED|ERROR|\?/i;

/** Raw adapter text → clean lines (echo, prompt, "SEARCHING..." removed). */
export function cleanLines(raw: string, sent?: string): string[] {
  return raw
    .replace(/>/g, "")
    .replace(/SEARCHING\.\.\./gi, "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && (!sent || l.replace(/\s/g, "").toUpperCase() !== sent.replace(/\s/g, "").toUpperCase()));
}

export function isNoData(raw: string): boolean {
  return NO_DATA.test(raw.replace(/SEARCHING\.\.\./gi, ""));
}

/**
 * Data bytes of a response, for single-frame AND multi-frame (ISO-TP, CAN) answers.
 * Multi-frame with ATCAF1 looks like:  "014" / "0: 49 02 01 57 56 57" / "1: 5A 5A 5A ..."
 * The first line (byte count) and the "n:" frame indexes are dropped.
 */
export function responseBytes(raw: string, sent?: string): number[] | null {
  if (isNoData(raw)) return null;
  const lines = cleanLines(raw, sent);
  const multi = lines.some((l) => /^[0-9A-F]:/i.test(l));
  const bytes: number[] = [];
  for (const line of lines) {
    if (multi && /^[0-9A-F]{3}$/i.test(line)) continue; // total length line
    const data = multi ? line.replace(/^[0-9A-F]:\s*/i, "") : line;
    const hex = data.replace(/\s+/g, "");
    if (!/^([0-9A-F]{2})+$/i.test(hex)) return null; // garbage → no data, never a guess
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes.length ? bytes : null;
}

const LETTERS = ["P", "C", "B", "U"];

/** Two bytes → "P0133" (SAE J2012 encoding). 00 00 = padding, not a code. */
export function decodeDtc(a: number, b: number): string | null {
  if (a === 0 && b === 0) return null;
  return `${LETTERS[a >> 6]}${(a >> 4) & 0x3}${(a & 0x0f).toString(16)}${(b >> 4).toString(16)}${(b & 0x0f).toString(16)}`.toUpperCase();
}

/**
 * Mode 03 / 07 / 0A answer → trouble codes. CAN adds a count byte after the
 * mode byte (43 02 01 33 02 34); older protocols do not (43 01 33 02 34 00 00).
 * Several ECUs may answer: each answer starts with the mode byte again.
 */
export function parseDtcResponse(raw: string, mode: "03" | "07" | "0A", isCan: boolean, kind: DtcKind): Dtc[] | null {
  const bytes = responseBytes(raw, mode);
  if (!bytes) return isNoData(raw) && /NO DATA/i.test(raw) ? [] : null; // "NO DATA" here = no code
  const header = parseInt(mode, 16) + 0x40;
  const codes = new Set<string>();
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] !== header) return null; // unexpected answer
    i++;
    let count = Infinity;
    if (isCan) count = bytes[i++] ?? 0;
    let taken = 0;
    while (i + 1 < bytes.length && taken < count && bytes[i] !== header) {
      const code = decodeDtc(bytes[i]!, bytes[i + 1]!);
      if (code) codes.add(code);
      i += 2;
      taken++;
    }
    if (!isCan) while (i < bytes.length && bytes[i] !== header) i++;
  }
  return [...codes].map((code) => ({ code, kind }));
}

/** Mode 01 PIDs read by GaragePro, with their SAE formula. Only read when the car says it supports them. */
export const PIDS: Record<string, { name: string; unit: string; bytes: number; decode: (d: number[]) => number }> = {
  "04": { name: "Charge moteur", unit: "%", bytes: 1, decode: ([a]) => Math.round((a! * 100) / 255) },
  "05": { name: "Température liquide de refroidissement", unit: "°C", bytes: 1, decode: ([a]) => a! - 40 },
  "0C": { name: "Régime moteur", unit: "tr/min", bytes: 2, decode: ([a, b]) => Math.round((a! * 256 + b!) / 4) },
  "0D": { name: "Vitesse", unit: "km/h", bytes: 1, decode: ([a]) => a! },
  "0F": { name: "Température air d'admission", unit: "°C", bytes: 1, decode: ([a]) => a! - 40 },
  "11": { name: "Position papillon", unit: "%", bytes: 1, decode: ([a]) => Math.round((a! * 100) / 255) },
  "21": { name: "Distance parcourue avec voyant moteur allumé", unit: "km", bytes: 2, decode: ([a, b]) => a! * 256 + b! },
  "2F": { name: "Niveau de carburant", unit: "%", bytes: 1, decode: ([a]) => Math.round((a! * 100) / 255) },
  "31": { name: "Distance depuis l'effacement des codes", unit: "km", bytes: 2, decode: ([a, b]) => a! * 256 + b! },
  "42": { name: "Tension calculateur", unit: "V", bytes: 2, decode: ([a, b]) => Math.round(((a! * 256 + b!) / 1000) * 100) / 100 },
  "5E": { name: "Débit de carburant", unit: "L/h", bytes: 2, decode: ([a, b]) => Math.round(((a! * 256 + b!) / 20) * 100) / 100 },
};

/** Plausible ranges: a value outside is reported as invalid, never displayed as a reading. */
const RANGE: Record<string, [number, number]> = { "05": [-40, 215], "0C": [0, 16384], "0D": [0, 255], "0F": [-40, 215], "42": [0, 65.5], "5E": [0, 3277] };

/** One Mode 01 answer ("41 0C 1A F8") → value, or null when absent / malformed / implausible. */
export function parsePid(raw: string, pid: string): LiveValue | null {
  const def = PIDS[pid];
  const bytes = responseBytes(raw, `01${pid}`);
  if (!def || !bytes) return null;
  const at = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === parseInt(pid, 16));
  if (at < 0 || bytes.length < at + 2 + def.bytes) return null;
  const value = def.decode(bytes.slice(at + 2, at + 2 + def.bytes));
  const r = RANGE[pid];
  if (!Number.isFinite(value) || (r && (value < r[0] || value > r[1]))) return null;
  return { pid, name: def.name, value, unit: def.unit };
}

/**
 * "Which PIDs are supported" answers (01 00, 01 20, 01 40 … 01 A0): 4 bytes = 32 flags each.
 * Returns the set of supported PIDs as two-digit hex strings.
 */
export function parseSupported(raw: string, base: number): Set<string> {
  const out = new Set<string>();
  const bytes = responseBytes(raw);
  if (!bytes) return out;
  const at = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === base);
  if (at < 0 || bytes.length < at + 6) return out;
  for (let byte = 0; byte < 4; byte++)
    for (let bit = 0; bit < 8; bit++) if (bytes[at + 2 + byte]! & (0x80 >> bit)) out.add((base + byte * 8 + bit + 1).toString(16).toUpperCase().padStart(2, "0"));
  return out;
}

/**
 * Odometer, PID A6 (OBD-II 2017+): 4 bytes, tenths of km. Many cars do NOT
 * provide it — then null, and GaragePro never estimates the mileage.
 */
export function parseOdometer(raw: string): number | null {
  const bytes = responseBytes(raw, "01A6");
  if (!bytes) return null;
  const at = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === 0xa6);
  if (at < 0 || bytes.length < at + 6) return null;
  const [a, b, c, d] = bytes.slice(at + 2, at + 6) as [number, number, number, number];
  const km = Math.floor((((a << 24) >>> 0) + (b << 16) + (c << 8) + d) / 10);
  return km >= 0 && km <= 2_000_000 ? km : null;
}

/** Mode 09 PID 02: VIN (17 characters, multi-frame). Null if absent or not a valid VIN. */
export function parseVin(raw: string): string | null {
  const bytes = responseBytes(raw, "0902");
  if (!bytes) return null;
  const at = bytes.findIndex((b, i) => b === 0x49 && bytes[i + 1] === 0x02);
  if (at < 0) return null;
  const text = String.fromCharCode(...bytes.slice(at + 3).filter((b) => b >= 0x20 && b < 0x7f)).replace(/[^A-HJ-NPR-Z0-9]/gi, "");
  const vin = text.slice(-17).toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

/** ATDPN answer ("A6" = automatic, protocol 6) → is it CAN (protocols 6–9)? */
export function isCanProtocol(dpn: string): boolean {
  const n = cleanLines(dpn).at(-1)?.replace(/^A/i, "") ?? "";
  return /^[6-9AB]$/i.test(n);
}
