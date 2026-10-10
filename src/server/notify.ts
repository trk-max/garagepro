import "server-only";
import { emailConfigured, sendEmail } from "@/server/email";

/**
 * Outgoing customer notifications. Each channel is optional and switched on
 * only when its keys are in `.env`:
 *   SMS   → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   Email → RESEND_API_KEY, SUPPORT_FROM_EMAIL (see server/email.ts)
 * Nothing configured = nothing sent (the app keeps working; the customer
 * still gets the on-screen confirmation). Failures are logged, never thrown.
 */

export type Channel = "SMS" | "EMAIL";

export function channelsConfigured(): Channel[] {
  const out: Channel[] = [];
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) out.push("SMS");
  if (emailConfigured()) out.push("EMAIL");
  return out;
}

/** "20 111 222" / "0021620111222" → "+21620111222". */
export function toE164(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `216${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

export async function sendSms(phone: string, text: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = toE164(phone);
  if (!sid || !token || !from || !to) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: text }),
    });
    if (!res.ok) console.error("[sms] failed", res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error("[sms] error", error);
    return false;
  }
}

type NotifyMessage = { subject: string; text: string; brand?: string; attachment?: { filename: string; content: string } };

/** Sends on every configured channel the customer can receive; returns the channels that worked. */
export async function notifyCustomer(contact: { phone?: string | null; email?: string | null }, message: NotifyMessage): Promise<Channel[]> {
  return (await notifyCustomerDetailed(contact, message)).sent;
}

/**
 * Same, but also says WHY nothing went out, so the team sees the real reason
 * (no e-mail on file, Gmail password refused…) instead of a generic message.
 * SMS and e-mail run in parallel: the slowest channel sets the wait, not the sum.
 */
export async function notifyCustomerDetailed(
  contact: { phone?: string | null; email?: string | null },
  message: NotifyMessage,
): Promise<{ sent: Channel[]; errors: string[] }> {
  const sent: Channel[] = [];
  const errors: string[] = [];
  const smsOn = channelsConfigured().includes("SMS");
  const [sms, email] = await Promise.all([
    contact.phone && smsOn ? sendSms(contact.phone, message.text) : Promise.resolve(null),
    contact.email ? sendEmail({ to: contact.email, ...message }) : Promise.resolve(null),
  ]);
  if (sms === true) sent.push("SMS");
  else if (sms === false) errors.push("SMS non envoyé");
  if (email?.ok) sent.push("EMAIL");
  else if (email) errors.push(email.error);
  else if (emailConfigured()) errors.push("Ce client n'a pas d'adresse e-mail");
  return { sent, errors };
}
