import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown instantly when the team navigates (Next.js streams the real page in when ready).
 * Generic shape for every staff page: title, a row of figures, a table.
 */
export default function GarageLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" role="status" aria-label="Chargement…">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="ms-auto h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-md border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t px-4 py-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-28 sm:block" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
