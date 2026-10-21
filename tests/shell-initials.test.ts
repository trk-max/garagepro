import { describe, expect, it } from "vitest";
import { initials } from "@/components/shell/initials";

describe("initials (avatar of the account pill)", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Karim Ben Salah")).toBe("KB");
    expect(initials("  sonia   accueil ")).toBe("SA");
  });
  it("ignores punctuation and words without letters", () => {
    expect(initials("Malek (Admin)")).toBe("MA");
    expect(initials("— Hédi")).toBe("H");
    expect(initials("\"Olfa\" RH")).toBe("OR");
  });
  it("works with Arabic names and empty values", () => {
    expect(initials("مالك بلال")).toBe("مب");
    expect(initials("")).toBe("");
  });
});
