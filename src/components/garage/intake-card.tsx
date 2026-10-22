import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { updateIntakeAction } from "@/actions/repair-order";
import { ActionForm } from "@/components/action-form";
import { IntakeFields, type IntakeDefaults } from "@/components/garage/intake-fields";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/field";
import type { Dictionary } from "@/lib/i18n/fr";

/** Work order page → « Prise en charge » (V10.6): details printed on the repair order + print link. */
export function IntakeCard({ workOrderId, defaults, locked, t }: { workOrderId: string; defaults: IntakeDefaults; locked: boolean; t: Dictionary }) {
  const l = t.legal.intake;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0">{l.title}</CardTitle>
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <Link href={`/garage/work-orders/${workOrderId}/prise-en-charge`} target="_blank">
            <ClipboardCheck className="size-4" aria-hidden /> {l.print}
          </Link>
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{l.intro}</p>
      <ActionForm action={updateIntakeAction.bind(null, workOrderId)} reset={false} successMessage={l.saved} className="grid gap-3">
        <IntakeFields t={t} defaults={defaults} disabled={locked} />
        {!locked && (
          <div>
            <Button type="submit" size="sm">
              {t.common.save}
            </Button>
          </div>
        )}
      </ActionForm>
    </Card>
  );
}
