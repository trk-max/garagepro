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
 * "Curtain reveal" footer: it stays fixed under the page and is uncovered as
 * the visitor scrolls to the end (giant brand word, tilted marquee, magnetic
 * pills). People who ask for reduced motion get it without animations.
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
        { y: "10vh", scale: 0.8, opacity: 0 },
        { y: "0vh", scale: 1, opacity: 1, ease: "power1.out", scrollTrigger: { trigger: wrapperRef.current, start: "top 80%", end: "bottom bottom", scrub: 1 } },
      );
      // Staggered content reveal.
      gsap.fromTo(
        [headingRef.current, linksRef.current],
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.15, ease: "power3.out", scrollTrigger: { trigger: wrapperRef.current, start: "top 40%", end: "bottom bottom", scrub: 1 } },
      );
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  // Long brand names must still fit on one line.
  const giantSize = `${Math.min(26, Math.round(150 / Math.max(giantText.length, 1)))}vw`;

  return (
    // The wrapper sits in the normal flow; its clip-path shows the fixed footer only inside its own box.
    <div ref={wrapperRef} className={cn("relative h-screen w-full", className)} style={{ clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)" }}>
      <footer className="cinematic-footer-wrapper fixed bottom-0 left-0 flex h-screen w-full flex-col justify-between overflow-hidden bg-background text-foreground">
        {/* Ambient light & grid */}
        <div className="footer-aurora animate-footer-breathe pointer-events-none absolute top-1/2 left-1/2 z-0 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[80px]" aria-hidden />
        <div className="footer-bg-grid pointer-events-none absolute inset-0 z-0" aria-hidden />

        {/* Giant background word */}
        <div
          ref={giantTextRef}
          className="footer-giant-bg-text pointer-events-none absolute -bottom-[5vh] left-1/2 z-0 -translate-x-1/2 whitespace-nowrap select-none"
          style={{ fontSize: giantSize }}
          dir="ltr"
          aria-hidden
        >
          {giantText}
        </div>

        {/* Tilted marquee */}
        <div className="absolute top-12 left-0 z-10 w-full -rotate-2 scale-110 overflow-hidden border-y border-border/50 bg-background/60 py-4 backdrop-blur-md" aria-hidden>
          <div className="animate-footer-scroll-marquee flex w-max text-xs font-bold tracking-[0.3em] text-muted-foreground uppercase md:text-sm" dir="ltr">
            <MarqueeItem items={marquee} />
            <MarqueeItem items={marquee} />
          </div>
        </div>
        {/* The same phrases for screen readers (the band above is decorative). */}
        <ul className="sr-only">
          {marquee.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>

        {/* Center */}
        <div className="relative z-10 mx-auto mt-20 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6">
          <h2 ref={headingRef} className="footer-text-glow mb-12 text-center text-4xl font-black tracking-tighter normal-case md:text-7xl">
            {heading}
          </h2>

          <div ref={linksRef} className="flex w-full flex-col items-center gap-6">
            <div className="flex w-full flex-wrap justify-center gap-4">
              {primaryLinks.map((l) => (
                <PillLink
                  key={l.href}
                  link={l}
                  className="footer-glass-pill group flex items-center gap-3 px-8 py-4 text-sm font-bold tracking-[0.06em] text-foreground uppercase hover:border-brand-500 md:px-10 md:py-5 md:text-base [&_svg]:size-5 [&_svg]:text-muted-foreground [&_svg]:transition-colors hover:[&_svg]:text-brand-500"
                />
              ))}
            </div>
            <div className="mt-2 flex w-full flex-wrap justify-center gap-3 md:gap-6">
              {secondaryLinks.map((l) => (
                <PillLink
                  key={l.href}
                  link={l}
                  className="footer-glass-pill px-5 py-3 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground md:px-6 md:text-sm"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative z-20 flex w-full flex-col items-center justify-between gap-6 px-6 pb-8 md:flex-row md:px-12">
          <div className="order-2 space-y-1 text-center text-[10px] font-semibold tracking-widest text-muted-foreground uppercase md:order-1 md:text-start md:text-xs">
            <p>{copyright}</p>
            {info && <div className="normal-case tracking-normal">{info}</div>}
          </div>

          <div className="footer-glass-pill order-1 flex cursor-default items-center gap-2 px-6 py-3 md:order-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">{credit.before}</span>
            <span className="animate-footer-heartbeat text-sm text-brand-500 md:text-base" aria-hidden>
              ❤
            </span>
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">{credit.after}</span>
            <span className="ms-1 text-xs font-black tracking-normal text-foreground md:text-sm">{credit.name}</span>
          </div>

          <MagneticButton
            as="button"
            type="button"
            onClick={scrollToTop}
            aria-label={backToTopLabel}
            title={backToTopLabel}
            className="footer-glass-pill group order-3 flex size-12 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <svg className="size-5 transition-transform duration-300 group-hover:-translate-y-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </MagneticButton>
        </div>
      </footer>
    </div>
  );
}
