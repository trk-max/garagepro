import type { ReactNode } from "react";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";

/**
 * Full-bleed cinematic banner at the top of a customer page: the slot's
 * photo (or video) edge to edge, a kicker and an uppercase title.
 */
export function PageBanner({
  video,
  photo,
  kicker,
  title,
  subtitle,
  labels,
  children,
}: {
  video: string | null;
  photo: string | null;
  kicker?: string;
  title: string;
  subtitle?: string;
  labels: { pause: string; play: string };
  children?: ReactNode;
}) {
  return (
    <section className="dark relative isolate flex min-h-[36dvh] flex-col justify-end overflow-hidden bg-black text-white sm:min-h-[44dvh]">
      <HeroBackdrop video={video} photo={photo} labels={labels} />
      <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10 sm:pb-14">
        {kicker && (
          <p className="f-label flex items-center gap-3 text-white/60">
            <span className="h-px w-8 bg-white/40" aria-hidden />
            {kicker}
          </p>
        )}
        <h1 className="f-display mt-4 max-w-3xl text-3xl text-white sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed tracking-[0.03em] text-white/65">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
