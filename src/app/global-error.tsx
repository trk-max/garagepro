"use client";

/**
 * Last-resort boundary: used only if the root layout itself fails, so it cannot
 * rely on the i18n provider or the stylesheet. Bilingual static text, no details.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Une erreur est survenue</h1>
          <p dir="rtl" style={{ fontSize: 18 }}>حدث خطأ</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, minHeight: 44, padding: "0 20px", fontSize: 16, borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Réessayer · أعد المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
