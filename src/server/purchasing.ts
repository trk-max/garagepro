import "server-only";
import { receivePartNeedsTx } from "@/server/delays";
import { assertCanNumberDocuments } from "@/server/hub";
import type { PaymentMethod, Prisma, PurchaseOrderStatus, SupplierInvoiceStatus } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";

type Tx = Prisma.TransactionClient;

/** Yearly numbering: BC2026-0001, BR2026-0001… */
async function nextNumber(tx: Tx, prefix: "BC" | "BR"): Promise<string> {
  assertCanNumberDocuments();
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const seq = await tx.sequence.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}${year}-${String(seq.value).padStart(4, "0")}`;
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export async function listSuppliers(q?: string) {
  const query = q?.trim();
  const suppliers = await prisma.supplier.findMany({
    where: {
      isActive: true,
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] } : {}),
    },
    include: {
      invoices: { where: { status: { not: "PAID" } }, select: { totalTtc: true, paidAmount: true } },
      _count: { select: { purchaseOrders: true } },
    },
    orderBy: { name: "asc" },
  });
  return suppliers.map((s) => ({ ...s, balance: s.invoices.reduce((sum, i) => sum + i.totalTtc - i.paidAmount, 0) }));
}

export async function supplierOptions() {
  return prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function createSupplier(data: Prisma.SupplierCreateInput) {
  return prisma.supplier.create({ data, select: { id: true } });
}

export async function updateSupplier(id: string, data: Prisma.SupplierUpdateInput) {
  await prisma.supplier.update({ where: { id }, data });
}

// ── Purchase orders (bons de commande) ───────────────────────────────────────

export type PurchaseLineInput = { partId: string; quantityX100: number; unitCost?: number };

export async function listPurchaseOrders(status?: PurchaseOrderStatus | "OPEN", supplierId?: string) {
  return prisma.purchaseOrder.findMany({
    where: {
      ...(status === "OPEN" ? { status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL"] } } : status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
    },
    include: {
      supplier: { select: { name: true } },
      requestedBy: { select: { name: true } },
      lines: { select: { quantityX100: true, unitCost: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function getPurchaseOrder(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      lines: { orderBy: { position: "asc" }, include: { part: { select: { sku: true, name: true, brand: true, unit: true, stockX100: true } } } },
      receipts: { orderBy: { receivedAt: "desc" }, select: { id: true, number: true, receivedAt: true } },
      invoices: { select: { id: true, number: true, totalTtc: true, status: true } },
    },
  });
}

/** Storekeeper request (or admin order). Admin-created orders are approved immediately. */
export async function createPurchaseOrder(
  input: { supplierId: string; notes?: string; expectedAt?: Date; lines: PurchaseLineInput[] },
  actor: StaffUser,
) {
  if (input.lines.length === 0) throw new AppError("noLinesPurchase", {}, 422);
  return prisma.$transaction(async (tx) => {
    const parts = await tx.part.findMany({ where: { id: { in: input.lines.map((l) => l.partId) } }, select: { id: true, costPrice: true } });
    const cost = new Map(parts.map((p) => [p.id, p.costPrice]));
    if (parts.length !== new Set(input.lines.map((l) => l.partId)).size) throw new AppError("invalid");

    const autoApprove = can(actor, "approvePurchase");
    const number = await nextNumber(tx, "BC");
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: input.supplierId,
        notes: input.notes,
        expectedAt: input.expectedAt,
        requestedById: actor.id,
        status: autoApprove ? "APPROVED" : "PENDING_APPROVAL",
        ...(autoApprove ? { approvedById: actor.id, approvedAt: new Date() } : {}),
        lines: {
          create: input.lines.map((l, i) => ({
            partId: l.partId,
            quantityX100: l.quantityX100,
            unitCost: l.unitCost ?? cost.get(l.partId) ?? 0,
            position: i,
          })),
        },
      },
      select: { id: true, status: true, lines: { select: { partId: true, quantityX100: true, unitCost: true } } },
    });
    await audit(tx, actor, "purchaseOrder.create", "PurchaseOrder", po.id, {
      after: { number, supplierId: input.supplierId, status: po.status, expectedAt: input.expectedAt ?? null, lines: po.lines },
    });
    return { id: po.id };
  });
}

async function loadPo(tx: Tx, id: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, select: { id: true, number: true, status: true } });
  if (!po) throw new AppError("notFound", {}, 404);
  return po;
}

export async function approvePurchaseOrder(id: string, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const po = await loadPo(tx, id);
    if (po.status !== "PENDING_APPROVAL") throw new AppError("poNotEditable", {}, 409);
    await tx.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), rejectionReason: null } });
    await audit(tx, actor, "purchaseOrder.approve", "PurchaseOrder", id, { before: { number: po.number, status: po.status }, after: { status: "APPROVED" } });
  });
}

export async function rejectPurchaseOrder(id: string, reason: string, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const po = await loadPo(tx, id);
    if (po.status !== "PENDING_APPROVAL") throw new AppError("poNotEditable", {}, 409);
    await tx.purchaseOrder.update({ where: { id }, data: { status: "REJECTED", approvedById: actor.id, approvedAt: new Date(), rejectionReason: reason } });
    await audit(tx, actor, "purchaseOrder.reject", "PurchaseOrder", id, { before: { number: po.number, status: po.status }, after: { status: "REJECTED", reason } });
  });
}

export async function cancelPurchaseOrder(id: string, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const po = await loadPo(tx, id);
    if (po.status !== "PENDING_APPROVAL" && po.status !== "APPROVED") throw new AppError("poNotEditable", {}, 409);
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "purchaseOrder.cancel", "PurchaseOrder", id, { before: { number: po.number, status: po.status }, after: { status: "CANCELLED" } });
  });
}

/** Lines to pre-fill a request: every part at or under its alert level, ordered up to 2× the minimum. */
export async function lowStockSuggestions() {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, stockX100: true, minStockX100: true, costPrice: true, defaultSupplierId: true },
    orderBy: { name: "asc" },
  });
  return parts
    .filter((p) => p.stockX100 <= p.minStockX100)
    .map((p) => ({
      partId: p.id,
      quantityX100: Math.max(100, Math.ceil((p.minStockX100 * 2 - p.stockX100) / 100) * 100),
      unitCost: p.costPrice,
      supplierId: p.defaultSupplierId,
    }));
}

// ── Goods receipts (bons de réception) ───────────────────────────────────────

export async function listReceipts() {
  return prisma.goodsReceipt.findMany({
    include: {
      supplier: { select: { name: true } },
      purchaseOrder: { select: { id: true, number: true } },
      receivedBy: { select: { name: true } },
      lines: { select: { quantityX100: true, unitCost: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 300,
  });
}

export async function getReceipt(id: string) {
  return prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true } },
      receivedBy: { select: { name: true } },
      lines: { include: { part: { select: { sku: true, name: true, brand: true, unit: true } } } },
    },
  });
}

/**
 * Receives goods: every line enters stock (movement GOODS_RECEIPT), the part's
 * purchase price is updated, and the linked order moves to PARTIAL / RECEIVED.
 * An order must be approved by the admin before anything can be received on it.
 */
export async function createReceipt(
  input: { supplierId: string; purchaseOrderId?: string; deliveryNoteRef?: string; notes?: string; lines: PurchaseLineInput[] },
  actor: StaffUser,
) {
  const lines = input.lines.filter((l) => l.quantityX100 > 0);
  if (lines.length === 0) throw new AppError("noLinesPurchase", {}, 422);

  return prisma.$transaction(async (tx) => {
    let poLines: { id: string; partId: string; quantityX100: number; receivedX100: number; unitCost: number }[] = [];
    let supplierId = input.supplierId;

    if (input.purchaseOrderId) {
      const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { lines: true } });
      if (!po) throw new AppError("notFound", {}, 404);
      if (po.status !== "APPROVED" && po.status !== "PARTIAL") throw new AppError("poNotApproved", {}, 409);
      supplierId = po.supplierId;
      poLines = po.lines;
      // Totals per part: two lines for the same part cannot exceed what is still due on the order.
      const perPart = new Map<string, number>();
      for (const l of lines) perPart.set(l.partId, (perPart.get(l.partId) ?? 0) + l.quantityX100);
      for (const [partId, qty] of perPart) {
        const pl = poLines.find((p) => p.partId === partId);
        if (!pl || qty > pl.quantityX100 - pl.receivedX100) throw new AppError("overReceive", {}, 422);
      }
    }

    const number = await nextNumber(tx, "BR");
    const receipt = await tx.goodsReceipt.create({
      data: {
        number,
        supplierId,
        purchaseOrderId: input.purchaseOrderId,
        deliveryNoteRef: input.deliveryNoteRef,
        notes: input.notes,
        receivedById: actor.id,
      },
      select: { id: true },
    });

    const audited: { partId: string; quantityX100: number; unitCost: number; stockX100: number }[] = [];
    for (const l of lines) {
      const pl = poLines.find((p) => p.partId === l.partId);
      const unitCost = l.unitCost ?? pl?.unitCost ?? 0;
      await tx.goodsReceiptLine.create({ data: { receiptId: receipt.id, partId: l.partId, quantityX100: l.quantityX100, unitCost } });
      const part = await tx.part.update({
        where: { id: l.partId },
        data: { stockX100: { increment: l.quantityX100 }, ...(unitCost > 0 ? { costPrice: unitCost } : {}), defaultSupplierId: supplierId },
        select: { stockX100: true },
      });
      audited.push({ partId: l.partId, quantityX100: l.quantityX100, unitCost, stockX100: part.stockX100 });
      await tx.stockMovement.create({
        data: { partId: l.partId, deltaX100: l.quantityX100, reason: "GOODS_RECEIPT", receiptId: receipt.id, actorId: actor.id },
      });
      if (pl) await tx.purchaseOrderLine.update({ where: { id: pl.id }, data: { receivedX100: { increment: l.quantityX100 } } });
    }

    // V16 Lot 3 (audit n° 13): the parts the workshop was waiting for are received for their orders.
    const perPartIn = new Map<string, number>();
    for (const l of lines) perPartIn.set(l.partId, (perPartIn.get(l.partId) ?? 0) + l.quantityX100);
    for (const [partId, quantityX100] of perPartIn) {
      await receivePartNeedsTx(tx, actor, { partId, quantityX100, purchaseOrderId: input.purchaseOrderId ?? null, receiptNumber: number });
    }

    if (input.purchaseOrderId) {
      const updated = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: input.purchaseOrderId } });
      const complete = updated.every((l) => l.receivedX100 >= l.quantityX100);
      await tx.purchaseOrder.update({ where: { id: input.purchaseOrderId }, data: { status: complete ? "RECEIVED" : "PARTIAL" } });
    }
    // One journal line for the whole receipt; the stock of each part after entry is in "lines".
    await audit(tx, actor, "receipt.create", "GoodsReceipt", receipt.id, {
      after: { number, supplierId, purchaseOrderId: input.purchaseOrderId ?? null, deliveryNoteRef: input.deliveryNoteRef ?? null, lines: audited },
    });
    return receipt;
  });
}

// ── Supplier invoices ────────────────────────────────────────────────────────

export async function listSupplierInvoices(filter: "all" | "unpaid" | "overdue", supplierId?: string) {
  const today = new Date(new Date().toDateString());
  return prisma.supplierInvoice.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      ...(filter === "unpaid" ? { status: { not: "PAID" } } : {}),
      ...(filter === "overdue" ? { status: { not: "PAID" }, dueDate: { lt: today } } : {}),
    },
    include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, number: true } } },
    orderBy: [{ dueDate: "asc" }, { issuedAt: "desc" }],
    take: 300,
  });
}

export async function getSupplierInvoice(id: string) {
  return prisma.supplierInvoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchaseOrder: { select: { id: true, number: true } },
      payments: { orderBy: { paidAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
}

export async function createSupplierInvoice(
  input: {
    supplierId: string;
    purchaseOrderId?: string;
    number: string;
    issuedAt: Date;
    dueDate?: Date;
    totalHt: number;
    totalTax: number;
    notes?: string;
  },
  actor: StaffUser,
) {
  return prisma.$transaction(async (tx) => {
    const data = { ...input, totalTtc: input.totalHt + input.totalTax };
    const inv = await tx.supplierInvoice.create({ data, select: { id: true } });
    await audit(tx, actor, "supplierInvoice.create", "SupplierInvoice", inv.id, { after: data });
    return inv;
  });
}

export async function paySupplierInvoice(id: string, input: { amount: number; method: PaymentMethod; reference?: string }, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    // Row lock (see recordPayment): concurrent payments are applied one after the other.
    await tx.$queryRaw`SELECT id FROM "SupplierInvoice" WHERE id = ${id} FOR UPDATE`;
    const inv = await tx.supplierInvoice.findUnique({ where: { id }, select: { number: true, totalTtc: true, paidAmount: true, status: true } });
    if (!inv) throw new AppError("notFound", {}, 404);
    if (input.amount > inv.totalTtc - inv.paidAmount) throw new AppError("overpaid", {}, 422);
    const paidAmount = inv.paidAmount + input.amount;
    const status: SupplierInvoiceStatus = paidAmount >= inv.totalTtc ? "PAID" : "PARTIAL";
    // Explicit columns: the shared payment form also sends "payer" (customer invoices only).
    const payment = await tx.supplierPayment.create({
      data: { supplierInvoiceId: id, amount: input.amount, method: input.method, reference: input.reference, actorId: actor.id },
      select: { id: true },
    });
    await tx.supplierInvoice.update({ where: { id }, data: { paidAmount, status } });
    await audit(tx, actor, "supplierPayment.record", "SupplierPayment", payment.id, {
      before: { invoice: inv.number, paidAmount: inv.paidAmount, status: inv.status },
      after: { invoice: inv.number, amount: input.amount, method: input.method, reference: input.reference ?? null, paidAmount, status },
    });
  });
}

export async function purchasingSummary() {
  const today = new Date(new Date().toDateString());
  const [pendingApprovals, openOrders, unpaid] = await Promise.all([
    prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["APPROVED", "PARTIAL"] } } }),
    prisma.supplierInvoice.findMany({ where: { status: { not: "PAID" } }, select: { totalTtc: true, paidAmount: true, dueDate: true } }),
  ]);
  return {
    pendingApprovals,
    openOrders,
    supplierDue: unpaid.reduce((s, i) => s + i.totalTtc - i.paidAmount, 0),
    supplierOverdue: unpaid.filter((i) => i.dueDate && i.dueDate < today).length,
  };
}
