import { DocFooter, DocLogo } from "@/components/garage/doc-brand";
import { displayPlate, formatDate, formatDateTime, formatKm, formatMoney, formatQty, woNumber } from "@/lib/format";
import { BODY_ZONE_FR, LAWYER_NOTICE, PARTS_ORIGINS, PARTS_ORIGIN_FR, type BodyZone, type RepairClause } from "@/lib/repair-order";

export type RepairOrderDoc = {
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; registry: string | null; footer: string | null };
  customer: { name: string; idLine: string | null; address: string | null; phone: string };
  vehicle: { make: string; model: string; plate: string; vin: string | null; mileage: number | null; fuelLevel: number | null; bodyZones: BodyZone[]; bodyNotes: string | null };
  number: number;
  createdAt: Date;
  promisedAt: Date | null;
  complaint: string;
  lines: { description: string; kind: string; quantityX100: number; totalHt: number }[];
  partsOrigin: string | null;
  estimate: { amount: number; source: "LINES" | "TYPED" } | null;
  deposit: { amount: number; method: string } | null;
  clauses: RepairClause[];
  reviewed: { day: Date } | null;
};

const money = (m: number) => formatMoney(m, "fr");
const box = (on: boolean) => (on ? "☒" : "☐");

function Block({ title, rows }: { title: string; rows: [string, string | null][] }) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-1.5 border-b pb-1 text-xs font-bold uppercase tracking-wide">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k}>
          <span className="font-semibold">{k} : </span>
          {v || "……………………"}
        </p>
      ))}
    </div>
  );
}

/**
 * A4 « Ordre de réparation et prise en charge » (V10.6), always in French (document language).
 * Signature boxes stay EMPTY: printed, signed by hand (no electronic signature, Law 2000-83).
 */
export function RepairOrderView({ doc, logo }: { doc: RepairOrderDoc; logo?: string | null }) {
  const g = doc.garage;
  const v = doc.vehicle;
  return (
    <article className="paper mx-auto max-w-[210mm] bg-white p-10 text-[12.5px] leading-snug text-zinc-900 shadow-sm max-sm:p-4 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-4">
        <div>
          <DocLogo logo={logo} name={g.name} />
          <h2 className="text-lg font-bold">{g.name}</h2>
          {g.address && <p className="whitespace-pre-line">{g.address}</p>}
          <p dir="ltr">{[g.phone, g.email].filter(Boolean).join(" · ")}</p>
          <p>{[g.taxId ? `MF : ${g.taxId}` : null, g.registry ? `RC : ${g.registry}` : null].filter(Boolean).join(" | ") || "MF : …………… | RC : ……………"}</p>
        </div>
        <div className="text-end">
          <p className="text-xl font-bold uppercase tracking-wide">Ordre de réparation</p>
          <p className="text-sm font-semibold uppercase">et prise en charge</p>
          <p className="font-mono">N° {woNumber(doc.number)}</p>
          <p>Date : {formatDateTime(doc.createdAt, "fr")}</p>
          {doc.promisedAt && <p className="text-xs">Restitution prévue : {formatDateTime(doc.promisedAt, "fr")}</p>}
        </div>
      </header>

      <section className="grid gap-4 py-4 sm:grid-cols-2 print:grid-cols-2">
        <Block
          title="1. Identification du client"
          rows={[
            ["Nom / Raison sociale", doc.customer.name],
            ["CIN / MF", doc.customer.idLine],
            ["Téléphone", doc.customer.phone],
            ["Adresse", doc.customer.address],
          ]}
        />
        <Block
          title="2. Identification du véhicule"
          rows={[
            ["Marque / Modèle", `${v.make} ${v.model}`],
            ["Immatriculation", displayPlate(v.plate)],
            ["N° châssis (VIN)", v.vin],
            ["Kilométrage", v.mileage === null ? null : formatKm(v.mileage, "fr")],
            ["Carburant", v.fuelLevel ? [1, 2, 3, 4].map((q) => `${box(q === v.fuelLevel)} ${q}/4`).join("  ") : "☐ 1/4  ☐ 2/4  ☐ 3/4  ☐ 4/4"],
          ]}
        />
      </section>

      <section className="rounded-md border p-3">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide">État de la carrosserie à la réception (rayures / chocs)</p>
        <p>{v.bodyZones.length ? v.bodyZones.map((z) => BODY_ZONE_FR[z]).join(" · ") : "Aucune zone cochée."}</p>
        <p className="mt-1 whitespace-pre-line">{v.bodyNotes || "Observations : ……………………………………………………………………………"}</p>
      </section>

      <h3 className="mt-4 border-b-2 border-zinc-800 pb-1 text-sm font-bold uppercase">3. Travaux demandés et estimation</h3>
      <p className="mt-2">
        <span className="font-semibold">Demande du client : </span>
        <span className="whitespace-pre-line">{doc.complaint}</span>
      </p>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y bg-zinc-50 text-xs uppercase text-zinc-600">
            <th className="px-2 py-1.5 text-start">Désignation des prestations / réparations</th>
            <th className="px-2 py-1.5 text-end">Qté</th>
            <th className="px-2 py-1.5 text-end">Est. HT</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="px-2 py-1.5">
                {l.description} <span className="text-xs text-zinc-500">({l.kind})</span>
              </td>
              <td className="px-2 py-1.5 text-end tabular-nums">{formatQty(l.quantityX100, "fr")}</td>
              <td className="px-2 py-1.5 text-end tabular-nums" dir="ltr">{money(l.totalHt)}</td>
            </tr>
          ))}
          {doc.lines.length === 0 &&
            [0, 1, 2].map((i) => (
              <tr key={i} className="border-b">
                <td className="px-2 py-3" colSpan={3} />
              </tr>
            ))}
        </tbody>
      </table>

      <section className="mt-3 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="font-semibold">Origine des pièces (accord du client) :</p>
          {PARTS_ORIGINS.map((o) => (
            <p key={o}>
              {box(doc.partsOrigin === o)} {PARTS_ORIGIN_FR[o]}
            </p>
          ))}
        </div>
        <dl className="space-y-1">
          <div className="flex justify-between gap-2">
            <dt className="font-semibold">Montant estimatif TTC</dt>
            <dd dir="ltr" className="tabular-nums">{doc.estimate ? money(doc.estimate.amount) : "……………… DT"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-semibold">Acompte versé</dt>
            <dd dir="ltr" className="tabular-nums">{doc.deposit ? `${money(doc.deposit.amount)} (${doc.deposit.method})` : "……………… DT"}</dd>
          </div>
          {doc.estimate && doc.deposit && (
            <div className="flex justify-between gap-2 border-t pt-1">
              <dt>Reste estimé</dt>
              <dd dir="ltr" className="tabular-nums">{money(Math.max(0, doc.estimate.amount - doc.deposit.amount))}</dd>
            </div>
          )}
          <p className="text-[11px] text-zinc-500">Montant indicatif : le prix définitif figure sur la facture ; tout travail supplémentaire est soumis à l&apos;accord préalable du client.</p>
        </dl>
      </section>

      <h3 className="mt-4 border-b-2 border-zinc-800 pb-1 text-sm font-bold uppercase">4. Conditions générales</h3>
      <div className="mt-2 space-y-1.5 text-justify text-[11.5px]">
        {doc.clauses.map((c, i) => (
          <p key={i}>
            <span className="font-bold">
              Art. {i + 1}
              {c.title ? ` (${c.title})` : ""} :
            </span>{" "}
            {c.body}
          </p>
        ))}
      </div>
      {doc.reviewed ? (
        <p className="mt-2 text-[11px] text-zinc-500">Clauses validées par un juriste le {formatDate(doc.reviewed.day, "fr")}.</p>
      ) : (
        <p className="mt-2 rounded border border-zinc-400 px-2 py-1 text-[11px] font-semibold">{LAWYER_NOTICE}</p>
      )}

      <section className="mt-5 grid grid-cols-2 gap-8 border-t border-dashed pt-3 text-center break-inside-avoid">
        <div>
          <p className="font-bold">Le Client</p>
          <p className="text-[11px] text-zinc-500">(Lu et approuvé — Bon pour accord)</p>
          <div className="mt-2 h-24 rounded border border-dashed" />
        </div>
        <div>
          <p className="font-bold">Pour le Garage</p>
          <p className="text-[11px] text-zinc-500">(Cachet et signature)</p>
          <div className="mt-2 h-24 rounded border border-dashed" />
        </div>
      </section>
      <DocFooter garage={g} text={g.footer} taxIdLabel="MF" />
    </article>
  );
}
