import type { Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { StaffUser } from "@/lib/session";
import { assignmentOptions, listSkills } from "@/server/skills";
import { SkillAssignCard } from "@/components/skills/assign-card";

/** V14 — assisted assignment card of the work order page (loads its own data). */
export async function SkillAssignSection({ workOrderId, staff, t, lang }: { workOrderId: string; staff: StaffUser; t: Dictionary; lang: Lang }) {
  const [map, skills] = await Promise.all([assignmentOptions([workOrderId]), listSkills()]);
  const o = map.get(workOrderId);
  if (!o) return null;
  return <SkillAssignCard o={o} skills={skills} staff={staff} t={t} lang={lang} />;
}
