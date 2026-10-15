import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/lang/route";

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/api/lang?${qs}`));

describe("language switch route", () => {
  it("sets the cookie and goes back to the page", () => {
    const res = call("l=ar&next=%2Fgarage%2Fwork-orders%3Fstatus%3DREADY");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/garage/work-orders?status=READY");
    expect(res.cookies.get("lang")?.value).toBe("ar");
  });
  it("accepts English", () => {
    expect(call("l=en&next=/").cookies.get("lang")?.value).toBe("en");
  });
  it("unknown language falls back to French", () => {
    expect(call("l=xx&next=/").cookies.get("lang")?.value).toBe("fr");
  });
  it("never redirects to another site", () => {
    for (const next of ["//evil.com", "https://evil.com", "/\\evil.com", "evil.com"]) {
      expect(call(`l=fr&next=${encodeURIComponent(next)}`).headers.get("location")).toBe("http://localhost:3000/");
    }
  });
  it("tab / newline / carriage return tricks stay on the site (%09, %0A, %0D)", () => {
    // The URL parser drops these characters, so "/<TAB>/evil.example" would become "//evil.example".
    for (const qs of [
      "next=%2F%09%2Fevil.example",
      "next=%2F%0A%2Fevil.example%2Fx",
      "next=%2F%0D%5Cevil.example",
      "next=%2F%0D%2Fevil.example",
      "next=%09%2F%2Fevil.example",
      "next=%2F%5C%09evil.example",
    ]) {
      const location = call(`l=fr&${qs}`).headers.get("location");
      expect(location, qs).toBe("http://localhost:3000/");
      expect(new URL(location!).host).toBe("localhost:3000");
    }
  });
  it("keeps query string and hash of a same-site path", () => {
    expect(call(`l=fr&next=${encodeURIComponent("/suivi/vehicule?x=1#hist")}`).headers.get("location")).toBe("http://localhost:3000/suivi/vehicule?x=1#hist");
  });
});
