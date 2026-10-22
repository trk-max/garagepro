"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission, requireStaff } from "@/lib/session";
import { GOAL_KINDS, SKILL_LEVELS } from "@/lib/skills";
import {
  ackWarnings,
  addGoal,
  assignWithSkills,
  closeGoal,
  closeReview,
  createStarterSkills,
  requestReview,
  saveSkill,
  saveSkillSettings,
  setLevel,
  setOrderSkills,
  voidCertificate,
} from "@/server/skills";

/** Ids: cuid, or the deterministic "sk_…" / "sr_goal_…" ids of this feature. */
const anyId = z.string().min(1).max(80).regex(/^[\w-]+$/);
const optId = z.preprocess((v) => (v === "" || v == null ? null : v), anyId.nullable());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : String(v)), z.string().trim().max(max));
const day = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const list = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);

const refresh = (...paths: string[]) => {
  revalidatePath("/garage/competences");
  for (const p of paths) revalidatePath(p);
};

// ── Levels, goals, certificates, reviews ─────────────────────────────────────

export async function setLevelAction(userId: string, form: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageSkills");
    const input = z.object({ skillId: anyId, level: z.enum(SKILL_LEVELS), reason: text(500) }).parse({ skillId: form.get("skillId"), level: form.get("level"), reason: form.get("reason") });
    const r = await setLevel(actor, anyId.parse(userId), input.skillId, input.level, input.reason);
    const { t } = await getI18n();
    refresh(`/garage/competences/${userId}`);
    return { ok: true, data: { message: r.changed ? t.v14.sheet.levelSaved : t.v14.sheet.unchanged } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addGoalAction(userId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    const input = z
      .object({ skillId: anyId, kind: z.enum(GOAL_KINDS), target: z.coerce.number().int().min(1).max(500), sinceDay: day, note: text(300) })
      .parse({ skillId: form.get("skillId"), kind: form.get("kind"), target: form.get("target"), sinceDay: form.get("since"), note: form.get("note") });
    await addGoal(actor, anyId.parse(userId), input);
    refresh(`/garage/competences/${userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function closeGoalAction(goalId: string, userId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    await closeGoal(actor, anyId.parse(goalId));
    refresh(`/garage/competences/${userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidCertificateAction(certId: string, userId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    await voidCertificate(actor, anyId.parse(certId), text(500).parse(reason));
    refresh(`/garage/competences/${userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** The employee himself asks for a re-evaluation (message to the managers, À traiter). */
export async function requestReviewAction(form: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requireStaff();
    const input = z.object({ skillId: optId, message: text(500) }).parse({ skillId: form.get("skillId"), message: form.get("message") });
    await requestReview(actor, input);
    const { t } = await getI18n();
    refresh(`/garage/competences/${actor.id}`, "/garage/competences/moi");
    return { ok: true, data: { message: t.v14.sheet.sent } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function closeReviewAction(id: string, userId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    await closeReview(actor, anyId.parse(id), text(300).parse(form.get("note")));
    refresh(`/garage/competences/${userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Catalogue & settings ─────────────────────────────────────────────────────

export async function saveSkillAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    const input = z
      .object({
        id: optId,
        code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,30}$/),
        nameFr: z.string().trim().min(2).max(80),
        nameAr: text(80),
        nameEn: text(80),
        description: text(500),
        publicLabelFr: text(120),
        publicLabelAr: text(120),
        publicLabelEn: text(120),
        position: z.coerce.number().int().min(0).max(10_000),
      })
      .parse(Object.fromEntries(["id", "code", "nameFr", "nameAr", "nameEn", "description", "publicLabelFr", "publicLabelAr", "publicLabelEn", "position"].map((k) => [k, form.get(k) ?? ""])));
    await saveSkill(actor, {
      ...input,
      keywords: list(form.get("keywords")),
      packageIds: form.getAll("packageIds").map(String).filter((p) => anyId.safeParse(p).success),
      supervisionRequired: form.get("supervisionRequired") === "on",
      habilitationRequired: form.get("habilitationRequired") === "on",
      isActive: form.get("isActive") === "on",
    });
    refresh("/garage/competences/reglages");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function starterSkillsAction(): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageSkills");
    const n = await createStarterSkills(actor);
    const { t } = await getI18n();
    refresh("/garage/competences/reglages");
    return { ok: true, data: { message: fmt(t.v14.settings.starterDone, { n }) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveSkillSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    await saveSkillSettings(actor, {
      certReminderDays: z.coerce.number().int().min(0).max(365).parse(form.get("certReminderDays")),
      supervisorVerifies: form.get("supervisorVerifies") === "on",
      publicLabels: form.get("publicLabels") === "on",
    });
    refresh("/garage/competences/reglages");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Assisted assignment (work order page, mobile workshop) ───────────────────

const refreshOrder = (workOrderId: string) => {
  revalidatePath(`/garage/work-orders/${workOrderId}`);
  revalidatePath("/garage/atelier");
  revalidatePath("/garage/competences");
};

export async function assignSkillsAction(workOrderId: string, form: FormData): Promise<ActionResult<{ message?: string; warning?: string }>> {
  try {
    // Same permission as the existing assignment select; the habilitation rule is checked on the server.
    const actor = await requirePermission("viewWorkOrders");
    const input = z
      .object({ mechanicId: optId, supervisorId: optId, overrideReason: text(500) })
      .parse({ mechanicId: form.get("mechanicId"), supervisorId: form.get("supervisorId"), overrideReason: form.get("overrideReason") });
    const r = await assignWithSkills(actor, anyId.parse(workOrderId), { ...input, overrideReason: input.overrideReason || null });
    const { t } = await getI18n();
    refreshOrder(workOrderId);
    return { ok: true, data: r.warnings.length ? { warning: fmt(t.v14.assign.assignedWarn, { n: r.warnings.length }) } : { message: t.v14.assign.assigned } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function orderSkillsAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const ids = form.getAll("skillIds").map(String).filter((s) => anyId.safeParse(s).success);
    await setOrderSkills(actor, anyId.parse(workOrderId), ids);
    refreshOrder(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Back to the skills deduced from the packages / lines. */
export async function resetOrderSkillsAction(workOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    await setOrderSkills(actor, anyId.parse(workOrderId), null);
    refreshOrder(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function ackWarningsAction(workOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSkills");
    await ackWarnings(actor, anyId.parse(workOrderId));
    refreshOrder(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
