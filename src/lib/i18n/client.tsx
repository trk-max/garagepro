"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

type I18nValue = { lang: Lang; t: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ lang, t, children }: I18nValue & { children: ReactNode }) {
  return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
