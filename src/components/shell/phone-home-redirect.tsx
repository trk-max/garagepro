"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Phones and tablets (< 1024 px): the staff home is the role-focused team space (/garage/app); the full
 * dashboard stays one tap away (« Tableau de bord complet » → /garage?full=1). Desktop is unchanged.
 */
export function PhoneHomeRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("full") === "1") return;
    if (window.matchMedia("(max-width: 1023px)").matches) router.replace("/garage/app");
  }, [params, router]);
  return null;
}
