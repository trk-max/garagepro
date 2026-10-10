"use client";

import { portalLoginAction } from "@/actions/portal";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayPlate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

export function PortalLoginForm({ defaultPlate }: { defaultPlate: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={portalLoginAction} reset={false} silent className="mt-6 space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t.portal.plate}</span>
        <Input
          name="plate"
          required
          defaultValue={defaultPlate ? displayPlate(defaultPlate) : ""}
          placeholder={t.customers.platePlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          dir="ltr"
          className="h-12 text-center font-mono text-lg uppercase tracking-wider"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t.portal.pin}</span>
        <Input
          name="pin"
          required
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="one-time-code"
          placeholder="••••"
          dir="ltr"
          className="h-12 text-center font-mono text-2xl tracking-[0.6em]"
        />
      </label>
      <Button type="submit" className="h-12 w-full bg-brand-500 text-base hover:bg-brand-600">
        {t.portal.loginSubmit}
      </Button>
    </ActionForm>
  );
}
