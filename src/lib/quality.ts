import type { QualityCategory } from "@prisma/client";
import type { QualityPoint } from "@/lib/lot5";

export const QUALITY_POINT_CATEGORIES = [
  "BRAKES",
  "ENGINE",
  "TIMING",
  "CLUTCH_GEARBOX",
  "ELECTRICAL_DIAGNOSTICS",
  "AIR_CONDITIONING",
  "SUSPENSION_STEERING",
  "TIRES_GEOMETRY",
  "BODYWORK",
  "OTHER",
] as const satisfies readonly QualityCategory[];

export const QUALITY_CATEGORIES = QUALITY_POINT_CATEGORIES;

export function qualityMode(workflowLineQuality: boolean): "TARGETED" | "LEGACY" {
  return workflowLineQuality ? "TARGETED" : "LEGACY";
}

const SKILL_CATEGORIES: Record<string, QualityCategory> = {
  BRAKES: "BRAKES",
  OIL: "ENGINE",
  ENGINE: "ENGINE",
  INJECTION: "ENGINE",
  TIMING: "TIMING",
  CLUTCH: "CLUTCH_GEARBOX",
  DIAG: "ELECTRICAL_DIAGNOSTICS",
  HV: "ELECTRICAL_DIAGNOSTICS",
  AC: "AIR_CONDITIONING",
  SUSPENSION: "SUSPENSION_STEERING",
  STEERING: "SUSPENSION_STEERING",
  BODY: "BODYWORK",
  TYRES: "TIRES_GEOMETRY",
};

export function qualityCategoryForSkillCode(code: string): QualityCategory {
  return SKILL_CATEGORIES[code.toUpperCase()] ?? "OTHER";
}

export type QualityLine = {
  id: string;
  description: string;
  type: "LABOR" | "PART";
  qualityCategory: QualityCategory;
  voidedAt: Date | null;
  approvalStatus: string;
};

export type QualityLineCheck = {
  label: string;
  type: "LABOR" | "PART";
  category: QualityCategory;
  ok: boolean;
  at: string | null;
  by: string | null;
};

export type QualityLineChecks = Record<string, QualityLineCheck>;

export function activeQualityLines(lines: readonly QualityLine[]) {
  return lines.filter((line) => !line.voidedAt && line.approvalStatus !== "REFUSED");
}

export function qualityCategories(lines: readonly QualityLine[]): Set<QualityCategory> {
  return new Set(activeQualityLines(lines).map((line) => line.qualityCategory));
}

export function qualityPointsForLines(points: readonly QualityPoint[], lines: readonly QualityLine[]) {
  const categories = qualityCategories(lines);
  return points.filter((point) => !point.categories?.length || point.categories.some((category) => categories.has(category)));
}

export function roadTestRequired(lines: readonly QualityLine[]): boolean {
  const categories = qualityCategories(lines);
  return ["BRAKES", "ENGINE", "TIMING", "CLUTCH_GEARBOX", "SUSPENSION_STEERING"].some((category) => categories.has(category as QualityCategory));
}

export function qualityLineChecksComplete(lines: readonly QualityLine[], checks: QualityLineChecks): boolean {
  const active = activeQualityLines(lines);
  return Object.keys(checks).length === active.length && active.every((line) => {
    const check = checks[line.id];
    return !!check && check.label === line.description && check.type === line.type && check.category === line.qualityCategory && check.ok;
  });
}

export function parseQualityLineChecks(raw: unknown): QualityLineChecks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const checks: QualityLineChecks = {};
  for (const [id, rawCheck] of Object.entries(raw as Record<string, unknown>)) {
    if (!rawCheck || typeof rawCheck !== "object" || Array.isArray(rawCheck)) continue;
    const check = rawCheck as Partial<QualityLineCheck>;
    if (
      typeof check.label === "string" &&
      (check.type === "LABOR" || check.type === "PART") &&
      typeof check.category === "string" &&
      ["BRAKES", "ENGINE", "TIMING", "CLUTCH_GEARBOX", "ELECTRICAL_DIAGNOSTICS", "AIR_CONDITIONING", "SUSPENSION_STEERING", "TIRES_GEOMETRY", "BODYWORK", "OTHER"].includes(check.category)
    ) {
      checks[id] = {
        label: check.label,
        type: check.type,
        category: check.category as QualityCategory,
        ok: check.ok === true,
        at: typeof check.at === "string" ? check.at : null,
        by: typeof check.by === "string" ? check.by : null,
      };
    }
  }
  return checks;
}

export function shouldShowIntakePriority(status: string, signed: boolean): boolean {
  return status === "RECEIVED" && !signed;
}

export function qualityCardVisible(status: string): boolean {
  return status === "QUALITY_CONTROL" || status === "WASHING" || status === "READY";
}

export function qualityCardCapabilities(input: { canFill: boolean; canApprove: boolean; approved: boolean; final: boolean }) {
  return {
    canEdit: input.canFill && !input.final,
    canApprove: input.canApprove && !input.approved && !input.final,
    waitingForApproval: input.canFill && !input.canApprove && !input.approved && !input.final,
  };
}

export function legacyQualityComplete(input: {
  roadTest: string | null;
  fluidsOk: boolean;
  warningsOk: boolean;
  toolsRemoved: boolean;
  workVerified: boolean;
  billingVerified: boolean;
}): boolean {
  return input.roadTest !== null && input.fluidsOk && input.warningsOk && input.toolsRemoved && input.workVerified && input.billingVerified;
}

export function targetedQualityComplete(input: {
  lines: readonly QualityLine[];
  lineChecks: QualityLineChecks;
  toolsRemoved: boolean;
  roadTestRequired: boolean;
  roadTest: string | null;
  roadTestKm: number | null;
  extraPoints: Record<string, { label: string; ok: boolean }>;
}) {
  const roadTestComplete =
    !input.roadTestRequired ||
    (input.roadTest === "NOT_NEEDED" ? false : input.roadTest === "DONE" && !!input.roadTestKm && input.roadTestKm >= 1 && input.roadTestKm <= 500);
  return (
    qualityLineChecksComplete(input.lines, input.lineChecks) &&
    input.toolsRemoved &&
    roadTestComplete &&
    Object.values(input.extraPoints).every((point) => point.ok)
  );
}
