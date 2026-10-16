import { NotFound } from "@/components/ui/not-found-2";
import { aboutContent } from "@/lib/about-content";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFoundPage() {
  const { t, lang } = await getI18n();
  return (
    <main className="ferrari bg-background text-foreground">
      <h1 className="sr-only">{t.errors.notFoundTitle}</h1>
      <NotFound description={t.errors.notFoundBody} homeLabel={t.errors.home} exploreLabel={aboutContent(lang).navLink} exploreHref="/a-propos" />
    </main>
  );
}
