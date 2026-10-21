"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * V10 motion helpers: tiny hooks, no dependency. The CSS side (page enter,
 * stagger, bars, rings, hover lift) lives in globals.css (.gp-enter …).
 */

const QUERY = "(prefers-reduced-motion: reduce)";

/** true when the system asks for less motion (also true on the server: nothing animates before hydration). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}

/**
 * Counts from 0 up to `target` in `duration` ms (ease-out), once after mount.
 * The server render already shows the final value (no JavaScript = right number).
 */
export function useCountUp(target: number, duration = 600): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (reduced || target === 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(p >= 1 ? target : target * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return value;
}

/** Width of an element in CSS pixels (charts draw in real pixels: round corners stay round). */
export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(120, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
