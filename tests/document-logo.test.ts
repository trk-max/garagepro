import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CertificateSnapshot } from "@/lib/certificate";
import { certificatePdf, fitSize } from "@/server/certificate-pdf";

const png = (file: string) => `data:image/png;base64,${readFileSync(path.resolve(import.meta.dirname, "..", file)).toString("base64")}`;

describe("certificate header with a garage logo", () => {
  it("fitSize keeps the largest size that fits, never below the minimum", () => {
    const w = (size: number) => size * 20; // 20 pt of width per point of size
    expect(fitSize(w, 400, 17, 10)).toBe(17);
    expect(fitSize(w, 300, 17, 10)).toBe(15);
    expect(fitSize(w, 50, 17, 10)).toBe(10);
  });

  it("produces the PDF with a square logo and a long company name", async () => {
    const snapshot: CertificateSnapshot = {
      number: "ATT-2026-0001",
      issuedAt: "2026-10-21T10:00:00.000Z",
      company: { legalName: "Garage Atlas Mécanique Générale et Carrosserie SARL", address: "ZI Ben Arous", taxId: "1234567/A/M/000", repName: "Malek", repTitle: "Gérant", city: "Ben Arous", phone: null, email: null },
      employee: { name: "Karim", nationalId: null, jobTitle: "Mécanicien", hireDate: "2022-03-01", endDate: null, contractType: "CDI" },
      purpose: null,
    };
    const pdf = await certificatePdf(snapshot, { logo: png("public/icons/icon-512.png") });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
