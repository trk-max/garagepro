"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import {
  formToObject,
  id,
  paymentSchema,
  purchaseOrderSchema,
  receiptSchema,
  rejectSchema,
  reminderSchema,
  supplierInvoiceSchema,
  supplierSchema,
} from "@/lib/validators";
import { recordReminder } from "@/server/invoices";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createReceipt,
  createSupplier,
  createSupplierInvoice,
  paySupplierInvoice,
  rejectPurchaseOrder,
  updateSupplier,
} from "@/server/purchasing";

type Result = ActionResult<{ redirectTo?: string }>;

const done = (redirectTo?: string): Result => {
  revalidatePath("/garage", "layout");
  return { ok: true, data: { redirectTo } };
};

const toLines = (lines: { partId: string; quantity: number; unitCost?: number }[]) =>
  lines.map((l) => ({ partId: l.partId, quantityX100: l.quantity, unitCost: l.unitCost }));

// ── Suppliers ────────────────────────────────────────────────────────────────

export async function createSupplierAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSuppliers");
    await createSupplier(supplierSchema.parse(formToObject(form)));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSupplierAction(supplierId: string, form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSuppliers");
    const d = supplierSchema.parse(formToObject(form));
    await updateSupplier(id.parse(supplierId), {
      name: d.name,
      contact: d.contact ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      address: d.address ?? null,
      taxId: d.taxId ?? null,
      notes: d.notes ?? null,
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Purchase orders ──────────────────────────────────────────────────────────

export async function createPurchaseOrderAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("requestPurchase");
    const d = purchaseOrderSchema.parse(formToObject(form));
    const po = await createPurchaseOrder(
      { supplierId: d.supplierId, notes: d.notes, expectedAt: d.expectedAt, lines: toLines(d.lines).filter((l) => l.quantityX100 > 0) },
      actor,
    );
    return done(`/garage/purchase-orders/${po.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function approvePurchaseOrderAction(poId: string): Promise<Result> {
  try {
    const actor = await requirePermission("approvePurchase");
    await approvePurchaseOrder(id.parse(poId), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function rejectPurchaseOrderAction(poId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("approvePurchase");
    await rejectPurchaseOrder(id.parse(poId), rejectSchema.parse(formToObject(form)).reason, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelPurchaseOrderAction(poId: string): Promise<Result> {
  try {
    await requirePermission("requestPurchase");
    await cancelPurchaseOrder(id.parse(poId));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Goods receipts ───────────────────────────────────────────────────────────

export async function createReceiptAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("receiveGoods");
    const d = receiptSchema.parse(formToObject(form));
    if (!d.supplierId && !d.purchaseOrderId) throw new AppError("invalid");
    const receipt = await createReceipt(
      {
        supplierId: d.supplierId ?? "",
        purchaseOrderId: d.purchaseOrderId,
        deliveryNoteRef: d.deliveryNoteRef,
        notes: d.notes,
        lines: toLines(d.lines),
      },
      actor,
    );
    return done(`/garage/receipts/${receipt.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

// ── Supplier invoices ────────────────────────────────────────────────────────

export async function createSupplierInvoiceAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSupplierInvoices");
    const inv = await createSupplierInvoice(supplierInvoiceSchema.parse(formToObject(form)));
    return done(`/garage/supplier-invoices/${inv.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function paySupplierInvoiceAction(invoiceId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("paySupplier");
    await paySupplierInvoice(id.parse(invoiceId), paymentSchema.parse(formToObject(form)), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Customer payment reminders ───────────────────────────────────────────────

export async function recordReminderAction(invoiceId: string, channel: string, message: string): Promise<Result> {
  try {
    const actor = await requirePermission("sendReminder");
    const d = reminderSchema.parse({ channel, message });
    await recordReminder(id.parse(invoiceId), d.channel, d.message, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}
