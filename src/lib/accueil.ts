/**
 * V15 — file d'attente de l'accueil : règles pures (aucune base de données), testées dans
 * tests/accueil.test.ts. Le serveur (src/server/accueil.ts) les applique.
 *
 * - Ordre de passage : priorité manuelle, puis RDV « à l'heure » (fenêtre ± réglable), puis motifs
 *   rapides (option), puis ordre d'arrivée.
 * - Temps d'attente estimé : moyenne RÉELLE des derniers tickets appelés du motif (fenêtre réglable) ;
 *   pas assez de tickets → null (affiché « — »). Rien d'inventé.
 * - Règle des appels : N appels sans réponse (délai réglable entre deux appels) → ABSENT.
 * - Écran public : numéro + motif court, jamais nom / téléphone / plaque entière.
 */

export const TICKET_STATUSES = ["WAITING", "CALLED", "SERVING", "DONE", "ABSENT", "CANCELLED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const REASON_KINDS = ["DROP_OFF", "PICKUP", "QUOTE", "PAYMENT", "OTHER"] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export const DEVICE_KINDS = ["KIOSK", "SCREEN"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Statuses of a ticket still in the room (shown on the screen). */
export const OPEN_STATUSES: readonly TicketStatus[] = ["WAITING", "CALLED", "SERVING"];

export const ticketLabel = (prefix: string, number: number) => `${prefix}-${number}`;

/**
 * Daily number from the per-day counter. Without a garage hub: 1, 2, 3… With a hub the two copies
 * may number at the same time while disconnected, so — as for work orders (scripts/hub/sync-engine.mjs,
 * splitSequences) — the garage PC takes the ODD numbers and the online copy the EVEN ones.
 */
export type NumberSide = "single" | "odd" | "even";
export function numberFromCounter(n: number, side: NumberSide): number {
  if (side === "odd") return 2 * n - 1;
  if (side === "even") return 2 * n;
  return n;
}

/**
 * Masked plate for the public screen: the last two characters are hidden.
 * "215TU1234" → "215 TU 12**". Very short plates are hidden more (never more than half shown).
 */
export function maskPlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const raw = plate.toUpperCase().replace(/[^A-Z0-9؀-ۿ]/g, "");
  if (!raw) return null;
  const hide = raw.length >= 7 ? 2 : Math.max(2, Math.ceil(raw.length / 2));
  const keep = Math.max(0, raw.length - hide);
  const masked = raw.slice(0, keep) + "*".repeat(raw.length - keep);
  const m = /^(\d{1,3})(TU|RS)(.+)$/.exec(masked);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : masked;
}

// ── Order of service ────────────────────────────────────────────────────────

export type PriorityTicket = {
  id: string;
  takenAt: Date;
  priority: number;
  apptAt: Date | null;
  reasonFast: boolean;
};
export type PriorityRules = { apptWindowMin: number; fastFirst: boolean };
/** Why a ticket is ahead: shown on the screen and the desk. */
export type PriorityGroup = "MANUAL" | "APPOINTMENT" | "FAST" | "ARRIVAL";

/**
 * RDV « à l'heure » : the ticket was taken no later than (appointment + window) — a customer later
 * than that waits in the normal order — and the appointment time is near: from (appointment − window)
 * on. A customer who comes very early does not jump the queue before that.
 */
export function onTimeAppointment(t: Pick<PriorityTicket, "apptAt" | "takenAt">, now: Date, windowMin: number): boolean {
  if (!t.apptAt) return false;
  const w = windowMin * 60_000;
  return t.takenAt.getTime() <= t.apptAt.getTime() + w && now.getTime() >= t.apptAt.getTime() - w;
}

export function priorityGroup(t: PriorityTicket, now: Date, rules: PriorityRules): PriorityGroup {
  if (t.priority > 0) return "MANUAL";
  if (onTimeAppointment(t, now, rules.apptWindowMin)) return "APPOINTMENT";
  if (rules.fastFirst && t.reasonFast) return "FAST";
  return "ARRIVAL";
}

const GROUP_RANK: Record<PriorityGroup, number> = { MANUAL: 0, APPOINTMENT: 1, FAST: 2, ARRIVAL: 3 };

/** Waiting tickets in the order they will be called ("Suivant" takes the first one). */
export function orderQueue<T extends PriorityTicket>(tickets: readonly T[], now: Date, rules: PriorityRules): T[] {
  const keyed = tickets.map((t) => ({ t, g: GROUP_RANK[priorityGroup(t, now, rules)] }));
  keyed.sort((a, b) => {
    if (a.g !== b.g) return a.g - b.g;
    if (a.g === GROUP_RANK.MANUAL && a.t.priority !== b.t.priority) return b.t.priority - a.t.priority;
    if (a.g === GROUP_RANK.APPOINTMENT) {
      const d = a.t.apptAt!.getTime() - b.t.apptAt!.getTime();
      if (d !== 0) return d;
    }
    const d = a.t.takenAt.getTime() - b.t.takenAt.getTime();
    return d !== 0 ? d : a.t.id.localeCompare(b.t.id);
  });
  return keyed.map((k) => k.t);
}

/** Number of people before this ticket in the ordered queue (null when it is not waiting). */
export function peopleAhead(ordered: readonly { id: string }[], ticketId: string): number | null {
  const i = ordered.findIndex((t) => t.id === ticketId);
  return i < 0 ? null : i;
}

// ── Waiting time ────────────────────────────────────────────────────────────

export type WaitSample = { takenAt: Date; calledAt: Date | null };
export type WaitRules = { window: number; min: number };

/**
 * Estimated wait in minutes = mean of (called − taken) over the `window` most recently called
 * tickets. Fewer than `min` real samples → null ("—"): nothing is invented.
 */
export function estimateWait(samples: readonly WaitSample[], rules: WaitRules): number | null {
  const called = samples
    .filter((s): s is { takenAt: Date; calledAt: Date } => !!s.calledAt && s.calledAt.getTime() >= s.takenAt.getTime())
    .sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime())
    .slice(0, Math.max(1, rules.window));
  if (called.length < Math.max(1, rules.min)) return null;
  const totalMs = called.reduce((s, x) => s + (x.calledAt.getTime() - x.takenAt.getTime()), 0);
  return Math.round(totalMs / called.length / 60_000);
}

// ── Calls ───────────────────────────────────────────────────────────────────

export type CallRules = { maxCalls: number; callTimeoutSec: number };
export type CallState = { status: string; callCount: number; calledAt: Date | null };
/**
 * What may happen to a CALLED ticket now:
 * - "WAIT": called less than `callTimeoutSec` ago (a new call would be too soon);
 * - "RECALL": the delay passed and fewer than `maxCalls` calls were made → the desk may call again;
 * - "ABSENT": `maxCalls` calls made and the delay after the last one passed → absent (never deleted).
 * Any other status: "NONE".
 */
export function callOutcome(t: CallState, now: Date, rules: CallRules): "NONE" | "WAIT" | "RECALL" | "ABSENT" {
  if (t.status !== "CALLED" || !t.calledAt) return "NONE";
  if (now.getTime() - t.calledAt.getTime() < rules.callTimeoutSec * 1000) return "WAIT";
  return t.callCount >= rules.maxCalls ? "ABSENT" : "RECALL";
}

// ── Statistics (desk of the day, reports) ───────────────────────────────────

export type StatTicket = { reasonId: string; status: string; takenAt: Date; calledAt: Date | null };
export type WaitStat = { count: number; called: number; absent: number; cancelled: number; avgWait: number | null; maxWait: number | null };

const minutes = (ms: number) => Math.round(ms / 60_000);

function waitStat(rows: readonly StatTicket[]): WaitStat {
  const waits = rows.filter((r) => r.calledAt).map((r) => r.calledAt!.getTime() - r.takenAt.getTime());
  return {
    count: rows.length,
    called: waits.length,
    absent: rows.filter((r) => r.status === "ABSENT").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
    avgWait: waits.length ? minutes(waits.reduce((s, w) => s + w, 0) / waits.length) : null,
    maxWait: waits.length ? minutes(Math.max(...waits)) : null,
  };
}

/** Hour of the day (0–23) in the garage's time zone. */
export function hourIn(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
}

function dayIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type QueueStats = {
  total: WaitStat;
  byReason: Map<string, WaitStat>;
  byHour: { hour: number; stat: WaitStat }[];
  byDay: { day: string; stat: WaitStat }[];
  /** Hours with the most tickets (up to 3), busiest first. */
  peakHours: number[];
  /** Absents ÷ tickets, in % (null when no ticket). */
  absentRate: number | null;
};

export function computeStats(rows: readonly StatTicket[], timeZone: string): QueueStats {
  const group = <K,>(key: (r: StatTicket) => K) => {
    const m = new Map<K, StatTicket[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const byReason = new Map([...group((r) => r.reasonId)].map(([k, v]) => [k, waitStat(v)]));
  const byHour = [...group((r) => hourIn(r.takenAt, timeZone))].sort((a, b) => a[0] - b[0]).map(([hour, v]) => ({ hour, stat: waitStat(v) }));
  const byDay = [...group((r) => dayIn(r.takenAt, timeZone))].sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day, stat: waitStat(v) }));
  const total = waitStat(rows);
  const peakHours = [...byHour].sort((a, b) => b.stat.count - a.stat.count || a.hour - b.hour).slice(0, 3).filter((h) => h.stat.count > 0).map((h) => h.hour);
  return { total, byReason, byHour, byDay, peakHours, absentRate: rows.length ? Math.round((total.absent / rows.length) * 1000) / 10 : null };
}

/** CSV (separator ";", Excel in French) of the tickets of a period. No phone, no name. */
export function ticketsCsv(
  rows: readonly { day: string; label: string; reason: string; status: string; takenAt: Date; calledAt: Date | null; doneAt: Date | null; callCount: number; counter: string | null }[],
  timeZone: string,
): string {
  const time = (d: Date | null) => (d ? new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) : "");
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Jour", "Ticket", "Motif", "Statut", "Pris", "Appelé", "Terminé", "Attente (min)", "Appels", "Guichet"];
  const lines = rows.map((r) =>
    [r.day, r.label, r.reason, r.status, time(r.takenAt), time(r.calledAt), time(r.doneAt), r.calledAt ? minutes(r.calledAt.getTime() - r.takenAt.getTime()) : "", r.callCount, r.counter ?? ""].map(cell).join(";"),
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}

/** Tunisian mobile / landline as typed at the kiosk: 8 digits, or +216 / 00216 followed by 8 digits. */
export function validKioskPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("00216") ? digits.slice(5) : digits.startsWith("216") && digits.length === 11 ? digits.slice(3) : digits;
  return /^[2-9]\d{7}$/.test(local) ? local : null;
}

// ── Customer messages (SMS / e-mail, only with the consent given at the kiosk) ──

export const QUEUE_MESSAGES = {
  fr: {
    called: "{garage} : c'est votre tour ! Ticket {ticket}, {counter}.",
    ahead: "{garage} : encore {n} personne(s) avant vous (ticket {ticket}).{link}",
    taken: "{garage} : votre ticket est le {ticket}. Nous vous préviendrons quand ce sera votre tour.{link}",
    link: " Suivi : {url}",
  },
  ar: {
    called: "{garage} : حان دوركم! التذكرة {ticket}، {counter}.",
    ahead: "{garage} : أمامكم {n} شخص (التذكرة {ticket}).{link}",
    taken: "{garage} : رقم تذكرتكم {ticket}. سنعلمكم عندما يحين دوركم.{link}",
    link: " المتابعة: {url}",
  },
  en: {
    called: "{garage}: it is your turn! Ticket {ticket}, {counter}.",
    ahead: "{garage}: {n} person(s) before you (ticket {ticket}).{link}",
    taken: "{garage}: your ticket is {ticket}. We will let you know when it is your turn.{link}",
    link: " Follow: {url}",
  },
} as const;

export function queueMessage(lang: string, kind: "called" | "ahead" | "taken", vars: { garage: string; ticket: string; counter?: string; n?: number; url?: string | null }): string {
  const m = QUEUE_MESSAGES[lang === "ar" || lang === "en" ? lang : "fr"];
  const link = vars.url ? m.link.replace("{url}", vars.url) : "";
  return m[kind]
    .replace("{garage}", vars.garage)
    .replace("{ticket}", vars.ticket)
    .replace("{counter}", vars.counter ?? "")
    .replace("{n}", String(vars.n ?? ""))
    .replace("{link}", link);
}

/** ESC/POS has no reliable Arabic / accent support on cheap printers: plain ASCII only. */
export const asciiOnly = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "");

/** ESC/POS bytes of a ticket: garage name, big number, reason, time, estimated wait, cut. */
export function escposTicket(t: { garage: string; label: string; reason: string; time: string; wait: string | null }): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const text = (s: string) => Array.from(`${asciiOnly(s)}\n`, (c) => c.charCodeAt(0));
  const bytes = [
    ESC, 0x40, // init
    ESC, 0x61, 0x01, // center
    ...text(t.garage),
    GS, 0x21, 0x33, // 4× size
    ...text(t.label),
    GS, 0x21, 0x00,
    ...text(t.reason),
    ...text(t.time),
    ...(t.wait ? text(t.wait) : []),
    0x0a, 0x0a, 0x0a,
    GS, 0x56, 0x42, 0x00, // partial cut
  ];
  return Uint8Array.from(bytes);
}
