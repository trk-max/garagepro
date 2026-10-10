-- Performance: indexes on foreign keys used in WHERE clauses (customer page,
-- supplier pages, stock history, receipts). Read-only for existing data:
-- nothing is dropped or modified. IF NOT EXISTS makes it safe to re-run.

CREATE INDEX IF NOT EXISTS "WorkOrder_customerId_createdAt_idx" ON "WorkOrder"("customerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX IF NOT EXISTS "StockMovement_workOrderId_idx" ON "StockMovement"("workOrderId");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_supplierId_idx" ON "GoodsReceipt"("supplierId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptLine_receiptId_idx" ON "GoodsReceiptLine"("receiptId");
CREATE INDEX IF NOT EXISTS "SupplierPayment_supplierInvoiceId_idx" ON "SupplierPayment"("supplierInvoiceId");
CREATE INDEX IF NOT EXISTS "Appointment_customerId_idx" ON "Appointment"("customerId");
