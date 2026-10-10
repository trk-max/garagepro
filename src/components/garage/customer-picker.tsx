"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { displayPlate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { CustomerOption } from "@/server/customers";

const DEBOUNCE_MS = 250;

/**
 * Searchable customer picker. Asks the server only for what matches the text
 * typed (after 250 ms without typing) and cancels the previous request when the
 * text changes, so the browser never downloads the whole customer list.
 */
export function CustomerPicker({ value, onChange }: { value: CustomerOption | null; onChange: (c: CustomerOption | null) => void }) {
  const { t } = useI18n();
  const w = t.workOrders;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults(await res.json());
        setFailed(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort(); // stale request: the user typed something else
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {value.phone}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden /> {w.changeCustomer}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={w.searchCustomer}
          aria-label={w.searchCustomer}
          className="ps-9"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      <div aria-live="polite">
        {failed && <p className="text-sm text-destructive">{t.errors.generic}</p>}
        {query.trim().length >= 2 && !loading && !failed && results.length === 0 && <p className="text-sm text-muted-foreground">{w.noCustomerFound}</p>}
        {results.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-md border">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onChange(c)}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">
                      {c.phone}
                    </span>
                  </span>
                  <span className="hidden flex-wrap justify-end gap-1 sm:flex">
                    {c.vehicles.slice(0, 2).map((v) => (
                      <span key={v.id} className="rounded-sm border px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                        {displayPlate(v.plate)}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground")}>
        <UserPlus className="size-3.5" aria-hidden /> {w.newCustomerHint}
      </p>
    </div>
  );
}
