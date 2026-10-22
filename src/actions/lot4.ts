"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { OLD_PARTS, type OldParts } from "@/lib/handover";
import { toActionError, type ActionResult } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { id } from "@/lib/validators";
import { recordHandover } from "@/server/handover";
import { issueCreditNote, reversePayment } from "@/server/invoices";
import { clientIp } from "@/server/portal-session";
import { signIntake, signSafetyWaiver } from "@/server/signatures";
import { recordReadyNotice, waiveStorageFee } from "@/server/storage-fees";
import { safetyWaiverMissing } from "@/server/work-orders";
import type { Prisma } from "@prisma/client";

/**
 * V16 Lot 4 — signed intake, handover, safety waiver on the tablet, storage fee, credit notes, payment reversal.
 * Each action checks its permission; the server function checks it again (whoever calls it).
 */

type Result = ActionResult<{ redirectTo?: string }>;

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

async function who() {
  return { ip: await clientIp(), userAgent: (await headers()).get("user-agent") };
}

const refresh = (workOrderId: string) => {
  revalidatePath("/garage", "layout");
  revalidatePath(`/garage/work-orders/${workOrderId}`);
};

export async function signIntakeAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("signIntake");
    await signIntake(id.parse(workOrderId), { signerName: str(form, "signerName"), image: str(form, "signature"), ...(await who()) }, actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function signWaiverAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("recordSafetyWaiver");
    const woId = id.parse(workOrderId);
    const lineIds = await safetyWaiverMissing(prisma as unknown as Prisma.TransactionClient, woId);
    await signSafetyWaiver(woId, lineIds, { signerName: str(form, "signerName"), image: str(form, "signature"), ...(await who()) }, actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recordHandoverAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("recordHandover");
    const km = Number.parseInt(str(form, "mileageOut"), 10);
    const fuel = Number.parseInt(str(form, "fuelLevelOut"), 10);
    const oldParts = str(form, "oldParts");
    await recordHandover(
      id.parse(workOrderId),
      {
        mileageOut: Number.isFinite(km) ? km : -1,
        fuelLevelOut: Number.isFinite(fuel) ? fuel : null,
        checklist: {
          workExplained: form.get("workExplained") === "on",
          oldParts: (OLD_PARTS as readonly string[]).includes(oldParts) ? (oldParts as OldParts) : "NONE",
          keysReturned: form.get("keysReturned") === "on",
          clean: form.get("clean") === "on",
        },
        notes: str(form, "notes"),
        signerName: str(form, "signerName"),
        image: str(form, "signature"),
        ...(await who()),
      },
      actor,
    );
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function waiveStorageFeeAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("waiveStorageFee");
    await waiveStorageFee(id.parse(workOrderId), str(form, "reason"), actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function readyNoticeAction(workOrderId: string): Promise<Result> {
  try {
    const actor = await requirePermission("deliverWorkOrder");
    await recordReadyNotice(id.parse(workOrderId), actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function issueCreditNoteAction(invoiceId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("issueCreditNote");
    await issueCreditNote(id.parse(invoiceId), str(form, "reason"), actor);
    revalidatePath("/garage", "layout");
    revalidatePath(`/garage/invoices/${invoiceId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function reversePaymentAction(paymentId: string, invoiceId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("reversePayment");
    await reversePayment(id.parse(paymentId), str(form, "reason"), actor);
    revalidatePath("/garage", "layout");
    revalidatePath(`/garage/invoices/${invoiceId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}
