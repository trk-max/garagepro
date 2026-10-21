"use server";

import { revalidatePath } from "next/cache";
import { zonedToUtc } from "@/lib/booking";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { wholeDaysSpan } from "@/lib/leaves";
import { requirePermission } from "@/lib/session";
import { validNetworks } from "@/lib/timeclock";
import {
  companyLegalSchema, certificateSchema,
  employeeProfileSchema,
  formToObject,
  id,
  leaveDecisionSchema,
  leaveRequestSchema,
  punchCorrectionSchema,
  punchSchema,
  reasonSchema,
  settingsV7Schema,
} from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { issueCertificate } from "@/server/certificates";
import { cancelLeave, decideLeave, requestLeave } from "@/server/leaves";
import { clientIp } from "@/server/portal-session";
import { getSettings } from "@/server/settings";
import { correctPunch, punch, voidPunch } from "@/server/timeclock";

type Msg = { message?: string };

const tz = async () => (await getSettings()).timezone;
const localToUtc = (value: string, timeZone: string) => {
  const [date, time] = value.split("T") as [string, string];
  return zonedToUtc(date, time, timeZone);
};

export async function punchAction(form: FormData): Promise<ActionResult<Msg>> {
  try {
    const actor = await requirePermission("useTimeClock");
    const input = punchSchema.parse(formToObject(form));
    await punch(actor, input.kind, { code: input.code, ip: await clientIp() });
    revalidatePath("/garage/pointage");
    const { t } = await getI18n();
    return { ok: true, data: { message: t.v7.clock.done } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function requestLeaveAction(form: FormData): Promise<ActionResult<Msg>> {
  try {
    const actor = await requirePermission("useTimeClock");
    const v = leaveRequestSchema.parse(formToObject(form));
    const timeZone = await tz();
    const span =
      v.type === "AUTHORIZATION"
        ? { startAt: zonedToUtc(v.date!, v.from!, timeZone), endAt: zonedToUtc(v.date!, v.to!, timeZone), allDay: false }
        : { ...wholeDaysSpan(v.firstDay!, v.lastDay!, timeZone), allDay: true };
    const leave = await requestLeave(actor, { userId: v.userId, type: v.type, reason: v.reason, ...span });
    revalidatePath("/garage", "layout");
    const { t } = await getI18n();
    return { ok: true, data: { message: leave.status === "APPROVED" ? t.v7.leave.recorded : t.v7.leave.sent } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function decideLeaveAction(leaveId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageTeam");
    const v = leaveDecisionSchema.parse(formToObject(form));
    await decideLeave(actor, id.parse(leaveId), v.decision === "approve", v.note);
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelLeaveAction(leaveId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("useTimeClock");
    await cancelLeave(actor, id.parse(leaveId));
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function correctPunchAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageTeam");
    const v = punchCorrectionSchema.parse(formToObject(form));
    await correctPunch(actor, { userId: v.userId, kind: v.kind, at: localToUtc(v.at, await tz()), reason: v.reason, replaceEventId: v.replaceEventId });
    revalidatePath(`/garage/equipe/${v.userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidPunchAction(eventId: string, userId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageTeam");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await voidPunch(actor, id.parse(eventId), r.data);
    revalidatePath(`/garage/equipe/${userId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateEmployeeProfileAction(userId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageTeam");
    const v = employeeProfileSchema.parse(formToObject(form));
    const uid = id.parse(userId);
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: uid }, select: { jobTitle: true, hireDate: true, nationalId: true, annualLeaveDays: true, contractType: true } });
      if (!before) throw new AppError("notFound", {}, 404);
      const data = {
        jobTitle: v.jobTitle ?? null,
        hireDate: v.hireDate ? new Date(`${v.hireDate}T00:00:00Z`) : null,
        nationalId: v.nationalId?.toUpperCase() ?? null,
        annualLeaveDays: v.annualLeaveDays ?? null,
        contractType: v.contractType ?? null,
      };
      await tx.user.update({ where: { id: uid }, data });
      // The ID number is personal: the journal only says it changed.
      await audit(tx, actor, "employee.profile", "User", uid, {
        before: { jobTitle: before.jobTitle, hireDate: before.hireDate, nationalIdSet: !!before.nationalId, annualLeaveDays: before.annualLeaveDays, contractType: before.contractType },
        after: { jobTitle: data.jobTitle, hireDate: data.hireDate, nationalIdSet: !!data.nationalId, annualLeaveDays: data.annualLeaveDays, contractType: data.contractType },
      });
    });
    revalidatePath(`/garage/equipe/${uid}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function issueCertificateAction(userId: string, form: FormData): Promise<ActionResult<Msg>> {
  try {
    const actor = await requirePermission("issueCertificates");
    const v = certificateSchema.parse(formToObject(form));
    await issueCertificate(actor, id.parse(userId), {
      purpose: v.purpose,
      endDate: v.endDate ? new Date(`${v.endDate}T00:00:00Z`) : null,
      notResigning: v.notResigning,
      recipient: v.recipientName ? { name: v.recipientName, address: v.recipientAddress ?? null } : null,
    });
    revalidatePath(`/garage/equipe/${userId}`);
    const { t } = await getI18n();
    return { ok: true, data: { message: t.v7.team.issued } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSettingsV7Action(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const v = settingsV7Schema.parse(formToObject(form));
    if (v.clockNetworks && !validNetworks(v.clockNetworks)) throw new AppError("invalid", {}, 422);
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { id: "garage" },
        select: {
          clockMode: true,
          clockNetworks: true,
          alertOrderLateHours: true,
          alertPartLateDays: true,
          alertInsuranceDays: true,
        },
      });
      const data = {
        clockMode: v.clockMode,
        clockNetworks: v.clockNetworks ?? null,
        alertOrderLateHours: v.alertOrderLateHours,
        alertPartLateDays: v.alertPartLateDays,
        alertInsuranceDays: v.alertInsuranceDays,
      };
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.v7", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Équipe → Entreprise (attestations de travail): the company's legal identity. */
export async function updateCompanyLegalAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("issueCertificates");
    const v = companyLegalSchema.parse(formToObject(form));
    const data = {
      legalName: v.legalName ?? null,
      legalAddress: v.legalAddress ?? null,
      city: v.city ?? null,
      legalRepName: v.legalRepName ?? null,
      legalRepTitle: v.legalRepTitle ?? null,
      legalCapital: v.legalCapital ?? null,
      registryNumber: v.registryNumber ?? null,
      registryCity: v.registryCity ?? null,
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { id: "garage" },
        select: { legalName: true, legalAddress: true, city: true, legalRepName: true, legalRepTitle: true, legalCapital: true, registryNumber: true, registryCity: true },
      });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.legal", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage/equipe", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
