import type { staffUxFr } from "@/lib/i18n/staff-ux-fr";

/** feat/staff-ux — intake first, vehicle QR on documents, manual reception ticket. */
export const staffUxEn: typeof staffUxFr = {
  intake: {
    firstTitle: "First: the intake",
    firstHint: "Fill in the repair order, then have the customer sign. Once signed, the intake folds away behind a button.",
    show: "Intake signed — view",
    hide: "Hide the intake",
  },
  qr: {
    carnet: "Vehicle logbook",
    scan: "Scan to open the vehicle logbook",
  },
  ticket: {
    nav: "Manual ticket",
    title: "Manual ticket",
    subtitle: "For a customer who did not take a ticket at the kiosk. The ticket can also be sent to their phone.",
    open: "Manual ticket",
    back: "Back to the reception desk",
    phoneTitle: "Send the ticket to the customer's phone (optional)",
    phoneHint: "The customer gets a message with the number and the tracking link, then « N people before you » and « it is your turn ». Only with their consent.",
    email: "E-mail (optional)",
    consent: "The customer agrees to receive messages (SMS / e-mail) about this ticket — no other use.",
    langs: { fr: "Français", ar: "العربية", en: "English" },
    lang: "Language of the messages",
    created: "Ticket {ticket}",
    scan: "The customer can scan this code to follow their turn on their phone.",
    link: "Tracking link",
    noLink: "Site address not set: the tracking link is not available.",
    another: "New ticket",
    sent: {
      SENT: "Message sent to the customer.",
      PENDING: "Message queued: it will leave as soon as possible.",
      FAILED: "Sending failed: it will be retried automatically.",
      SKIPPED: "No sending channel set up (SMS): no message was sent.",
      NONE: "No phone or no consent: no message.",
    },
  },
};
