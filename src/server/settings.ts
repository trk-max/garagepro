import "server-only";
import type { Setting } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getSettings(): Promise<Setting> {
  return prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
}
