import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { readRepairClauses, repairTermsChanged, type BodyZone, type PartsOrigin, type RepairClause } from "@/lib/repair-order";
import { audit } from "@/server/audit";
import { isFinal } from "@/server/workflow";
import { intakeSigned } from "@/server/signatures";
import type { WarningLight } from "@/lib/handover";

/**
 * Prise en charge / ordre de réparation (V10.6). Every change is audited in the same transaction.
 * Clauses: edited with manageSettings; the lawyer's validation is recorded by an administrator only
 * (reviewContractTemplates, like the contract templates) and is cleared whenever the terms change.
 */

export type IntakeInput = {
  fuelLevel?: number;
  partsOrigin?: PartsOrigin;
  bodyChecklist: BodyZone[];
  bodyDamageNotes?: string;
  estimateTtc?: number;
  depositAmount?: number;
  depositMethod?: PaymentMethod;
  /** CIN of the customer (stored on the customer file): undefined = unchanged, null = cleared. */
  customerNationalId?: string | null;
  /** V16 Lot 4 */
  warningLights?: WarningLight[];
  itemsLeft?: string;
  keyCount?: number;
  authorizationCeiling?: number;
};

const INTAKE_SELECT = {
  fuelLevel: true,
  partsOrigin: true,
  bodyChecklist: true,
  bodyDamageNotes: true,
  estimateTtc: true,
  depositAmount: true,
  depositMethod: true,
  // V16 Lot 4
  warningLights: true,
  itemsLeft: true,
  keyCount: true,
  authorizationCeiling: true,
} as const;

/** Check-in details of an open work order (not once delivered or cancelled). */
export async function updateIntake(workOrderId: string, input: IntakeInput, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true, customerId: true, workflowLot4: true, invoice: { select: { id: true } }, customer: { select: { nationalId: true } }, ...INTAKE_SELECT },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    // V16 Lot 4: once the customer signed the intake on the tablet, the intake is frozen (document + SHA-256).
    if (await intakeSigned(tx, workOrderId)) throw new AppError("intakeLocked", {}, 409);
    // V16 Lot 4: the deposit of a new order becomes a payment at the invoice; once invoiced, record a payment.
    const depositChanged = (input.depositAmount ?? null) !== wo.depositAmount;
    if (depositChanged && wo.workflowLot4 && wo.invoice) throw new AppError("depositAfterInvoice", {}, 409);
    const data = {
      fuelLevel: input.fuelLevel ?? null,
      partsOrigin: input.partsOrigin ?? null,
      bodyChecklist: input.bodyChecklist as unknown as Prisma.InputJsonValue,
      bodyDamageNotes: input.bodyDamageNotes ?? null,
      estimateTtc: input.estimateTtc ?? null,
      depositAmount: input.depositAmount ?? null,
      depositMethod: input.depositAmount ? (input.depositMethod ?? "CASH") : null,
      // V16 Lot 4
      warningLights: (input.warningLights ?? []) as unknown as Prisma.InputJsonValue,
      itemsLeft: input.itemsLeft ?? null,
      keyCount: input.keyCount ?? null,
      authorizationCeiling: input.authorizationCeiling ?? null,
    };
    await tx.workOrder.update({ where: { id: workOrderId }, data: { ...data, ...(depositChanged ? { depositReceivedAt: input.depositAmount ? new Date() : null } : {}) } });
    const { customer } = wo;
    const before = {
      fuelLevel: wo.fuelLevel,
      partsOrigin: wo.partsOrigin,
      bodyChecklist: wo.bodyChecklist,
      bodyDamageNotes: wo.bodyDamageNotes,
      estimateTtc: wo.estimateTtc,
      depositAmount: wo.depositAmount,
      depositMethod: wo.depositMethod,
      warningLights: wo.warningLights,
      itemsLeft: wo.itemsLeft,
      keyCount: wo.keyCount,
      authorizationCeiling: wo.authorizationCeiling,
    };
    await audit(tx, actor, "workOrder.intake", "WorkOrder", workOrderId, { before, after: data });
    const nationalId = input.customerNationalId;
    if (nationalId !== undefined && nationalId !== customer.nationalId) {
      await tx.customer.update({ where: { id: wo.customerId }, data: { nationalId } });
      await audit(tx, actor, "customer.update", "Customer", wo.customerId, { before: { nationalId: customer.nationalId }, after: { nationalId } });
    }
  });
}

export type RepairTermsInput = {
  clauses: RepairClause[];
  storageFeePerDay: number;
  storageGraceHours: number;
  abandonmentDays: number;
  invoicePaymentTerms?: string;
  invoicePenaltyText?: string;
};

/** Paramètres → Conditions de l'ordre de réparation (+ mentions of the invoice). */
export async function saveRepairTerms(actor: StaffUser, input: RepairTermsInput) {
  if (!can(actor, "manageSettings")) throw new AppError("forbidden", {}, 403);
  if (input.clauses.length === 0) throw new AppError("invalid", {}, 422);
  await prisma.$transaction(async (tx) => {
    const s = await tx.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
    const before = {
      clauses: readRepairClauses(s.repairClauses),
      storageFeePerDay: s.storageFeePerDay,
      storageGraceHours: s.storageGraceHours,
      abandonmentDays: s.abandonmentDays,
      invoicePaymentTerms: s.invoicePaymentTerms,
      invoicePenaltyText: s.invoicePenaltyText,
      reviewedAt: s.repairClausesReviewedAt,
    };
    const after = {
      clauses: input.clauses,
      storageFeePerDay: input.storageFeePerDay,
      storageGraceHours: input.storageGraceHours,
      abandonmentDays: input.abandonmentDays,
      invoicePaymentTerms: input.invoicePaymentTerms ?? null,
      invoicePenaltyText: input.invoicePenaltyText ?? null,
    };
    // New wording or new amounts: the previous validation no longer covers them.
    const resetReview = repairTermsChanged(before, after);
    await tx.setting.update({
      where: { id: "garage" },
      data: {
        repairClauses: after.clauses as unknown as Prisma.InputJsonValue,
        storageFeePerDay: after.storageFeePerDay,
        storageGraceHours: after.storageGraceHours,
        abandonmentDays: after.abandonmentDays,
        invoicePaymentTerms: after.invoicePaymentTerms,
        invoicePenaltyText: after.invoicePenaltyText,
        ...(resetReview ? { repairClausesReviewedAt: null, repairClausesReviewedById: null } : {}),
      },
    });
    await audit(tx, actor, "settings.repairTerms", "Setting", "garage", { before, after: { ...after, reviewCleared: resetReview && !!before.reviewedAt } });
  });
}

/** Administrator: "validated by a lawyer" (who / when) or back to "to be validated". Never automatic. */
export async function setRepairTermsReview(actor: StaffUser, reviewed: boolean) {
  if (!can(actor, "reviewContractTemplates")) throw new AppError("forbidden", {}, 403);
  await prisma.$transaction(async (tx) => {
    const s = await tx.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
    const after = reviewed ? { repairClausesReviewedAt: new Date(), repairClausesReviewedById: actor.id } : { repairClausesReviewedAt: null, repairClausesReviewedById: null };
    await tx.setting.update({ where: { id: "garage" }, data: after });
    await audit(tx, actor, reviewed ? "settings.repairTermsReviewed" : "settings.repairTermsUnreviewed", "Setting", "garage", {
      before: { reviewedAt: s.repairClausesReviewedAt, reviewedById: s.repairClausesReviewedById },
      after,
    });
  });
}

/** Who recorded the validation (name shown in Paramètres). */
export async function repairTermsReviewer(userId: string | null) {
  if (!userId) return null;
  return (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null;
}

/** V16 — Paramètres › Parcours atelier: work without a quote (off by default), paid before delivery (on by default). */
export async function saveWorkflowSettings(
  actor: StaffUser,
  input: {
    allowWorkWithoutQuote: boolean;
    requirePaidBeforeDelivery: boolean;
    /** V16 Lot 3 — diagnostic fee (millimes HT, null = none), safety waiver, automatic « attente pièces ». */
    diagnosticFee?: number | null;
    requireSafetyWaiver?: boolean;
    autoWaitingParts?: boolean;
    /** V16 Lot 4 — signed handover before delivery, storage fee on the invoice, graduated invoice reminders. */
    requireSignedHandover?: boolean;
    autoStorageFee?: boolean;
    autoInvoiceReminders?: boolean;
  },
) {
  if (!can(actor, "manageSettings")) throw new AppError("forbidden", {}, 403);
  await prisma.$transaction(async (tx) => {
    const s = await tx.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
    const before = {
      allowWorkWithoutQuote: s.allowWorkWithoutQuote,
      requirePaidBeforeDelivery: s.requirePaidBeforeDelivery,
      diagnosticFee: s.diagnosticFee,
      requireSafetyWaiver: s.requireSafetyWaiver,
      autoWaitingParts: s.autoWaitingParts,
      requireSignedHandover: s.requireSignedHandover,
      autoStorageFee: s.autoStorageFee,
      autoInvoiceReminders: s.autoInvoiceReminders,
    };
    await tx.setting.update({ where: { id: "garage" }, data: input });
    await audit(tx, actor, "settings.workflow", "Setting", "garage", { before, after: input });
  });
}
