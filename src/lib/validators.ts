import { z } from "zod";
import { ALERT_LIMITS } from "@/lib/alerts";
import {
  ClaimCategory,
  ClaimStatus,
  FuelType,
  ReminderChannel,
  LineType,
  PaymentMethod,
  Priority,
  Role,
  StockMovementReason,
  WorkOrderStatus,
} from "@prisma/client";
import { MIN_PHONE_DIGITS } from "@/lib/booking";
import { normalizePlate } from "@/lib/format";
import { isValidVin, normalizeVin } from "@/lib/vehicle-info";

/** Form helpers: HTML inputs always send strings, empty means "not provided". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max = 500) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const requiredText = (max = 200) => z.string().trim().min(1).max(max);

/**
 * "1,5" / " 45.500 " → number. A blank string becomes NaN (rejected) instead of
 * Number("") === 0, so an empty required field can never be saved as 0.
 */
const parseDecimal = (v: unknown) => {
  if (typeof v !== "string") return v;
  const s = v.replace(/\s/g, "").replace(",", ".");
  return s === "" ? Number.NaN : Number(s);
};

/** "45,5" or "45.500" DT → 45500 millimes. */
export const money = z.preprocess(
  parseDecimal,
  z.number().finite().min(0).max(10_000_000).transform((dt) => Math.round(dt * 1000)),
);

export const optionalMoney = z.preprocess(emptyToUndefined, money.optional());

/** "1,5" → 150 (quantities ×100). Signed variant for stock movements. */
const qtyBase = z.preprocess(
  parseDecimal,
  z.number().finite().min(-100_000).max(100_000).transform((q) => Math.round(q * 100)),
);
export const quantity = qtyBase.refine((q) => q > 0);
export const signedQuantity = qtyBase.refine((q) => q !== 0);

export const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10_000_000).optional());
export const optionalDate = z.preprocess(
  emptyToUndefined,
  z.coerce.date().refine((d) => d.getFullYear() >= 2000 && d.getFullYear() <= 2100).optional(),
);
/** <input type="datetime-local"> value, kept as text and converted with the garage's time zone. */
export const optionalLocalDateTime = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^(20\d\d|2100)-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
);

export const optionalId = z.preprocess(emptyToUndefined, z.string().cuid().optional());
export const id = z.string().cuid();

export const plate = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .transform(normalizePlate)
  .refine((p) => p.length >= 2);

export const customerSchema = z.object({
  name: requiredText(120),
  phone: requiredText(30),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  address: optionalText(300),
  taxId: optionalText(40),
  notes: optionalText(2000),
  /** Checkbox "refuse les rappels d'entretien". */
  reminderOptOut: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
});

export const vehicleSchema = z.object({
  plate,
  make: requiredText(60),
  model: requiredText(60),
  year: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1950).max(2100).optional()),
  vin: z.preprocess(emptyToUndefined, z.string().trim().max(40).transform(normalizeVin).optional()),
  fuel: z.preprocess(emptyToUndefined, z.nativeEnum(FuelType).optional()),
  color: optionalText(40),
  mileage: optionalInt,
});

/** Chassis number: 17 characters (spaces and dashes removed, uppercase). */
export const vin = z
  .string()
  .trim()
  .transform(normalizeVin)
  .refine(isValidVin, { message: "VIN : 17 caractères (chiffres et lettres sauf I, O, Q)" });

/** New vehicle at check-in: every piece of information is mandatory. */
export const checkInVehicleSchema = vehicleSchema.extend({
  vin,
  year: z.coerce.number().int().min(1950).max(2100),
  fuel: z.nativeEnum(FuelType),
  color: requiredText(40),
});

/** Known vehicle at check-in: the missing pieces typed in the form (f_vin, f_year…). */
export const vehicleCompletionSchema = z.object({
  vin: z.preprocess(emptyToUndefined, vin.optional()),
  year: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1950).max(2100).optional()),
  fuel: z.preprocess(emptyToUndefined, z.nativeEnum(FuelType).optional()),
  color: optionalText(40),
});

export const createWorkOrderSchema = z.object({
  customerId: optionalId,
  vehicleId: optionalId,
  complaint: requiredText(2000),
  priority: z.nativeEnum(Priority).default("NORMAL"),
  /** Mileage at check-in: mandatory. */
  mileageIn: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10_000_000)),
  promisedAt: optionalLocalDateTime,
  mechanicId: optionalId,
});

export const workOrderMetaSchema = z.object({
  diagnosis: optionalText(4000),
  priority: z.nativeEnum(Priority).optional(),
  promisedAt: optionalLocalDateTime,
  mileageIn: optionalInt,
});

export const statusSchema = z.nativeEnum(WorkOrderStatus);

export const addLineSchema = z.object({
  type: z.nativeEnum(LineType),
  partId: optionalId,
  description: optionalText(200),
  quantity,
  unitPrice: optionalMoney,
});

export const noteSchema = z.object({ body: requiredText(2000) });

export const partSchema = z.object({
  sku: requiredText(40).transform((v) => v.toUpperCase()),
  name: requiredText(120),
  brand: optionalText(60),
  unit: z.preprocess(emptyToUndefined, z.string().trim().max(10).default("pce")),
  costPrice: optionalMoney,
  salePrice: money,
  stock: z.preprocess(emptyToUndefined, qtyBase.optional()),
  minStock: z.preprocess(emptyToUndefined, qtyBase.optional()),
});

export const stockMovementSchema = z.object({
  delta: signedQuantity,
  reason: z.enum([StockMovementReason.PURCHASE, StockMovementReason.ADJUSTMENT, StockMovementReason.SUPPLIER_RETURN]),
  note: optionalText(200),
  supplierId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
});

export const reservationSchema = z.object({ partId: z.string().cuid(), quantity: z.preprocess(parseDecimal, z.number().finite().positive().max(100_000)).transform((q) => Math.round(q * 100)) });

export const paymentSchema = z.object({
  amount: money.refine((m) => m > 0),
  method: z.nativeEnum(PaymentMethod),
  reference: optionalText(80),
  payer: z.enum(["CUSTOMER", "INSURANCE"]).default("CUSTOMER"),
});

export const expenseSchema = z.object({
  description: z.string().trim().min(2).max(200),
  amount: money.refine((m) => m > 0),
  supplierId: z.preprocess(emptyToUndefined, id.optional()),
});

export const profitSettingsSchema = z.object({
  laborCostPerHour: money,
  overheadMode: z.enum(["NONE", "PERCENT_REVENUE", "PER_LABOR_HOUR"]),
  /** % of revenue (e.g. "12,5") or DT per person-hour, depending on the mode. */
  overheadValue: z.preprocess(parseDecimal, z.number().finite().min(0).max(1_000_000)),
});

export const hourlyCostSchema = z.object({ hourlyCost: optionalMoney });

export const settingsSchema = z.object({
  garageName: requiredText(120),
  address: optionalText(300),
  phone: optionalText(40),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  taxId: optionalText(40),
  laborRate: money,
  defaultTaxPercent: z.coerce.number().min(0).max(100),
  stampDuty: money,
  invoiceFooter: optionalText(500),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(15),
  /** Public address of the site (links and QR Codes) when APP_URL is not set. */
  siteUrl: z.preprocess(emptyToUndefined, z.string().trim().url().regex(/^https?:\/\//).max(200).optional()),
});

export const packageSchema = z.object({ name: requiredText(120), description: optionalText(300) });

export const packageLineSchema = z.object({
  type: z.nativeEnum(LineType),
  partId: optionalId,
  description: optionalText(200),
  quantity,
  unitPrice: optionalMoney,
});

export const staffSchema = z.object({
  name: requiredText(120),
  email: z.string().trim().toLowerCase().email(),
  phone: optionalText(30),
  role: z.nativeEnum(Role),
  password: z.string().min(8).max(100),
});

export const staffRoleSchema = z.object({ role: z.nativeEnum(Role) });

export const staffPasswordSchema = z
  .object({ password: z.string().min(8).max(100), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "passwordMismatch", path: ["confirm"] });

/** FormData → plain object (single values). */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

// ── Espace fournisseur ───────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name: requiredText(120),
  contact: optionalText(120),
  phone: optionalText(30),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
  address: optionalText(300),
  taxId: optionalText(40),
  notes: optionalText(1000),
});

/** Dynamic line editors post their rows as JSON in a hidden "lines" input. */
const linesJson = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom });
      return z.NEVER;
    }
  })
  .pipe(
    z.array(
      z.object({
        partId: id,
        // Receipt: an emptied quantity explicitly means "nothing received" (0), as before.
        quantity: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), qtyBase.refine((q) => q >= 0)),
        unitCost: optionalMoney,
      }),
    ),
  );

export const purchaseOrderSchema = z.object({
  supplierId: id,
  notes: optionalText(1000),
  expectedAt: optionalDate,
  lines: linesJson,
});

export const receiptSchema = z.object({
  supplierId: optionalId,
  purchaseOrderId: optionalId,
  deliveryNoteRef: optionalText(60),
  notes: optionalText(1000),
  lines: linesJson,
});

export const rejectSchema = z.object({ reason: requiredText(300) });

export const supplierInvoiceSchema = z.object({
  supplierId: id,
  purchaseOrderId: optionalId,
  number: requiredText(60),
  issuedAt: z.coerce.date(),
  dueDate: optionalDate,
  totalHt: money,
  totalTax: money,
  notes: optionalText(500),
});

export const reminderSchema = z.object({
  channel: z.nativeEnum(ReminderChannel),
  message: requiredText(1000),
});

const isoDate = z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

/** Invoice list filters from the URL (?number=&dateMode=&date=&from=&to=…). Bad values are ignored. */
export const invoiceFilterSchema = z.object({
  number: optionalText(40).catch(undefined),
  dateMode: z.enum(["exact", "range"]).optional().catch(undefined),
  date: isoDate.catch(undefined),
  from: isoDate.catch(undefined),
  to: isoDate.catch(undefined),
  customer: optionalText(80).catch(undefined),
  plate: optionalText(20).catch(undefined),
  totalMin: optionalMoney.catch(undefined),
  totalMax: optionalMoney.catch(undefined),
  dueMin: optionalMoney.catch(undefined),
  dueMax: optionalMoney.catch(undefined),
  status: z.preprocess(emptyToUndefined, z.enum(["ISSUED", "PARTIAL", "PAID", "OVERDUE"]).optional()).catch(undefined),
});

// ── Portail client & prise de RDV ────────────────────────────────────────────

export const portalLoginSchema = z.object({
  plate: z.string().trim().min(2).max(20),
  pin: z.string().trim().regex(/^\d{4}$/),
});

export const customerMessageSchema = z.object({ body: requiredText(1000) });

export const bookingSchema = z.object({
  serviceId: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  firstName: requiredText(60),
  lastName: requiredText(60),
  phone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .regex(/^[+\d\s().-]+$/)
    .refine((p) => p.replace(/\D/g, "").length >= MIN_PHONE_DIGITS, { message: "Au moins 8 chiffres" }),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().max(120).optional()),
  plate: z.string().trim().min(2).max(20),
  make: optionalText(40),
  model: optionalText(40),
  notes: optionalText(500),
  /** Honeypot: hidden field, must stay empty (bots fill it). */
  website: z.string().max(0).optional().default(""),
});

/** Complaint from the customer site. */
export const claimSchema = z.object({
  name: requiredText(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s().-]+$/)
    .refine((p) => p.replace(/\D/g, "").length >= MIN_PHONE_DIGITS),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().max(120).optional()),
  plate: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(20).transform(normalizePlate).optional()),
  category: z.nativeEnum(ClaimCategory).default("OTHER"),
  message: z.string().trim().min(10).max(2000),
  /** Honeypot: hidden field, must stay empty (bots fill it). */
  website: z.string().max(0).optional().default(""),
});

/** Customer rating (1-5 stars) after a repair or a visit. */
export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(1000),
  name: optionalText(80),
  plate: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(20).transform(normalizePlate).optional()),
  website: z.string().max(0).optional().default(""),
});

/** Staff handling a complaint. */
export const claimUpdateSchema = z.object({
  status: z.nativeEnum(ClaimStatus),
  response: optionalText(2000),
});

export const bookableServiceSchema = z.object({
  name: requiredText(80),
  nameAr: optionalText(80),
  description: optionalText(300),
  descriptionAr: optionalText(300),
  durationMin: z.coerce.number().int().min(10).max(600),
  priceFrom: optionalMoney,
  position: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const bookingSettingsSchema = z.object({
  bookingEnabled: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  bookingSlotMinutes: z.coerce.number().int().min(5).max(240),
  bookingCapacity: z.coerce.number().int().min(1).max(50),
  bookingLeadMinutes: z.coerce.number().int().min(0).max(10_080),
  bookingHorizonDays: z.coerce.number().int().min(1).max(120),
  hours: z.array(
    z.object({ closed: z.boolean(), open: hhmm, close: hhmm }).refine((d) => d.closed || d.open < d.close),
  ).length(7),
});

// ── V7 : équipe, pointage, congés, suivi des réparations, portail entreprise ──

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean());

export const punchSchema = z.object({
  kind: z.enum(["IN", "OUT", "BREAK_START", "BREAK_END"]),
  code: optionalText(12),
});

export const leaveRequestSchema = z
  .object({
    userId: optionalId,
    type: z.enum(["PAID_LEAVE", "SICK", "UNPAID", "AUTHORIZATION", "ABSENCE", "OTHER"]),
    firstDay: z.preprocess(emptyToUndefined, isoDay.optional()),
    lastDay: z.preprocess(emptyToUndefined, isoDay.optional()),
    date: z.preprocess(emptyToUndefined, isoDay.optional()),
    from: z.preprocess(emptyToUndefined, hhmm.optional()),
    to: z.preprocess(emptyToUndefined, hhmm.optional()),
    reason: optionalText(500),
  })
  .refine((v) => (v.type === "AUTHORIZATION" ? !!(v.date && v.from && v.to && v.from < v.to) : !!(v.firstDay && v.lastDay && v.firstDay <= v.lastDay)), {
    message: "dates",
  });

export const leaveDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]), note: optionalText(500) });

export const punchCorrectionSchema = z.object({
  userId: id,
  kind: z.enum(["IN", "OUT", "BREAK_START", "BREAK_END"]),
  at: localDateTime,
  reason: z.string().trim().min(3).max(300),
  replaceEventId: optionalId,
});

export const reasonSchema = z.string().trim().min(3).max(300);

export const employeeProfileSchema = z.object({
  jobTitle: optionalText(120),
  hireDate: z.preprocess(emptyToUndefined, isoDay.optional()),
  nationalId: z.preprocess(emptyToUndefined, z.string().trim().regex(/^[A-Z0-9]{6,12}$/i).optional()),
  annualLeaveDays: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(60).optional()),
  contractType: z.preprocess(emptyToUndefined, z.enum(["CDI", "CDD", "SIVP", "OTHER"]).optional()),
});

export const laborManualSchema = z.object({ userId: id, from: localDateTime, to: localDateTime, note: optionalText(300) });

export const qualityCheckSchema = z.object({
  roadTest: z.preprocess(emptyToUndefined, z.enum(["DONE", "NOT_NEEDED"]).optional()),
  fluidsOk: checkbox,
  warningsOk: checkbox,
  toolsRemoved: checkbox,
  workVerified: checkbox,
  billingVerified: checkbox,
  notes: optionalText(1000),
});

export const insuranceSchema = z.object({
  insurerName: optionalText(120),
  insuranceClaimRef: optionalText(80),
  insuranceRequestedAt: z.preprocess(emptyToUndefined, isoDay.optional()),
  insuranceDecision: z.preprocess(emptyToUndefined, z.enum(["APPROVED", "REJECTED", "PARTIAL"]).optional()),
});

export const partNeedSchema = z.object({
  partId: optionalId,
  description: z.string().trim().min(2).max(200),
  quantity,
  supplierId: optionalId,
  expectedAt: z.preprocess(emptyToUndefined, isoDay.optional()),
  note: optionalText(300),
});

export const partNeedUpdateSchema = z.object({
  status: z.enum(["NEEDED", "ORDERED", "RECEIVED", "CANCELLED"]),
  expectedAt: z.preprocess(emptyToUndefined, isoDay.optional()),
  supplierId: optionalId,
});

export const certificateSchema = z.object({
  purpose: optionalText(120),
  endDate: z.preprocess(emptyToUndefined, isoDay.optional()),
  /** Checkbox: the issuer confirms the employee is neither resigning nor being dismissed. */
  notResigning: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  recipientName: optionalText(150),
  recipientAddress: optionalText(300),
});

export const companyLegalSchema = z.object({
  legalName: optionalText(200),
  legalAddress: optionalText(300),
  city: optionalText(80),
  legalRepName: optionalText(120),
  legalRepTitle: optionalText(80),
  legalCapital: optionalText(60),
  registryNumber: optionalText(60),
  registryCity: optionalText(80),
});

export const companyUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["FLEET_ADMIN", "MANAGER", "VIEWER"]),
  password: z.string().min(10).max(200),
});

export const companyLoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export const companyForgotSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export const companyResetSchema = z.object({
  token: z.string().min(10).max(500),
  password: z.string().min(10).max(200),
  confirm: z.string().max(200),
});

export const settingsV7Schema = z.object({
  clockMode: z.enum(["CODE", "NETWORK", "CODE_AND_NETWORK"]),
  clockNetworks: optionalText(500),
  alertOrderLateHours: z.coerce.number().int().min(ALERT_LIMITS.alertOrderLateHours.min).max(ALERT_LIMITS.alertOrderLateHours.max),
  alertPartLateDays: z.coerce.number().int().min(ALERT_LIMITS.alertPartLateDays.min).max(ALERT_LIMITS.alertPartLateDays.max),
  alertInsuranceDays: z.coerce.number().int().min(ALERT_LIMITS.alertInsuranceDays.min).max(ALERT_LIMITS.alertInsuranceDays.max),
});
