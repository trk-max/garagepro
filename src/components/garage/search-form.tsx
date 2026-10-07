import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Plain GET form: works without JavaScript and keeps the URL shareable. */
export function SearchForm({
  placeholder,
  defaultValue,
  hidden = {},
}: {
  placeholder: string;
  defaultValue?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" className="relative w-full max-w-sm">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input name="q" defaultValue={defaultValue} placeholder={placeholder} className="ps-8" aria-label={placeholder} />
    </form>
  );
}
