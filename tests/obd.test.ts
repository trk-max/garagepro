import { describe, expect, it } from "vitest";
import { decodeDtc, isCanProtocol, parseDtcResponse, parseOdometer, parsePid, parseSupported, parseVin, responseBytes } from "@/lib/obd/elm327";

describe("ELM327 : lecture des réponses", () => {
  it("removes echo, prompt and SEARCHING…; refuses garbage instead of guessing", () => {
    expect(responseBytes("010C\rSEARCHING...\r41 0C 1A F8 \r\r>", "010C")).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
    expect(responseBytes("41 0C ZZ\r>")).toBeNull();
    expect(responseBytes("NO DATA\r>")).toBeNull();
    expect(responseBytes("UNABLE TO CONNECT\r>")).toBeNull();
  });

  it("joins a multi-frame CAN answer (frame indexes and length line dropped)", () => {
    const raw = "014\r0: 49 02 01 57 56 57\r1: 5A 5A 5A 31 4A 5A 33\r2: 57 33 38 36 37 35 32\r>";
    expect(responseBytes(raw)).toHaveLength(20);
  });
});

describe("codes défauts", () => {
  it("SAE encoding of the first two bits → letter", () => {
    expect(decodeDtc(0x01, 0x33)).toBe("P0133");
    expect(decodeDtc(0x41, 0x23)).toBe("C0123");
    expect(decodeDtc(0x82, 0x00)).toBe("B0200");
    expect(decodeDtc(0xc1, 0x00)).toBe("U0100");
    expect(decodeDtc(0x00, 0x00)).toBeNull(); // padding, not a code
  });

  it("CAN: count byte, two codes; several ECUs answering; duplicates merged", () => {
    expect(parseDtcResponse("43 02 01 33 02 34\r>", "03", true, "stored")).toEqual([
      { code: "P0133", kind: "stored" },
      { code: "P0234", kind: "stored" },
    ]);
    expect(parseDtcResponse("43 01 03 00\r43 02 03 00 01 71\r>", "03", true, "stored")!.map((d) => d.code)).toEqual(["P0300", "P0171"]);
  });

  it("older protocols: no count byte, 00 00 padding ignored", () => {
    expect(parseDtcResponse("43 01 33 00 00 00 00\r>", "03", false, "stored")).toEqual([{ code: "P0133", kind: "stored" }]);
  });

  it("pending (07) and permanent (0A) codes keep their kind", () => {
    expect(parseDtcResponse("47 01 04 20\r>", "07", true, "pending")).toEqual([{ code: "P0420", kind: "pending" }]);
    expect(parseDtcResponse("4A 01 04 20\r>", "0A", true, "permanent")).toEqual([{ code: "P0420", kind: "permanent" }]);
  });

  it("NO DATA = no code; an unexpected answer = unknown (null), never an empty list", () => {
    expect(parseDtcResponse("NO DATA\r>", "03", true, "stored")).toEqual([]);
    expect(parseDtcResponse("41 0C 1A F8\r>", "03", true, "stored")).toBeNull();
    expect(parseDtcResponse("CAN ERROR\r>", "03", true, "stored")).toBeNull();
  });
});

describe("données moteur", () => {
  it("SAE formulas", () => {
    expect(parsePid("41 0C 1A F8\r>", "0C")).toMatchObject({ value: 1726, unit: "tr/min" });
    expect(parsePid("41 05 7B\r>", "05")).toMatchObject({ value: 83, unit: "°C" });
    expect(parsePid("41 0D 32\r>", "0D")).toMatchObject({ value: 50 });
    expect(parsePid("41 42 35 0C\r>", "42")).toMatchObject({ value: 13.58, unit: "V" });
  });
  it("missing, truncated or wrong answers give nothing", () => {
    expect(parsePid("NO DATA\r>", "0C")).toBeNull();
    expect(parsePid("41 0C 1A\r>", "0C")).toBeNull();
    expect(parsePid("41 05 7B\r>", "0C")).toBeNull();
  });
  it("supported PIDs bitmask", () => {
    const s = parseSupported("41 00 BE 1F A8 13\r>", 0x00);
    expect([...s].slice(0, 6)).toEqual(["01", "03", "04", "05", "06", "07"]);
    expect(s.has("0C")).toBe(true);
    expect(s.has("02")).toBe(false);
    expect(parseSupported("NO DATA\r>", 0x00).size).toBe(0);
  });
});

describe("kilométrage et VIN : seulement si la voiture les fournit", () => {
  it("odometer PID A6 = tenths of km; absent → null (never estimated)", () => {
    expect(parseOdometer("41 A6 00 1B 4F 30\r>")).toBe(178_974);
    expect(parseOdometer("NO DATA\r>")).toBeNull();
    expect(parseOdometer("41 A6 00 1B\r>")).toBeNull();
  });
  it("VIN from a multi-frame answer; invalid VIN → null", () => {
    const raw = "014\r0: 49 02 01 57 56 57\r1: 5A 5A 5A 31 4A 5A 33\r2: 57 33 38 36 37 35 32\r>";
    expect(parseVin(raw)).toBe("WVWZZZ1JZ3W386752");
    expect(parseVin("NO DATA\r>")).toBeNull();
    expect(parseVin("49 02 01 41 42 43\r>")).toBeNull();
  });
  it("protocol number → CAN or not", () => {
    expect(isCanProtocol("A6\r>")).toBe(true);
    expect(isCanProtocol("3\r>")).toBe(false);
  });
});
