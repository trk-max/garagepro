import "server-only";
import { createId } from "@/lib/id";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, deleteObject, putObject, sniffMedia } from "@/server/storage";

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

  return prisma.$transaction(async (tx) => {
    const media = await tx.workOrderMedia.create({
      data: {
        workOrderId,
        kind: type.kind,
        storageKey,
        contentType: type.contentType,
        size: file.bytes.length,
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
