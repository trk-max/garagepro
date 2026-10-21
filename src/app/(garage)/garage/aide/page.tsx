import { redirect } from "next/navigation";
import { HelpGuide } from "@/components/garage/help-guide";
import { helpAr } from "@/lib/i18n/help-ar";
import { helpEn } from "@/lib/i18n/help-en";
import { helpFr } from "@/lib/i18n/help-fr";
import { getLang } from "@/lib/i18n/server";
import { getStaff } from "@/lib/session";

const HELP = { fr: helpFr, en: helpEn, ar: helpAr };

/**
 * V10.4 — "Aide": guide of every module, open to every team member (account menu).
 * Only the reader's language is sent to the browser; the search filters on the client.
 */
export default async function HelpPage() {
  if (!(await getStaff())) redirect("/login");
  const lang = await getLang();
  return <HelpGuide help={HELP[lang]} />;
}
