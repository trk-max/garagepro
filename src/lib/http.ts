import "server-only";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";

export type ErrorCode = keyof Dictionary["errors"];

/** Business error carrying a dictionary key, translated at the edge (FR/AR). */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly vars: Record<string, string | number> = {},
    public readonly status = 400,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function codeFor(error: unknown): { code: ErrorCode; vars?: Record<string, string | number>; status: number } | null {
  if (error instanceof AppError) return { code: error.code, vars: error.vars, status: error.status };
  if (error instanceof ZodError) return { code: "invalid", status: 422 };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return { code: "notFound", status: 404 };
    if (error.code === "P2002") {
      const target = JSON.stringify(error.meta?.target ?? "");
      if (target.includes("plate")) return { code: "plateTaken", status: 409 };
      if (target.includes("supplierId") && target.includes("number")) return { code: "duplicateSupplierInvoice", status: 409 };
      if (target.includes("sku")) return { code: "skuTaken", status: 409 };
      if (target.includes("email")) return { code: "emailTaken", status: 409 };
      return { code: "invalid", status: 409 };
    }
  }
  return null;
}

export async function toActionError(error: unknown): Promise<{ ok: false; error: string }> {
  const { t } = await getI18n();
  const known = codeFor(error);
  if (!known) {
    console.error(error);
    return { ok: false, error: t.errors.generic };
  }
  return { ok: false, error: fmt(t.errors[known.code], known.vars ?? {}) };
}

export async function toErrorResponse(error: unknown): Promise<NextResponse> {
  const known = codeFor(error);
  if (!known) {
    console.error(error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const details = error instanceof ZodError ? error.flatten() : undefined;
  return NextResponse.json({ error: known.code, details }, { status: known.status });
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
