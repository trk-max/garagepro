"use client";

import type React from "react";
import { portalLoginAction } from "@/actions/portal";
import { ActionForm } from "@/components/action-form";
import { displayPlate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { useAppBase } from "@/lib/app-base";

/** Plate + 4-digit code, in the app's dark rounded fields (label inside the box) and the orange pill. */
export function PortalLoginForm({ defaultPlate }: { defaultPlate: string }) {
  const { t } = useI18n();
  const base = useAppBase();
  return (
    <ActionForm action={portalLoginAction} reset={false} silent className="mt-6 space-y-3">
      {base && <input type="hidden" name="from" value="app" />}
      <label className="phone-field">
        <span className="phone-kicker">{t.portal.plate}</span>
        <input
          name="plate"
          required
          defaultValue={defaultPlate ? displayPlate(defaultPlate) : ""}
          placeholder={t.customers.platePlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          dir="ltr"
          className="uppercase"
        />
      </label>
      <label className="phone-field">
        <span className="phone-kicker">{t.portal.pin}</span>
        <input
          name="pin"
          required
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="one-time-code"
          placeholder="••••"
          dir="ltr"
          // Dots like the mock-up, without the password manager offering to save a "password".
          style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
          className="tracking-[0.4em]"
        />
      </label>
      <button type="submit" className="phone-pill mt-3 w-full text-base" data-testid="portal-login-submit">
        {t.portal.loginSubmit}
      </button>
    </ActionForm>
  );
}
