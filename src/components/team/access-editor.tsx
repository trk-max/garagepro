import type { Role } from "@prisma/client";
import { setUserPermissionsAction } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/field";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { PERMISSION_GROUPS, roleCan, SELF_PROTECTED, type OverrideChoice, type PermEffect, type PermissionGroup } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const CHOICES: OverrideChoice[] = ["ROLE", "GRANT", "DENY"];

/**
 * V10.3 — "Accès" section of an employee file (administrators only): every permission, grouped by
 * area, with a 3-way control "Per role / Allowed / Refused" and the role default shown beside it.
 * Plain radios (keyboard: Tab to the group, arrows to choose), saved by setUserPermissionsAction.
 */
export function AccessEditor({
  t,
  userId,
  role,
  overrides,
  isSelf,
}: {
  t: Dictionary;
  userId: string;
  role: Role;
  overrides: Record<string, PermEffect>;
  isSelf: boolean;
}) {
  const a = t.v103.access;
  const count = Object.keys(overrides).length;
  return (
    <Card id="acces" className="scroll-mt-20 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{a.title}</CardTitle>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", count ? "bg-gp-accent-tint text-gp-accent-ink" : "bg-muted text-muted-foreground")}>
          {count ? fmt(a.custom, { n: count }) : a.none}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{a.hint}</p>
      <ActionForm action={setUserPermissionsAction.bind(null, userId)} reset={false} silent className="mt-4 space-y-5">
        {(Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).map((group) => (
          <fieldset key={group} className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">{a.groups[group]}</legend>
            <ul className="divide-y rounded-md border">
              {PERMISSION_GROUPS[group].map((perm) => {
                const byRole = roleCan(role, perm);
                const current: OverrideChoice = overrides[perm] ?? "ROLE";
                const locked = isSelf && SELF_PROTECTED.includes(perm);
                const labelId = `perm-${perm}`;
                return (
                  <li key={perm} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p id={labelId} className="text-sm font-medium">{a.perms[perm]}</p>
                      <p className={cn("text-xs", byRole ? "text-gp-success-ink" : "text-muted-foreground")}>
                        {byRole ? a.roleDefault.yes : a.roleDefault.no}
                        {locked && <span className="ms-2 text-muted-foreground">· {a.selfLocked}</span>}
                      </p>
                    </div>
                    <div role="radiogroup" aria-labelledby={labelId} className="inline-flex w-full shrink-0 rounded-full bg-gp-panel p-1 sm:w-auto">
                      {CHOICES.map((choice) => {
                        const disabled = locked && choice === "DENY";
                        return (
                          <label
                            key={choice}
                            className={cn(
                              "relative flex-1 cursor-pointer rounded-full px-3 py-1.5 text-center text-xs font-medium whitespace-nowrap text-gp-muted transition-colors sm:flex-none",
                              "has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-gp-accent",
                              choice === "ROLE" && "has-[:checked]:bg-gp-card has-[:checked]:text-gp-ink",
                              choice === "GRANT" && "has-[:checked]:bg-gp-success has-[:checked]:text-white",
                              choice === "DENY" && "has-[:checked]:bg-gp-danger has-[:checked]:text-white",
                              disabled && "cursor-not-allowed opacity-40",
                            )}
                          >
                            <input type="radio" name={perm} value={choice} defaultChecked={current === choice} disabled={disabled} className="sr-only" />
                            {a.choice[choice]}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
        <div className="sticky bottom-24 flex justify-end xl:bottom-3">
          <Button type="submit">{a.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}

/** Team lists: "N accès sur mesure" chip, links to the employee's Accès section. */
export function AccessChip({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="shrink-0 rounded-full bg-gp-accent-tint px-2 py-0.5 text-[11px] font-medium text-gp-accent-ink hover:underline">
      {label}
    </a>
  );
}
