import Link from "next/link";
import { redirect } from "next/navigation";
import { CompanyLoginForm } from "@/components/team/company-login-form";
import { getI18n } from "@/lib/i18n/server";
import { getCompanyViewer } from "@/server/company-session";

export default async function CompanyLoginPage() {
  if (await getCompanyViewer()) redirect("/entreprise");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="f-display text-2xl">{t.v7.company.login}</h1>
      <p className="text-sm text-muted-foreground">{t.v7.company.loginIntro}</p>
      <CompanyLoginForm />
      <Link href="/entreprise/mot-de-passe" className="block text-sm underline-offset-4 hover:underline">
        {t.v7.company.forgot}
      </Link>
    </div>
  );
}
