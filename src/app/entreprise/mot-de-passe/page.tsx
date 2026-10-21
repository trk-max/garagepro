import Link from "next/link";
import { redirect } from "next/navigation";
import { CompanyForgotForm } from "@/components/team/company-reset-forms";
import { getI18n } from "@/lib/i18n/server";
import { getCompanyViewer } from "@/server/company-session";

export default async function CompanyForgotPage() {
  if (await getCompanyViewer()) redirect("/entreprise");
  const { t } = await getI18n();
  const c = t.v7.company;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="f-display text-2xl">{c.forgotTitle}</h1>
      <p className="text-sm text-muted-foreground">{c.forgotIntro}</p>
      <CompanyForgotForm />
      <Link href="/entreprise/connexion" className="block text-sm underline-offset-4 hover:underline">
        {c.backToLogin}
      </Link>
    </div>
  );
}
