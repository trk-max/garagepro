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
import { formatMoney } from "@/lib/format";
import { reminderLevel } from "@/lib/billing";
import { SURVEY_AFTER_DAYS, SURVEY_UNTIL_DAYS, refusedReminderLevel, surveyDue } from "@/lib/lot5";
import { audit } from "@/server/audit";

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
  // V16 Lot 4: "INVOICE_REMINDER" = graduated reminder of an overdue invoice (J+7, J+15, J+30).
  // V16 Lot 5: "SURVEY" = satisfaction survey 3 days after the delivery, "REFUSED_LINES" = refused work reminded at 30 / 90 days.
  kind: "MAINTENANCE" | "APPOINTMENT" | "DELIVERY" | "AGENDA" | "QUEUE" | "READY" | "QUOTE" | "QUOTE_REMINDER" | "PROMISE" | "PART_DATE" | "INVOICE_REMINDER" | "SURVEY" | "REFUSED_LINES";
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
  const queued =
    (await queueItems(await collectDue(now), sender)) +
    (await queueInvoiceReminders(now, sender)) +
    (await queueSatisfactionSurveys(now, sender)) +
    (await queueRefusedLineReminders(now, sender));
  const { sent, failed } = await deliverPending(now, sender);
  return { queued, sent, failed, channels: sender.channels() };
}

const DAY = 86_400_000;

/**
 * V16 Lot 4 — graduated reminders of overdue customer invoices: 7, 15 and 30 days after the due date (the highest
 * level reached, once each — dedupe key invoice-remind:<id>:<level>). Invoices of the orders of Lot 4 on only (no
 * wave of messages on the history the day it goes live), setting autoInvoiceReminders, never to a customer who
 * refuses automatic messages. Each queued reminder is also written in the invoice's reminder history
 * (InvoiceReminder, level) and in the journal. Returns the number of messages queued.
 */
export async function queueInvoiceReminders(now = new Date(), sender: Sender = realSender): Promise<number> {
  const s = await getSettings();
  if (!s.autoInvoiceReminders) return 0;
  const cut = new Date(now.getTime() - 7 * DAY);
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIAL"] },
      workOrder: { workflowLot4: true },
      customer: { reminderOptOut: false },
      OR: [{ dueDate: { lt: cut } }, { dueDate: null, issuedAt: { lt: cut } }],
    },
    select: { id: true, number: true, totalTtc: true, paidAmount: true, dueDate: true, issuedAt: true, workOrderId: true, customer: { select: { id: true, phone: true, email: true } }, workOrder: { select: { vehicleId: true } } },
    take: 1000,
  });
  const configured = sender.channels();
  let queued = 0;
  for (const inv of invoices) {
    const days = Math.floor((now.getTime() - (inv.dueDate ?? inv.issuedAt).getTime()) / DAY);
    const level = reminderLevel(days);
    const balance = inv.totalTtc - inv.paidAmount;
    if (!level || balance <= 0) continue;
    const dedupeKey = `invoice-remind:${inv.id}:${level}`;
    if (await prisma.notification.count({ where: { dedupeKey } })) continue;
    const body = fmt(fr.v16.lot4.reminder.sms, { garage: s.garageName, number: inv.number, amount: formatMoney(balance, "fr"), days, phone: s.phone ?? "" }).trim();
    queued += await prisma.$transaction(async (tx) => {
      const n = await queueItems(
        [{ kind: "INVOICE_REMINDER", dedupeKey, phone: inv.customer.phone, email: inv.customer.email, customerId: inv.customer.id, vehicleId: inv.workOrder.vehicleId, workOrderId: inv.workOrderId, subject: `${s.garageName} : facture ${inv.number}`, body }],
        sender,
        tx,
      );
      if (n === 0) return 0;
      const channel = configured.includes("SMS") && inv.customer.phone ? "SMS" : configured.includes("EMAIL") && inv.customer.email ? "EMAIL" : null;
      if (channel) {
        const r = await tx.invoiceReminder.create({ data: { invoiceId: inv.id, channel, message: body, level, actorId: null }, select: { id: true } });
        await tx.workOrderEvent.create({ data: { workOrderId: inv.workOrderId, actorId: null, type: "NOTE", body: `[${channel}] ${body}`, data: { invoiceReminder: level } } });
        await audit(tx, null, "invoice.autoReminder", "InvoiceReminder", r.id, { after: { invoice: inv.number, level, daysLate: days, balance, channel } });
      }
      return n;
    });
  }
  return queued;
}

/**
 * V16 Lot 5 — satisfaction survey 3 days after the delivery (setting autoSatisfactionSurvey, orders of Lot 5 on):
 * one message with the link of the repair tracker, where the existing rating form is (CustomerFeedback, one per
 * order). Only while the tracker is still open (7 days), never when the order is already rated, never to a customer
 * who refuses automatic messages (reminderOptOut). Dedupe key survey:<id> (once per order). Returns the number queued.
 */
export async function queueSatisfactionSurveys(now = new Date(), sender: Sender = realSender): Promise<number> {
  const s = await getSettings();
  if (!s.autoSatisfactionSurvey) return 0;
  const orders = await prisma.workOrder.findMany({
    where: {
      workflowLot5: true,
      status: { in: ["DELIVERED", "CLOSED"] },
      deliveredAt: { lte: new Date(now.getTime() - SURVEY_AFTER_DAYS * DAY), gt: new Date(now.getTime() - SURVEY_UNTIL_DAYS * DAY) },
      feedback: null,
      customer: { reminderOptOut: false },
    },
    select: { id: true, deliveredAt: true, trackingPin: true, vehicle: { select: { id: true, plate: true } }, customer: { select: { id: true, phone: true, email: true } } },
    take: 500,
  });
  if (!orders.length) return 0;
  const base = await getBaseUrl().catch(() => null);
  let queued = 0;
  for (const w of orders) {
    if (!surveyDue(w.deliveredAt, now)) continue;
    const dedupeKey = `survey:${w.id}`;
    if (await prisma.notification.count({ where: { dedupeKey } })) continue;
    const body = fmt(fr.v16.lot5.followUp.surveySms, { garage: s.garageName, plate: displayPlate(w.vehicle.plate), url: base ? `${base}/suivi?plate=${w.vehicle.plate}` : "", pin: w.trackingPin ?? "" }).trim();
    queued += await prisma.$transaction(async (tx) => {
      const n = await queueItems([{ kind: "SURVEY", dedupeKey, phone: w.customer.phone, email: w.customer.email, customerId: w.customer.id, vehicleId: w.vehicle.id, workOrderId: w.id, subject: `${s.garageName} : votre avis`, body }], sender, tx);
      if (n > 0) await audit(tx, null, "workOrder.survey", "WorkOrder", w.id, { after: { dedupeKey, deliveredAt: w.deliveredAt } });
      return n;
    });
  }
  return queued;
}

/**
 * V16 Lot 5 — reminder of the work the customer refused (REFUSED lines, never voided), 30 then 90 days after the
 * delivery (setting autoRefusedLineReminders, V16 orders): one message per order and level (refused-remind:<id>:<level>,
 * the highest level reached only, nothing after 120 days), never to a customer who refuses automatic messages,
 * never when the vehicle came back since (a newer order exists). Returns the number queued.
 */
export async function queueRefusedLineReminders(now = new Date(), sender: Sender = realSender): Promise<number> {
  const s = await getSettings();
  if (!s.autoRefusedLineReminders) return 0;
  const orders = await prisma.workOrder.findMany({
    where: {
      workflowV16: true,
      status: { in: ["DELIVERED", "CLOSED"] },
      deliveredAt: { lte: new Date(now.getTime() - 30 * DAY), gte: new Date(now.getTime() - 121 * DAY) },
      customer: { reminderOptOut: false },
      lines: { some: { approvalStatus: "REFUSED", voidedAt: null } },
    },
    select: {
      id: true,
      deliveredAt: true,
      vehicleId: true,
      vehicle: { select: { plate: true } },
      customer: { select: { id: true, phone: true, email: true } },
      lines: { where: { approvalStatus: "REFUSED", voidedAt: null }, orderBy: { position: "asc" }, select: { description: true, priority: true } },
    },
    take: 500,
  });
  let queued = 0;
  for (const w of orders) {
    const level = refusedReminderLevel(w.deliveredAt, now);
    if (!level) continue;
    // The car came back since: the team sees the refused work again at the counter; no message.
    if (await prisma.workOrder.count({ where: { vehicleId: w.vehicleId, id: { not: w.id }, createdAt: { gt: w.deliveredAt! }, status: { not: "CANCELLED" } } })) continue;
    const dedupeKey = `refused-remind:${w.id}:${level}`;
    if (await prisma.notification.count({ where: { dedupeKey } })) continue;
    // Safety first, at most 3 items in the message.
    const items = [...w.lines].sort((a, b) => (a.priority === "SAFETY" ? 0 : 1) - (b.priority === "SAFETY" ? 0 : 1)).slice(0, 3).map((l) => l.description).join(", ");
    const body = fmt(fr.v16.lot5.followUp.refusedSms, { garage: s.garageName, plate: displayPlate(w.vehicle.plate), date: formatDate(w.deliveredAt!, "fr", s.timezone), items, phone: s.phone ?? "" }).trim();
    queued += await prisma.$transaction(async (tx) => {
      const n = await queueItems([{ kind: "REFUSED_LINES", dedupeKey, phone: w.customer.phone, email: w.customer.email, customerId: w.customer.id, vehicleId: w.vehicleId, workOrderId: w.id, subject: `${s.garageName} : travaux conseillés`, body }], sender, tx);
      if (n > 0) await audit(tx, null, "workOrder.refusedLinesReminder", "WorkOrder", w.id, { after: { dedupeKey, level, lines: w.lines.length } });
      return n;
    });
  }
  return queued;
}

/** Staff: send a failed message again (counts as a new series of attempts). */
export async function retryNotification(id: string) {
  const { count } = await prisma.notification.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: null } });
  return count > 0;
}

export async function listNotifications(take = 200) {
  return prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take });
}
