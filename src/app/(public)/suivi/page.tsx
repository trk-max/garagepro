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
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <span className="grid size-12 place-items-center rounded-xl bg-navy text-orange-400">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{t.portal.loginTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.portal.loginSubtitle}</p>
        <PortalLoginForm defaultPlate={plate ?? ""} />
      </div>
    </div>
  );
}
