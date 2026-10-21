"use client";

import { signOutAction } from "@/actions/auth";
import { clearPrivateCache } from "@/components/pwa/pwa-register";
import { SIGN_OUT_FORM } from "@/components/shell/user-menu";

/**
 * One hidden sign-out form for the whole shell; the rail button and the account
 * menu submit it (form="…"). Sign-out also forgets the pages saved for offline use.
 */
export function SignOutForm() {
  return <form id={SIGN_OUT_FORM} action={signOutAction} onSubmit={() => clearPrivateCache()} hidden />;
}
