import Link from "next/link";
import { GraduationCap, ShieldAlert } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/redesign/chip";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { fmt, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { CertState, SkillLevel, SkillWarning } from "@/lib/skills";
import { cn } from "@/lib/utils";

/** V14 — shared display helpers of the skills map (server components). */

type Named = { nameFr: string; nameAr: string | null; nameEn: string | null };
export const skillLabel = (s: Named, lang: Lang) => (lang === "ar" ? s.nameAr : lang === "en" ? s.nameEn : null) || s.nameFr;

/** 🟢 autonomous, 🟡 supervised, 🔴 in training, grey = not concerned / not assessed. */
const DOT: Record<SkillLevel, string> = { AUTONOMOUS: "bg-emerald-500", SUPERVISED: "bg-amber-400", TRAINING: "bg-red-500", NOT_CONCERNED: "bg-zinc-300 dark:bg-zinc-600" };
const TONE: Record<SkillLevel, ChipTone> = { AUTONOMOUS: "success", SUPERVISED: "accent", TRAINING: "danger", NOT_CONCERNED: "neutral" };

export function LevelChip({ level, t }: { level: SkillLevel | null | undefined; t: Dictionary }) {
  if (!level) return <Chip tone="neutral">{t.v14.noLevel}</Chip>;
  return (
    <Chip tone={TONE[level]}>
      <span className={cn("size-2 rounded-full", DOT[level])} aria-hidden /> {t.v14.levels[level]}
    </Chip>
  );
}

/** Matrix cell: coloured dot + one letter (the full name for screen readers and on hover). */
export function LevelDot({ level, t, toVerify }: { level: SkillLevel | null | undefined; t: Dictionary; toVerify?: boolean }) {
  const label = `${level ? t.v14.levels[level] : t.v14.noLevel}${toVerify ? ` · ${t.v14.toVerify}` : ""}`;
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span className={cn("inline-grid size-6 place-items-center rounded-full text-[0.625rem] font-semibold text-white", level ? DOT[level] : "border border-dashed border-gp-line bg-transparent text-gp-muted")} aria-hidden>
        {level ? t.v14.levelShort[level] : "·"}
      </span>
      {toVerify && <ShieldAlert className="size-3.5 text-amber-600" aria-hidden />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

const CERT_TONE: Record<CertState, ChipTone> = { VALID: "success", EXPIRING: "accent", EXPIRED: "danger", VOID: "neutral" };
export function CertChip({ state, t }: { state: CertState; t: Dictionary }) {
  return <Chip tone={CERT_TONE[state]}>{t.v14.cert.state[state]}</Chip>;
}

export function warningText(w: SkillWarning, t: Dictionary, nameOf: (skillId: string) => string): string {
  return fmt(t.v14.warn[w.code], { skill: w.skillId ? nameOf(w.skillId) : "" });
}

/** Dashboard block « manques de compétences » (viewSkills). */
export function SkillGapsCard({ t, lang, data }: { t: Dictionary; lang: Lang; data: { skills: (Named & { id: string })[]; gaps: { skillId: string; supervised: number; training: number }[]; expiring: number } }) {
  const v = t.v14;
  const byId = new Map(data.skills.map((s) => [s.id, s]));
  return (
    <Surface aria-labelledby="ov-skills">
      <SurfaceHeader id="ov-skills" title={t.v103.dash.blocks.skillGaps} hint={v.dash.hint}>
        <PillLink href="/garage/competences" variant="outline" className="h-10">
          {v.nav.skills}
        </PillLink>
      </SurfaceHeader>
      {data.gaps.length === 0 ? (
        <EmptyState icon={GraduationCap} title={data.skills.length ? v.dash.none : v.matrix.empty} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.gaps.slice(0, 8).map((g) => (
            <li key={g.skillId} className="rounded-[14px] bg-gp-panel px-3 py-2 text-[13px]">
              <p className="font-medium">{fmt(v.matrix.gapLine, { skill: byId.get(g.skillId) ? skillLabel(byId.get(g.skillId)!, lang) : g.skillId })}</p>
              <p className="text-xs text-gp-muted">{fmt(v.matrix.gapDetail, { supervised: g.supervised, training: g.training })}</p>
            </li>
          ))}
        </ul>
      )}
      {data.gaps.length > 8 && <p className="mt-2 text-xs text-gp-muted">{fmt(v.dash.more, { n: data.gaps.length - 8 })}</p>}
      {data.expiring > 0 && (
        <Link href="/garage/competences#certificats" className="mt-3 inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">
          <ShieldAlert className="size-4 text-amber-600" aria-hidden /> {fmt(v.dash.expiring, { n: data.expiring })}
        </Link>
      )}
    </Surface>
  );
}
