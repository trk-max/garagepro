"use client";

import { companyLoginAction } from "@/actions/company";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

export function CompanyLoginForm() {
  const { t } = useI18n();
  const c = t.v7.company;
  return (
    <ActionForm action={companyLoginAction} silent reset={false} className="space-y-3">
      <Field label={c.email}>
        <Input type="email" name="email" required autoComplete="username" dir="ltr" />
      </Field>
      <Field label={c.password}>
        <Input type="password" name="password" required autoComplete="current-password" />
      </Field>
      <Button type="submit" className="w-full">
        {c.signIn}
      </Button>
    </ActionForm>
  );
}
