import { ReportView } from "@/components/garage/report-view";
import { getI18n } from "@/lib/i18n/server";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/report";
import { requirePageAccess } from "@/lib/session";
import { getReport } from "@/server/reports";

type PageProps = { searchParams: Promise<{ periode?: string }> };

/** Owner's report: today, 7 days, 30 days or 3 months. */
export default async function ReportsPage({ searchParams }: PageProps) {
  await requirePageAccess("viewReports");
  const { periode } = await searchParams;
  const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(periode ?? "") ? (periode as ReportPeriod) : "week";
  const [{ t, lang }, data] = await Promise.all([getI18n(), getReport(period)]);
  return <ReportView data={data} t={t} lang={lang} />;
}
