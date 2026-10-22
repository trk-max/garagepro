import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { PARTS_ORIGINS, REPAIR_AMOUNT_LIMITS, cleanBodyZones, cleanRepairClauses, MAX_CLAUSES, type BodyZone, type PartsOrigin, type RepairClause } from "@/lib/repair-order";
import { money, optionalMoney, optionalText } from "@/lib/validators";
import { cleanWarningLights, type WarningLight } from "@/lib/handover";

/** Form readers of the repair order (V10.6): check-in, work order page, Paramètres. */

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const intakeSchema = z.object({
  fuelLevel: z.preprocess(empty, z.coerce.number().int().min(1).max(4).optional()),
  partsOrigin: z.preprocess(empty, z.enum(PARTS_ORIGINS).optional()),
  bodyDamageNotes: optionalText(2000),
  estimateTtc: optionalMoney,
  depositAmount: optionalMoney,
  depositMethod: z.preprocess(empty, z.nativeEnum(PaymentMethod).optional()),
  // V16 Lot 4
  itemsLeft: optionalText(500),
  keyCount: z.preprocess(empty, z.coerce.number().int().min(0).max(20).optional()),
  authorizationCeiling: optionalMoney,
});

export type IntakeForm = {
  fuelLevel?: number;
  partsOrigin?: PartsOrigin;
  bodyChecklist: BodyZone[];
  bodyDamageNotes?: string;
  estimateTtc?: number;
  depositAmount?: number;
  depositMethod?: PaymentMethod;
  /** undefined = field absent from the form; null = emptied. */
  customerNationalId?: string | null;
  /** V16 Lot 4 — warning lights on, items left in the car, keys handed over, authorization ceiling (millimes TTC). */
  warningLights?: WarningLight[];
  itemsLeft?: string;
  keyCount?: number;
  authorizationCeiling?: number;
};

/** Reads the intake fields (same names in the check-in form and on the work order page). */
export function parseIntakeForm(form: FormData): IntakeForm {
  const raw: Record<string, string> = {};
  for (const k of ["fuelLevel", "partsOrigin", "bodyDamageNotes", "estimateTtc", "depositAmount", "depositMethod", "itemsLeft", "keyCount", "authorizationCeiling"]) {
    const v = form.get(k);
    if (typeof v === "string") raw[k] = v;
  }
  const parsed = intakeSchema.parse(raw);
  const cin = form.get("customerNationalId");
  const nationalId = typeof cin === "string" ? cin.trim().slice(0, 30) || null : undefined;
  return { ...parsed, bodyChecklist: cleanBodyZones(form.getAll("bodyChecklist")), customerNationalId: nationalId, warningLights: cleanWarningLights(form.getAll("warningLights")) };
}

const intIn = (l: { min: number; max: number }) => z.coerce.number().int().min(l.min).max(l.max);

const termsSchema = z.object({
  storageFeePerDay: money.pipe(z.number().max(REPAIR_AMOUNT_LIMITS.storageFeePerDay.max)),
  storageGraceHours: intIn(REPAIR_AMOUNT_LIMITS.storageGraceHours),
  abandonmentDays: intIn(REPAIR_AMOUNT_LIMITS.abandonmentDays),
  invoicePaymentTerms: optionalText(500),
  invoicePenaltyText: optionalText(500),
});

/** Paramètres form: clause_title_0 / clause_body_0 … (+ 2 empty rows to add articles). */
export function parseRepairTermsForm(form: FormData): {
  clauses: RepairClause[];
  storageFeePerDay: number;
  storageGraceHours: number;
  abandonmentDays: number;
  invoicePaymentTerms?: string;
  invoicePenaltyText?: string;
} {
  const rows: { title?: string; body?: string }[] = [];
  for (let i = 0; i < MAX_CLAUSES + 2; i++) {
    const title = form.get(`clause_title_${i}`);
    const body = form.get(`clause_body_${i}`);
    if (typeof title !== "string" && typeof body !== "string") continue;
    rows.push({ title: typeof title === "string" ? title : "", body: typeof body === "string" ? body : "" });
  }
  const raw: Record<string, string> = {};
  for (const k of ["storageFeePerDay", "storageGraceHours", "abandonmentDays", "invoicePaymentTerms", "invoicePenaltyText"]) {
    const v = form.get(k);
    if (typeof v === "string") raw[k] = v;
  }
  return { clauses: cleanRepairClauses(rows), ...termsSchema.parse(raw) };
}
