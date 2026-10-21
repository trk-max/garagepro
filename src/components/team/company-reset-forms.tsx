"use client";

import { companyForgotPasswordAction, companyResetPasswordAction } from "@/actions/company";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

/** "Mot de passe oublié": asks for the account e-mail. */
export function CompanyForgotForm() {
  const { t } = useI18n();
  const c = t.v7.company;
  return (
    <ActionForm action={companyForgotPasswordAction} className="space-y-3">
      <Field label={c.email}>
        <Input type="email" name="email" required autoComplete="username" dir="ltr" />
      </Field>
      <Button type="submit" className="w-full">
        {c.sendLink}
      </Button>
    </ActionForm>
  );
}

/** New password, from the link received by e-mail. */
export function CompanyResetForm({ token }: { token: string }) {
  const { t } = useI18n();
  const c = t.v7.company;
  return (
    <ActionForm action={companyResetPasswordAction} silent reset={false} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Field label={c.newPassword}>
        <Input type="password" name="password" required minLength={10} maxLength={200} autoComplete="new-password" />
      </Field>
      <Field label={c.confirmPassword}>
        <Input type="password" name="confirm" required minLength={10} maxLength={200} autoComplete="new-password" />
      </Field>
      <Button type="submit" className="w-full">
        {c.setPassword}
      </Button>
    </ActionForm>
  );
}
