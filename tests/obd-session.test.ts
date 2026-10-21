import { describe, expect, it } from "vitest";
import { ObdError, runDiagnostic, simulatedTransport, type ObdTransport } from "@/lib/obd/session";

function scripted(answers: Record<string, string>, sent: string[] = []): ObdTransport {
  return {
    label: "test",
    simulated: false,
    async send(cmd) {
      sent.push(cmd);
      return `${answers[cmd] ?? (cmd.startsWith("AT") ? "OK" : "NO DATA")}\r>`;
    },
    async close() {},
  };
}

const CAR = {
  ATZ: "ELM327 v2.1",
  "0100": "41 00 98 18 00 13", // supports 01, 04, 05, 0C, 0D, 1C, 1F, 20
  "0120": "41 20 00 00 00 01", // → supports 40
  "0140": "41 40 00 00 00 00",
  ATDP: "AUTO, ISO 15765-4 (CAN 11/500)",
  ATDPN: "A6",
  "0104": "41 04 3F",
  "0105": "41 05 7B",
  "010C": "41 0C 1A F8",
  "010D": "41 0D ZZ", // unreadable
  "03": "43 02 01 33 03 00",
  "07": "NO DATA",
  "0A": "NO DATA",
  "0902": "014\r0: 49 02 01 57 56 57\r1: 5A 5A 5A 31 4A 5A 33\r2: 57 33 38 36 37 35 32",
};

describe("session de diagnostic OBD", () => {
  it("reads what the car supports, lists what it does not, keeps unreadable answers out", async () => {
    const sent: string[] = [];
    const r = await runDiagnostic(scripted(CAR, sent));
    expect(r.simulated).toBe(false);
    expect(r.adapter).toBe("ELM327 v2.1");
    expect(r.vin).toBe("WVWZZZ1JZ3W386752");
    expect(r.dtcs).toEqual([
      { code: "P0133", kind: "stored" },
      { code: "P0300", kind: "stored" },
    ]);
    expect(r.live.map((v) => [v.pid, v.value])).toEqual([
      ["04", 25],
      ["05", 83],
      ["0C", 1726],
    ]);
    expect(r.warnings.some((w) => w.startsWith("010D"))).toBe(true); // garbage → warning, not a value
    expect(r.odometerKm).toBeNull(); // A6 not supported → never estimated
    expect(r.unsupported.some((u) => u.startsWith("01A6"))).toBe(true);
    expect(sent).not.toContain("012F"); // unsupported PIDs are not even asked
    expect(sent).not.toContain("04"); // never clears the codes
  });

  it("ignition off / car not answering → clear error, nothing invented", async () => {
    await expect(runDiagnostic(scripted({ ATZ: "ELM327 v1.5", "0100": "UNABLE TO CONNECT" }))).rejects.toMatchObject({ reason: "noVehicle" });
  });

  it("something that is not an OBD adapter → refused", async () => {
    await expect(runDiagnostic(scripted({ ATZ: "hello" }))).rejects.toBeInstanceOf(ObdError);
  });

  it("the demonstration adapter is always marked simulated", async () => {
    const r = await runDiagnostic(simulatedTransport());
    expect(r.simulated).toBe(true);
    expect(r.adapter).toMatch(/SIMULATEUR/);
    expect(r.dtcs.map((d) => d.code)).toEqual(["P0171"]);
    expect(r.vin).toBeNull();
  });
});
