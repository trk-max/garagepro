import { createHash } from "node:crypto";

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,79}$/;

export function safeErrorType(error: unknown): string {
  if (error instanceof Error && SAFE_NAME.test(error.name)) return error.name;
  return "Error";
}

export function sanitizeSystemErrorMessage(message: string): string {
  const clean = message
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi, "[redacted-url]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, "[redacted-key]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return /\b(?:select|insert|update|delete|drop|alter)\b/i.test(clean) ? "Technical error details omitted" : clean;
}

export function systemErrorFingerprint(source: string, place: string, message: string): string {
  return createHash("sha256").update(`${source}\u0000${place}\u0000${message}`).digest("hex");
}
