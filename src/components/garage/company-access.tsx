import { createCompanyUserAction, updateCompanyUserAction } from "@/actions/company";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";
import { listCompanyUsers } from "@/server/company-portal";

const ROLES = ["FLEET_ADMIN", "MANAGER", "VIEWER"] as const;

/** Staff: the customer's accounts on the company portal (/entreprise). */
export async function CompanyAccess({ customerId, t, lang }: { customerId: string; t: Dictionary; lang: Lang }) {
  const users = await listCompanyUsers(customerId);
  const c = t.v7.company;
  return (
    <Card className="h-fit">
      <CardTitle>{c.staffTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{c.staffIntro}</p>
      <ul className="mb-4 space-y-3">
        {users.map((u) => (
          <li key={u.id} className={cn("border p-3 text-sm", !u.isActive && "opacity-60")}>
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {u.email}
            </p>
            <p className="text-xs text-muted-foreground">
              {c.lastLogin} : {u.lastLoginAt ? formatDateTime(u.lastLoginAt, lang) : c.never}
            </p>
            <ActionForm action={updateCompanyUserAction.bind(null, u.id, customerId)} className="mt-2 grid gap-2">
              <NativeSelect name="role" defaultValue={u.role} aria-label={c.status}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {c.roles[r]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="isActive" defaultValue={String(u.isActive)} aria-label={c.status}>
                <option value="true">{c.enable}</option>
                <option value="false">{c.disable}</option>
              </NativeSelect>
              <Input type="password" name="password" minLength={10} placeholder={c.resetPassword} autoComplete="new-password" />
              <Button type="submit" size="sm" variant="outline">
                {t.common.save}
              </Button>
            </ActionForm>
          </li>
        ))}
      </ul>
      <ActionForm action={createCompanyUserAction.bind(null, customerId)} className="grid gap-2">
        <Field label={c.name}>
          <Input name="name" required minLength={2} maxLength={120} />
        </Field>
        <Field label={c.email}>
          <Input type="email" name="email" required maxLength={200} dir="ltr" />
        </Field>
        <Field label={c.status}>
          <NativeSelect name="role" defaultValue="VIEWER">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {c.roles[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={c.tempPassword}>
          <Input type="password" name="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Button type="submit">{c.createAccount}</Button>
      </ActionForm>
    </Card>
  );
}
