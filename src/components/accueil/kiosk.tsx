"use client";

import { ArrowLeft, Camera, Delete, Maximize, Printer, QrCode, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

type V15 = Dictionary["v15"];
type KLang = "fr" | "ar";
export type KioskReason = { id: string; prefix: string; nameFr: string; nameAr: string | null; kind: string };
type Ticket = { label: string; trackToken: string; ahead: number | null; waitMinutes: number | null; appointmentTime: string | null; appointment: boolean };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const IDLE_MS = 45_000;

/**
 * V15 — entrance kiosk (tablet, full screen, no account; device token in an http-only cookie).
 * Big buttons per visit reason → optional plate (large keypad) or vehicle QR → ticket in large type,
 * optional SMS (phone + explicit consent), optional print. Goes back to the start after inactivity.
 */
export function Kiosk({ dict, garage, logo, reasons, printer }: { dict: Record<KLang, V15>; garage: string; logo: string | null; reasons: KioskReason[]; printer: boolean }) {
  const [lang, setLang] = useState<KLang>("fr");
  const v = dict[lang];
  const [step, setStep] = useState<"reason" | "plate" | "ticket">("reason");
  const [reason, setReason] = useState<KioskReason | null>(null);
  const [plate, setPlate] = useState("");
  const [letters, setLetters] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [smsDone, setSmsDone] = useState(false);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setStep("reason");
    setReason(null);
    setPlate("");
    setTicket(null);
    setError(null);
    setPhone("");
    setConsent(false);
    setSmsDone(false);
    setPrintMsg(null);
    setScanning(false);
    setLetters(false);
  }, []);

  // Back to the start after inactivity (the next customer never sees the previous ticket for long).
  useEffect(() => {
    const arm = () => {
      if (idle.current) clearTimeout(idle.current);
      if (step !== "reason") idle.current = setTimeout(reset, IDLE_MS);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [step, reset]);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (res.status === 401) {
      window.location.reload(); // token revoked: the page shows "device not authorised"
      throw new Error("device");
    }
    return res;
  }

  async function take(opts: { plate?: string; qr?: string }) {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post("/api/accueil/borne/ticket", { reasonId: reason.id, plate: opts.plate || null, qr: opts.qr || null, lang });
      if (!res.ok) throw new Error(String(res.status));
      setTicket((await res.json()) as Ticket);
      setStep("ticket");
    } catch {
      setError(navigator.onLine ? v.kiosk.error : v.kiosk.offline);
    } finally {
      setBusy(false);
      setScanning(false);
    }
  }

  async function saveSms() {
    if (!ticket || !consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post("/api/accueil/borne/sms", { token: ticket.trackToken, phone, consent: true });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error === "queuePhone" ? v.kiosk.phone : v.kiosk.error);
        return;
      }
      setSmsDone(true);
    } catch {
      setError(v.kiosk.offline);
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    if (!ticket || busy) return;
    setBusy(true);
    try {
      const res = await post("/api/accueil/borne/print", { token: ticket.trackToken });
      const r = (await res.json()) as { printed?: boolean };
      setPrintMsg(r.printed ? v.kiosk.printed : v.kiosk.printFailed);
    } catch {
      setPrintMsg(v.kiosk.printFailed);
    } finally {
      setBusy(false);
    }
  }

  // Vehicle QR through the camera (BarcodeDetector: Chrome / Android tablets). Otherwise: type the plate.
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    type Detector = { detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setError(v.kiosk.scanUnavailable);
      setScanning(false);
      return;
    }
    const detector = new Ctor({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        while (!stop) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const hit = codes.find((c) => c.rawValue.includes("/v/"));
          if (hit) {
            stop = true;
            void take({ qr: hit.rawValue });
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        setError(v.kiosk.scanUnavailable);
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the camera is opened / closed
  }, [scanning]);

  const key = (k: string) => setPlate((p) => (k === "⌫" ? p.trimEnd().slice(0, -1).trimEnd() : (p + (k === "TU" || k === "RS" ? ` ${k} ` : k)).replace(/\s+/g, " ").slice(0, 20)));
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "TU", "0", "⌫"];
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const reasonName = (r: KioskReason) => (lang === "ar" ? r.nameAr || r.nameFr : r.nameFr);
  const big = "rounded-3xl bg-white/10 text-white transition active:scale-[0.98] hover:bg-white/20 disabled:opacity-50";

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="flex min-h-dvh flex-col bg-neutral-950 text-white select-none" data-testid="kiosk">
      <header className="flex items-center gap-4 px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- garage logo stored as a data URL (Paramètres) */}
        {logo ? <img src={logo} alt="" className="h-12 w-auto rounded bg-white p-1" /> : null}
        <p className="text-xl font-semibold">{garage}</p>
        <div className="ms-auto flex items-center gap-2">
          <button type="button" onClick={() => setLang("fr")} className={cn("h-12 rounded-full px-5 text-lg", lang === "fr" ? "bg-white text-black" : "bg-white/10")}>
            Français
          </button>
          <button type="button" onClick={() => setLang("ar")} className={cn("h-12 rounded-full px-5 text-lg", lang === "ar" ? "bg-white text-black" : "bg-white/10")} lang="ar">
            العربية
          </button>
          <button type="button" aria-label={v.kiosk.fullscreen} onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} className="grid size-12 place-items-center rounded-full bg-white/10">
            <Maximize className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <section className="flex flex-1 flex-col px-6 pb-8">
        {error && (
          <p role="alert" className="mb-4 rounded-2xl bg-amber-500/20 p-4 text-center text-xl text-amber-200">
            {error}
          </p>
        )}

        {step === "reason" && (
          <>
            <h1 className="mt-4 text-center text-5xl font-bold">{v.kiosk.welcome}</h1>
            <p className="mt-3 mb-8 text-center text-2xl text-white/70">{v.kiosk.choose}</p>
            <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={cn(big, "flex min-h-32 items-center gap-6 p-6 text-start")}
                  onClick={() => {
                    setReason(r);
                    setStep("plate");
                  }}
                >
                  <span className="grid size-20 shrink-0 place-items-center rounded-2xl bg-orange-500 font-mono text-4xl font-bold" dir="ltr">
                    {r.prefix}
                  </span>
                  <span className="text-3xl font-semibold">{reasonName(r)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "plate" && reason && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            <button type="button" onClick={reset} className="mb-4 inline-flex h-12 items-center gap-2 self-start rounded-full bg-white/10 px-5 text-lg">
              <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden /> {v.kiosk.back}
            </button>
            <h1 className="text-4xl font-bold">{v.kiosk.plateTitle}</h1>
            <p className="mt-2 text-xl text-white/70">{v.kiosk.plateHint}</p>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase().slice(0, 300))}
              onKeyDown={(e) => {
                // A handheld QR scanner types the link and presses Enter.
                if (e.key === "Enter") void take(plate.includes("/V/") || plate.includes("/v/") ? { qr: plate.replace(/\/V\//, "/v/") } : { plate });
              }}
              aria-label={v.kiosk.plateTitle}
              dir="ltr"
              inputMode="none"
              className="mt-6 h-24 w-full rounded-3xl bg-white px-6 text-center font-mono text-5xl tracking-widest text-black uppercase outline-none"
              data-testid="plate-input"
            />
            <div className="mt-5 grid grid-cols-3 gap-3" dir="ltr">
              {(letters ? [...alpha, "⌫"] : digits).map((k) => (
                <button key={k} type="button" onClick={() => key(k)} className={cn(big, "h-20 text-4xl font-semibold", letters && "h-16 text-2xl")} aria-label={k === "⌫" ? v.kiosk.erase : k}>
                  {k === "⌫" ? <Delete className="mx-auto size-8" aria-hidden /> : k}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3" dir="ltr">
              <button type="button" onClick={() => key("RS")} className={cn(big, "h-14 text-2xl")}>
                RS
              </button>
              <button type="button" onClick={() => setLetters((l) => !l)} className={cn(big, "h-14 text-2xl")}>
                {letters ? "123" : "ABC"}
              </button>
            </div>
            {scanning ? (
              <div className="mt-5 overflow-hidden rounded-3xl bg-black">
                <video ref={videoRef} muted playsInline className="mx-auto max-h-72" />
                <p className="p-3 text-center text-lg text-white/70">{v.kiosk.scanHint}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setScanning(true)} className={cn(big, "mt-5 flex h-16 items-center justify-center gap-3 text-2xl")}>
                <QrCode className="size-7" aria-hidden /> <Camera className="size-7" aria-hidden /> {v.kiosk.scan}
              </button>
            )}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <button type="button" disabled={busy} onClick={() => void take({})} className={cn(big, "h-20 text-2xl")} data-testid="skip">
                {v.kiosk.skip}
              </button>
              <button type="button" disabled={busy || plate.replace(/\s/g, "").length < 2} onClick={() => void take({ plate })} className="h-20 rounded-3xl bg-orange-500 text-3xl font-bold text-white disabled:opacity-40" data-testid="plate-ok">
                {v.kiosk.ok}
              </button>
            </div>
          </div>
        )}

        {step === "ticket" && ticket && reason && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center text-center" data-testid="kiosk-ticket">
            <p className="mt-2 text-3xl text-white/70">{v.kiosk.yourTicket}</p>
            <p className="my-4 font-mono text-[9rem] leading-none font-black tracking-tight text-orange-400" dir="ltr">
              {ticket.label}
            </p>
            <p className="text-3xl font-semibold">{reasonName(reason)}</p>
            {ticket.appointment && ticket.appointmentTime && <p className="mt-4 rounded-2xl bg-emerald-500/20 px-6 py-3 text-2xl text-emerald-200">{fill(v.kiosk.apptOk, { time: ticket.appointmentTime })}</p>}
            <p className="mt-4 text-2xl">{ticket.ahead === 0 ? v.kiosk.first : ticket.ahead !== null ? fill(v.kiosk.ahead, { n: ticket.ahead }) : ""}</p>
            <p className="mt-1 text-xl text-white/70">
              {ticket.waitMinutes === null ? v.kiosk.waitUnknown : fill(v.kiosk.wait, { n: ticket.waitMinutes })} ({v.estimated})
            </p>

            <div className="mt-8 w-full rounded-3xl bg-white/5 p-5 text-start">
              {smsDone ? (
                <p className="text-center text-2xl text-emerald-300">{v.kiosk.smsSaved}</p>
              ) : (
                <>
                  <p className="flex items-center gap-3 text-2xl font-semibold">
                    <Smartphone className="size-7" aria-hidden /> {v.kiosk.smsOffer}
                  </p>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d +]/g, "").slice(0, 16))}
                    inputMode="tel"
                    dir="ltr"
                    aria-label={v.kiosk.phone}
                    placeholder="20 123 456"
                    className="mt-4 h-16 w-full rounded-2xl bg-white px-5 font-mono text-3xl text-black outline-none"
                  />
                  <label className="mt-4 flex items-start gap-3 text-lg">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-7 shrink-0" />
                    {v.kiosk.consent}
                  </label>
                  <button type="button" disabled={!consent || phone.replace(/\D/g, "").length < 8 || busy} onClick={() => void saveSms()} className="mt-4 h-16 w-full rounded-2xl bg-white/15 text-2xl font-semibold disabled:opacity-40">
                    {v.kiosk.send}
                  </button>
                </>
              )}
            </div>

            <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              {printer && (
                <button type="button" disabled={busy} onClick={() => void print()} className={cn(big, "flex h-20 items-center justify-center gap-3 text-2xl")}>
                  <Printer className="size-7" aria-hidden /> {v.kiosk.print}
                </button>
              )}
              <button type="button" onClick={reset} className={cn("h-20 rounded-3xl bg-orange-500 text-3xl font-bold", !printer && "sm:col-span-2")} data-testid="kiosk-done">
                {v.kiosk.done}
              </button>
            </div>
            {printMsg && <p className="mt-3 text-xl text-white/80">{printMsg}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
