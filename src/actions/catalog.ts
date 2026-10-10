"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { LANG_COOKIE } from "@/lib/i18n/server";
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
import { addPackageLine, archivePackage, createPackage, createStaff, removePackageLine, setStaffActive, setStaffPassword, setStaffRole } from "@/server/admin";
import { addVehicle, createCustomer, updateCustomer } from "@/server/customers";
import { recordPayment } from "@/server/invoices";
import { createPart, moveStock, updatePart } from "@/server/parts";
import { prisma } from "@/lib/prisma";

type Result = ActionResult<{ redirectTo?: string }>;

const done = (redirectTo?: string): Result => {
  revalidatePath("/garage", "layout");
  return { ok: true, data: { redirectTo } };
};

// ── Language ─────────────────────────────────────────────────────────────────

export async function setLangAction(lang: "fr" | "ar"): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang === "ar" ? "ar" : "fr", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

// ── Customers & vehicles ─────────────────────────────────────────────────────

export async function createCustomerAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("viewCustomers");
    const customer = await createCustomer(customerSchema.parse(formToObject(form)));
    return done(`/garage/customers/${customer.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCustomerAction(customerId: string, form: FormData): Promise<Result> {
  try {
    await requirePermission("viewCustomers");
    const data = customerSchema.parse(formToObject(form));
    await updateCustomer(id.parse(customerId), {
      ...data,
      email: data.email ?? null,
      address: data.address ?? null,
      taxId: data.taxId ?? null,
      notes: data.notes ?? null,
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function addVehicleAction(customerId: string, form: FormData): Promise<Result> {
  try {
    await requirePermission("viewCustomers");
    await addVehicle(id.parse(customerId), vehicleSchema.parse(formToObject(form)));
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
    await requirePermission("manageStock");
    const data = partSchema.parse(formToObject(form));
    await updatePart(id.parse(partId), {
      sku: data.sku,
      name: data.name,
      brand: data.brand ?? null,
      unit: data.unit,
      costPrice: data.costPrice ?? 0,
      salePrice: data.salePrice,
      ...(data.minStock !== undefined ? { minStockX100: data.minStock } : {}),
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveStockAction(partId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageStock");
    await moveStock(id.parse(partId), stockMovementSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function recordPaymentAction(invoiceId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("recordPayment");
    await recordPayment(id.parse(invoiceId), paymentSchema.parse(formToObject(form)), actor);
    revalidatePath(`/garage/invoices/${invoiceId}`);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Settings (admin) ─────────────────────────────────────────────────────────

export async function updateSettingsAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
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
    };
    await prisma.setting.upsert({ where: { id: "garage" }, update: values, create: { id: "garage", ...values } });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function createPackageAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    await createPackage(packageSchema.parse(formToObject(form)));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function addPackageLineAction(packageId: string, form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    const input = packageLineSchema.parse(formToObject(form));
    await addPackageLine(id.parse(packageId), {
      type: input.type,
      partId: input.partId,
      description: input.description,
      quantityX100: input.quantity,
      unitPrice: input.unitPrice,
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function removePackageLineAction(lineId: string): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    await removePackageLine(id.parse(lineId));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function archivePackageAction(packageId: string): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    await archivePackage(id.parse(packageId));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function createStaffAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    await createStaff(staffSchema.parse(formToObject(form)));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffRoleAction(userId: string, form: FormData): Promise<Result> {
  try {
    const admin = await requirePermission("manageSettings");
    const { role } = staffRoleSchema.parse(formToObject(form));
    await setStaffRole(admin.id, id.parse(userId), role);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffPasswordAction(userId: string, form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    const parsed = staffPasswordSchema.safeParse(formToObject(form));
    if (!parsed.success) {
      const mismatch = parsed.error.issues.some((i) => i.message === "passwordMismatch");
      throw new AppError(mismatch ? "passwordMismatch" : "passwordTooShort", {}, 422);
    }
    await setStaffPassword(id.parse(userId), parsed.data.password);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStaffActiveAction(userId: string, active: boolean): Promise<Result> {
  try {
    const admin = await requirePermission("manageSettings");
    if (admin.id === userId && !active) throw new AppError("forbidden", {}, 403);
    await setStaffActive(id.parse(userId), active);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}
