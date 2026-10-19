"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** Button that asks for a reason (kept in the history) before running the action. */
export function ReasonButton({ action, question, children, className }: { action: (reason: string) => Promise<Result>; question: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() => {
        const reason = window.prompt(question)?.trim();
        if (!reason) return;
        start(async () => {
          const r = await action(reason);
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}
