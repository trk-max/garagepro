"use server";

import { signOut } from "@/lib/auth";

/** Ends the staff session and lands on the staff login page (not the customer home page). */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
