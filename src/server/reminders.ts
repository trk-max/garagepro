import "server-only";
import type { Prisma } from "@prisma/client";
import { getBaseUrl } from "@/lib/base-url";
import { displayPlate, fmt, formatDate, formatTime } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { QUOTE_WAIT_DAYS } from "@/lib/todo";
import { MAX_ATTEMPTS, maintenanceDedupeKey, nextDue, renderTemplate, retryDelayMs } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail, type EmailResult } from "@/server/email";
import { isCloudWithHub } from "@/server/hub";
import { sendSmsDetailed, toE164, type Channel } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * Automatic customer reminders (Prompt 2/5, step D): maintenance due (date or
 * km), appointment in the next 24 h, promised delivery in the next 24 h.
 *
 * - Nothing is ever simulated: a message is SENT only when the provider said
 *   so; otherwise FAILED (with the provider's error, retried) or SKIPPED (with
 *   the reason: no channel configured, no phone/e-mail on file).
 * - One reminder per occurrence: (dedupeKey, channel) is unique in the database,
 *   so two runs at the same time cannot send it twice.
 * - Maintenance reminders respect the customer's refusal (reminderOptOut);
 *   service messages (appointment, delivery) are always allowed.
 * - With a garage hub, only the hub sends (the online copy skips), so a
 *   customer never gets the same message from both.
 */
export const DEFAULT_TEMPLATES = {
  MAINTENANCE: "{garage} : {item} à prévoir pour votre véhicule {plate} ({when}). Prenez rendez-vous en ligne ou au {phone}.",
  APPOINTMENT: "{garage} : rappel de votre rendez-vous le {date} à {time} pour le véhicule {plate}. Pour annuler ou déplacer : {phone}.",
  DELIVERY: "{garage} : la livraison de votre véhicule {plate} est prévue le {date} vers {time}. Nous vous prévenons dès qu'il est prêt.",
} as const;

export const MAINTENANCE_KINDS = ["OIL", "FILTERS", "SERVICE", "BRAKES", "TIRES", "BATTERY", "OTHER"] as const;
const ITEM_FR: Record<string, string> = {
  OIL: "Vidange",
  FILTERS: "Remplacement des filtres",
  SERVICE: "Entretien périodique",
  BRAKES: "Contrôle des freins",
  TIRES: "Contrôle des pneus",
  BATTERY: "Contrôle de la batterie",
  OTHER: "Entretien",
};

export type Sender = {
  channels: () => Channel[];
  sms: (phone: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  email: (msg: { to: string; subject: string; text: string; brand?: string }) => Promise<EmailResult>;
};

export const realSender: Sender = {
  channels: () => {
    const out: Channel[] = [];
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) out.push("SMS");
    if (emailConfigured()) out.push("EMAIL");
    return out;
  },
  sms: sendSmsDetailed,
  email: sendEmail,
};

/** V12: "AGENDA" = message of the upcoming repairs agenda (sent only after the garage validated it). */
export type Item = {
  // V15: "QUEUE" = message of the reception queue (« c'est votre tour », « encore N personnes »), consent given at the kiosk.
  // V16: "READY" = « votre véhicule est prêt » (after the move to READY), journalised like the others.
  // V16 Lot 2: "QUOTE" = « devis / supplément à valider » (link + code), "QUOTE_REMINDER" = one reminder after QUOTE_WAIT_DAYS.
  // V16 Lot 3: "PROMISE" = the promised date changed, "PART_DATE" = a missing part's expected date changed.
  kind: "MAINTENANCE" | "APPOINTMENT" | "DELIVERY" | "AGENDA" | "QUEUE" | "READY" | "QUOTE" | "QUOTE_REMINDER" | "PROMISE" | "PART_DATE";
  dedupeKey: string;
  phone: string | null;
  email: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;
  appointmentId?: string | null;
  maintenanceId?: string | null;
  forecastId?: string | null;
  subject: string;
  body: string;
};

/** Everything that should be reminded now (read-only). */
export async function collectDue(now = new Date()): Promise<Item[]> {
  const s = await getSettings();
  const tz = s.timezone;
  const base = { garage: s.garageName, phone: s.phone ?? "" };
  const in24h = new Date(now.getTime() + 24 * 3_600_000);
  const quoteCut = new Date(now.getTime() - QUOTE_WAIT_DAYS * 86_400_000);
  const [plans, appointments, orders, quotes] = await Promise.all([
    prisma.vehicleMaintenance.findMany({
      where: { isActive: true },
      include: { vehicle: { select: { id: true, plate: true, mileage: true, customer: { select: { id: true, phone: true, email: true, reminderOptOut: true } } } } },
      take: 5000,
    }),
    prisma.appointment.findMany({ where: { status: "CONFIRMED", startAt: { gt: now, lte: in24h } }, take: 1000 }),
    prisma.workOrder.findMany({
      where: { status: { in: ACTIVE_STATUSES.filter((x) => x !== "READY") }, promisedAt: { gt: now, lte: in24h } },
      select: { id: true, promisedAt: true, vehicle: { select: { id: true, plate: true } }, customer: { select: { id: true, phone: true, email: true } } },
      take: 1000,
    }),
    // V16 Lot 2: quotes still waiting for the customer after QUOTE_WAIT_DAYS, still valid: one reminder each.
    prisma.quote.findMany({
      where: { status: "SENT", sentAt: { lte: quoteCut }, validUntil: { gt: now }, workOrder: { status: { in: ["QUOTE_SENT", "WAITING_CUSTOMER"] } } },
      select: { id: true, workOrder: { select: { id: true, trackingPin: true, vehicle: { select: { id: true, plate: true } }, customer: { select: { id: true, phone: true, email: true } } } } },
      take: 1000,
    }),
  ]);

  const items: Item[] = [];
  for (const p of plans) {
    if (p.vehicle.customer.reminderOptOut) continue;
    const due = nextDue(p, p.vehicle.mileage, now, s.reminderLeadDays);
    if (due.status !== "SOON" && due.status !== "OVERDUE") continue;
    const item = p.kind === "OTHER" && p.label ? p.label : ITEM_FR[p.kind] ?? p.label ?? "Entretien";
    const when = due.by === "km" ? `${due.dueKm?.toLocaleString("fr-FR")} km` : due.dueDate ? formatDate(due.dueDate, "fr", tz) : "";
    const body = renderTemplate(s.tplMaintenance ?? DEFAULT_TEMPLATES.MAINTENANCE, { ...base, item, plate: displayPlate(p.vehicle.plate), when, km: due.dueKm ?? "" });
    items.push({
      kind: "MAINTENANCE",
      dedupeKey: maintenanceDedupeKey(p.id, due),
      phone: p.vehicle.customer.phone,
      email: p.vehicle.customer.email,
      customerId: p.vehicle.customer.id,
      vehicleId: p.vehicle.id,
      maintenanceId: p.id,
      subject: `${s.garageName} : ${item}`,
      body,
    });
  }
  for (const a of appointments) {
    const body = renderTemplate(s.tplAppointment ?? DEFAULT_TEMPLATES.APPOINTMENT, { ...base, plate: displayPlate(a.plate), date: formatDate(a.startAt, "fr", tz), time: formatTime(a.startAt, "fr", tz) });
    items.push({
      kind: "APPOINTMENT",
      dedupeKey: `appt:${a.id}:${a.startAt.toISOString()}`,
      phone: a.phone,
      email: a.email,
      customerId: a.customerId,
      vehicleId: a.vehicleId,
      appointmentId: a.id,
      subject: `${s.garageName} : rappel de rendez-vous`,
      body,
    });
  }
  for (const w of orders) {
    const body = renderTemplate(s.tplDelivery ?? DEFAULT_TEMPLATES.DELIVERY, { ...base, plate: displayPlate(w.vehicle.plate), date: formatDate(w.promisedAt!, "fr", tz), time: formatTime(w.promisedAt!, "fr", tz) });
    items.push({
      kind: "DELIVERY",
      dedupeKey: `deliv:${w.id}:${w.promisedAt!.toISOString()}`,
      phone: w.customer.phone,
      email: w.customer.email,
      customerId: w.customer.id,
      vehicleId: w.vehicle.id,
      workOrderId: w.id,
      subject: `${s.garageName} : livraison prévue`,
      body,
    });
  }
  if (quotes.length) {
    const base = await getBaseUrl().catch(() => null);
    for (const q of quotes) {
      const w = q.workOrder;
      const body = fmt(fr.v16.quote.smsReminder, { garage: s.garageName, plate: displayPlate(w.vehicle.plate), url: base ? `${base}/suivi?plate=${w.vehicle.plate}` : "", pin: w.trackingPin ?? "" });
      items.push({
        kind: "QUOTE_REMINDER",
        dedupeKey: `quote-remind:${q.id}`,
        phone: w.customer.phone,
        email: w.customer.email,
        customerId: w.customer.id,
        vehicleId: w.vehicle.id,
        workOrderId: w.id,
        subject: `${s.garageName} : devis en attente`,
        body,
      });
    }
  }
  return items;
}

/** Writes one row per possible channel (or one SKIPPED row saying why none). Duplicates are ignored. */
export async function queueItems(items: Item[], sender: Sender = realSender, db: Pick<Prisma.TransactionClient, "notification"> = prisma) {
  const configured = sender.channels();
  const rows = items.flatMap((it) => {
    const common = {
      kind: it.kind,
      dedupeKey: it.dedupeKey,
      customerId: it.customerId ?? null,
      vehicleId: it.vehicleId ?? null,
      workOrderId: it.workOrderId ?? null,
      appointmentId: it.appointmentId ?? null,
      maintenanceId: it.maintenanceId ?? null,
      forecastId: it.forecastId ?? null,
      subject: it.subject,
      body: it.body,
    };
    const out = [];
    const phone = it.phone ? toE164(it.phone) : null;
    if (configured.includes("SMS") && phone) out.push({ ...common, channel: "SMS", to: phone });
    if (configured.includes("EMAIL") && it.email) out.push({ ...common, channel: "EMAIL", to: it.email });
    if (out.length === 0) {
      const reason =
        configured.length === 0
          ? "Aucun canal configuré : ajoutez TWILIO_* (SMS) ou l'envoi d'e-mails (Resend / Gmail) dans .env"
          : "Ni téléphone valide (SMS) ni e-mail (e-mail) pour ce client avec les canaux configurés";
      out.push({ ...common, channel: "NONE", to: null, status: "SKIPPED", error: reason });
    }
    return out;
  });
  if (rows.length === 0) return 0;
  const { count } = await db.notification.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/**
 * Sends what is waiting (new, or failed and due for a retry). Each row is
 * claimed with a conditional update first, so two runners never send the same row.
 */
export async function deliverPending(now = new Date(), sender: Sender = realSender, limit = 200, only?: Prisma.NotificationWhereInput) {
  const candidates = await prisma.notification.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } }],
      ...(only ?? {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const n of candidates) {
    const { count } = await prisma.notification.updateMany({ where: { id: n.id, status: n.status, attempts: n.attempts }, data: { status: "SENDING" } });
    if (count === 0) continue; // another runner took it
    let ok = false;
    let error: string | undefined;
    try {
      if (n.channel === "SMS" && n.to) ({ ok, error } = await sender.sms(n.to, n.body));
      else if (n.channel === "EMAIL" && n.to) {
        const r = await sender.email({ to: n.to, subject: n.subject ?? "", text: n.body });
        ok = r.ok;
        error = r.ok ? undefined : r.error;
      } else error = "Canal inconnu";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const attempts = n.attempts + 1;
    if (ok) {
      sent++;
      await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), attempts, error: null, nextAttemptAt: null } });
    } else {
      failed++;
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", attempts, error: (error ?? "Échec d'envoi").slice(0, 500), nextAttemptAt: attempts < MAX_ATTEMPTS ? new Date(now.getTime() + retryDelayMs(attempts)) : null },
      });
    }
  }
  return { sent, failed };
}

export type RunResult = { skipped?: string; queued: number; sent: number; failed: number; channels: Channel[] };

export async function runReminders(now = new Date(), sender: Sender = realSender): Promise<RunResult> {
  if (isCloudWithHub()) return { skipped: "Le hub du garage envoie les rappels (évite les doublons).", queued: 0, sent: 0, failed: 0, channels: sender.channels() };
  const queued = await queueItems(await collectDue(now), sender);
  const { sent, failed } = await deliverPending(now, sender);
  return { queued, sent, failed, channels: sender.channels() };
}

/** Staff: send a failed message again (counts as a new series of attempts). */
export async function retryNotification(id: string) {
  const { count } = await prisma.notification.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: null } });
  return count > 0;
}

export async function listNotifications(take = 200) {
  return prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take });
}
