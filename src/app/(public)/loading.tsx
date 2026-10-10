import { Skeleton } from "@/components/ui/skeleton";

/** Customer portal: instant placeholder while the page (tracking, booking…) loads. */
export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" role="status" aria-label="Chargement…">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
