-- A1 — tie each received quantity to the purchase-order line it fulfils.
-- Additive and safe to replay. Historical rows are linked only when the part
-- identifies exactly one line on the receipt's purchase order.
ALTER TABLE "GoodsReceiptLine"
  ADD COLUMN IF NOT EXISTS "purchaseOrderLineId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"GoodsReceiptLine"'::regclass
      AND conname = 'GoodsReceiptLine_purchaseOrderLineId_fkey'
  ) THEN
    ALTER TABLE "GoodsReceiptLine"
      ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey"
      FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GoodsReceiptLine_purchaseOrderLineId_idx"
  ON "GoodsReceiptLine"("purchaseOrderLineId");

WITH unique_matches AS (
  SELECT gl.id, MIN(pol.id) AS "purchaseOrderLineId"
  FROM "GoodsReceiptLine" gl
  JOIN "GoodsReceipt" r ON r.id = gl."receiptId"
  JOIN "PurchaseOrderLine" pol
    ON pol."purchaseOrderId" = r."purchaseOrderId"
   AND pol."partId" = gl."partId"
  WHERE gl."purchaseOrderLineId" IS NULL
  GROUP BY gl.id
  HAVING COUNT(pol.id) = 1
)
UPDATE "GoodsReceiptLine" gl
SET "purchaseOrderLineId" = m."purchaseOrderLineId"
FROM unique_matches m
WHERE gl.id = m.id;

-- Repair historical counters only when every received row has an explicit,
-- unambiguous line association. Ambiguous duplicate-part receipts are preserved.
UPDATE "PurchaseOrderLine" pol
SET "receivedX100" = COALESCE((
  SELECT SUM(gl."quantityX100")
  FROM "GoodsReceiptLine" gl
  WHERE gl."purchaseOrderLineId" = pol.id
), 0)::INTEGER
WHERE pol."receivedX100" IS DISTINCT FROM COALESCE((
  SELECT SUM(gl."quantityX100")
  FROM "GoodsReceiptLine" gl
  WHERE gl."purchaseOrderLineId" = pol.id
), 0)::INTEGER
AND NOT EXISTS (
  SELECT 1
  FROM "GoodsReceiptLine" gl
  JOIN "GoodsReceipt" r ON r.id = gl."receiptId"
  WHERE r."purchaseOrderId" = pol."purchaseOrderId"
    AND gl."partId" = pol."partId"
    AND gl."purchaseOrderLineId" IS NULL
);
