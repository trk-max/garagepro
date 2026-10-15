import "server-only";
import { createId } from "@/lib/id";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, createSignedUpload, deleteObject, putObject, readObjectHead, sniffMedia } from "@/server/storage";

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
  file: { bytes: Buffer; caption?: string; visibleToCustomer: boolean },
  actor: StaffUser,
) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (wo.status === "CANCELLED") throw new AppError("final", {}, 409);

  const type = sniffMedia(file.bytes);
  if (!type) throw new MediaError("badType");
  const max = type.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (file.bytes.length > max) throw new MediaError("tooLarge", max / 1024 / 1024);

  const storageKey = `work-orders/${workOrderId}/${createId()}.${type.ext}`;
  await putObject(storageKey, file.bytes, type.contentType);
  return recordMedia(workOrderId, { storageKey, type, size: file.bytes.length, caption: file.caption, visibleToCustomer: file.visibleToCustomer }, actor);
}

type Sniffed = NonNullable<ReturnType<typeof sniffMedia>>;

async function recordMedia(
  workOrderId: string,
  file: { storageKey: string; type: Sniffed; size: number; caption?: string; visibleToCustomer: boolean },
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
      },
      select: { id: true },
    });
    await tx.workOrderEvent.create({
      data: { workOrderId, actorId: actor.id, type: "MEDIA_ADDED", data: { mediaId: media.id }, body: file.caption },
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
  file: { storageKey: string; caption?: string; visibleToCustomer: boolean },
  actor: StaffUser,
) {
  // Only keys we could have issued for this work order (no path tricks, no other order's files).
  const pattern = new RegExp(`^work-orders/${workOrderId.replace(/[^A-Za-z0-9_-]/g, "")}/[A-Za-z0-9_-]{16}\\.(mp4|mov|webm|jpg|png|webp)$`);
  if (!pattern.test(file.storageKey)) throw new AppError("invalid", {}, 422);
  await assertEditable(workOrderId);
  if (await prisma.workOrderMedia.findUnique({ where: { storageKey: file.storageKey }, select: { id: true } })) throw new AppError("invalid", {}, 409);

  const stored = await readObjectHead(file.storageKey);
  if (!stored) throw new AppError("notFound", {}, 404);
  const type = sniffMedia(stored.head);
  const max = type?.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (!type || stored.size > max) {
    await deleteObject(file.storageKey); // never keep a file we refuse
    throw type ? new MediaError("tooLarge", max / 1024 / 1024) : new MediaError("badType");
  }
  return recordMedia(workOrderId, { storageKey: file.storageKey, type, size: stored.size, caption: file.caption, visibleToCustomer: file.visibleToCustomer }, actor);
}

export async function setMediaVisibility(mediaId: string, visibleToCustomer: boolean) {
  const media = await prisma.workOrderMedia.update({ where: { id: mediaId }, data: { visibleToCustomer }, select: { workOrderId: true } });
  await prisma.workOrder.update({ where: { id: media.workOrderId }, data: { updatedAt: new Date() } });
  return media.workOrderId;
}

export async function removeMedia(mediaId: string) {
  const media = await prisma.workOrderMedia.delete({ where: { id: mediaId }, select: { workOrderId: true, storageKey: true } });
  await deleteObject(media.storageKey);
  await prisma.workOrder.update({ where: { id: media.workOrderId }, data: { updatedAt: new Date() } });
  return media.workOrderId;
}
