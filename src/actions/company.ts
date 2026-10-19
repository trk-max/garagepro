"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { companyLoginSchema, companyUserSchema, formToObject, id } from "@/lib/validators";
import { authenticateCompanyUser, createCompanyUser, updateCompanyUser } from "@/server/company-portal";
import { endCompanySession, startCompanySession } from "@/server/company-session";
import { clientIp } from "@/server/portal-session";
import { z } from "zod";

export async function companyLoginAction(form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const v = companyLoginSchema.parse(formToObject(form));
    const user = await authenticateCompanyUser(v.email, v.password, await clientIp());
    await startCompanySession(user);
    return { ok: true, data: { redirectTo: "/entreprise" } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function companyLogoutAction(): Promise<void> {
  await endCompanySession();
  redirect("/entreprise/connexion");
}

// ── Staff side ───────────────────────────────────────────────────────────────

export async function createCompanyUserAction(customerId: string, form: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageCompanyAccess");
    await createCompanyUser(actor, id.parse(customerId), companyUserSchema.parse(formToObject(form)));
    revalidatePath(`/garage/customers/${customerId}`);
    const { t } = await getI18n();
    return { ok: true, data: { message: t.v7.company.created } };
  } catch (error) {
    return toActionError(error);
  }
}

const updateSchema = z.object({
  isActive: z.enum(["true", "false"]).optional(),
  role: z.enum(["FLEET_ADMIN", "MANAGER", "VIEWER"]).optional(),
  password: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(10).max(200).optional()),
});

export async function updateCompanyUserAction(companyUserId: string, customerId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageCompanyAccess");
    const v = updateSchema.parse(formToObject(form));
    await updateCompanyUser(actor, id.parse(companyUserId), { isActive: v.isActive === undefined ? undefined : v.isActive === "true", role: v.role, password: v.password });
    revalidatePath(`/garage/customers/${customerId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
