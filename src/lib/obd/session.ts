import { PIDS, cleanLines, isCanProtocol, isNoData, parseDtcResponse, parseOdometer, parsePid, parseSupported, parseVin, type Dtc, type LiveValue } from "@/lib/obd/elm327";

/**
 * One diagnostic run on any transport (real adapter in the browser, or the
 * clearly marked simulator). Read-only: modes 01, 03, 07, 09, 0A. Mode 04
 * (clear codes) is never sent.
 */
export interface ObdTransport {
  /** Sends one command (without "\r"), resolves with the raw answer up to the ">" prompt. */
  send(command: string, timeoutMs?: number): Promise<string>;
  readonly label: string;
  readonly simulated: boolean;
  close(): Promise<void>;
}

export type DiagnosticResult = {
  simulated: boolean;
  adapter: string;
  protocol: string | null;
  vin: string | null;
  odometerKm: number | null;
  dtcs: Dtc[];
  live: LiveValue[];
  /** What the car did not provide (shown as such, never estimated). */
  unsupported: string[];
  /** Answers that could not be read (kept out of the results). */
  warnings: string[];
  readAt: string;
};

export class ObdError extends Error {
  constructor(public readonly reason: "noVehicle" | "noAdapter" | "timeout" | "notSupported", detail?: string) {
    super(detail ?? reason);
  }
}

const FORBIDDEN = /^\s*04\s*$/; // clear trouble codes

async function ask(t: ObdTransport, cmd: string, timeoutMs = 4000) {
  if (FORBIDDEN.test(cmd)) throw new Error("Mode 04 (effacement des codes) interdit");
  return t.send(cmd, timeoutMs);
}

export async function runDiagnostic(t: ObdTransport, onStep?: (step: string) => void): Promise<DiagnosticResult> {
  const warnings: string[] = [];
  const unsupported: string[] = [];
  onStep?.("init");
  const reset = await ask(t, "ATZ", 5000);
  if (!/ELM|OBD|STN|v\d/i.test(reset)) throw new ObdError("noAdapter", cleanLines(reset).join(" "));
  const version = cleanLines(reset, "ATZ").find((l) => /ELM|STN|OBD/i.test(l)) ?? "ELM327";
  for (const cmd of ["ATE0", "ATL0", "ATS1", "ATH0", "ATSP0"]) await ask(t, cmd);

  onStep?.("connect");
  const first = await ask(t, "0100", 12_000); // protocol search can take several seconds
  if (isNoData(first)) throw new ObdError("noVehicle", cleanLines(first).join(" "));
  const protocol = cleanLines(await ask(t, "ATDP")).at(-1) ?? null;
  const isCan = isCanProtocol(await ask(t, "ATDPN"));

  const supported = parseSupported(first, 0x00);
  for (const base of [0x20, 0x40, 0x60, 0x80, 0xa0]) {
    const flag = base.toString(16).toUpperCase().padStart(2, "0");
    if (!supported.has(flag)) break;
    for (const p of parseSupported(await ask(t, `01${flag}`), base)) supported.add(p);
  }

  onStep?.("live");
  const live: LiveValue[] = [];
  for (const pid of Object.keys(PIDS)) {
    if (!supported.has(pid)) {
      unsupported.push(`01${pid} ${PIDS[pid]!.name}`);
      continue;
    }
    const value = parsePid(await ask(t, `01${pid}`), pid);
    if (value) live.push(value);
    else warnings.push(`01${pid} ${PIDS[pid]!.name} : réponse illisible`);
  }

  let odometerKm: number | null = null;
  if (supported.has("A6")) {
    odometerKm = parseOdometer(await ask(t, "01A6"));
    if (odometerKm === null) warnings.push("01A6 kilométrage : réponse illisible");
  } else unsupported.push("01A6 Kilométrage (non fourni par ce véhicule)");

  onStep?.("dtc");
  const dtcs: Dtc[] = [];
  for (const [mode, kind] of [["03", "stored"], ["07", "pending"], ["0A", "permanent"]] as const) {
    const found = parseDtcResponse(await ask(t, mode, 6000), mode, isCan, kind);
    if (found === null) warnings.push(`Mode ${mode} : réponse illisible`);
    else dtcs.push(...found);
  }

  onStep?.("vin");
  const vinRaw = await ask(t, "0902", 6000);
  const vin = parseVin(vinRaw);
  if (!vin) unsupported.push("0902 VIN (non fourni)");

  return { simulated: t.simulated, adapter: version, protocol, vin, odometerKm, dtcs, live, unsupported, warnings, readAt: new Date().toISOString() };
}

/**
 * Demonstration adapter. Everything it returns is FAKE and is stored and shown
 * as "simulé": it never updates a mileage, never triggers a reminder.
 */
export function simulatedTransport(): ObdTransport {
  const answers: Record<string, string> = {
    ATZ: "ELM327 v1.5 (SIMULATEUR)",
    "0100": "41 00 BE 1F A8 13",
    "0120": "41 20 80 00 00 01",
    "0140": "41 40 44 00 00 00",
    ATDP: "AUTO, ISO 15765-4 (CAN 11/500) — SIMULÉ",
    ATDPN: "A6",
    "0104": "41 04 3F",
    "0105": "41 05 7B",
    "010C": "41 0C 0B B8",
    "010D": "41 0D 00",
    "010F": "41 0F 44",
    "0111": "41 11 26",
    "0121": "41 21 00 00",
    "012F": "NO DATA",
    "0131": "41 31 02 1C",
    "0142": "41 42 35 0C",
    "03": "43 01 01 71",
    "07": "47 00",
    "0A": "NO DATA",
    "0902": "NO DATA",
  };
  return {
    label: "Simulateur (démonstration)",
    simulated: true,
    async send(cmd) {
      await new Promise((r) => setTimeout(r, 30));
      return `${answers[cmd.toUpperCase()] ?? (cmd.startsWith("AT") ? "OK" : "NO DATA")}\r\r>`;
    },
    async close() {},
  };
}
