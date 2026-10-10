import "server-only";
import { cache } from "react";
import type { Setting } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Garage settings, read at most once per request (React `cache`), even though
 * the layout, the page and several helpers all ask for them.
 * A plain read; the row is only created the very first time (fresh database).
 */
export const getSettings = cache(async (): Promise<Setting> => {
  const existing = await prisma.setting.findUnique({ where: { id: "garage" } });
  return existing ?? prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
});
