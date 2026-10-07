import "server-only";
import { cookies } from "next/headers";
import type { Lang } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";
import { fr, type Dictionary } from "@/lib/i18n/fr";

export const LANG_COOKIE = "lang";
const DICTIONARIES: Record<Lang, Dictionary> = { fr, ar };

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === "ar" ? "ar" : "fr";
}

export async function getI18n() {
  const lang = await getLang();
  return { lang, dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const), t: DICTIONARIES[lang] };
}
