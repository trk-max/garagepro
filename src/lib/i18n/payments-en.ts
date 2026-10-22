import type { paymentsFr } from "@/lib/i18n/payments-fr";

/** Partial payments — next payment date promised by the customer (invoice, order, invoice list). */
export const paymentsEn: typeof paymentsFr = {
  promise: {
    title: "Next payment",
    hint: "Date on which the customer promises to pay. The latest date recorded counts; the earlier ones stay in the history. If it passes without a payment, the invoice comes back in red in “To do”.",
    day: "Next payment date",
    amount: "Promised amount (DT, optional)",
    amountHint: "Empty = the whole balance due ({amount}).",
    note: "Note (optional)",
    submit: "Save the date",
    history: "Promise history",
    none: "No promised date yet.",
    on: "on {date}",
    rest: "the balance due",
    overdue: "Payment promise missed",
    overdueSince: "Promised on {date} — missed by {days} d",
    kept: "Promise kept: a payment was received since. Set the next date if a balance is still due.",
    waiting: "Waiting",
    by: "by {name}",
    recordedAt: "recorded on {date}",
    toSet: "To set",
    remind: "Remind the customer",
    invoiceOf: "Invoice {number}",
    noRight: "Only people who take payments can set the date.",
  },
};
