"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";

/** V14 — adds a certificate (and its PDF / photo) to /api/skills/certificates; the server checks everything again. */
export function CertificateForm({ userId, skills }: { userId: string; skills: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const c = t.v14.cert;
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = new FormData(e.currentTarget);
        body.set("userId", userId);
        const file = body.get("file");
        if (file instanceof File && file.size === 0) body.delete("file");
        start(async () => {
          const res = await fetch("/api/skills/certificates", { method: "POST", body });
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as { message?: string } | null;
            toast.error(j?.message ?? t.errors.generic);
            return;
          }
          toast.success(c.added);
          ref.current?.reset();
          router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        <Field label={c.type} className="sm:col-span-2">
          <Input name="type" required minLength={2} maxLength={150} />
        </Field>
        <Field label={c.issuer}>
          <Input name="issuer" maxLength={150} />
        </Field>
        <Field label={c.skill}>
          <NativeSelect name="skillId" defaultValue="">
            <option value="">{c.noSkill}</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={c.issuedOn}>
          <Input type="date" name="issuedOn" />
        </Field>
        <Field label={c.expiresOn}>
          <Input type="date" name="expiresOn" />
        </Field>
        <Field label={c.file} className="sm:col-span-2">
          <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="max-w-full text-sm" />
        </Field>
        <Field label={c.note} className="sm:col-span-2">
          <Input name="note" maxLength={500} />
        </Field>
        <div>
          <Button type="submit">{pending ? c.uploading : c.add}</Button>
        </div>
      </fieldset>
    </form>
  );
}
