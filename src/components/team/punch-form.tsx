"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { punchAction } from "@/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

type Kind = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

/** Clock in/out: the kiosk code (unless network-only mode) + one button per allowed punch. */
export function PunchForm({ allowed, needsCode, initialCode }: { allowed: Kind[]; needsCode: boolean; initialCode?: string }) {
  const { t } = useI18n();
  const c = t.v7.clock;
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [pending, start] = useTransition();

  const send = (kind: Kind) =>
    start(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("code", code);
      const r = await punchAction(form);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.data?.message ?? c.done);
      setCode("");
      router.replace("/garage/pointage");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {needsCode ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{c.codeLabel}</span>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-14 max-w-56 text-center font-mono text-3xl tracking-[0.3em]"
            dir="ltr"
            aria-describedby="code-hint"
          />
          <span id="code-hint" className="block text-xs text-muted-foreground">
            {c.codeHint}
          </span>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">{c.networkOnly}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {allowed.map((k) => (
          <Button key={k} size="lg" variant={k === "IN" || k === "BREAK_END" ? "default" : "outline"} disabled={pending || (needsCode && code.length !== 6)} onClick={() => send(k)}>
            {c.kind[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}
