import { OPTION_LABELS_FR, type LegalRef } from "@/lib/contract-templates";
import { fillPlaceholders, includedClauses, type TemplateClause, type TemplateField } from "@/lib/contracts";
import { amountInFrenchWords } from "@/lib/amount-words";

/**
 * Printable content of a contract (V9.0), built from the template version stored in the database,
 * the typed fields and the snapshot of the parties. Pure: the PDF (src/server/contract-pdf.ts) and
 * the page preview draw exactly this. French (document language). Signature blocks stay EMPTY.
 */

export type GarageSnap = {
  name: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  registry: string | null;
  repName: string | null;
  repTitle: string | null;
};
export type PartySnap = {
  kind: "CUSTOMER" | "EMPLOYEE" | "SUPPLIER" | "OTHER";
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  nationalId?: string | null;
  isCompany?: boolean;
};
export type VehicleSnap = { plate: string; make: string; model: string; vin: string | null; year: number | null; mileage: number | null };
export type RepairLineSnap = { type: "LABOR" | "PART"; description: string; quantityX100: number; unitTtc: number; totalTtc: number; taxRateBp: number };
export type RepairSnap = {
  workOrderNumber: number;
  complaint: string;
  diagnosis: string | null;
  mileageIn: number | null;
  lines: RepairLineSnap[];
  totals: { ht: number; tax: number; stamp: number; ttc: number };
  /** Lines with a negative price (discounts), already inside `lines`. */
  discountTtc: number;
  quoteApprovedAt: string | null;
  promisedAt: string | null;
  invoice: { number: string; totalTtc: number; paid: number; status: string } | null;
  warranties: { label: string; endDay: string | null; endKm: number | null }[];
};
export type ContractSnapshot = { garage: GarageSnap; party: PartySnap | null; vehicles: VehicleSnap[]; repair?: RepairSnap | null; takenAt: string };

export type ContractDataJson = { fields: Record<string, string>; snapshot: ContractSnapshot | null; excluded: string[] };

/** Reads Contract.data whatever its age (missing keys → empty). */
export function readContractData(raw: unknown): ContractDataJson {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<ContractDataJson>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.fields ?? {})) if (typeof v === "string") fields[k] = v;
  return { fields, snapshot: (o.snapshot as ContractSnapshot) ?? null, excluded: Array.isArray(o.excluded) ? o.excluded.filter((x): x is string => typeof x === "string") : [] };
}

// ── Formatting (plain characters: the PDF standard fonts draw WinAnsi only) ──

export const frDay = (day: string | null | undefined) => (day && /^\d{4}-\d{2}-\d{2}/.test(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "……");

/** 1234500 millimes → "1 234,500 DT". */
export function dt(millimes: number): string {
  const neg = millimes < 0;
  const abs = Math.abs(Math.round(millimes));
  const int = Math.floor(abs / 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${int},${String(abs % 1000).padStart(3, "0")} DT`;
}
const moneyText = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? dt(Math.round(n * 1000)) : s;
};
const qty = (x100: number) => (x100 % 100 === 0 ? String(x100 / 100) : (x100 / 100).toFixed(2).replace(".", ","));
export const kmText = (km: number | null | undefined) => (km === null || km === undefined ? "……" : `${km.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} km`);
export const woRef = (n: number) => `OR-${String(n).padStart(4, "0")}`;

export const vehicleLine = (v: VehicleSnap) => [v.plate, `${v.make} ${v.model}`.trim(), v.year ? String(v.year) : null, v.vin ? `VIN ${v.vin}` : null, v.mileage !== null ? kmText(v.mileage) : null].filter(Boolean).join(" · ");

const PARTY_LABELS: Record<string, [string, string]> = {
  REPAIR: ["Le Garage", "Le Client"],
  FLEET: ["Le Garage", "L'Entreprise cliente"],
  EMPLOYMENT: ["L'Employeur", "Le Salarié"],
  SUPPLIER: ["Le Garage", "Le Fournisseur / Prestataire"],
  BLANK: ["Partie 1", "Partie 2"],
};

const CONFIDENCE_FR: Record<string, string> = { OFFICIAL: "officiel", OFFICIAL_PARTIAL: "officiel, texte partiellement illisible", SECONDARY: "source secondaire" };

export type DocInput = {
  number: string;
  category: string;
  startDay: string;
  endDay: string | null;
  indefinite: boolean;
  data: ContractDataJson;
  renewal?: { previousNumber: string; basis: string } | null;
  template: {
    title: string;
    version: number;
    fields: TemplateField[];
    clauses: TemplateClause[];
    legalRefs: LegalRef[];
    unverified: string[];
    verifiedDay: string;
    reviewStatus: string;
    reviewedDay: string | null;
  };
};

export type ContractDoc = {
  title: string;
  number: string;
  versionLine: string;
  parties: { label: string; lines: string[] }[];
  vehicles: string[];
  repair: { rows: [string, string, string, string][]; totals: [string, string][] } | null;
  clauses: { title: string; text: string }[];
  renewalLine: string | null;
  /** "Modèle à valider par un juriste — références : …" while the version is not reviewed. */
  legalNotice: string;
  unverified: string[];
  signatures: [string, string];
};

function partyLines(p: PartySnap | null): string[] {
  if (!p) return ["……"];
  return [
    p.name,
    p.address?.replace(/\s*\n\s*/g, ", ") ?? null,
    p.taxId ? `Matricule fiscal : ${p.taxId}` : null,
    p.nationalId ? `CIN : ${p.nationalId}` : null,
    [p.phone, p.email].filter(Boolean).join(" · ") || null,
  ].filter((x): x is string => !!x);
}

function garageLines(g: GarageSnap): string[] {
  return [
    g.legalName || g.name,
    g.address?.replace(/\s*\n\s*/g, ", ") ?? null,
    g.taxId ? `Matricule fiscal : ${g.taxId}` : null,
    g.registry,
    g.repName ? `Représenté par ${g.repName}${g.repTitle ? `, ${g.repTitle}` : ""}` : null,
  ].filter((x): x is string => !!x);
}

/** Values of the {{placeholders}}: typed fields (select values in French) + computed texts. */
export function placeholderValues(input: DocInput): Record<string, string> {
  const { fields } = input.data;
  const snap = input.data.snapshot;
  const values: Record<string, string> = {};
  for (const f of input.template.fields) {
    const v = fields[f.key];
    if (!v) continue;
    values[f.key] = f.type === "select" ? (OPTION_LABELS_FR[v] ?? v) : f.type === "money" ? moneyText(v) : f.type === "date" ? frDay(v) : v;
  }
  values.startDate = frDay(input.startDay);
  values.endDate = input.endDay ? frDay(input.endDay) : "";
  values.endText = input.endDay ? ` et prend fin le ${frDay(input.endDay)}` : input.indefinite ? ", pour une durée indéterminée" : "";
  values.employerName = snap ? snap.garage.legalName || snap.garage.name : "";
  values.employeeName = fields.employeeName || snap?.party?.name || "";
  values.vehicleList = (snap?.vehicles ?? []).map(vehicleLine).join(" ; ");
  const probation = Number(fields.probationMonths || 0);
  values.probationText = probation > 0 ? `${probation} mois${fields.probationRenewable === "YES" ? ", renouvelable une seule fois pour une durée au plus égale, la fin de l'essai étant notifiée par écrit 15 jours avant son terme" : ""}` : "aucune";
  // V10.6 (CDI v2): salary in words, as in the owner's model ("995 TND (neuf cent quatre-vingt-quinze dinars)").
  const salary = Number(fields.salary);
  if (fields.salary && Number.isFinite(salary) && salary >= 0) values.salaryWords = amountInFrenchWords(Math.round(salary * 1000));
  values.replacedText = fields.cddReason === "REMPLACEMENT" && fields.replacedEmployee ? ` (salarié remplacé : ${fields.replacedEmployee})` : "";
  const r = snap?.repair;
  if (r) {
    values.complaint = r.complaint;
    values.totalTtc = dt(r.invoice?.totalTtc ?? r.totals.ttc);
    values.quoteApproval = r.quoteApprovedAt ? `accepté par le Client le ${frDay(r.quoteApprovedAt)}` : "non encore accepté par le Client";
    values.invoiceSituation = r.invoice
      ? `facture ${r.invoice.number}, total ${dt(r.invoice.totalTtc)}, déjà payé ${dt(r.invoice.paid)}, reste ${dt(Math.max(0, r.invoice.totalTtc - r.invoice.paid))}`
      : "facture non encore émise";
  }
  return values;
}

export function buildContractDoc(input: DocInput): ContractDoc {
  const snap = input.data.snapshot;
  const t = input.template;
  const [l1, l2] = PARTY_LABELS[input.category] ?? PARTY_LABELS.BLANK!;
  const values = placeholderValues(input);
  const clauses = includedClauses(t.clauses, input.data.excluded, input.data.fields).map((c) => ({ title: c.title, text: fillPlaceholders(c.body, values) }));
  const refs = t.legalRefs.map((r) => `${r.ref} (${CONFIDENCE_FR[r.confidence] ?? r.confidence})`).join(" ; ");
  const reviewed = t.reviewStatus === "REVIEWED" && t.reviewedDay;
  const party: PartySnap | null =
    input.category === "BLANK" && !snap?.party && input.data.fields.partyName
      ? { kind: "OTHER", name: input.data.fields.partyName, address: input.data.fields.partyAddress ?? null }
      : (snap?.party ?? null);
  const r = snap?.repair ?? null;
  return {
    title: t.title,
    number: input.number,
    versionLine: `Modèle v${t.version} · Droit tunisien · Références vérifiées le ${frDay(t.verifiedDay)}`,
    parties: [
      { label: l1, lines: snap ? garageLines(snap.garage) : ["……"] },
      { label: l2, lines: partyLines(party) },
    ],
    vehicles: (snap?.vehicles ?? []).map(vehicleLine),
    repair: r
      ? {
          rows: r.lines.map((l) => [l.description, qty(l.quantityX100), dt(l.unitTtc), dt(l.totalTtc)]),
          totals: [
            ["Total HT", dt(r.totals.ht)],
            ["TVA", dt(r.totals.tax)],
            ...(r.totals.stamp ? ([["Droit de timbre", dt(r.totals.stamp)]] as [string, string][]) : []),
            ["Remises", r.discountTtc ? dt(r.discountTtc) : "aucune"],
            ["Total TTC", dt(r.totals.ttc)],
          ],
        }
      : null,
    clauses,
    renewalLine: input.renewal ? `Renouvellement du contrat ${input.renewal.previousNumber} — fondement : ${input.renewal.basis}` : null,
    legalNotice: reviewed
      ? `Modèle relu par un juriste le ${frDay(t.reviewedDay)} — références : ${refs}`
      : `Modèle à valider par un juriste — références : ${refs}`,
    unverified: reviewed ? [] : t.unverified,
    signatures: [`${l1} (signature et cachet)`, `${l2} (signature précédée de « lu et approuvé »)`],
  };
}
