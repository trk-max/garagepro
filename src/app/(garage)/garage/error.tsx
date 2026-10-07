"use client";

import { ErrorView } from "@/components/error-view";

/** Error boundary for every staff page (rendered inside the sidebar layout). */
export default function GarageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} homeHref="/garage" />;
}
