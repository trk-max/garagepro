import { describe, expect, it } from "vitest";
import { buildContractDoc, dt, type DocInput } from "@/lib/contract-document";
import { ALL_TEMPLATE_DEFS, PREVIOUS_TEMPLATE_DEFS, TEMPLATE_DEFS, templateDefById, templateRows } from "@/lib/contract-templates";
import {
  canContract,
  checkMove,
  cleanData,
  computeDates,
  contractCategoriesFor,
  contractFlags,
  contractNumber,
  disguisedEmploymentSigns,
  employmentErrors,
  endDayAfterMonths,
  expiryOf,
  fillPlaceholders,
  includedClauses,
  missingFields,
  sniffScan,
  templateId,
  TEMPLATE_ID,
  type MoveContext,
  type TemplateField,
} from "@/lib/contracts";

describe("contract dates", () => {
  it("a 1-year contract ends the day before the same date one year later", () => {
    expect(endDayAfterMonths("2026-10-21", 12)).toBe("2027-10-20");
    expect(computeDates({ startDay: "2026-10-21", durationMonths: 12 })).toEqual({ startDay: "2026-10-21", endDay: "2027-10-20", durationMonths: 12, indefinite: false });
  });
  it("end of month is kept (31 January + 1 month)", () => {
    expect(endDayAfterMonths("2026-01-31", 1)).toBe("2026-02-27");
    expect(endDayAfterMonths("2028-02-01", 1)).toBe("2028-02-29");
  });
  it("a typed end date wins over the duration; end before start is refused", () => {
    expect(computeDates({ startDay: "2026-10-21", durationMonths: 12, endDay: "2027-03-31" })).toMatchObject({ endDay: "2027-03-31" });
    expect(computeDates({ startDay: "2026-10-21", endDay: "2026-10-20" })).toBe("contractDates");
    expect(computeDates({ startDay: "2026-10-21", endDay: "2026-10-21" })).toMatchObject({ endDay: "2026-10-21" });
  });
  it("a CDI (indefinite) has NO end date — never a fictitious 1-year expiry", () => {
    expect(computeDates({ startDay: "2026-10-21", indefinite: true })).toEqual({ startDay: "2026-10-21", endDay: null, durationMonths: null, indefinite: true });
    expect(computeDates({ startDay: "2026-10-21", indefinite: true, durationMonths: 12 })).toBe("contractCdiEnd");
    expect(computeDates({ startDay: "2026-10-21", indefinite: true, endDay: "2027-10-20" })).toBe("contractCdiEnd");
  });
  it("no duration and no end: no end date (repair contract)", () => {
    expect(computeDates({ startDay: "2026-10-21" })).toMatchObject({ endDay: null, indefinite: false });
  });
});

describe("expiry window", () => {
  const today = "2026-10-21";
  it("SOON within the window (last day included), OK beyond, PAST once passed", () => {
    expect(expiryOf({ status: "ACTIVE", endDay: "2026-11-20" }, today, 30)).toEqual({ state: "SOON", daysLeft: 30 });
    expect(expiryOf({ status: "ACTIVE", endDay: "2026-11-21" }, today, 30)).toEqual({ state: "OK", daysLeft: 31 });
    expect(expiryOf({ status: "SIGNED", endDay: today }, today, 30)).toEqual({ state: "SOON", daysLeft: 0 });
    expect(expiryOf({ status: "ACTIVE", endDay: "2026-10-20" }, today, 30)).toEqual({ state: "PAST", daysLeft: -1 });
  });
  it("no end date, or not running (draft, terminated, expired) → nothing to alert", () => {
    expect(expiryOf({ status: "ACTIVE", endDay: null }, today, 30).state).toBe("NONE");
    for (const status of ["DRAFT", "PENDING_SIGNATURE", "TERMINATED", "EXPIRED", "ARCHIVED"]) expect(expiryOf({ status, endDay: "2026-10-25" }, today, 30).state, status).toBe("NONE");
  });
});

describe("employment rules (Law 2025-9)", () => {
  const base = { endDay: null, durationMonths: null };
  it("CDI by default; a CDI has no end date", () => {
    expect(employmentErrors({ ...base })).toEqual([]);
    expect(employmentErrors({ ...base, endDay: "2027-10-20" })).toContain("contractCdiEnd");
    expect(employmentErrors({ ...base, durationMonths: 12 })).toContain("contractCdiEnd");
  });
  it("CDD blocked without one of the 3 legal reasons", () => {
    expect(employmentErrors({ employmentType: "CDD", endDay: "2027-04-20", durationMonths: null })).toContain("contractCddReason");
    expect(employmentErrors({ employmentType: "CDD", cddReason: "CONVENANCE", endDay: "2027-04-20", durationMonths: null })).toContain("contractCddReason");
    for (const r of ["SURCROIT", "SAISONNIER"]) expect(employmentErrors({ employmentType: "CDD", cddReason: r, endDay: "2027-04-20", durationMonths: null }), r).toEqual([]);
  });
  it("CDD: end date required, replaced employee named, no probation", () => {
    expect(employmentErrors({ employmentType: "CDD", cddReason: "SURCROIT", endDay: null, durationMonths: null })).toContain("contractCddEnd");
    expect(employmentErrors({ employmentType: "CDD", cddReason: "REMPLACEMENT", endDay: "2027-04-20", durationMonths: null })).toContain("contractReplaced");
    expect(employmentErrors({ employmentType: "CDD", cddReason: "REMPLACEMENT", replacedEmployee: "Ali", endDay: "2027-04-20", durationMonths: null })).toEqual([]);
    expect(employmentErrors({ employmentType: "CDD", cddReason: "SURCROIT", endDay: "2027-04-20", durationMonths: null, probationMonths: "1" })).toContain("contractCddProbation");
    expect(employmentErrors({ employmentType: "CDD", cddReason: "SURCROIT", endDay: "2027-04-20", durationMonths: null, probationRenewable: "YES" })).toContain("contractCddProbation");
  });
  it("probation: at most 6 months, renewable once (CDI)", () => {
    expect(employmentErrors({ ...base, probationMonths: "6", probationRenewable: "YES" })).toEqual([]);
    expect(employmentErrors({ ...base, probationMonths: "7" })).toContain("contractProbation");
    expect(employmentErrors({ ...base, probationMonths: "-1" })).toContain("contractProbation");
    expect(employmentErrors({ ...base, probationMonths: "2.5" })).toContain("contractProbation");
    expect(employmentErrors({ ...base, probationRenewable: "TWICE" })).toContain("contractProbation");
    expect(employmentErrors({ ...base, probationMonths: "0", probationRenewable: "YES" })).toContain("contractProbation");
  });
});

describe("status machine", () => {
  const ctx = (over: Partial<MoveContext> = {}): MoveContext => ({ needsLegalReview: false, hasScan: false, endDay: null, today: "2026-10-21", missing: [], ...over });
  it("follows the order and refuses jumps", () => {
    expect(checkMove("DRAFT", "VALIDATION", ctx())).toBeNull();
    expect(checkMove("DRAFT", "SIGNED", ctx({ hasScan: true }))).toBe("contractTransition");
    expect(checkMove("DRAFT", "ACTIVE", ctx())).toBe("contractTransition");
    expect(checkMove("ARCHIVED", "DRAFT", ctx())).toBe("contractTransition");
    expect(checkMove("SIGNED", "DRAFT", ctx())).toBe("contractTransition");
    expect(checkMove("DRAFT", "NOPE", ctx())).toBe("contractTransition");
  });
  it("submitting a draft needs every required field", () => {
    expect(checkMove("DRAFT", "VALIDATION", ctx({ missing: ["salary"] }))).toBe("contractMissingFields");
  });
  it("anything flagged (template not reviewed, CDD…) must go through the legal review", () => {
    expect(checkMove("VALIDATION", "APPROVED", ctx({ needsLegalReview: true }))).toBe("contractLegalReview");
    expect(checkMove("VALIDATION", "LEGAL_REVIEW", ctx({ needsLegalReview: true }))).toBeNull();
    expect(checkMove("LEGAL_REVIEW", "APPROVED", ctx({ needsLegalReview: true }))).toBeNull();
    expect(checkMove("VALIDATION", "APPROVED", ctx())).toBeNull();
  });
  it("SIGNED only with the hand-signed scan", () => {
    expect(checkMove("PENDING_SIGNATURE", "SIGNED", ctx())).toBe("contractScanMissing");
    expect(checkMove("PENDING_SIGNATURE", "SIGNED", ctx({ hasScan: true }))).toBeNull();
  });
  it("EXPIRED only after the end date; TERMINATED needs a reason", () => {
    expect(checkMove("ACTIVE", "EXPIRED", ctx({ endDay: "2026-10-21" }))).toBe("contractNotEnded");
    expect(checkMove("ACTIVE", "EXPIRED", ctx({ endDay: null }))).toBe("contractNotEnded");
    expect(checkMove("ACTIVE", "EXPIRED", ctx({ endDay: "2026-10-20" }))).toBeNull();
    expect(checkMove("ACTIVE", "TERMINATED", ctx())).toBe("reasonRequired");
    expect(checkMove("ACTIVE", "TERMINATED", ctx({ reason: "Fin de collaboration" }))).toBeNull();
  });
});

describe("required fields and data cleaning", () => {
  const fields: TemplateField[] = [
    { key: "salary", type: "money", required: true },
    { key: "employmentType", type: "select", required: true, options: ["CDI", "CDD"] },
    { key: "cddReason", type: "select", required: true, options: ["SURCROIT"], showIf: { key: "employmentType", equals: "CDD" } },
    { key: "probationMonths", type: "number", required: false, min: 0, max: 6 },
    { key: "start", type: "date", required: false },
  ];
  it("keeps only the template's fields, of the right type", () => {
    expect(cleanData(fields, { salary: " 1 250,500 ", employmentType: "CDX", probationMonths: "9", start: "21/10/2026", hacker: "x" })).toEqual({ salary: "1250.500" });
  });
  it("a conditional field is required only when shown", () => {
    expect(missingFields(fields, { salary: "1000", employmentType: "CDI" })).toEqual([]);
    expect(missingFields(fields, { salary: "1000", employmentType: "CDD" })).toEqual(["cddReason"]);
    expect(missingFields(fields, {})).toEqual(["salary", "employmentType"]);
  });
  it("placeholders never invent: empty → ……", () => {
    expect(fillPlaceholders("Salaire : {{salary}} — heures : {{hours}}", { salary: "1 000,000 DT" })).toBe("Salaire : 1 000,000 DT — heures : ……");
  });
  it("optional clauses can be removed, required ones never", () => {
    const clauses = [
      { key: "a", title: "A", body: "", required: true },
      { key: "b", title: "B", body: "", required: false },
      { key: "c", title: "C", body: "", required: true, showIf: { key: "employmentType", equals: "CDD" } },
    ];
    expect(includedClauses(clauses, ["a", "b"], { employmentType: "CDI" }).map((c) => c.key)).toEqual(["a"]);
    expect(includedClauses(clauses, [], { employmentType: "CDD" }).map((c) => c.key)).toEqual(["a", "b", "c"]);
  });
});

describe("access by category (server-side rules)", () => {
  it("employment contracts: administrator and HR only", () => {
    expect(contractCategoriesFor("HR", "view")).toEqual(["EMPLOYMENT"]);
    for (const r of ["MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "ACCOUNTANT"] as const) expect(canContract(r, "EMPLOYMENT", "view"), r).toBe(false);
    expect(canContract("ADMIN", "EMPLOYMENT", "manage")).toBe(true);
  });
  it("repair / fleet: admin, manager, reception (+ accountant read)", () => {
    expect(canContract("RECEPTION", "REPAIR", "manage")).toBe(true);
    expect(canContract("ACCOUNTANT", "REPAIR", "view")).toBe(true);
    expect(canContract("ACCOUNTANT", "REPAIR", "manage")).toBe(false);
    expect(canContract("MECHANIC", "REPAIR", "view")).toBe(false);
  });
  it("supplier: admin, manager; accountant reads", () => {
    expect(canContract("MANAGER", "SUPPLIER", "manage")).toBe(true);
    expect(canContract("ACCOUNTANT", "SUPPLIER", "view")).toBe(true);
    expect(canContract("RECEPTION", "SUPPLIER", "view")).toBe(false);
    expect(canContract("STOREKEEPER", "SUPPLIER", "view")).toBe(false);
  });
  it("unknown category or role: nothing", () => {
    expect(canContract("ADMIN", "SECRET", "view")).toBe(false);
    expect(canContract(null, "REPAIR", "view")).toBe(false);
  });
});

describe("flags, numbering, scans", () => {
  it("a template not reviewed by a lawyer is always flagged; CDD and disguised employment too", () => {
    expect(contractFlags({ category: "REPAIR", templateReviewStatus: "NEEDS_LEGAL_REVIEW", data: {} })).toEqual(["TEMPLATE_NOT_REVIEWED"]);
    expect(contractFlags({ category: "REPAIR", templateReviewStatus: "REVIEWED", data: {} })).toEqual([]);
    expect(contractFlags({ category: "EMPLOYMENT", templateReviewStatus: "REVIEWED", data: { employmentType: "CDD" } })).toEqual(["CDD"]);
    expect(contractFlags({ category: "SUPPLIER", subtype: "SERVICE_PROVIDER", templateReviewStatus: "REVIEWED", data: { subordination: "YES" } })).toEqual(["DISGUISED_EMPLOYMENT_RISK"]);
  });
  it("disguised employment signs only for service-type partners", () => {
    expect(disguisedEmploymentSigns("SERVICE_PROVIDER", { subordination: "YES", coreActivity: "YES", specializedExpertise: "NO", exclusiveFullTime: "YES" })).toEqual(["subordination", "coreActivity", "noExpertise", "exclusiveFullTime"]);
    expect(disguisedEmploymentSigns("SERVICE_PROVIDER", { subordination: "NO", coreActivity: "NO", specializedExpertise: "YES", exclusiveFullTime: "NO" })).toEqual([]);
    expect(disguisedEmploymentSigns("PARTS", { subordination: "YES" })).toEqual([]);
  });
  it("numbers and deterministic template ids", () => {
    expect(contractNumber(2026, 7)).toBe("CTR-2026-0007");
    expect(templateId("EMPLOYMENT_MECHANIC", 1)).toBe("tpl-employment-mechanic-v1");
    for (const r of templateRows()) expect(TEMPLATE_ID.test(r.id), r.id).toBe(true);
    expect(new Set(templateRows().map((r) => r.id)).size).toBe(ALL_TEMPLATE_DEFS.length);
  });
  it("signed scan recognised by its first bytes only", () => {
    expect(sniffScan(Buffer.from("%PDF-1.7\n%âãÏÓ"))?.contentType).toBe("application/pdf");
    expect(sniffScan(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))?.contentType).toBe("image/jpeg");
    expect(sniffScan(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.contentType).toBe("image/png");
    expect(sniffScan(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffScan(Buffer.from("MZ\x90\x00\x03\x00\x00\x00"))).toBeNull();
  });
});

describe("templates: verified references only, never 'compliant'", () => {
  it("every template is Tunisian, dated 21/10/2026 and lists its references", () => {
    for (const r of templateRows()) {
      expect(r.jurisdiction).toBe("TN");
      expect(r.verifiedAt.toISOString().slice(0, 10)).toBe("2026-10-21");
      expect(r.legalRefs.length, r.code).toBeGreaterThan(0);
      expect(JSON.stringify(r)).not.toMatch(/conforme/i);
    }
  });
  it("the printed document says 'to be validated by a lawyer' until reviewed, signature blocks empty", () => {
    const t = TEMPLATE_DEFS.find((x) => x.code === "BLANK")!;
    const input: DocInput = {
      number: "CTR-2026-0001",
      category: "BLANK",
      startDay: "2026-10-21",
      endDay: null,
      indefinite: false,
      data: { fields: { object: "Location d'un pont", body: "Texte" }, snapshot: null, excluded: [] },
      template: { ...t, legalRefs: t.legalRefs, unverified: t.unverified, verifiedDay: "2026-10-21", reviewStatus: "NEEDS_LEGAL_REVIEW", reviewedDay: null },
    };
    const doc = buildContractDoc(input);
    expect(doc.legalNotice).toMatch(/^Modèle à valider par un juriste — références : Loi n° 2000-83/);
    expect(doc.signatures.every((s) => !/[A-Z][a-z]+ [A-Z][a-z]+$/.test(s))).toBe(true);
    const reviewed = buildContractDoc({ ...input, template: { ...input.template, reviewStatus: "REVIEWED", reviewedDay: "2026-11-02" } });
    expect(reviewed.legalNotice).toMatch(/^Modèle relu par un juriste le 02\/11\/2026/);
    expect(reviewed.legalNotice).not.toMatch(/conforme/i);
  });
  it("employment: 12 job templates (incl. blank), CDI by default, salary / hours / leave required and never pre-filled", () => {
    const jobs = TEMPLATE_DEFS.filter((x) => x.category === "EMPLOYMENT");
    expect(jobs.map((x) => x.subtype)).toEqual([
      "MECHANIC",
      "BODYWORK_TECHNICIAN",
      "AUTO_ELECTRICIAN",
      "DIAGNOSTIC_TECHNICIAN",
      "STOREKEEPER",
      "SECTOR_MANAGER",
      "GARAGE_MANAGER",
      "HR_EMPLOYEE",
      "GENERAL_TECHNICIAN",
      "SALESPERSON",
      "SHOWROOM_EMPLOYEE",
      "EMPLOYMENT_BLANK",
    ]);
    for (const j of jobs) {
      const f = (k: string) => j.fields.find((x) => x.key === k)!;
      expect(f("employmentType").default, j.code).toBe("CDI");
      for (const k of ["salary", "workHours", "leave", "workplace"]) {
        expect(f(k).required, `${j.code} ${k}`).toBe(true);
        expect(f(k).default, `${j.code} ${k}`).toBeUndefined();
      }
      expect(j.legalRefs.map((r) => r.ref).join(" ")).toMatch(/art\. 6-2.*art\. 6-3.*art\. 6-4.*art\. 17/);
    }
    expect(jobs.find((j) => j.subtype === "MECHANIC")!.fields.find((x) => x.key === "jobTitle")!.default).toBe("Mécanicien automobile");
    expect(jobs.find((j) => j.subtype === "EMPLOYMENT_BLANK")!.fields.find((x) => x.key === "jobTitle")!.default).toBeUndefined();
  });
  it("employment document: CDI prints no end date; CDD prints its reason and end date, no probation clause", () => {
    const t = TEMPLATE_DEFS.find((x) => x.code === "EMPLOYMENT_MECHANIC")!;
    const base: DocInput = {
      number: "CTR-2026-0002",
      category: "EMPLOYMENT",
      startDay: "2026-11-01",
      endDay: null,
      indefinite: true,
      data: { fields: { employeeName: "Ali Ben Salah", jobTitle: "Mécanicien automobile", duties: "Réparations", employmentType: "CDI", probationMonths: "3", probationRenewable: "YES", salary: "1200", workHours: "48 h par semaine", leave: "selon la loi", workplace: "Atelier" }, snapshot: null, excluded: [] },
      template: { ...t, verifiedDay: "2026-10-21", reviewStatus: "NEEDS_LEGAL_REVIEW", reviewedDay: null },
    };
    const cdi = buildContractDoc(base).clauses.map((c) => `${c.title}: ${c.text}`).join("\n");
    expect(cdi).toMatch(/durée indéterminée/);
    expect(cdi).toMatch(/Période d'essai : 3 mois, renouvelable une seule fois/);
    expect(cdi).toMatch(/1 200,000 DT/);
    expect(cdi).not.toMatch(/au \d\d\/\d\d\/\d{4}/);
    const cdd = buildContractDoc({ ...base, endDay: "2027-04-30", indefinite: false, data: { ...base.data, fields: { ...base.data.fields, employmentType: "CDD", cddReason: "SAISONNIER", probationMonths: "", probationRenewable: "" } } })
      .clauses.map((c) => c.text)
      .join("\n");
    expect(cdd).toMatch(/du 01\/11\/2026 au 30\/04\/2027, pour le motif suivant : travail saisonnier/);
    expect(cdd).not.toMatch(/Période d'essai/);
  });
  it("CDI v2 (owner's model): new version, v1 kept for existing contracts, same legal rules", () => {
    const v2 = TEMPLATE_DEFS.filter((x) => x.category === "EMPLOYMENT");
    expect(v2.every((j) => j.version === 2)).toBe(true);
    expect(PREVIOUS_TEMPLATE_DEFS.map((j) => `${j.code}-v${j.version}`)).toEqual(v2.map((j) => `${j.code}-v1`));
    expect(templateDefById("tpl-employment-mechanic-v1")?.clauses.some((c) => c.key === "freeOfCommitment")).toBe(false);
    expect(templateRows().filter((r) => r.code === "EMPLOYMENT_MECHANIC").map((r) => r.version).sort()).toEqual([1, 2]);
    const t = templateDefById("tpl-employment-mechanic-v2")!;
    expect(t.clauses.map((c) => c.key)).toEqual([
      "hiring", "freeOfCommitment", "start", "cdi", "cdd", "probation", "hours", "leave", "salary", "workplace", "obligations", "bonuses",
      "socialSecurity", "training", "confidentiality", "notice", "equipment", "law", "severability", "entireAgreement", "domicile", "special",
      "disputes", "personalData", "signature",
    ]);
    for (const k of ["noticePeriod", "jurisdictionCity"]) expect(t.fields.find((f) => f.key === k), k).toMatchObject({ required: true });
    expect(t.fields.find((f) => f.key === "noticePeriod")!.default).toBeUndefined();
    expect(t.unverified.join(" ")).toMatch(/modèle de CDI du garage/);
    const doc = buildContractDoc({
      number: "CTR-2026-0009",
      category: "EMPLOYMENT",
      startDay: "2026-11-01",
      endDay: null,
      indefinite: true,
      data: { fields: { employeeName: "Ali Ben Salah", jobTitle: "Mécanicien automobile", duties: "Réparations.", employmentType: "CDI", probationMonths: "6", probationRenewable: "YES", salary: "995", workHours: "48 heures par semaine", leave: "selon la loi", workplace: "Atelier", noticePeriod: "deux (02) mois", jurisdictionCity: "Monastir", grade: "3" }, snapshot: null, excluded: [] },
      template: { ...t, verifiedDay: "2026-10-21", reviewStatus: "NEEDS_LEGAL_REVIEW", reviewedDay: null },
    });
    const text = doc.clauses.map((c) => c.text).join(" | ");
    expect(text).toMatch(/995,000 DT \(neuf cent quatre-vingt-quinze dinars\)/);
    expect(text).toMatch(/échelle 3, échelon ……/);
    expect(text).toMatch(/Période d'essai : 6 mois, renouvelable une seule fois/);
    expect(text).toMatch(/juridictions de Monastir/);
    expect(text).toMatch(/visite médicale d'embauche/);
    expect(doc.legalNotice).toMatch(/^Modèle à valider par un juriste/);
    expect(JSON.stringify(t)).not.toMatch(/conforme/i);
  });
  it("suppliers: 6 partner kinds; service-type ones ask the disguised-employment questions and cite art. 28-30", () => {
    const sup = TEMPLATE_DEFS.filter((x) => x.category === "SUPPLIER");
    expect(sup.map((x) => x.subtype)).toEqual(["PARTS", "BATTERIES_CHARGING", "SPECIALIZED_GARAGE", "BODYWORK_PAINT", "SERVICE_PROVIDER", "OTHER"]);
    for (const s of sup) {
      const service = ["SPECIALIZED_GARAGE", "BODYWORK_PAINT", "SERVICE_PROVIDER", "OTHER"].includes(s.subtype!);
      expect(s.fields.some((f) => f.key === "subordination"), s.code).toBe(service);
      expect(s.legalRefs.some((r) => r.ref.includes("28-30")), s.code).toBe(service);
    }
  });
  it("amounts in dinars with 3 decimals", () => {
    expect(dt(1_234_500)).toBe("1 234,500 DT");
    expect(dt(-500)).toBe("-0,500 DT");
  });
});
