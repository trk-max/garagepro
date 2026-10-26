"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { submitFeedbackAction } from "@/actions/portal";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useAppBase } from "@/lib/app-base";

/**
 * 1-5 star rating + comment. From the repair tracker (`fromTracker`) it is tied
 * to the signed-in work order; on the public page name and plate are asked.
 */
export function FeedbackForm({ fromTracker = false }: { fromTracker?: boolean }) {
  const { t } = useI18n();
  const f = t.feedback;
  const base = useAppBase();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  return (
    <ActionForm action={submitFeedbackAction} silent className="space-y-4">
      {fromTracker && <input type="hidden" name="fromTracker" value="1" />}
      {base && <input type="hidden" name="from" value="app" />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <fieldset>
        <legend className="f-label mb-2 text-muted-foreground">{f.rating}</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} required className="peer sr-only" checked={rating === n} onChange={() => setRating(n)} />
              <span className="grid size-11 place-items-center peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
                <Star className={cn("size-8 transition-colors", n <= shown ? "fill-brand-500 text-brand-500" : "text-muted-foreground")} strokeWidth={1.25} aria-hidden />
              </span>
              <span className="sr-only">{fmt(f.stars, { n })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {!fromTracker && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="f-label text-muted-foreground">{t.common.name}</span>
            <Input name="name" maxLength={80} autoComplete="name" />
          </label>
          <label className="block space-y-1.5">
            <span className="f-label text-muted-foreground">{t.portal.plate}</span>
            <Input name="plate" maxLength={20} dir="ltr" className="uppercase" placeholder={t.customers.platePlaceholder} />
          </label>
        </div>
      )}
      <label className="block space-y-1.5">
        <span className="f-label text-muted-foreground">{f.comment}</span>
        <Textarea name="comment" rows={3} maxLength={1000} placeholder={f.commentPlaceholder} />
      </label>
      <Button type="submit" className="h-12 w-full hover:bg-brand-500 hover:text-white" disabled={rating === 0}>
        {f.submit}
      </Button>
    </ActionForm>
  );
}
