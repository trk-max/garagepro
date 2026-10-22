import { describe, expect, it } from "vitest";
import { snapshotLegal } from "@/lib/invoice-snapshot";
import {
  cleanBodyZones,
  cleanRepairClauses,
  DEFAULT_REPAIR_CLAUSES,
  estimateOf,
  fuelLabel,
  LAWYER_NOTICE,
  readRepairClauses,
  renderRepairClauses,
  repairTermsChanged,
} from "@/lib/repair-order";
import { parseIntakeForm, parseRepairTermsForm } from "@/lib/repair-order-forms";

const amounts = { storageFeePerDay: 20_000, storageGraceHours: 48, abandonmentDays: 30 };

describe("clauses de l'ordre de réparation", () => {
  it("6 articles par défaut, repris du kit du garage, jamais présentés comme vérifiés", () => {
    expect(DEFAULT_REPAIR_CLAUSES.map((c) => c.title)).toEqual([
      "Autorisation de réparation et essais",
      "Travaux supplémentaires",
      "Droit de rétention",
      "Frais de gardiennage",
      "Effets personnels",
      "Abandon du véhicule",
    ]);
    expect(JSON.stringify(DEFAULT_REPAIR_CLAUSES)).not.toMatch(/conforme au|vérifi|art\.\s*\d/i);
    expect(LAWYER_NOTICE).toBe("Clauses à faire valider par un juriste (droit tunisien)");
  });
  it("montants et délais remplis depuis les paramètres", () => {
    const text = renderRepairClauses(DEFAULT_REPAIR_CLAUSES, amounts).map((c) => c.body).join("\n");
    expect(text).toMatch(/franchise de 48 heures/);
    expect(text).toMatch(/gardiennage de 20,000 DT par jour/);
    expect(text).toMatch(/pendant 30 jours/);
    expect(text).not.toMatch(/\{\w+\}/);
    expect(renderRepairClauses([{ title: "X", body: "{inconnu} {storageFee}" }], { ...amounts, storageFeePerDay: 1_234_500 })[0]!.body).toBe("{inconnu} 1 234,500 DT");
  });
  it("lecture : null ou invalide → textes par défaut", () => {
    expect(readRepairClauses(null)).toHaveLength(6);
    expect(readRepairClauses([{ title: 1 }])).toHaveLength(6);
    expect(readRepairClauses([{ title: "A", body: "B" }])).toEqual([{ title: "A", body: "B" }]);
  });
  it("formulaire : texte vide = article retiré, limites appliquées", () => {
    const out = cleanRepairClauses([{ title: " A ", body: " texte " }, { title: "vide", body: "  " }, { title: "x".repeat(300), body: "y".repeat(3000) }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "A", body: "texte" });
    expect(out[1]!.title).toHaveLength(120);
    expect(out[1]!.body).toHaveLength(2000);
    expect(cleanRepairClauses(Array.from({ length: 20 }, () => ({ title: "t", body: "b" })))).toHaveLength(12);
  });
  it("tout changement de texte ou de montant annule la validation par un juriste", () => {
    const base = { clauses: [{ title: "A", body: "B" }], ...amounts };
    expect(repairTermsChanged(base, { ...base })).toBe(false);
    expect(repairTermsChanged(base, { ...base, clauses: [{ title: "A", body: "C" }] })).toBe(true);
    expect(repairTermsChanged(base, { ...base, storageFeePerDay: 15_000 })).toBe(true);
    expect(repairTermsChanged(base, { ...base, abandonmentDays: 60 })).toBe(true);
  });
  it("Paramètres : lecture du formulaire", () => {
    const f = new FormData();
    f.set("clause_title_0", "Art A");
    f.set("clause_body_0", "Texte A");
    f.set("clause_title_1", "Retiré");
    f.set("clause_body_1", "");
    f.set("clause_title_2", "");
    f.set("clause_body_2", "Sans titre");
    f.set("storageFeePerDay", "15,5");
    f.set("storageGraceHours", "72");
    f.set("abandonmentDays", "45");
    f.set("invoicePaymentTerms", "");
    f.set("invoicePenaltyText", "1 % par mois");
    expect(parseRepairTermsForm(f)).toEqual({
      clauses: [
        { title: "Art A", body: "Texte A" },
        { title: "", body: "Sans titre" },
      ],
      storageFeePerDay: 15_500,
      storageGraceHours: 72,
      abandonmentDays: 45,
      invoicePaymentTerms: undefined,
      invoicePenaltyText: "1 % par mois",
    });
    f.set("abandonmentDays", "0");
    expect(() => parseRepairTermsForm(f)).toThrow();
  });
});

describe("prise en charge", () => {
  it("carburant 1/4 à 4/4, zones connues seulement", () => {
    expect(fuelLabel(3)).toBe("3/4");
    expect(fuelLabel(0)).toBeNull();
    expect(fuelLabel(5)).toBeNull();
    expect(cleanBodyZones(["LEFT_SIDE", "HACK", "FRONT_BUMPER", "LEFT_SIDE"])).toEqual(["FRONT_BUMPER", "LEFT_SIDE"]);
    expect(cleanBodyZones("x")).toEqual([]);
  });
  it("estimation : lignes d'abord, sinon le montant saisi, sinon rien (laissé en blanc)", () => {
    expect(estimateOf(119_000, 50_000)).toEqual({ amount: 119_000, source: "LINES" });
    expect(estimateOf(null, 50_000)).toEqual({ amount: 50_000, source: "TYPED" });
    expect(estimateOf(null, null)).toBeNull();
  });
  it("formulaire : valeurs contrôlées, CIN vidé = null, absent = inchangé", () => {
    const f = new FormData();
    f.set("fuelLevel", "2");
    f.set("partsOrigin", "ADAPTABLE");
    f.append("bodyChecklist", "ROOF");
    f.append("bodyChecklist", "NOPE");
    f.set("bodyDamageNotes", " rayure porte ");
    f.set("estimateTtc", "350");
    f.set("depositAmount", "100,000");
    f.set("depositMethod", "CARD");
    f.set("customerNationalId", "  ");
    expect(parseIntakeForm(f)).toEqual({
      fuelLevel: 2,
      partsOrigin: "ADAPTABLE",
      bodyChecklist: ["ROOF"],
      bodyDamageNotes: "rayure porte",
      estimateTtc: 350_000,
      depositAmount: 100_000,
      depositMethod: "CARD",
      customerNationalId: null,
    });
    const g = new FormData();
    expect(parseIntakeForm(g)).toEqual({ bodyChecklist: [], customerNationalId: undefined });
    g.set("fuelLevel", "5");
    expect(() => parseIntakeForm(g)).toThrow();
    const h = new FormData();
    h.set("partsOrigin", "CHINE");
    expect(() => parseIntakeForm(h)).toThrow();
  });
});

describe("facture : mentions figées (nouvelles factures seulement)", () => {
  it("ancienne facture : aucune mention, jamais lue dans les paramètres actuels", () => {
    expect(snapshotLegal({ garage: { name: "G" } })).toEqual({ garageLegalName: null, garageRegistry: null, customerNationalId: null, paymentTerms: null, penaltyText: null });
    expect(snapshotLegal(null).paymentTerms).toBeNull();
  });
  it("nouvelle facture : les mentions figées sont lues", () => {
    const legal = { garageLegalName: "SARL X", garageRegistry: "B123 (Tunis)", customerNationalId: "01234567", paymentTerms: "Virement", penaltyText: "" };
    expect(snapshotLegal({ legal })).toEqual({ ...legal, penaltyText: null });
  });
});
