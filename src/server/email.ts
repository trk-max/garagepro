import "server-only";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/html-escape";

/**
 * Transactional e-mail through Resend (https://resend.com).
 * Needs in .env:
 *   RESEND_API_KEY      re_xxx… (Resend → API Keys)
 *   SUPPORT_FROM_EMAIL  "Garage Atlas <rdv@votredomaine.tn>"  — the domain must be verified in Resend.
 *                       Before verifying a domain you can use "Garage <onboarding@resend.dev>",
 *                       but Resend then only delivers to the e-mail address of your Resend account.
 * Optional:
 *   RESEND_REPLY_TO     where customer replies go (e.g. the garage's Gmail)
 */

let client: Resend | null = null;

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.SUPPORT_FROM_EMAIL);
}

export function emailSender(): string | null {
  return process.env.SUPPORT_FROM_EMAIL ?? null;
}

function resend(): Resend {
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
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

/** Sends one e-mail. Never throws: returns Resend's error message so the UI can show it. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, error: "RESEND_API_KEY / SUPPORT_FROM_EMAIL manquant dans .env" };
  try {
    const { data, error } = await resend().emails.send({
      from: process.env.SUPPORT_FROM_EMAIL!,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: renderHtml(message),
      ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
      ...(message.attachment
        ? { attachments: [{ filename: message.attachment.filename, content: Buffer.from(message.attachment.content) }] }
        : {}),
    });
    if (error || !data) {
      console.error("[email] Resend error", error);
      return { ok: false, error: error?.message ?? "Unknown Resend error" };
    }
    return { ok: true, id: data.id };
  } catch (error) {
    console.error("[email] send failed", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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
