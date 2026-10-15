import { z } from "zod";
import {
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
});

export const vehicleSchema = z.object({
  plate,
  make: requiredText(60),
  model: requiredText(60),
  year: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1950).max(2100).optional()),
  vin: optionalText(40),
  fuel: z.preprocess(emptyToUndefined, z.nativeEnum(FuelType).optional()),
  color: optionalText(40),
  mileage: optionalInt,
});

export const createWorkOrderSchema = z.object({
  customerId: optionalId,
  vehicleId: optionalId,
  complaint: requiredText(2000),
  priority: z.nativeEnum(Priority).default("NORMAL"),
  mileageIn: optionalInt,
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
  reason: z.enum([StockMovementReason.PURCHASE, StockMovementReason.ADJUSTMENT]),
  note: optionalText(200),
});

export const paymentSchema = z.object({
  amount: money.refine((m) => m > 0),
  method: z.nativeEnum(PaymentMethod),
  reference: optionalText(80),
});

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
