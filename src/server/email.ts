import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/html-escape";

/**
 * Transactional e-mail. Two senders, tried in this order:
 *
 * 1. Resend (https://resend.com) — needs a verified domain to write to customers.
 *      RESEND_API_KEY      re_xxx… (Resend → API Keys)
 *      SUPPORT_FROM_EMAIL  "Garage Atlas <rdv@votredomaine.tn>"
 *                          (with "…@resend.dev", Resend only delivers to your own Resend address)
 *
 * 2. SMTP — e.g. the garage's Gmail, free, NO domain needed (~500 e-mails/day).
 *      SMTP_USER  garage@gmail.com
 *      SMTP_PASS  Gmail "app password" (16 letters; Google account → Security →
 *                 2-Step Verification ON → App passwords). NOT the normal password.
 *      Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), SMTP_FROM_NAME.
 *
 * If Resend fails (not configured, domain not verified, quota…), SMTP is used automatically.
 * Optional: RESEND_REPLY_TO / SMTP_REPLY_TO — where customer replies go.
 */

const resendConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.SUPPORT_FROM_EMAIL);
const smtpConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

export function emailConfigured(): boolean {
  return resendConfigured() || smtpConfigured();
}

/** Shown in Settings → E-mails: which sender(s) will be used, in order. */
export function emailSender(): string | null {
  const senders = [
    resendConfigured() ? `Resend : ${process.env.SUPPORT_FROM_EMAIL}` : null,
    smtpConfigured() ? `SMTP : ${process.env.SMTP_USER}` : null,
  ].filter(Boolean);
  return senders.length ? senders.join("  →  ") : null;
}

let resendClient: Resend | null = null;
let smtpClient: Transporter | null = null;

function smtp(): Transporter {
  const port = Number(process.env.SMTP_PORT || 465);
  smtpClient ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    // Gmail shows app passwords as "abcd efgh ijkl mnop": spaces are removed.
    auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return smtpClient;
}

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text; also rendered as the HTML body (line breaks kept, links clickable). */
  text: string;
  /** Shown as the header of the HTML e-mail. */
  brand?: string;
  attachment?: { filename: string; content: string };
};

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

async function viaResend(message: EmailMessage): Promise<EmailResult> {
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resendClient.emails.send({
    from: process.env.SUPPORT_FROM_EMAIL!,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: renderHtml(message),
    ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
    ...(message.attachment ? { attachments: [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content) }] } : {}),
  });
  if (error || !data) return { ok: false, error: `Resend : ${error?.message ?? "erreur inconnue"}` };
  return { ok: true, id: data.id };
}

async function viaSmtp(message: EmailMessage): Promise<EmailResult> {
  // Gmail only sends as the account itself: the display name is free, the address is not.
  const name = (process.env.SMTP_FROM_NAME || message.brand || "Garage").replace(/["<>]/g, "");
  const info = await smtp().sendMail({
    from: { name, address: process.env.SMTP_USER! },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: renderHtml(message),
    ...(process.env.SMTP_REPLY_TO || process.env.RESEND_REPLY_TO ? { replyTo: process.env.SMTP_REPLY_TO || process.env.RESEND_REPLY_TO } : {}),
    // Content is always passed in memory (never a path/URL): no file or network access.
    ...(message.attachment ? { attachments: [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content) }] } : {}),
  });
  if (info.rejected?.length) return { ok: false, error: "SMTP : adresse refusée" };
  return { ok: true, id: info.messageId };
}

const SMTP_HINTS: [RegExp, string][] = [
  [/535|Username and Password not accepted|BadCredentials/i, "mot de passe refusé : utilisez un « mot de passe d'application » Gmail, pas le mot de passe normal"],
  [/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET/i, "serveur SMTP injoignable (Internet ? port 465 bloqué ?)"],
  [/550|5\.4\.5|limit/i, "limite d'envoi Gmail atteinte, réessayez demain"],
];

/** Sends one e-mail through Resend, then SMTP. Never throws: returns the error so the UI can show it. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, error: "Aucun envoi d'e-mail configuré : ajoutez SMTP_USER/SMTP_PASS (Gmail) ou RESEND_API_KEY dans .env" };
  const errors: string[] = [];
  if (resendConfigured()) {
    try {
      const r = await viaResend(message);
      if (r.ok) return r;
      errors.push(r.error);
    } catch (error) {
      errors.push(`Resend : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (smtpConfigured()) {
    try {
      const r = await viaSmtp(message);
      if (r.ok) return r;
      errors.push(r.error);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const hint = SMTP_HINTS.find(([re]) => re.test(raw))?.[1];
      errors.push(`SMTP : ${hint ?? raw.split("\n")[0]}`);
    }
  }
  console.error("[email] not sent:", errors.join(" | "));
  return { ok: false, error: errors.join(" · ") };
}

/** Minimal, mail-client-safe HTML (inline styles, no external assets). */
function renderHtml({ text, brand, subject }: EmailMessage): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#ea580c">$1</a>')
    .replace(/\n/g, "<br>");
  const rtl = /[؀-ۿ]/.test(text);
  return `<!doctype html>
<html lang="${rtl ? "ar" : "fr"}" dir="${rtl ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0b1f3a;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold">
          <span style="display:inline-block;background:#f97316;border-radius:6px;padding:2px 8px;margin-${rtl ? "left" : "right"}:8px">${escapeHtml((brand ?? "G").trim().charAt(0).toUpperCase() || "G")}</span>${escapeHtml(brand ?? "")}
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6">${body}</td></tr>
        <tr><td style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px">${escapeHtml(brand ?? "")}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
