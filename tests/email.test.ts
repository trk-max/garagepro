import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ resend: [] as unknown[], smtp: [] as Record<string, unknown>[], resendError: null as null | { message: string }, smtpError: null as null | Error }));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: unknown) => {
        calls.resend.push(m);
        return calls.resendError ? { data: null, error: calls.resendError } : { data: { id: "re_1" }, error: null };
      },
    };
  },
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (m: Record<string, unknown>) => {
        calls.smtp.push(m);
        if (calls.smtpError) throw calls.smtpError;
        return { messageId: "<smtp-1>", rejected: [] };
      },
    }),
  },
}));

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({ garageName: "911 Garages", address: "Zone industrielle", phone: "+216 22 000 000", email: null, logoDataUrl: null }),
}));

const load = async () => {
  vi.resetModules();
  return import("@/server/email");
};
const msg = { to: "client@example.com", subject: "RDV", text: "Bonjour", brand: "911 Garages" };

beforeEach(() => {
  calls.resend = [];
  calls.smtp = [];
  calls.resendError = null;
  calls.smtpError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("sendEmail: Resend first, then Gmail (SMTP)", () => {
  it("nothing configured → clear error, nothing sent", async () => {
    const { sendEmail, emailConfigured } = await load();
    expect(emailConfigured()).toBe(false);
    const r = await sendEmail(msg);
    expect(r.ok).toBe(false);
  });

  it("Gmail only: sent as the Gmail account with the garage name, app password without spaces", async () => {
    vi.stubEnv("SMTP_USER", "garage911@gmail.com");
    vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
    const { sendEmail, emailSender } = await load();
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "<smtp-1>" });
    expect(calls.smtp[0]!.from).toEqual({ name: "911 Garages", address: "garage911@gmail.com" });
    expect(emailSender()).toBe("SMTP : garage911@gmail.com");
  });

  it("Resend works → Gmail not used", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("SUPPORT_FROM_EMAIL", "Garage <rdv@garage.tn>");
    vi.stubEnv("SMTP_USER", "g@gmail.com");
    vi.stubEnv("SMTP_PASS", "p");
    const { sendEmail } = await load();
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "re_1" });
    expect(calls.smtp).toHaveLength(0);
  });

  it("Resend refuses (no verified domain) → Gmail takes over", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("SUPPORT_FROM_EMAIL", "Garage <onboarding@resend.dev>");
    vi.stubEnv("SMTP_USER", "g@gmail.com");
    vi.stubEnv("SMTP_PASS", "p");
    calls.resendError = { message: "You can only send testing emails to your own email address" };
    const { sendEmail } = await load();
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "<smtp-1>" });
    expect(calls.resend).toHaveLength(1);
  });

  it("wrong Gmail password → French explanation", async () => {
    vi.stubEnv("SMTP_USER", "g@gmail.com");
    vi.stubEnv("SMTP_PASS", "normal-password");
    calls.smtpError = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    const { sendEmail } = await load();
    const r = await sendEmail(msg);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/mot de passe d'application/);
  });

  it("both fail → both errors reported", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("SUPPORT_FROM_EMAIL", "G <a@b.tn>");
    vi.stubEnv("SMTP_USER", "g@gmail.com");
    vi.stubEnv("SMTP_PASS", "p");
    calls.resendError = { message: "API key is invalid" };
    calls.smtpError = new Error("connect ETIMEDOUT");
    const { sendEmail } = await load();
    const r = await sendEmail(msg);
    expect(!r.ok && r.error).toMatch(/Resend : API key is invalid · SMTP : serveur SMTP injoignable/);
  });
});
