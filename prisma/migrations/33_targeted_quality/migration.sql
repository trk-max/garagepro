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

ALTER TABLE "WorkOrder"
  ADD COLUMN "workflowLineQuality" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrder"
  ALTER COLUMN "workflowLineQuality" SET DEFAULT true;

ALTER TABLE "WorkOrderLine"
  ADD COLUMN "qualityCategory" "QualityCategory" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "Part"
  ADD COLUMN "qualityCategory" "QualityCategory";

ALTER TABLE "QualityCheck"
  ADD COLUMN "lineChecks" JSONB NOT NULL DEFAULT '{}';
