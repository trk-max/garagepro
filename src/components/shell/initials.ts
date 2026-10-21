/**
 * "Karim Ben Salah" → "KB" (first letters of the first two words). Words without a letter or
 * digit are skipped and punctuation is ignored: "Malek (Admin)" → "MA", not "M(".
 */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => !!c)
    .slice(0, 2)
    .map((c) => c.toUpperCase())
    .join("");
