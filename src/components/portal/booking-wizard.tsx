"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clock, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { createBookingAction } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/field";
import { displayPlate, fmt, formatDay, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type WizardService = {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  durationMin: number;
  priceFrom: number | null;
};

type Day = { date: string; slots: string[] };
type Details = { firstName: string; lastName: string; phone: string; email: string; plate: string; make: string; model: string; notes: string };

const EMPTY: Details = { firstName: "", lastName: "", phone: "", email: "", plate: "", make: "", model: "", notes: "" };
const STEPS = ["service", "slot", "details", "confirm"] as const;

const monthKey = (date: string) => date.slice(0, 7);
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** Monday-first grid of YYYY-MM-DD (null = padding) for a month. */
function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const pad = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: pad }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  return cells;
}

export function BookingWizard({
  services,
  initialServiceId,
  initialNotes,
  garagePhone,
}: {
  services: WizardService[];
  initialServiceId?: string;
  /** Pre-filled "notes" field, e.g. the symptom summary written by the AI assistant. */
  initialNotes?: string;
  garagePhone: string | null;
}) {
  const { t, lang } = useI18n();
  const b = t.booking;
  const router = useRouter();
  const [step, setStep] = useState(initialServiceId && services.some((s) => s.id === initialServiceId) ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [days, setDays] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [month, setMonth] = useState("");
  const [details, setDetails] = useState<Details>({ ...EMPTY, notes: initialNotes ?? "" });
  const [pending, startTransition] = useTransition();

  const service = services.find((s) => s.id === serviceId);
  const label = (s: WizardService) => (lang === "ar" && s.nameAr ? s.nameAr : s.name);
  const desc = (s: WizardService) => (lang === "ar" && s.descriptionAr ? s.descriptionAr : s.description);
  const price = (s: WizardService) => (s.priceFrom == null ? b.onQuote : fmt(b.priceFrom, { price: formatMoney(s.priceFrom, lang) }));
  const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`);

  const loadAvailability = useCallback(async (id: string) => {
    setLoading(true);
    setDays(null);
    try {
      const res = await fetch(`/api/booking/availability?serviceId=${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { days: Day[] };
      setDays(data.days);
      const first = data.days[0]?.date;
      setMonth(first ? monthKey(first) : "");
    } catch {
      setDays([]);
      toast.error(t.errors.generic);
    } finally {
      setLoading(false);
    }
  }, [t.errors.generic]);

  useEffect(() => {
    if (step === 1 && serviceId) void loadAvailability(serviceId);
  }, [step, serviceId, loadAvailability]);

  const byDate = useMemo(() => new Map((days ?? []).map((d) => [d.date, d.slots])), [days]);
  const slots = byDate.get(date) ?? [];
  const firstMonth = days?.[0] ? monthKey(days[0].date) : "";
  const lastMonth = days?.length ? monthKey(days[days.length - 1]!.date) : "";

  // Each field says what is wrong (instead of a grey button with no explanation).
  const errors: Partial<Record<keyof Details, string>> = {};
  if (!details.firstName.trim()) errors.firstName = b.errRequired;
  if (!details.lastName.trim()) errors.lastName = b.errRequired;
  if (!details.phone.trim()) errors.phone = b.errRequired;
  else if (!/^[+\d\s().-]{8,20}$/.test(details.phone.trim())) errors.phone = b.errPhone;
  if (details.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) errors.email = b.errEmail;
  if (details.plate.trim().length < 2) errors.plate = b.errPlate;
  const [showErrors, setShowErrors] = useState(false);

  const goToSummary = () => {
    if (Object.keys(errors).length === 0) {
      setShowErrors(false);
      setStep(3);
      return;
    }
    setShowErrors(true);
    toast.error(b.fixErrors);
    // Put the cursor in the first field to fix.
    const first = (["firstName", "lastName", "phone", "email", "plate"] as const).find((k) => errors[k]);
    if (first) document.getElementById(`bk-${first}`)?.focus();
  };

  const submit = () =>
    startTransition(async () => {
      const form = new FormData();
      form.set("serviceId", serviceId);
      form.set("date", date);
      form.set("time", time);
      for (const [k, v] of Object.entries(details)) form.set(k, v);
      form.set("website", "");
      const result = await createBookingAction(form);
      if (!result.ok) {
        toast.error(result.error);
        if (result.error === t.errors.slotTaken) {
          setTime("");
          setStep(1);
          void loadAvailability(serviceId);
        }
        return;
      }
      if (result.data.redirectTo) router.push(result.data.redirectTo);
    });

  const field = (key: keyof Details, labelText: string, props: React.ComponentProps<typeof Input> = {}) => {
    const error = showErrors ? errors[key] : undefined;
    return (
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{labelText}</span>
        <Input
          id={`bk-${key}`}
          value={details[key]}
          onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `bk-${key}-error` : undefined}
          {...props}
          className={cn("h-11 bg-card", props.className, error && "border-destructive ring-1 ring-destructive/40")}
        />
        {error && (
          <span id={`bk-${key}-error`} className="block text-xs font-medium text-destructive">
            {error}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Step indicator ── */}
      <ol className="grid grid-cols-4 gap-2" aria-label={b.title}>
        {STEPS.map((key, i) => (
          <li key={key} className="space-y-1.5">
            <span className={cn("block h-1.5 rounded-full", i < step ? "bg-emerald-500" : i === step ? "bg-brand-500" : "bg-muted")} />
            <span className={cn("block truncate text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {i + 1}. {b.steps[key]}
            </span>
          </li>
        ))}
      </ol>

      {/* ── 1. Service ── */}
      {step === 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{b.chooseService}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  setDate("");
                  setTime("");
                  setStep(1);
                }}
                className={cn(
                  "rounded-lg bg-card p-4 text-start shadow-sm ring-1 transition hover:ring-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
                  serviceId === s.id ? "ring-2 ring-brand-500" : "ring-border",
                )}
              >
                <p className="font-semibold">{label(s)}</p>
                {desc(s) && <p className="mt-1 text-sm text-muted-foreground">{desc(s)}</p>}
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-4" aria-hidden /> {b.duration} : {duration(s.durationMin)}
                  </span>
                  <span className="font-medium text-brand-700 dark:text-brand-400" dir="ltr">{price(s)}</span>
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 2. Date & time ── */}
      {step === 1 && service && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{label(service)}</span> · {duration(service.durationMin)}
          </p>

          {loading || days === null ? (
            <p className="flex items-center gap-2 rounded-lg bg-card p-6 text-sm text-muted-foreground ring-1 ring-border">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {b.loading}
            </p>
          ) : days.length === 0 ? (
            <div className="rounded-lg bg-card p-6 text-sm ring-1 ring-border">
              <p>{b.noSlots}</p>
              {garagePhone && (
                <Button asChild className="mt-3 bg-anthracite">
                  <a href={`tel:${garagePhone}`}>
                    <Phone className="size-4" aria-hidden /> {t.portal.call}
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-lg bg-card p-4 shadow-sm ring-1 ring-border">
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} disabled={month <= firstMonth} className="grid size-11 place-items-center rounded-md hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-400/60" aria-label={b.prevMonth}>
                    <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
                  </button>
                  <h3 className="font-semibold capitalize">{formatDay(`${month}-01`, lang, { month: "long", year: "numeric" })}</h3>
                  <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={month >= lastMonth} className="grid size-11 place-items-center rounded-md hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-400/60" aria-label={b.nextMonth}>
                    <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                  {["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map((d) => (
                    <span key={d}>{formatDay(d, lang, { weekday: "narrow" })}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthGrid(month).map((d, i) => {
                    if (!d) return <span key={`p${i}`} />;
                    const free = byDate.get(d)?.length ?? 0;
                    const selected = d === date;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!free}
                        onClick={() => {
                          setDate(d);
                          setTime("");
                        }}
                        aria-pressed={selected}
                        aria-label={formatDay(d, lang)}
                        className={cn(
                          "aspect-square min-h-10 rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-400/60",
                          !free && "cursor-not-allowed text-muted-foreground line-through decoration-border",
                          free && !selected && "bg-emerald-50 dark:bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/15",
                          selected && "bg-brand-500 font-semibold text-white shadow",
                        )}
                      >
                        {Number(d.slice(8))}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-card p-4 shadow-sm ring-1 ring-border">
                <h3 className="mb-3 font-semibold">{date ? <span className="capitalize">{formatDay(date, lang)}</span> : b.chooseDay}</h3>
                {date ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTime(s)}
                        aria-pressed={time === s}
                        className={cn(
                          "min-h-11 rounded-lg py-2.5 text-sm font-medium tabular-nums ring-1 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-400/60",
                          time === s ? "bg-brand-500 text-white ring-brand-500" : "bg-card ring-border hover:ring-brand-400",
                        )}
                        dir="ltr"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{b.chooseTime}</p>
                )}
              </div>
            </div>
          )}

          <nav className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {b.back}
            </Button>
            <Button type="button" disabled={!date || !time} onClick={() => setStep(2)} className="bg-brand-500 hover:bg-brand-600">
              {b.next} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          </nav>
        </section>
      )}

      {/* ── 3. Customer details ── */}
      {step === 2 && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border sm:grid-cols-2">
            {field("firstName", b.firstName, { autoComplete: "given-name", required: true })}
            {field("lastName", b.lastName, { autoComplete: "family-name", required: true })}
            {field("phone", b.phone, { type: "tel", autoComplete: "tel", inputMode: "tel", dir: "ltr", placeholder: "+216 …", required: true })}
            {field("email", b.email, { type: "email", autoComplete: "email", dir: "ltr" })}
            {field("plate", b.plate, { dir: "ltr", placeholder: t.customers.platePlaceholder, className: "h-11 bg-card font-mono uppercase", required: true })}
            <div className="grid grid-cols-2 gap-3">
              {field("make", b.make)}
              {field("model", b.model)}
            </div>
            <label className="block space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{b.notes}</span>
              <Textarea
                value={details.notes}
                onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
                rows={3}
                maxLength={500}
                placeholder={b.notesPlaceholder}
                className="bg-card"
              />
            </label>
          </div>
          <nav className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {b.back}
            </Button>
            <Button type="button" onClick={goToSummary} className="bg-brand-500 hover:bg-brand-600">
              {b.next} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          </nav>
        </section>
      )}

      {/* ── 4. Summary & confirm ── */}
      {step === 3 && service && (
        <section className="space-y-4">
          <div className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
            <h2 className="mb-3 font-semibold">{b.summary}</h2>
            <dl className="divide-y text-sm">
              {[
                [b.service, `${label(service)} · ${duration(service.durationMin)}`],
                [b.when, `${formatDay(date, lang)} · ${time}`],
                [`${b.firstName} / ${b.lastName}`, `${details.firstName} ${details.lastName}`],
                [b.phone, details.phone],
                ...(details.email ? [[t.common.email, details.email]] : []),
                [b.plate, `${displayPlate(details.plate.toUpperCase().replace(/[^A-Z0-9]/g, ""))}${details.make ? ` · ${details.make} ${details.model}` : ""}`],
                ...(details.notes ? [[b.notes, details.notes]] : []),
                ["", price(service)],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-end font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <nav className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {b.back}
            </Button>
            <Button type="button" onClick={submit} disabled={pending} className="h-11 bg-emerald-600 px-6 text-base hover:bg-emerald-700">
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />} {b.confirm}
            </Button>
          </nav>
        </section>
      )}
    </div>
  );
}
