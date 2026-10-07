"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button onClick={() => window.print()} variant="outline" className="print:hidden">
      <Printer className="size-4" aria-hidden /> {t.common.print}
    </Button>
  );
}
