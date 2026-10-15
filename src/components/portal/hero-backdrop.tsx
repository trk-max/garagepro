"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * Full-bleed background for a dark section: a muted looping video when one
 * exists (photo as poster/fallback), otherwise the photo.
 * - reduced motion or data saver: the photo only (the video stays paused);
 * - the video plays only while on screen, so off-screen sections cost nothing;
 * - the video fades in over its poster once it really plays (no black flash);
 * - a pause button is always offered.
 */
export function HeroBackdrop({
  video,
  photo,
  dim = "strong",
  labels,
}: {
  video: string | null;
  photo: string | null;
  dim?: "strong" | "soft" | "band";
  labels: { pause: string; play: string };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || saveData) {
      userPaused.current = true;
      v.pause();
      setPaused(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (userPaused.current) return;
        if (entry.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  if (!video && !photo) return null;

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      void v.play().catch(() => {});
      setPaused(false);
    } else {
      userPaused.current = true;
      v.pause();
      setPaused(true);
    }
  };

  const overlay =
    dim === "strong"
      ? "bg-gradient-to-t from-black via-black/45 to-black/20"
      : dim === "band"
        ? "bg-black/55"
        : "bg-gradient-to-b from-black/50 via-black/65 to-black";

  return (
    <>
      {photo && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${photo})` }} />}
      {video && (
        <video
          ref={ref}
          aria-hidden
          className={`absolute inset-0 -z-20 size-full object-cover transition-opacity duration-1000 ${playing || !photo ? "opacity-100" : "opacity-0"}`}
          src={video}
          poster={photo ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          onPlaying={() => setPlaying(true)}
        />
      )}
      <div aria-hidden className={`absolute inset-0 -z-10 ${overlay}`} />
      {video && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? labels.play : labels.pause}
          className="absolute end-4 bottom-4 z-10 grid size-10 place-items-center border border-white/30 text-white/70 transition-colors hover:border-brand-500 hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
        </button>
      )}
    </>
  );
}
