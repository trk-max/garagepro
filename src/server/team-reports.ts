import "server-only";
import type { LeaveType } from "@prisma/client";
import { attendanceByDay, localDate } from "@/lib/attendance";
import { parseOpeningHours } from "@/lib/booking";
import { spanHours, workingDays } from "@/lib/leaves";
import { prisma } from "@/lib/prisma";

/**
 * Report for one employee over [from, to): presence (punches), time on each
 * repair (chronometers), approved leaves and absences. Only recorded data;
 * incomplete days are flagged, never filled in.
 */
export async function employeeReport(userId: string, from: Date, to: Date) {
  const [user, setting, punches, labor, leaves] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, jobTitle: true, hireDate: true, isActive: true } }),
    prisma.setting.findUnique({ where: { id: "garage" }, select: { timezone: true, openingHours: true } }),
    prisma.clockEvent.findMany({ where: { userId, voidedAt: null, at: { gte: from, lt: to } }, orderBy: { at: "asc" }, select: { kind: true, at: true } }),
    prisma.laborEntry.findMany({
      where: { userId, voidedAt: null, startedAt: { gte: from, lt: to } },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, endedAt: true, workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } } },
    }),
    prisma.leaveRequest.findMany({ where: { userId, startAt: { lt: to }, endAt: { gt: from } }, orderBy: { startAt: "asc" } }),
  ]);
  if (!user) return null;
  const tz = setting?.timezone ?? "Africa/Tunis";
  const hours = parseOpeningHours(setting?.openingHours);
  const days = attendanceByDay(punches, tz);

  const byOrder = new Map<string, { id: string; number: number; plate: string; minutes: number; running: boolean }>();
  for (const l of labor) {
    const key = l.workOrder.id;
    const row = byOrder.get(key) ?? { id: key, number: l.workOrder.number, plate: l.workOrder.vehicle.plate, minutes: 0, running: false };
    if (l.endedAt) row.minutes += Math.round((l.endedAt.getTime() - l.startedAt.getTime()) / 60_000);
    else row.running = true; // still running: not counted until stopped
    byOrder.set(key, row);
  }

  const approved = leaves.filter((l) => l.status === "APPROVED");
  const leaveTotals = new Map<LeaveType, { days: number; hours: number }>();
  for (const l of approved) {
    // Clip to the period so a leave across two months is not counted twice.
    const span = { startAt: l.startAt < from ? from : l.startAt, endAt: l.endAt > to ? to : l.endAt };
    const t = leaveTotals.get(l.type) ?? { days: 0, hours: 0 };
    if (l.allDay) t.days += workingDays(span, tz, hours);
    else t.hours += spanHours(span);
    leaveTotals.set(l.type, t);
  }

  const presenceMinutes = days.reduce((s, d) => s + d.presenceMinutes, 0);
  const laborMinutes = [...byOrder.values()].reduce((s, o) => s + o.minutes, 0);
  return {
    user,
    timeZone: tz,
    from,
    to,
    days,
    presenceMinutes,
    breakMinutes: days.reduce((s, d) => s + d.breakMinutes, 0),
    daysWorked: days.filter((d) => d.presenceMinutes > 0).length,
    incompleteDays: days.filter((d) => d.incomplete).map((d) => d.date),
    laborByOrder: [...byOrder.values()].sort((a, b) => b.minutes - a.minutes),
    laborMinutes,
    leaves,
    leaveTotals: [...leaveTotals.entries()].map(([type, v]) => ({ type, ...v })),
  };
}

export type EmployeeReport = NonNullable<Awaited<ReturnType<typeof employeeReport>>>;

/** CSV (semicolon, UTF-8 with BOM) that Excel opens directly. */
export function employeeReportCsv(r: EmployeeReport): string {
  const h = (m: number) => (m / 60).toFixed(2).replace(".", ",");
  const local = (d: Date) => d.toLocaleString("fr-FR", { timeZone: r.timeZone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows: string[][] = [
    ["Employé", r.user.name],
    ["Période", `${localDate(r.from, r.timeZone)} → ${localDate(new Date(r.to.getTime() - 1), r.timeZone)}`],
    ["Heures de présence", h(r.presenceMinutes)],
    ["Heures sur réparations", h(r.laborMinutes)],
    ["Jours incomplets (pointage de sortie manquant)", r.incompleteDays.join(" ") || "aucun"],
    [],
    ["Date", "Arrivée", "Départ", "Pauses (h)", "Présence (h)", "Incomplet"],
    ...r.days.map((d) => [
      d.date,
      d.firstIn ? d.firstIn.toLocaleTimeString("fr-FR", { timeZone: r.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "",
      d.lastOut ? d.lastOut.toLocaleTimeString("fr-FR", { timeZone: r.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "",
      h(d.breakMinutes),
      h(d.presenceMinutes),
      d.incomplete ? "oui" : "",
    ]),
    [],
    ["Ordre", "Immatriculation", "Heures travaillées"],
    ...r.laborByOrder.map((o) => [`OR-${String(o.number).padStart(4, "0")}`, o.plate, h(o.minutes)]),
    [],
    ["Congé / absence", "Du", "Au", "Statut"],
    ...r.leaves.map((l) => [l.type, local(l.startAt), local(new Date(l.endAt.getTime() - (l.allDay ? 1 : 0))), l.status]),
  ];
  return "﻿" + rows.map((r2) => r2.map(esc).join(";")).join("\r\n");
}
