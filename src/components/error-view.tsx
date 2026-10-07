"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/**
 * Shared body of the error boundaries. Shows a safe message only:
 * the real error (stack, SQL, secrets) stays in the server logs.
 * `digest` is the id Next.js prints in the server log for this error.
 */
export function ErrorView({ error, reset, homeHref }: { error: Error & { digest?: string }; reset: () => void; homeHref: string }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[ui] page error", error.digest ?? "", error.name);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{t.errors.pageTitle}</h1>
      <p className="text-sm text-muted-foreground">{t.errors.pageBody}</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground" dir="ltr">
          ref: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> {t.errors.retry}
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>{t.errors.home}</Link>
        </Button>
      </div>
    </div>
  );
}
