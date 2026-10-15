"use client";

import { ClaimCategory } from "@prisma/client";
import { submitClaimAction } from "@/actions/portal";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

/** Complaint form. From the tracker, name/phone/plate come pre-filled from the work order. */
export function ClaimForm({ fromTracker = false, defaults }: { fromTracker?: boolean; defaults?: { name?: string; plate?: string } }) {
  const { t } = useI18n();
  const c = t.claims;
  const field = "block space-y-1.5";
  const label = "f-label text-muted-foreground";

  return (
    <ActionForm action={submitClaimAction} silent className="space-y-4">
      {fromTracker && <input type="hidden" name="fromTracker" value="1" />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className={label}>{t.common.name}</span>
          <Input name="name" required maxLength={80} autoComplete="name" defaultValue={defaults?.name} />
        </label>
        <label className={field}>
          <span className={label}>{t.common.phone}</span>
          <Input name="phone" type="tel" required inputMode="tel" dir="ltr" placeholder="+216 …" autoComplete="tel" />
        </label>
        <label className={field}>
          <span className={label}>{`${t.common.email} (${t.common.optional})`}</span>
          <Input name="email" type="email" dir="ltr" autoComplete="email" />
        </label>
        <label className={field}>
          <span className={label}>{t.portal.plate}</span>
          <Input name="plate" maxLength={20} dir="ltr" className="uppercase" placeholder={t.customers.platePlaceholder} defaultValue={defaults?.plate} />
        </label>
      </div>
      <label className={field}>
        <span className={label}>{c.category}</span>
        <NativeSelect name="category" defaultValue="QUALITY" required>
          {Object.values(ClaimCategory).map((k) => (
            <option key={k} value={k}>
              {c.categories[k]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className={field}>
        <span className={label}>{c.message}</span>
        <Textarea name="message" required minLength={10} maxLength={2000} rows={5} placeholder={c.messagePlaceholder} />
      </label>
      <Button type="submit" variant="outline" className="h-12 w-full hover:border-brand-500 hover:text-brand-500">
        {c.submit}
      </Button>
    </ActionForm>
  );
}
