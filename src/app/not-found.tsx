import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="text-sm text-muted-foreground">{t.errors.notFoundBody}</p>
      <Button asChild>
        <Link href="/">{t.errors.home}</Link>
      </Button>
    </main>
  );
}
