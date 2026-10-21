import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script (no types)
import { backupName, createKeyFile, decryptFile, encryptFile, loadKey, selectForDeletion, sha256File } from "../scripts/backup/lib.mjs";

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gp-backup-unit-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("chiffrement des sauvegardes", () => {
  it("encrypt → decrypt gives back exactly the same bytes (2 MB, binary)", async () => {
    const key = randomBytes(32);
    const src = path.join(dir, "plain.bin");
    await writeFile(src, randomBytes(2 * 1024 * 1024));
    await encryptFile(src, path.join(dir, "enc.gpbk"), key);
    const enc = await readFile(path.join(dir, "enc.gpbk"));
    expect(enc.subarray(0, 5).toString()).toBe("GPBK1");
    expect(enc.includes((await readFile(src)).subarray(0, 64))).toBe(false); // not readable in clear
    await decryptFile(path.join(dir, "enc.gpbk"), path.join(dir, "back.bin"), key);
    expect(await sha256File(path.join(dir, "back.bin"))).toBe(await sha256File(src));
  });

  it("one changed byte, or the wrong key, is refused (nothing restored from a damaged file)", async () => {
    const key = randomBytes(32);
    const src = path.join(dir, "p2.bin");
    await writeFile(src, Buffer.from("GaragePro ".repeat(1000)));
    await encryptFile(src, path.join(dir, "e2.gpbk"), key);
    const bytes = await readFile(path.join(dir, "e2.gpbk"));
    bytes.writeUInt8(bytes.readUInt8(200) ^ 0x01, 200);
    await writeFile(path.join(dir, "e2-bad.gpbk"), bytes);
    await expect(decryptFile(path.join(dir, "e2-bad.gpbk"), path.join(dir, "x.bin"), key)).rejects.toThrow(/refusé/);
    await expect(decryptFile(path.join(dir, "e2.gpbk"), path.join(dir, "y.bin"), randomBytes(32))).rejects.toThrow(/refusé/);
  });

  it("key file: created once, never overwritten, validated on load", async () => {
    const file = path.join(dir, "k", "backup.key");
    await createKeyFile(file);
    expect((await loadKey(file)).length).toBe(32);
    await expect(createKeyFile(file)).rejects.toThrow(/existe déjà/);
    await writeFile(path.join(dir, "bad.key"), "1234");
    await expect(loadKey(path.join(dir, "bad.key"))).rejects.toThrow(/invalide/);
    await expect(loadKey(path.join(dir, "missing.key"))).rejects.toThrow(/introuvable/);
  });
});

describe("conservation des versions", () => {
  it("keeps the N newest, never touches other files, always keeps at least one", () => {
    const names = ["garagepro-20261001-230000.gpbk", "garagepro-20261003-230000.gpbk", "garagepro-20261002-230000.gpbk", "notes.txt", "garagepro-20261003-230000.gpbk.json", "status.json"];
    expect(selectForDeletion(names, 2)).toEqual(["garagepro-20261001-230000.gpbk"]);
    expect(selectForDeletion(names, 0)).toEqual(["garagepro-20261002-230000.gpbk", "garagepro-20261001-230000.gpbk"]);
  });
  it("file names are sortable UTC timestamps", () => {
    expect(backupName(new Date("2026-10-21T23:05:09Z"))).toBe("garagepro-20261021-230509.gpbk");
  });
});
