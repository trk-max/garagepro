import type { v16Fr } from "@/lib/i18n/v16-fr";

/** V16 — traceable workshop flow (Lot 1). */
export const v16En: typeof v16Fr = {
  status: {
    open: "Change status…",
    title: "Change status",
    to: "New status",
    reason: "Reason",
    reasonRequired: "A reason is required for this change",
    reasonPlaceholder: "E.g. the customer does not want the work done",
    reasonHint: "The reason stays internal: it is never shown to the customer.",
    submit: "Confirm",
    next: "Next step: {status}",
    none: "You cannot change the status at this step.",
    noInvoice: "No invoice yet: delivery is refused.",
    balanceDue: "Still due: {amount} (deposit deducted). Delivery is refused.",
    override: "Deliver anyway (override, reason required)",
    overrideOnlyManager: "Only a manager can deliver with an override.",
    workWithoutQuote: "Work without a quote is turned off for this order (Settings › Workshop flow).",
    legacy: "Order opened before V16: the new quote and delivery rules do not apply.",
  },
  line: {
    void: "Void the line",
    voidTitle: "Void this line",
    voidHint: "This line was part of the customer’s agreement: it will be voided (struck through, kept), not deleted. Its parts go back to stock.",
    voided: "Voided on {date} — {reason}",
    voidedShort: "Voided",
  },
  promisedInitial: "First promised date",
  settings: {
    title: "Workshop flow",
    intro: "Rules for new repair orders (orders opened before V16 are not affected).",
    allowWorkWithoutQuote: "Allow work without a quote (Received / Diagnosis → In progress)",
    allowWorkWithoutQuoteHint: "Off: the order must go through “Quote sent”.",
    requirePaidBeforeDelivery: "Deliver only with a settled invoice (deposit deducted)",
    requirePaidBeforeDeliveryHint: "A manager can always deliver with an override, with a reason recorded in the journal.",
    saved: "Workshop flow settings saved",
  },
  events: {
    reason: "Reason: {reason}",
    override: "Delivered with an override (still due: {amount})",
    auto: "Closed automatically (invoice settled)",
    lineVoided: "voided the line: {description}",
  },
};
