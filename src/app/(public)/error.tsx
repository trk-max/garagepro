"use client";

import { ErrorView } from "@/components/error-view";

/** Error boundary for the customer portal (home, tracking, booking). */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} homeHref="/" />;
}
