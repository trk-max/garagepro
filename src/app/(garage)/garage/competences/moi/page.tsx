import { redirect } from "next/navigation";
import { getStaff } from "@/lib/session";

/** V14 — « Mes compétences »: the signed-in person's own sheet (read-only for him). */
export default async function MySkillsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  redirect(`/garage/competences/${staff.id}`);
}
