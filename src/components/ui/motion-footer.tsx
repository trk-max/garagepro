"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

// Register ScrollTrigger safely for React (browser only).
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// -------------------------------------------------------------------------
// Magnetic button primitive (follows the cursor, springs back). Styles of the
// whole footer live in app/globals.css ("Cinematic footer").
// -------------------------------------------------------------------------
export type MagneticButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    as?: React.ElementType;
  };

const MagneticButton = React.forwardRef<HTMLElement, MagneticButtonProps>(({ className, children, as: Component = "button", ...props }, forwardedRef) => {
  const localRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = localRef.current;
    if (!element || reducedMotion()) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(element, { x: x * 0.4, y: y * 0.4, rotationX: -y * 0.15, rotationY: x * 0.15, scale: 1.05, ease: "power2.out", duration: 0.4 });
    };
    const handleMouseLeave = () => {
      gsap.to(element, { x: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1, ease: "elastic.out(1, 0.3)", duration: 1.2 });
    };

    element.addEventListener("mousemove", handleMouseMove);
    element.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      element.removeEventListener("mousemove", handleMouseMove);
      element.removeEventListener("mouseleave", handleMouseLeave);
      gsap.killTweensOf(element);
    };
  }, []);

  return (
    <Component
      ref={(node: HTMLElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={cn("cursor-pointer", className)}
      {...props}
    >
      {children}
    </Component>
  );
});
MagneticButton.displayName = "MagneticButton";

// -------------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------------
export type FooterLink = { href: string; label: string; icon?: React.ReactNode; external?: boolean };

export type CinematicFooterProps = {
  /** Huge outlined word behind everything (brand name). */
  giantText: string;
  /** Phrases scrolling in the tilted band at the top. */
  marquee: string[];
  heading: string;
  /** Big pills (main actions). */
  primaryLinks: FooterLink[];
  /** Small pills (secondary pages). */
  secondaryLinks: FooterLink[];
  copyright: string;
  credit: { before: string; after: string; name: string };
  backToTopLabel: string;
  /** Extra line in the bottom bar (address, phone…). */
  info?: React.ReactNode;
  className?: string;
};

function MarqueeItem({ items }: { items: string[] }) {
  return (
    <div className="flex items-center space-x-12 px-6">
      {items.map((text, i) => (
        <React.Fragment key={i}>
          <span>{text}</span>
          <span className={i % 2 ? "text-foreground/40" : "text-brand-500/70"} aria-hidden>
            ✦
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function PillLink({ link, className }: { link: FooterLink; className: string }) {
  const content = (
    <>
      {link.icon}
      {link.label}
    </>
  );
  return link.external ? (
    <MagneticButton as="a" href={link.href} target="_blank" rel="noopener" className={className}>
      {content}
    </MagneticButton>
  ) : (
    <MagneticButton as={Link} href={link.href} className={className}>
      {content}
    </MagneticButton>
  );
}

/**
 * Compact animated footer: thin marquee, brand word in the background, magnetic
 * pills. People who ask for reduced motion get it without animations.
 */
export function CinematicFooter({ giantText, marquee, heading, primaryLinks, secondaryLinks, copyright, credit, backToTopLabel, info, className }: CinematicFooterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const giantTextRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wrapperRef.current || reducedMotion()) return;

    // React strict-mode compatible GSAP context cleanup.
    const ctx = gsap.context(() => {
      // Background parallax.
      gsap.fromTo(
        giantTextRef.current,
        { y: "4vw", opacity: 0 },
        { y: "0vw", opacity: 1, ease: "power1.out", scrollTrigger: { trigger: wrapperRef.current, start: "top bottom", end: "bottom bottom", scrub: 1 } },
      );
      // Staggered content reveal.
      gsap.fromTo(
        [headingRef.current, linksRef.current],
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: wrapperRef.current, start: "top 95%", end: "top 60%", scrub: 1 } },
      );
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  // Long brand names must still fit on one line.
  const giantSize = `${Math.min(12, Math.round(90 / Math.max(giantText.length, 1)))}vw`;

  return (
    // Compact footer in the normal page flow (no full-screen curtain): about one third of a screen.
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <footer className="cinematic-footer-wrapper relative flex w-full flex-col overflow-hidden border-t border-border bg-background text-foreground">
        {/* Ambient light & grid */}
        <div className="footer-aurora animate-footer-breathe pointer-events-none absolute top-1/2 left-1/2 z-0 h-[40vh] w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[80px]" aria-hidden />
        <div className="footer-bg-grid pointer-events-none absolute inset-0 z-0" aria-hidden />

        {/* Giant background word, small and faint */}
        <div
          ref={giantTextRef}
          className="footer-giant-bg-text pointer-events-none absolute -bottom-[1.5vw] left-1/2 z-0 -translate-x-1/2 whitespace-nowrap select-none"
          style={{ fontSize: giantSize }}
          dir="ltr"
          aria-hidden
        >
          {giantText}
        </div>

        {/* Thin marquee */}
        <div className="relative z-10 w-full overflow-hidden border-b border-border/50 bg-background/60 py-2.5 backdrop-blur-md" aria-hidden>
          <div className="animate-footer-scroll-marquee flex w-max text-[10px] font-bold tracking-[0.3em] text-muted-foreground uppercase md:text-xs" dir="ltr">
            <MarqueeItem items={marquee} />
            <MarqueeItem items={marquee} />
          </div>
        </div>
        <ul className="sr-only">
          {marquee.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>

        {/* Center */}
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 pt-8 pb-6 md:flex-row md:items-center md:justify-between md:gap-8 md:pt-10">
          <h2 ref={headingRef} className="footer-text-glow text-center text-xl font-black tracking-tight md:text-start md:text-2xl">
            {heading}
          </h2>
          <div ref={linksRef} className="flex flex-col items-center gap-3 md:items-end">
            <div className="flex flex-wrap justify-center gap-2 md:justify-end">
              {primaryLinks.map((l) => (
                <PillLink
                  key={l.href}
                  link={l}
                  className="footer-glass-pill group flex items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-[0.06em] text-foreground uppercase hover:border-brand-500 [&_svg]:size-4 [&_svg]:text-muted-foreground [&_svg]:transition-colors hover:[&_svg]:text-brand-500"
                />
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2 md:justify-end">
              {secondaryLinks.map((l) => (
                <PillLink key={l.href} link={l} className="footer-glass-pill px-3 py-1.5 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground" />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar. Extra space below: the floating "Ask the AI" button (bottom corner) never covers "back to top". */}
        <div className="relative z-20 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t border-border/50 px-4 pt-4 pb-20 md:flex-row">
          <div className="space-y-1 text-center text-[10px] font-semibold tracking-widest text-muted-foreground uppercase md:text-start">
            <p>{copyright}</p>
            {info && <div className="normal-case tracking-normal">{info}</div>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex cursor-default items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <span>{credit.before}</span>
              <span className="animate-footer-heartbeat text-sm text-brand-500" aria-hidden>
                ❤
              </span>
              <span>{credit.after}</span>
              <span className="ms-1 text-xs font-black tracking-normal text-foreground">{credit.name}</span>
            </div>
            <MagneticButton
              as="button"
              type="button"
              onClick={scrollToTop}
              aria-label={backToTopLabel}
              title={backToTopLabel}
              className="footer-glass-pill group flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <svg className="size-4 transition-transform duration-300 group-hover:-translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </MagneticButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
