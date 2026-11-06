DO $$ BEGIN
  CREATE TYPE "QualityCategory" AS ENUM (
    'BRAKES',
    'ENGINE',
    'TIMING',
    'CLUTCH_GEARBOX',
    'ELECTRICAL_DIAGNOSTICS',
    'AIR_CONDITIONING',
    'SUSPENSION_STEERING',
    'TIRES_GEOMETRY',
    'BODYWORK',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "workflowLineQuality" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrder"
  ALTER COLUMN "workflowLineQuality" SET DEFAULT true;

ALTER TABLE "WorkOrderLine"
  ADD COLUMN IF NOT EXISTS "qualityCategory" "QualityCategory" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "Part"
  ADD COLUMN IF NOT EXISTS "qualityCategory" "QualityCategory";

ALTER TABLE "QualityCheck"
  ADD COLUMN IF NOT EXISTS "lineChecks" JSONB NOT NULL DEFAULT '{}';
