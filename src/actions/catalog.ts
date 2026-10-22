"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { LANG_COOKIE, getI18n } from "@/lib/i18n/server";
import { utcToZoned, zonedToUtc } from "@/lib/booking";
import { getSettings } from "@/server/settings";
import { requirePermission } from "@/lib/session";
import {
  customerSchema,
  formToObject,
  id,
  packageLineSchema,
  packageSchema,
  partSchema,
  paymentSchema,
  settingsSchema,
  staffPasswordSchema,
  staffRoleSchema,
  staffSchema,
  stockMovementSchema,
  vehicleSchema,
} from "@/lib/validators";
import { addPackageLine, archivePackage, createPackage, createStaff, deleteStaff, removePackageLine, setStaffActive, setStaffPassword, setStaffRole } from "@/server/admin";
import { addVehicle, createCustomer, updateCustomer } from "@/server/customers";
import { recordPayment } from "@/server/invoices";
import { audit } from "@/server/audit";
import { createPart, moveStock, updatePart } from "@/server/parts";
import { prisma } from "@/lib/prisma";

type Result = ActionResult<{ redirectTo?: string; warning?: string }>;

/** V16 Lot 4 — the payment date typed (garage day): today = now; another day = that day at noon, garage time. */
async function paymentDate(day: string): Promise<Date | undefined> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const tz = (await getSettings()).timezone;
  if (day === utcToZoned(new Date(), tz).date) return undefined;
  return zonedToUtc(day, "12:00", tz);
}

const done = (redirectTo?: string): Result => {
  revalidatePath("/garage", "layout");
  return { ok: true, data: { redirectTo } };
};

// ── Language ─────────────────────────────────────────────────────────────────

export async function setLangAction(lang: "fr" | "ar" | "en"): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang === "ar" || lang === "en" ? lang : "fr", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

// ── Customers & vehicles ─────────────────────────────────────────────────────

export async function createCustomerAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("viewCustomers");
    const customer = await createCustomer(customerSchema.parse(formToObject(form)), actor);
    return done(`/garage/customers/${customer.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCustomerAction(customerId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("viewCustomers");
    const data = customerSchema.parse(formToObject(form));
    await updateCustomer(
      id.parse(customerId),
      {
        ...data,
        email: data.email ?? null,
        address: data.address ?? null,
        taxId: data.taxId ?? null,
        nationalId: data.nationalId ?? null,
        notes: data.notes ?? null,
      },
      actor,
    );
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function addVehicleAction(customerId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("viewCustomers");
    await addVehicle(id.parse(customerId), vehicleSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Parts & stock ────────────────────────────────────────────────────────────

export async function createPartAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageStock");
    await createPart(partSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePartAction(partId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageStock");
    const data = partSchema.parse(formToObject(form));
    await updatePart(
      id.parse(partId),
      {
        sku: data.sku,
        name: data.name,
        brand: data.brand ?? null,
        unit: data.unit,
        costPrice: data.costPrice ?? 0,
        salePrice: data.salePrice,
        ...(data.minStock !== undefined ? { minStockX100: data.minStock } : {}),
      },
      actor,
    );
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveStockAction(partId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageStock");
    const v = stockMovementSchema.parse(formToObject(form));
    // A return to the supplier is typed as a positive quantity: it always goes out.
    await moveStock(id.parse(partId), { ...v, delta: v.reason === "SUPPLIER_RETURN" ? -Math.abs(v.delta) : v.delta }, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function recordPaymentAction(invoiceId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("recordPayment");
    const raw = formToObject(form);
    // V16 Lot 4: real date of the payment (garage day; today = now) and the form's anti double-click key.
    const paidAt = await paymentDate(typeof raw.paidAt === "string" ? raw.paidAt : "");
    const key = typeof raw.requestKey === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(raw.requestKey) ? raw.requestKey : null;
    const r = await recordPayment(id.parse(invoiceId), { ...paymentSchema.parse(raw), paidAt, requestKey: key }, actor);
    revalidatePath(`/garage/invoices/${invoiceId}`);
    if (r.duplicate) return { ok: true, data: { warning: (await getI18n()).t.v16.lot4.payment.duplicate } };
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Settings (admin) ─────────────────────────────────────────────────────────

export async function updateSettingsAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const data = settingsSchema.parse(formToObject(form));
    const values = {
      garageName: data.garageName,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      taxId: data.taxId ?? null,
      laborRate: data.laborRate,
      defaultTaxBp: Math.round(data.defaultTaxPercent * 100),
      stampDuty: data.stampDuty,
      invoiceFooter: data.invoiceFooter ?? null,
      paymentTermsDays: data.paymentTermsDays,
      siteUrl: data.siteUrl?.replace(/\/+$/, "") ?? null,
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { id: "garage" },
        select: { garageName: true, address: true, phone: true, email: true, taxId: true, laborRate: true, defaultTaxBp: true, stampDuty: true, invoiceFooter: true, paymentTermsDays: true, siteUrl: true },
      });
      await tx.setting.upsert({ where: { id: "garage" }, update: values, create: { id: "garage", ...values } });
      await audit(tx, actor, "settings.general", "Setting", "garage", { before, after: values });
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function createPackageAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    await createPackage(packageSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function addPackageLineAction(packageId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const input = packageLineSchema.parse(formToObject(form));
    await addPackageLine(
      id.parse(packageId),
      {
        type: input.type,
        partId: input.partId,
        description: input.description,
        quantityX100: input.quantity,
        unitPrice: input.unitPrice,
      },
      actor,
    );
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function removePackageLineAction(lineId: string): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    await removePackageLine(id.parse(lineId), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function archivePackageAction(packageId: string): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    await archivePackage(id.parse(packageId), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function createStaffAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    await createStaff(staffSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffRoleAction(userId: string, form: FormData): Promise<Result> {
  try {
    const admin = await requirePermission("manageSettings");
    const { role } = staffRoleSchema.parse(formToObject(form));
    await setStaffRole(admin, id.parse(userId), role);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffPasswordAction(userId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const parsed = staffPasswordSchema.safeParse(formToObject(form));
    if (!parsed.success) {
      const mismatch = parsed.error.issues.some((i) => i.message === "passwordMismatch");
      throw new AppError(mismatch ? "passwordMismatch" : "passwordTooShort", {}, 422);
    }
    await setStaffPassword(id.parse(userId), parsed.data.password, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const admin = await requirePermission("manageSettings");
    if (admin.id === userId && !active) throw new AppError("forbidden", {}, 403);
    await setStaffActive(id.parse(userId), active, admin);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteStaffAction(userId: string): Promise<Result> {
  try {
    const admin = await requirePermission("manageSettings");
    await deleteStaff(admin, id.parse(userId));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}
