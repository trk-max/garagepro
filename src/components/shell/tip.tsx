/** Tooltip: beside the rail on computers, above the bottom bar on tablets (shown on hover and keyboard focus of the parent `group`). */
export function Tip({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full z-50 mb-2 hidden rounded-full bg-gp-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-gp-primary-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 md:block xl:start-full xl:bottom-auto xl:mb-0 xl:ms-3"
    >
      {label}
    </span>
  );
}
