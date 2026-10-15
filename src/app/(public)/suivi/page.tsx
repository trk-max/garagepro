import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { PortalLoginForm } from "@/components/portal/login-form";
import { getI18n } from "@/lib/i18n/server";
import { getPortalWorkOrderId } from "@/server/portal-session";

type PageProps = { searchParams: Promise<{ plate?: string }> };

export default async function TrackLoginPage({ searchParams }: PageProps) {
  if (await getPortalWorkOrderId()) redirect("/suivi/vehicule");
  const [{ plate }, { t }] = await Promise.all([searchParams, getI18n()]);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-lg bg-card p-6 shadow-sm ring-1 ring-border">
        <span className="grid size-12 place-items-center rounded-md bg-navy text-white">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{t.portal.loginTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.portal.loginSubtitle}</p>
        <PortalLoginForm defaultPlate={plate ?? ""} />
      </div>
    </div>
  );
}
