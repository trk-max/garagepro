import Link from "next/link";
import { CompassIcon, HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

/**
 * 404 screen (shadcn "not-found-2"), wired for GaragePro: real links instead of
 * "#", translated texts passed in by the page, square buttons of the site.
 */
export function NotFound({
  description,
  homeLabel,
  homeHref = "/",
  exploreLabel,
  exploreHref,
}: {
  description: string;
  homeLabel: string;
  homeHref?: string;
  exploreLabel: string;
  exploreHref: string;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
      <Empty>
        <EmptyHeader>
          <EmptyTitle className="mask-b-from-20% mask-b-to-80% text-9xl font-extrabold" aria-label="404">
            404
          </EmptyTitle>
          <EmptyDescription className="-mt-8 max-w-xs text-balance text-foreground/80">{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={homeHref}>
                <HomeIcon className="size-4" data-icon="inline-start" aria-hidden />
                {homeLabel}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={exploreHref}>
                <CompassIcon className="size-4" data-icon="inline-start" aria-hidden />
                {exploreLabel}
              </Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
