import { redirect } from "next/navigation";
import { getStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Start page of the TEAM app (manifest start_url, short address to type on the garage Wi-Fi):
 * signed in → the role-focused « Espace équipe »; otherwise the sign-in page, which comes back here.
 */
export default async function TeamAppEntry() {
  if (await getStaff()) redirect("/garage/app");
  redirect("/login?next=/garage/app");
}
