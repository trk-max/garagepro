import { Skeleton } from "@/components/ui/skeleton";

const card = "rounded-[24px] border border-gp-line bg-gp-card p-5";

/**
 * Shown instantly when the team navigates (Next.js streams the real page in when ready).
 * V10 shape: big title + subtitle, three cards (figure, 2 × 2 tiles, chart), a table.
 */
export default function GarageLoading() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5 print:hidden" role="status" aria-label="Chargement…">
      <div className="mb-6 flex items-end gap-3">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-10 w-72 max-w-full rounded-full" />
          <Skeleton className="h-4 w-96 max-w-full rounded-full" />
        </div>
        <Skeleton className="hidden h-11 w-36 rounded-full sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.1fr]">
        <div className={`${card} space-y-4`}>
          <Skeleton className="h-4 w-32 rounded-full" />
          <Skeleton className="h-10 w-48 rounded-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-11 rounded-full" />
            <Skeleton className="h-11 rounded-full" />
          </div>
          <Skeleton className="h-28 rounded-[18px]" />
        </div>
        <div className={`${card} grid grid-cols-2 gap-3 p-3`}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-[20px]" />
          ))}
        </div>
        <div className={`${card} space-y-4 md:col-span-2 xl:col-span-1`}>
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-60 rounded-[18px]" />
        </div>
      </div>
      <div className={card}>
        <Skeleton className="mb-4 h-5 w-56 rounded-full" />
        <div className="space-y-1 rounded-[18px] bg-gp-panel p-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-[14px] bg-gp-card px-4 py-3">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1 rounded-full" />
              <Skeleton className="hidden h-4 w-28 rounded-full sm:block" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
