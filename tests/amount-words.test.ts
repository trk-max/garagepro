import { describe, expect, it } from "vitest";
import { amountInFrenchWords, integerToFrenchWords, invoiceAmountSentence } from "@/lib/amount-words";

describe("nombres en lettres (français, orthographe traditionnelle)", () => {
  it("0 à 99 : et-un, soixante-dix, quatre-vingt(s)", () => {
    const cases: [number, string][] = [
      [0, "zéro"],
      [1, "un"],
      [16, "seize"],
      [17, "dix-sept"],
      [21, "vingt et un"],
      [22, "vingt-deux"],
      [31, "trente et un"],
      [60, "soixante"],
      [70, "soixante-dix"],
      [71, "soixante et onze"],
      [77, "soixante-dix-sept"],
      [80, "quatre-vingts"],
      [81, "quatre-vingt-un"],
      [90, "quatre-vingt-dix"],
      [91, "quatre-vingt-onze"],
      [99, "quatre-vingt-dix-neuf"],
    ];
    for (const [n, w] of cases) expect(integerToFrenchWords(n), String(n)).toBe(w);
  });
  it("centaines : cent invariable sauf en fin de nombre", () => {
    expect(integerToFrenchWords(100)).toBe("cent");
    expect(integerToFrenchWords(101)).toBe("cent un");
    expect(integerToFrenchWords(200)).toBe("deux cents");
    expect(integerToFrenchWords(201)).toBe("deux cent un");
    expect(integerToFrenchWords(280)).toBe("deux cent quatre-vingts");
    expect(integerToFrenchWords(995)).toBe("neuf cent quatre-vingt-quinze");
  });
  it("mille invariable ; cent et vingt sans s devant mille, avec s devant millions", () => {
    expect(integerToFrenchWords(1000)).toBe("mille");
    expect(integerToFrenchWords(1001)).toBe("mille un");
    expect(integerToFrenchWords(2000)).toBe("deux mille");
    expect(integerToFrenchWords(80_000)).toBe("quatre-vingt mille");
    expect(integerToFrenchWords(200_000)).toBe("deux cent mille");
    expect(integerToFrenchWords(1_234)).toBe("mille deux cent trente-quatre");
    expect(integerToFrenchWords(1_000_000)).toBe("un million");
    expect(integerToFrenchWords(200_000_000)).toBe("deux cents millions");
    expect(integerToFrenchWords(2_500_000)).toBe("deux millions cinq cent mille");
    expect(integerToFrenchWords(1_000_000_000)).toBe("un milliard");
  });
});

describe("montant en dinars et millimes", () => {
  it("dinars et millimes", () => {
    expect(amountInFrenchWords(1_234_500)).toBe("mille deux cent trente-quatre dinars et cinq cents millimes");
    expect(amountInFrenchWords(995_000)).toBe("neuf cent quatre-vingt-quinze dinars");
    expect(amountInFrenchWords(1_000)).toBe("un dinar");
    expect(amountInFrenchWords(1_001)).toBe("un dinar et un millime");
    expect(amountInFrenchWords(500)).toBe("cinq cents millimes");
    expect(amountInFrenchWords(0)).toBe("zéro dinar");
    expect(amountInFrenchWords(71_080)).toBe("soixante et onze dinars et quatre-vingts millimes");
    expect(amountInFrenchWords(1_000_000_000)).toBe("un million de dinars");
    expect(amountInFrenchWords(-2_000)).toBe("moins deux dinars");
  });
  it("phrase légale de la facture", () => {
    expect(invoiceAmountSentence(119_000)).toBe("Arrêtée la présente facture à la somme de cent dix-neuf dinars.");
    expect(invoiceAmountSentence(60_501)).toBe("Arrêtée la présente facture à la somme de soixante dinars et cinq cent un millimes.");
  });
});
