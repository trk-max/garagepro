import { beforeEach, describe, expect, it, vi } from "vitest";

const { reserveAttemptMock, recordSystemErrorMock } = vi.hoisted(() => ({
  reserveAttemptMock: vi.fn(),
  recordSystemErrorMock: vi.fn(),
}));

vi.mock("@/server/rate-limit", () => ({ reserveAttempt: reserveAttemptMock }));
vi.mock("@/server/system-errors", () => ({ recordSystemError: recordSystemErrorMock }));

import { POST } from "@/app/api/system-errors/route";

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://garagepro.test/api/system-errors", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("browser error report endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveAttemptMock.mockResolvedValue(["attempt"]);
    recordSystemErrorMock.mockResolvedValue(true);
  });

  it("accepts only safe boundary metadata and applies its per-address limit", async () => {
    const response = await POST(request({ source: "route-boundary", name: "TypeError", digest: "ref_123" }));
    expect(response.status).toBe(204);
    expect(reserveAttemptMock).toHaveBeenCalledWith(expect.any(Array), 10, false);
    expect(reserveAttemptMock.mock.calls[0]![0][0].max).toBe(8);
    expect(recordSystemErrorMock).toHaveBeenCalledWith({
      source: "client",
      place: "route-boundary",
      message: "Client render failure (TypeError; ref ref_123)",
      requestId: "ref_123",
    });
  });

  it("rejects untrusted report details and returns a visible failure on limit or storage errors", async () => {
    expect((await POST(request({ source: "arbitrary", name: "Error" }))).status).toBe(400);

    reserveAttemptMock.mockResolvedValueOnce(null);
    expect((await POST(request({ source: "global-boundary" }))).status).toBe(429);

    recordSystemErrorMock.mockResolvedValueOnce(false);
    expect((await POST(request({ source: "global-boundary" }))).status).toBe(503);
  });
});
