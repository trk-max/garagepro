import { describe, expect, it } from "vitest";
import { QUESTIONS, RESULTS, ROOT, matchService } from "@/lib/guided-diagnosis";

describe("guided diagnosis tree", () => {
  it("every option leads somewhere that exists (exactly one target)", () => {
    for (const q of Object.values(QUESTIONS)) {
      for (const o of q.options) {
        const targets = [o.next, o.result, o.ai].filter(Boolean);
        expect(targets, `${q.id} > ${o.label.fr}`).toHaveLength(1);
        if (o.next) expect(QUESTIONS[o.next], o.next).toBeDefined();
        if (o.result) expect(RESULTS[o.result], o.result).toBeDefined();
      }
    }
  });

  it("every question and every result can be reached from the start", () => {
    const seenQ = new Set<string>();
    const seenR = new Set<string>();
    const walk = (id: string) => {
      if (seenQ.has(id)) return;
      seenQ.add(id);
      for (const o of QUESTIONS[id]!.options) {
        if (o.next) walk(o.next);
        if (o.result) seenR.add(o.result);
      }
    };
    walk(ROOT);
    expect([...seenQ].sort()).toEqual(Object.keys(QUESTIONS).sort());
    expect([...seenR].sort()).toEqual(Object.keys(RESULTS).sort());
  });

  it("every screen offers a way to the AI (or the garage)", () => {
    for (const q of Object.values(QUESTIONS)) expect(q.options.some((o) => o.ai), q.id).toBe(true);
  });

  it("French and Arabic texts are filled everywhere", () => {
    const texts = [
      ...Object.values(QUESTIONS).flatMap((q) => [q.text, ...q.options.map((o) => o.label)]),
      ...Object.values(RESULTS).flatMap((r) => [r.title, ...r.causes, ...r.checks]),
    ];
    for (const t of texts) {
      expect(t.fr.trim().length, JSON.stringify(t)).toBeGreaterThan(1);
      expect(t.ar.trim().length, JSON.stringify(t)).toBeGreaterThan(1);
    }
  });

  it("dangerous cases are marked as danger", () => {
    for (const id of ["brakePedal", "oilRed", "overheat", "leakBrake", "brakeGrind"]) expect(RESULTS[id]!.urgency, id).toBe("danger");
  });
});

describe("matchService (guide result → garage service)", () => {
  // Same names as the demo data (prisma/seed.ts).
  const services = [
    { id: "oil", name: "Vidange & filtres", nameAr: "تغيير الزيت والفلاتر" },
    { id: "rev", name: "Révision générale", nameAr: "مراجعة شاملة" },
    { id: "diag", name: "Diagnostic électronique", nameAr: "تشخيص إلكتروني" },
    { id: "brk", name: "Freinage", nameAr: "الفرامل" },
    { id: "ac", name: "Climatisation", nameAr: "المكيّف" },
    { id: "rep", name: "Réparation spécifique", nameAr: "إصلاح خاص" },
  ];
  it("finds the right service for each kind of problem", () => {
    expect(matchService("brakes", services)?.id).toBe("brk");
    expect(matchService("oil", services)?.id).toBe("oil");
    expect(matchService("service", services)?.id).toBe("rev");
    expect(matchService("aircon", services)?.id).toBe("ac");
    expect(matchService("repair", services)?.id).toBe("rep");
    expect(matchService("diagnostic", services)?.id).toBe("diag");
  });
  it("falls back to the diagnostic, then to nothing", () => {
    expect(matchService("aircon", services.filter((s) => s.id !== "ac"))?.id).toBe("diag");
    expect(matchService("brakes", [])).toBeNull();
    expect(matchService("none", services)).toBeNull();
  });
});
