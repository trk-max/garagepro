"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from "@/lib/handover";

/**
 * V16 Lot 4 — home-made signature pad (no library): a fixed-size canvas (600 × 220 px, white background, black
 * stroke) drawn with the finger, a stylus or the mouse (pointer events). On each stroke the drawing is exported as a
 * PNG data URL into a hidden input (`name`), so a plain <form> sends it: a few KB, far below Vercel's 4.5 MB limit.
 * Works offline on the garage hub (nothing external).
 */
export function SignaturePad({ name = "signature", required = false }: { name?: string; required?: boolean }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState("");

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setValue("");
  };

  useEffect(clear, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{t.v16.lot4.signature.pad}</p>
      <canvas
        ref={canvasRef}
        width={SIGNATURE_WIDTH}
        height={SIGNATURE_HEIGHT}
        role="img"
        aria-label={t.v16.lot4.signature.pad}
        data-testid="signature-pad"
        className="h-auto w-full max-w-[600px] touch-none rounded-[14px] border-2 border-dashed border-gp-line bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = canvasRef.current!.getContext("2d")!;
          const p = point(e);
          ctx.strokeStyle = "#111111";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          setValue(canvasRef.current!.toDataURL("image/png"));
        }}
        onPointerLeave={() => {
          if (!drawing.current) return;
          drawing.current = false;
          last.current = null;
          setValue(canvasRef.current!.toDataURL("image/png"));
        }}
      />
      {/* Hidden value sent with the form (an empty signature is refused by the server with a clear message). */}
      <input type="hidden" name={name} value={value} />
      {required && !value && <p className="text-xs text-muted-foreground">{t.v16.lot4.signature.empty}</p>}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="size-4" aria-hidden /> {t.v16.lot4.signature.clear}
        </Button>
      </div>
    </div>
  );
}
