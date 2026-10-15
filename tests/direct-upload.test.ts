import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stored: null as { head: Buffer; size: number } | null,
  deleted: [] as string[],
  created: [] as { storageKey: string; kind: string; size: number }[],
  existing: new Set<string>(),
}));

vi.mock("@/server/storage", async (orig) => {
  const real = await orig<typeof import("@/server/storage")>();
  return {
    ...real,
    putObject: vi.fn(),
    createSignedUpload: async (key: string) => `https://sb.example/storage/v1/object/upload/sign/b/${key}?token=t`,
    readObjectHead: async () => state.stored,
    deleteObject: async (key: string) => void state.deleted.push(key),
  };
});

vi.mock("@/lib/prisma", () => {
  const tx = {
    workOrderMedia: { create: async ({ data }: { data: { storageKey: string; kind: string; size: number } }) => (state.created.push(data), { id: "m1" }) },
    workOrderEvent: { create: async () => ({}) },
    workOrder: { update: async () => ({}) },
  };
  return {
    prisma: {
      workOrder: { findUnique: async () => ({ status: "IN_PROGRESS" }) },
      workOrderMedia: { findUnique: async ({ where }: { where: { storageKey: string } }) => (state.existing.has(where.storageKey) ? { id: "x" } : null) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

const { startDirectUpload, finishDirectUpload } = await import("@/server/media");
const actor = { id: "u1", name: "Karim", email: "k@g.tn", role: "MECHANIC" } as never;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(20)]);
const KEY = "work-orders/wo1/AbCdEfGhIjKlMnOp.mp4";

beforeEach(() => {
  state.stored = null;
  state.deleted = [];
  state.created = [];
  state.existing.clear();
});

describe("direct upload (big videos on Vercel)", () => {
  it("issues a key inside the work order folder", async () => {
    const r = await startDirectUpload("wo1", { size: 30 * 1024 * 1024, contentType: "video/mp4" });
    expect(r.storageKey).toMatch(/^work-orders\/wo1\/[A-Za-z0-9_-]{16}\.mp4$/);
    expect(r.uploadUrl).toContain(r.storageKey);
  });
  it("refuses unknown types and oversized files before any upload", async () => {
    await expect(startDirectUpload("wo1", { size: 1000, contentType: "application/zip" })).rejects.toMatchObject({ reason: "badType" });
    await expect(startDirectUpload("wo1", { size: 80 * 1024 * 1024, contentType: "video/mp4" })).rejects.toMatchObject({ reason: "tooLarge" });
  });
  it("records a real video after checking its bytes and size", async () => {
    state.stored = { head: MP4, size: 30 * 1024 * 1024 };
    await finishDirectUpload("wo1", { storageKey: KEY, visibleToCustomer: true }, actor);
    expect(state.created).toEqual([expect.objectContaining({ storageKey: KEY, kind: "VIDEO", size: 30 * 1024 * 1024 })]);
  });
  it("rejects keys of another work order or with path tricks", async () => {
    for (const key of ["work-orders/other/AbCdEfGhIjKlMnOp.mp4", "work-orders/wo1/../x/AbCdEfGhIjKlMnOp.mp4", "work-orders/wo1/AbCdEfGhIjKlMnOp.exe"]) {
      await expect(finishDirectUpload("wo1", { storageKey: key, visibleToCustomer: true }, actor)).rejects.toMatchObject({ code: "invalid" });
    }
  });
  it("deletes a file that is not really a photo/video", async () => {
    state.stored = { head: Buffer.from("MZ this is an exe file padding"), size: 1000 };
    await expect(finishDirectUpload("wo1", { storageKey: KEY, visibleToCustomer: true }, actor)).rejects.toMatchObject({ reason: "badType" });
    expect(state.deleted).toEqual([KEY]);
    expect(state.created).toEqual([]);
  });
  it("deletes a file bigger than allowed", async () => {
    state.stored = { head: MP4, size: 90 * 1024 * 1024 };
    await expect(finishDirectUpload("wo1", { storageKey: KEY, visibleToCustomer: true }, actor)).rejects.toMatchObject({ reason: "tooLarge" });
    expect(state.deleted).toEqual([KEY]);
  });
  it("cannot record the same file twice", async () => {
    state.existing.add(KEY);
    await expect(finishDirectUpload("wo1", { storageKey: KEY, visibleToCustomer: true }, actor)).rejects.toMatchObject({ code: "invalid" });
  });
});
