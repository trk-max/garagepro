import { escapeHtml } from "@/lib/html-escape";

/**
 * Customer e-mail layout, shared by every message the garage sends (tracking link, booking,
 * quote, vehicle ready, reminders…). Mail-client-safe: tables + inline styles, no web fonts,
 * no external images (the logo is an inline attachment, `cid:`).
 *
 * The message itself stays plain text; the layout only adds presentation:
 * - the first link becomes a big button, with a label guessed from its path;
 * - an access code (« code : 8143 ») is shown in its own box;
 * - the garage's address / phone / e-mail go in the footer.
 */
export type EmailLayout = {
  subject: string;
  text: string;
  brand?: string | null;
  contact?: { address?: string | null; phone?: string | null; email?: string | null };
  /** Content-ID of the inline logo attachment, when the garage has a logo. */
  logoCid?: string | null;
};

const ACCENT = "#e10600";
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
const CODE_RE = /(code|pin|رمز)(\s*(?:d'accès|:|：)?\s*)(\d{4,8})/i;

const LABELS = {
  fr: {
    track: "Suivre ma réparation",
    booking: "Voir mon rendez-vous",
    quote: "Voir le devis",
    invoice: "Voir la facture",
    listing: "Voir l'annonce",
    open: "Ouvrir le lien",
    code: "Votre code d'accès",
    fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    sentBy: "Message envoyé par",
  },
  ar: {
    track: "تابع إصلاح سيارتك",
    booking: "عرض موعدي",
    quote: "عرض التسعيرة",
    invoice: "عرض الفاتورة",
    listing: "عرض الإعلان",
    open: "فتح الرابط",
    code: "رمز الدخول",
    fallback: "إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:",
    sentBy: "رسالة من",
  },
} as const;

type Lang = keyof typeof LABELS;

/** Label of the main button, from the link's path. */
export function ctaLabel(url: string, lang: Lang): string {
  const l = LABELS[lang];
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return l.open;
  }
  if (/suivi|track/.test(path)) return l.track;
  if (/rdv|booking|reserv|rendez/.test(path)) return l.booking;
  if (/devis|quote/.test(path)) return l.quote;
  if (/factur|invoice/.test(path)) return l.invoice;
  if (/showroom|annonce|listing|vente/.test(path)) return l.listing;
  return l.open;
}

/** "https://garage.vercel.app/suivi?plate=…" → "garage.vercel.app/suivi" (readable in the text). */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export function renderEmailHtml({ subject, text, brand, contact, logoCid }: EmailLayout): string {
  const rtl = /[؀-ۿ]/.test(text);
  const lang: Lang = rtl ? "ar" : "fr";
  const l = LABELS[lang];
  const garage = (brand ?? "").trim();
  const urls = text.match(URL_RE) ?? [];
  const mainUrl = urls[0] ?? null;
  const code = text.match(CODE_RE)?.[3] ?? null;
  const align = rtl ? "right" : "left";

  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(URL_RE, (u) => `<a href="${u}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(shortUrl(u))}</a>`)
        .replace(CODE_RE, (_m, word: string, sep: string, digits: string) => `${word}${sep}<strong style="font-family:Consolas,Menlo,monospace;letter-spacing:2px">${digits}</strong>`)
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("");

  // Hidden preview line shown by Gmail / Outlook next to the subject.
  const preheader = escapeHtml(text.replace(URL_RE, "").replace(/\s+/g, " ").trim().slice(0, 110));

  const badge = escapeHtml(garage.charAt(0).toUpperCase() || "G");
  const logo = logoCid
    ? `<img src="cid:${logoCid}" alt="${escapeHtml(garage)}" height="40" style="display:block;height:40px;max-width:160px;border:0">`
    : `<span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:${ACCENT};color:#ffffff;border-radius:8px;font-size:18px;font-weight:bold">${badge}</span>`;

  const button = mainUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${code ? "16px" : "8px"} 0 6px"><tr><td style="border-radius:10px;background:${ACCENT}">
        <a href="${mainUrl}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:10px">${escapeHtml(ctaLabel(mainUrl, lang))}</a>
      </td></tr></table>`
    : "";

  const codeBox = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:12px 20px;text-align:center">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px">${l.code}</div>
        <div style="font-family:Consolas,Menlo,monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a">${escapeHtml(code)}</div>
      </td></tr></table>`
    : "";

  const fallback = mainUrl
    ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.5">${l.fallback}<br><a href="${mainUrl}" style="color:#64748b;word-break:break-all">${escapeHtml(mainUrl)}</a></p>`
    : "";

  const phone = contact?.phone?.trim();
  const footerLines = [
    garage ? `<strong style="color:#0f172a">${escapeHtml(garage)}</strong>` : "",
    contact?.address?.trim() ? escapeHtml(contact.address.trim()) : "",
    [
      phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" style="color:#475569;text-decoration:none">${escapeHtml(phone)}</a>` : "",
      contact?.email?.trim() ? `<a href="mailto:${escapeHtml(contact.email.trim())}" style="color:#475569;text-decoration:none">${escapeHtml(contact.email.trim())}</a>` : "",
    ]
      .filter(Boolean)
      .join(" &nbsp;·&nbsp; "),
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:'Segoe UI',Roboto,Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${rtl ? "rtl" : "ltr"}" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0b0c10;padding:18px 26px;border-bottom:4px solid ${ACCENT}">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle">${logo}</td>
            <td style="vertical-align:middle;padding-${rtl ? "right" : "left"}:12px;color:#ffffff;font-size:19px;font-weight:bold">${logoCid ? "" : escapeHtml(garage)}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 26px 8px;text-align:${align}">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#0f172a">${escapeHtml(subject)}</h1>
          <div style="font-size:15px;line-height:1.65;color:#1e293b">${paragraphs}</div>
          ${codeBox}
          ${button}
          ${fallback}
        </td></tr>
        <tr><td style="padding:22px 26px 0"><div style="border-top:1px solid #e2e8f0"></div></td></tr>
        <tr><td style="padding:16px 26px 24px;text-align:${align};font-size:12px;line-height:1.7;color:#64748b">
          ${footerLines.join("<br>")}
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#94a3b8">${l.sentBy} ${escapeHtml(garage || "GaragePro")}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
