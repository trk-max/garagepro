import { escapeHtml } from "@/lib/html-escape";

/**
 * Customer e-mail layout, shared by every message the garage sends (tracking link, booking,
 * quote, supplement, vehicle ready, reminders…), in the GaragePro website style: black header and
 * footer, uppercase spaced labels, red accent, GaragePro monogram. Mail-client-safe: tables +
 * inline styles, system fonts.
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
  /** Image source of the GaragePro monogram: "cid:…" (inline attachment) or an https URL. */
  productLogoSrc?: string | null;
  /** Content-ID of the garage's own logo (Paramètres › logo des documents), when it has one. */
  logoCid?: string | null;
};

const ACCENT = "#e10600";
const INK = "#0a0a0a";
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
const CODE_RE = /(code|pin|رمز)(\s*(?:d'accès|:|：)?\s*)(\d{4,8})/i;
const DISPLAY = "'Archivo','Segoe UI','Helvetica Neue',Arial,sans-serif";
const BODY = "'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif";

const LABELS = {
  fr: {
    track: "Suivre ma réparation",
    booking: "Voir mon rendez-vous",
    quote: "Voir et valider le devis",
    invoice: "Voir la facture",
    listing: "Voir l'annonce",
    open: "Ouvrir le lien",
    code: "Votre code d'accès",
    fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    poweredBy: "Propulsé par",
    auto: "Message envoyé par votre garage.",
  },
  ar: {
    track: "تابع إصلاح سيارتك",
    booking: "عرض موعدي",
    quote: "عرض التسعيرة والموافقة",
    invoice: "عرض الفاتورة",
    listing: "عرض الإعلان",
    open: "فتح الرابط",
    code: "رمز الدخول",
    fallback: "إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:",
    poweredBy: "بواسطة",
    auto: "رسالة من الورشة.",
  },
} as const;

type Lang = keyof typeof LABELS;

/** Label of the main button, from the link's path (and the text, for quotes sent through the tracking page). */
export function ctaLabel(url: string, lang: Lang, text = ""): string {
  const l = LABELS[lang];
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return l.open;
  }
  if (/devis|supplément|à valider|تسعيرة|إضافة/i.test(text) && /suivi/.test(path)) return l.quote;
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
    const u = new URL(url.replace(/&amp;/g, "&"));
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export function renderEmailHtml({ subject, text, brand, contact, productLogoSrc, logoCid }: EmailLayout): string {
  const rtl = /[؀-ۿ]/.test(text);
  const lang: Lang = rtl ? "ar" : "fr";
  const l = LABELS[lang];
  const garage = (brand ?? "").trim();
  const mainUrl = text.match(URL_RE)?.[0] ?? null;
  const code = text.match(CODE_RE)?.[3] ?? null;
  const align = rtl ? "right" : "left";
  const dir = rtl ? "rtl" : "ltr";
  const arrow = rtl ? "&larr;" : "&rarr;";

  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(URL_RE, (u) => `<a href="${u}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(shortUrl(u))}</a>`)
        .replace(CODE_RE, (_m, word: string, sep: string, digits: string) => `${word}${sep}<strong style="letter-spacing:2px;color:${INK}">${digits}</strong>`)
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("");

  // Hidden preview line shown by Gmail / Outlook next to the subject.
  const preheader = escapeHtml(text.replace(URL_RE, "").replace(/\s+/g, " ").trim().slice(0, 110));

  const headerMark = logoCid
    ? `<img src="cid:${logoCid}" alt="${escapeHtml(garage)}" height="40" style="display:block;height:40px;max-width:150px;border:0">`
    : productLogoSrc
      ? `<img src="${escapeHtml(productLogoSrc)}" alt="GaragePro" width="40" height="40" style="display:block;width:40px;height:40px;border:0;border-radius:8px">`
      : `<span style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;background:${ACCENT};color:#ffffff;border-radius:8px;font-family:${DISPLAY};font-size:18px;font-weight:800">${escapeHtml(garage.charAt(0).toUpperCase() || "G")}</span>`;

  const button = mainUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${code ? "18px" : "8px"} 0 4px"><tr><td style="background:${INK};border-radius:4px">
        <a href="${mainUrl}" style="display:inline-block;padding:16px 28px;font-family:${DISPLAY};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none">${escapeHtml(ctaLabel(mainUrl, lang, text))} &nbsp;${arrow}</a>
      </td></tr></table>`
    : "";

  const codeBox = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px"><tr><td style="background:#fff4f3;border:1px solid #ffd6d3;border-radius:12px;padding:14px 24px;text-align:${align}">
        <div style="font-family:${BODY};font-size:11px;color:#9f1d14;text-transform:uppercase;letter-spacing:2px">${l.code}</div>
        <div style="font-family:${DISPLAY};font-size:32px;font-weight:800;letter-spacing:10px;color:${INK};padding-top:2px">${escapeHtml(code)}</div>
      </td></tr></table>`
    : "";

  const fallback = mainUrl
    ? `<p style="margin:22px 0 0;font-size:12px;color:#71717a;line-height:1.5">${l.fallback}<br><a href="${mainUrl}" style="color:#71717a;word-break:break-all">${escapeHtml(mainUrl)}</a></p>`
    : "";

  const phone = contact?.phone?.trim();
  const email = contact?.email?.trim();
  const reach = [
    phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" style="color:#e4e4e7;text-decoration:none">${escapeHtml(phone)}</a>` : "",
    email ? `<a href="mailto:${escapeHtml(email)}" style="color:#e4e4e7;text-decoration:none">${escapeHtml(email)}</a>` : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  const powered = productLogoSrc
    ? `<img src="${escapeHtml(productLogoSrc)}" alt="" width="16" height="16" style="width:16px;height:16px;border:0;vertical-align:middle;border-radius:3px">&nbsp; ${l.poweredBy} <strong style="color:#a1a1aa">GaragePro</strong>`
    : `${l.poweredBy} <strong style="color:#a1a1aa">GaragePro</strong>`;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${BODY};color:${INK}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="background:${INK};padding:20px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;width:40px">${headerMark}</td>
            <td style="vertical-align:middle;padding-${rtl ? "right" : "left"}:14px;font-family:${DISPLAY};color:#ffffff;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(garage)}</td>
          </tr></table>
        </td></tr>
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${ACCENT}">&nbsp;</td></tr>
        <tr><td style="padding:32px 28px 30px;text-align:${align}">
          <h1 style="margin:0 0 18px;font-family:${DISPLAY};font-size:24px;line-height:1.25;font-weight:800;color:${INK}">${escapeHtml(subject)}</h1>
          <div style="font-size:15px;line-height:1.7;color:#27272a">${paragraphs}</div>
          ${codeBox}
          ${button}
          ${fallback}
        </td></tr>
        <tr><td style="background:${INK};padding:22px 28px;text-align:${align};font-size:12px;line-height:1.8;color:#a1a1aa">
          ${garage ? `<div style="font-family:${DISPLAY};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${escapeHtml(garage)}</div>` : ""}
          ${contact?.address?.trim() ? `<div>${escapeHtml(contact.address.trim())}</div>` : ""}
          ${reach ? `<div>${reach}</div>` : ""}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;font-family:${BODY}">${l.auto} &nbsp;${powered}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
