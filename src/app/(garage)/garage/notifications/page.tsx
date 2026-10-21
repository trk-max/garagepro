import Link from "next/link";
import { retryNotificationAction, runRemindersAction } from "@/actions/reminders";
import { ActionButton } from "@/components/action-form";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { isCloudWithHub } from "@/server/hub";
import { channelsConfigured } from "@/server/notify";
import { listNotifications } from "@/server/reminders";
import { getSettings } from "@/server/settings";

/** History of customer reminders: what went out, what failed and why, what could not be sent. */
export default async function NotificationsPage() {
  const staff = await requirePageAccess("viewNotifications");
  const [{ t, lang }, rows, settings] = await Promise.all([getI18n(), listNotifications(300), getSettings()]);
  const n = t.v7.notifications;
  const channels = channelsConfigured();
  const cron = !!process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16;
  const statusCls: Record<string, string> = {
    SENT: "text-emerald-700 dark:text-emerald-400",
    FAILED: "text-red-600 dark:text-red-400",
    SKIPPED: "text-amber-700 dark:text-amber-400",
    PENDING: "text-muted-foreground",
    SENDING: "text-muted-foreground",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader title={n.title}>
        {can(staff, "manageSettings") && <ActionButton action={runRemindersAction}>{n.runNow}</ActionButton>}
      </PageHeader>

      <Card>
        <CardTitle>{n.setupTitle}</CardTitle>
        <ul className="space-y-1 text-sm">
          <li>
            SMS (Twilio) : <strong className={channels.includes("SMS") ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{channels.includes("SMS") ? n.configured : n.missingSms}</strong>
          </li>
          <li>
            E-mail : <strong className={channels.includes("EMAIL") ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{channels.includes("EMAIL") ? n.configured : n.missingEmail}</strong>
          </li>
          <li>
            {n.schedule} : <strong className={cron ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{isCloudWithHub() ? n.hubSends : cron ? n.cronOn : n.cronMissing}</strong>
          </li>
          <li className="text-muted-foreground">
            {n.leadDays} : {settings.reminderLeadDays} — <Link href="/garage/settings" className="underline-offset-4 hover:underline">{t.nav.settings}</Link>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{n.noSimulation}</p>
      </Card>

      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{n.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{n.when}</Th>
                <Th>{n.kind}</Th>
                <Th>{n.channel}</Th>
                <Th>{n.to}</Th>
                <Th>{n.message}</Th>
                <Th>{n.status}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap text-xs tabular-nums">{formatDateTime(r.createdAt, lang, settings.timezone)}</Td>
                  <Td className="text-xs">{n.kinds[r.kind as keyof typeof n.kinds] ?? r.kind}</Td>
                  <Td className="text-xs">{r.channel}</Td>
                  <Td className="text-xs" dir="ltr">
                    {r.to ?? "—"}
                  </Td>
                  <Td className="max-w-md text-xs">{r.body}</Td>
                  <Td className="text-xs">
                    <span className={cn("font-semibold", statusCls[r.status])}>{n.statuses[r.status as keyof typeof n.statuses] ?? r.status}</span>
                    {r.attempts > 0 && <span className="block text-muted-foreground">{r.attempts} essai(s)</span>}
                    {r.sentAt && <span className="block text-muted-foreground">{formatDateTime(r.sentAt, lang, settings.timezone)}</span>}
                    {r.error && <span className="block max-w-xs break-words text-muted-foreground">{r.error}</span>}
                    {r.status === "FAILED" && (
                      <ActionButton size="sm" variant="outline" className="mt-1 h-6" action={retryNotificationAction.bind(null, r.id)}>
                        {n.retry}
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
