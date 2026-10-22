import { describe, expect, it } from "vitest";
import { ctaLabel, renderEmailHtml } from "@/lib/email-template";

const tracking = "911 Garages : suivez la réparation de votre véhicule 220 TU 6025 en direct sur https://garage.example/suivi?plate=220TU6025 – code : 8143";

describe("customer e-mail layout", () => {
  it("turns the first link into a button labelled from its path", () => {
    const html = renderEmailHtml({ subject: "Suivi", text: tracking, brand: "911 Garages" });
    expect(html).toContain('href="https://garage.example/suivi?plate=220TU6025"');
    expect(html).toContain("Suivre ma réparation");
    expect(ctaLabel("https://g.example/rdv/ABC", "fr")).toBe("Voir mon rendez-vous");
    expect(ctaLabel("https://g.example/autre", "ar")).toBe("فتح الرابط");
    expect(ctaLabel("https://g.example/suivi?plate=1", "fr", "911 : un supplément (148,750 DT) est à valider")).toBe("Voir et valider le devis");
  });

  it("shows the access code in its own box", () => {
    const html = renderEmailHtml({ subject: "Suivi", text: tracking, brand: "911 Garages" });
    expect(html).toContain("Votre code d'accès");
    expect(html).toMatch(/letter-spacing:10px;[^>]*>8143<\/div>/);
  });

  it("puts the garage contact in the footer and uses the logo only when given", () => {
    const withContact = renderEmailHtml({ subject: "S", text: "Bonjour", brand: "911 Garages", contact: { address: "Rue X, Tunis", phone: "+216 22 000 000", email: "g@example.tn" } });
    expect(withContact).toContain("Rue X, Tunis");
    expect(withContact).toContain('href="tel:+21622000000"');
    expect(withContact).toContain("mailto:g@example.tn");
    expect(withContact).not.toContain("cid:");
    expect(renderEmailHtml({ subject: "S", text: "Bonjour", brand: "G", logoCid: "garage-logo" })).toContain('src="cid:garage-logo"');
    const product = renderEmailHtml({ subject: "S", text: "Bonjour", brand: "G", productLogoSrc: "cid:garagepro-logo" });
    expect(product).toContain('src="cid:garagepro-logo"');
    expect(product).toContain("GaragePro");
  });

  it("escapes the message and switches to right-to-left for Arabic", () => {
    const html = renderEmailHtml({ subject: "<b>x</b>", text: "مرحبا <script>alert(1)</script>", brand: "G" });
    expect(html).not.toContain("<script>");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("has no button or code box when the text has neither", () => {
    const html = renderEmailHtml({ subject: "S", text: "Votre véhicule est prêt.", brand: "G" });
    expect(html).not.toContain("Ouvrir le lien");
    expect(html).not.toContain("Votre code d'accès");
  });
});
