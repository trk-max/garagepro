import "server-only";
import { createId } from "@/lib/id";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, createSignedUpload, deleteObject, putObject, readObjectHead, sniffMedia } from "@/server/storage";
import type { MediaStage, Prisma, WorkOrderStatus } from "@prisma/client";
import { intakeSigned } from "@/server/signatures";

/**
 * V16 Lot 4 — when was the photo taken: the stage chosen in the uploader, else from the order's status (reception
 * before the work, delivery once ready, work otherwise). After the intake signature, a new photo is never an
 * INTAKE photo (it would not be in the signed document).
 */
export function defaultStage(status: WorkOrderStatus): MediaStage {
  if (status === "RECEIVED" || status === "DIAGNOSIS") return "INTAKE";
  if (status === "READY" || status === "DELIVERED" || status === "CLOSED") return "DELIVERY";
  return "WORK";
}

async function resolveStage(db: Pick<Prisma.TransactionClient, "signature">, workOrderId: string, status: WorkOrderStatus, wanted: MediaStage | null | undefined): Promise<MediaStage> {
  const stage = wanted ?? defaultStage(status);
  return stage === "INTAKE" && (await intakeSigned(db, workOrderId)) ? "WORK" : stage;
}

export class MediaError extends Error {
  constructor(
    public readonly reason: "tooLarge" | "badType",
    public readonly maxMb = 0,
  ) {
    super(reason);
  }
}

export async function addMedia(
  workOrderId: string,
  file: { bytes: Buffer; caption?: string; visibleToCustomer: boolean; stage?: MediaStage | null },
  actor: StaffUser,
) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (wo.status === "CANCELLED") throw new AppError("final", {}, 409);
  const stage = await resolveStage(prisma, workOrderId, wo.status, file.stage);

  const type = sniffMedia(file.bytes);
  if (!type) throw new MediaError("badType");
  const max = type.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (file.bytes.length > max) throw new MediaError("tooLarge", max / 1024 / 1024);

  const storageKey = `work-orders/${workOrderId}/${createId()}.${type.ext}`;
  await putObject(storageKey, file.bytes, type.contentType);
  return recordMedia(workOrderId, { storageKey, type, size: file.bytes.length, caption: file.caption, visibleToCustomer: file.visibleToCustomer, stage }, actor);
}

type Sniffed = NonNullable<ReturnType<typeof sniffMedia>>;

async function recordMedia(
  workOrderId: string,
  file: { storageKey: string; type: Sniffed; size: number; caption?: string; visibleToCustomer: boolean; stage: MediaStage },
  actor: StaffUser,
) {
  return prisma.$transaction(async (tx) => {
    const media = await tx.workOrderMedia.create({
      data: {
        workOrderId,
        kind: file.type.kind,
        storageKey: file.storageKey,
        contentType: file.type.contentType,
        size: file.size,
        caption: file.caption,
        visibleToCustomer: file.visibleToCustomer,
        uploadedById: actor.id,
        stage: file.stage,
      },
      select: { id: true },
    });
    await tx.workOrderEvent.create({
      data: { workOrderId, actorId: actor.id, type: "MEDIA_ADDED", data: { mediaId: media.id, stage: file.stage }, body: file.caption },
    });
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() } });
    return media;
  });
}

// ── Direct upload (big videos on Vercel): browser → Supabase, then we check & record ──

const EXT_BY_TYPE: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function assertEditable(workOrderId: string) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (wo.status === "CANCELLED") throw new AppError("final", {}, 409);
  return wo.status;
}

/** Step 1: reserve a storage key and return a one-time upload URL for it. */
export async function startDirectUpload(workOrderId: string, file: { size: number; contentType: string }) {
  await assertEditable(workOrderId);
  const ext = EXT_BY_TYPE[file.contentType.toLowerCase()];
  if (!ext) throw new MediaError("badType");
  const max = file.contentType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (file.size > max) throw new MediaError("tooLarge", max / 1024 / 1024);
  const storageKey = `work-orders/${workOrderId}/${createId()}.${ext}`;
  return { storageKey, uploadUrl: await createSignedUpload(storageKey) };
}

/** Step 2: the browser has uploaded — check the real bytes and size, then record it. */
export async function finishDirectUpload(
  workOrderId: string,
  file: { storageKey: string; caption?: string; visibleToCustomer: boolean; stage?: MediaStage | null },
  actor: StaffUser,
) {
  // Only keys we could have issued for this work order (no path tricks, no other order's files).
  const pattern = new RegExp(`^work-orders/${workOrderId.replace(/[^A-Za-z0-9_-]/g, "")}/[A-Za-z0-9_-]{16}\\.(mp4|mov|webm|jpg|png|webp)$`);
  if (!pattern.test(file.storageKey)) throw new AppError("invalid", {}, 422);
  const status = await assertEditable(workOrderId);
  if (await prisma.workOrderMedia.findUnique({ where: { storageKey: file.storageKey }, select: { id: true } })) throw new AppError("invalid", {}, 409);

  const stored = await readObjectHead(file.storageKey);
  if (!stored) throw new AppError("notFound", {}, 404);
  const type = sniffMedia(stored.head);
  const max = type?.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (!type || stored.size > max) {
    await deleteObject(file.storageKey); // never keep a file we refuse
    throw type ? new MediaError("tooLarge", max / 1024 / 1024) : new MediaError("badType");
  }
  const stage = await resolveStage(prisma, workOrderId, status, file.stage);
  return recordMedia(workOrderId, { storageKey: file.storageKey, type, size: stored.size, caption: file.caption, visibleToCustomer: file.visibleToCustomer, stage }, actor);
}

/** Shows / hides a photo on the customer portal (V16: journalised, same transaction). */
export async function setMediaVisibility(mediaId: string, visibleToCustomer: boolean, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.workOrderMedia.findUnique({ where: { id: mediaId }, select: { workOrderId: true, visibleToCustomer: true, caption: true } });
    if (!before) throw new AppError("notFound", {}, 404);
    await tx.workOrderMedia.update({ where: { id: mediaId }, data: { visibleToCustomer } });
    await tx.workOrder.update({ where: { id: before.workOrderId }, data: { updatedAt: new Date() } });
    await audit(tx, actor, "media.visibility", "WorkOrderMedia", mediaId, {
      before: { workOrderId: before.workOrderId, visibleToCustomer: before.visibleToCustomer },
      after: { visibleToCustomer },
    });
    return before.workOrderId;
  });
}

/** Deletes a photo / video. V16: journalised in the same transaction; the file goes only once the row is gone. */
export async function removeMedia(mediaId: string, actor: StaffUser) {
  const media = await prisma.$transaction(async (tx) => {
    // V16 Lot 4: a photo of the SIGNED intake is part of the proof — hidden at most, never deleted.
    const target = await tx.workOrderMedia.findUnique({ where: { id: mediaId }, select: { workOrderId: true, stage: true } });
    if (!target) throw new AppError("notFound", {}, 404);
    if (target.stage === "INTAKE" && (await intakeSigned(tx, target.workOrderId))) throw new AppError("intakePhotoLocked", {}, 409);
    const m = await tx.workOrderMedia.delete({ where: { id: mediaId }, select: { workOrderId: true, storageKey: true, kind: true, caption: true, visibleToCustomer: true, uploadedById: true, createdAt: true } });
    await tx.workOrder.update({ where: { id: m.workOrderId }, data: { updatedAt: new Date() } });
    await audit(tx, actor, "media.remove", "WorkOrderMedia", mediaId, { before: m });
    return m;
  });
  await deleteObject(media.storageKey);
  return media.workOrderId;
}
