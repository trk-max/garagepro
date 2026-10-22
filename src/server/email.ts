import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { type EmailLayout, renderEmailHtml } from "@/lib/email-template";

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
    // Short timeouts: a wrong host/port fails in ~8 s instead of keeping the button spinning.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
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

async function viaResend(message: EmailMessage, details: GarageDetails): Promise<EmailResult> {
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resendClient.emails.send({
    from: process.env.SUPPORT_FROM_EMAIL!,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: renderHtml(message, details, false),
    ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
    ...(message.attachment ? { attachments: [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content) }] } : {}),
  });
  if (error || !data) {
    const raw = error?.message ?? "erreur inconnue";
    const hint = /domain|verify|testing emails|own email/i.test(raw)
      ? "domaine non vérifié : sans domaine, Resend n'envoie qu'à votre propre adresse. Utilisez Gmail (SMTP_USER + SMTP_PASS)"
      : raw;
    return { ok: false, error: `Resend : ${hint}` };
  }
  return { ok: true, id: data.id };
}

async function viaSmtp(message: EmailMessage, details: GarageDetails): Promise<EmailResult> {
  // Gmail only sends as the account itself: the display name is free, the address is not.
  const name = (process.env.SMTP_FROM_NAME || message.brand || "Garage").replace(/["<>]/g, "");
  const info = await smtp().sendMail({
    from: { name, address: process.env.SMTP_USER! },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: renderHtml(message, details, true),
    ...(process.env.SMTP_REPLY_TO || process.env.RESEND_REPLY_TO ? { replyTo: process.env.SMTP_REPLY_TO || process.env.RESEND_REPLY_TO } : {}),
    // Content is always passed in memory (never a path/URL): no file or network access.
    attachments: [
      ...(details.logo ? [{ filename: `logo.${details.logo.contentType.split("/")[1]}`, content: details.logo.content, contentType: details.logo.contentType, cid: LOGO_CID }] : []),
      ...(message.attachment ? [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content) }] : []),
    ],
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
  const details = await garageDetails();
  if (resendConfigured()) {
    try {
      const r = await viaResend(message, details);
      if (r.ok) return r;
      errors.push(r.error);
    } catch (error) {
      errors.push(`Resend : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (smtpConfigured()) {
    try {
      const r = await viaSmtp(message, details);
      if (r.ok) return r;
      errors.push(r.error);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const hint = /resend/i.test(process.env.SMTP_HOST ?? "")
        ? "SMTP_HOST pointe vers Resend (même blocage de domaine) : supprimez la ligne SMTP_HOST du .env pour utiliser Gmail"
        : SMTP_HINTS.find(([re]) => re.test(raw))?.[1];
      errors.push(`SMTP : ${hint ?? raw.split("\n")[0]}`);
    }
  }
  console.error("[email] not sent:", errors.join(" | "));
  return { ok: false, error: errors.join(" · ") };
}

const LOGO_CID = "garage-logo";

type GarageDetails = { contact: EmailLayout["contact"]; logo: { contentType: string; content: Buffer } | null };

/** Garage details for the e-mail footer and logo; the e-mail still goes out if they can't be read. */
async function garageDetails(): Promise<GarageDetails> {
  try {
    // Loaded only when an e-mail is sent: importing the database client at module load reads .env.
    const { getSettings } = await import("@/server/settings");
    const s = await getSettings();
    const [, contentType, base64] = s.logoDataUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/) ?? [];
    return {
      contact: { address: s.address, phone: s.phone, email: s.email },
      logo: contentType && base64 ? { contentType, content: Buffer.from(base64, "base64") } : null,
    };
  } catch {
    return { contact: undefined, logo: null };
  }
}

/** Layout in src/lib/email-template.ts. The logo is only embedded through SMTP (inline cid attachment). */
function renderHtml({ text, brand, subject }: EmailMessage, details: GarageDetails, withLogo: boolean): string {
  return renderEmailHtml({ subject, text, brand, contact: details.contact, logoCid: withLogo && details.logo ? LOGO_CID : null });
}
