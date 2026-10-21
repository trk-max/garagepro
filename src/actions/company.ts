"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getBaseUrl } from "@/lib/base-url";
import { fmt } from "@/lib/format";
import { AppError } from "@/lib/http";
import { toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { companyForgotSchema, companyLoginSchema, companyResetSchema, companyUserSchema, formToObject, id } from "@/lib/validators";
import { authenticateCompanyUser, createCompanyUser, updateCompanyUser } from "@/server/company-portal";
import { endCompanySession, startCompanySession } from "@/server/company-session";
import { prepareCompanyPasswordReset, resetCompanyPassword } from "@/server/company-password";
import { sendEmail } from "@/server/email";
import { getSettings } from "@/server/settings";
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

/**
 * "Mot de passe oublié", step 1. Always the same answer, whether the account
 * exists or not; the e-mail is sent after the response (after()), so the
 * response time does not tell either.
 */
export async function companyForgotPasswordAction(form: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const v = companyForgotSchema.parse(formToObject(form));
    const { t } = await getI18n();
    const reset = await prepareCompanyPasswordReset(v.email, await clientIp());
    if (reset) {
      const [base, settings] = await Promise.all([getBaseUrl(), getSettings()]);
      const c = t.v7.company;
      const link = `${base}/entreprise/mot-de-passe/nouveau?token=${encodeURIComponent(reset.token)}`;
      after(async () => {
        await sendEmail({
          to: reset.email,
          brand: settings.garageName,
          subject: fmt(c.resetSubject, { garage: settings.garageName }),
          text: fmt(c.resetBody, { name: reset.name, company: reset.companyName, link }),
        });
      });
    }
    return { ok: true, data: { message: t.v7.company.linkSent } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Step 2: new password from the e-mailed link, then signed in. */
export async function companyResetPasswordAction(form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const v = companyResetSchema.parse(formToObject(form));
    if (v.password !== v.confirm) throw new AppError("passwordMismatch", {}, 422);
    const user = await resetCompanyPassword(v.token, v.password, await clientIp());
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
