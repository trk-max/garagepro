import { describe, expect, it } from "vitest";
import { safeErrorType, sanitizeSystemErrorMessage, systemErrorFingerprint } from "@/server/system-error-utils";

describe("system error metadata", () => {
  it("keeps safe error class names but rejects names containing arbitrary details", () => {
    const ordinary = new TypeError("private message");
    const forged = new Error("private message");
    forged.name = "Error: password=secret";

    expect(safeErrorType(ordinary)).toBe("TypeError");
    expect(safeErrorType(forged)).toBe("Error");
  });

  it("deduplicates equivalent reports and separates different locations", () => {
    const first = systemErrorFingerprint("api", "orders", "Internal failure (TypeError)");
    expect(systemErrorFingerprint("api", "orders", "Internal failure (TypeError)")).toBe(first);
    expect(systemErrorFingerprint("api", "billing", "Internal failure (TypeError)")).not.toBe(first);
  });

  it("removes credentials, URLs, email addresses, and SQL-like details", () => {
    expect(sanitizeSystemErrorMessage("request failed for sam@example.com password=hunter2 https://example.test/x")).toBe(
      "request failed for [redacted-email] password=[redacted] [redacted-url]",
    );
    expect(sanitizeSystemErrorMessage("query SELECT * FROM Customer")).toBe("Technical error details omitted");
  });
});
