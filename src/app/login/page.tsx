import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";
import { LangSwitch } from "@/components/garage/lang-switch";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia, slotMedia } from "@/lib/site-media";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const { t } = await getI18n();
  const { video, photo } = slotMedia(siteMedia(), "login", "hero");

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/garage",
      });
    } catch (err) {
      if (err instanceof CredentialsSignin && err.code === "locked") redirect("/login?error=locked");
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err; // NEXT_REDIRECT on success
    }
  }

  // Same "black marble" look as the customer site: the film behind, a flat square panel in front.
  return (
    <main className="ferrari dark relative isolate flex min-h-dvh flex-col bg-black text-white">
      <HeroBackdrop video={video} photo={photo} dim="band" labels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }} />
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="f-label inline-flex min-h-11 items-center gap-2 text-white/70 transition-colors hover:text-brand-500">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          <GpWordmark className="h-2.5 w-auto" aria-hidden />
          <span className="sr-only">{t.common.appName}</span>
        </Link>
        <LangSwitch className="border-[#303030]" />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form action={login} className="w-full max-w-sm space-y-5 border border-[#303030] bg-black/80 p-6 backdrop-blur-sm sm:p-8">
          <div className="flex flex-col items-center gap-5 pb-2 text-center">
            <GpMonogram className="h-14 w-auto text-white" aria-hidden />
            <div>
              <h1 className="f-display text-xl">{t.login.title}</h1>
              <p className="mt-2 text-[0.8125rem] text-white/60">{t.login.subtitle}</p>
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="f-label text-white/60">{t.login.email}</span>
            <Input name="email" type="email" autoComplete="email" dir="ltr" required className="h-12" />
          </label>
          <label className="block space-y-1.5">
            <span className="f-label text-white/60">{t.login.password}</span>
            <Input name="password" type="password" autoComplete="current-password" dir="ltr" required className="h-12" />
          </label>
          {error && (
            <p role="alert" className="border-s-2 border-brand-500 ps-3 text-[0.8125rem] text-white">
              {error === "locked" ? t.login.locked : t.login.error}
            </p>
          )}
          <Button type="submit" className="h-12 w-full hover:bg-brand-500 hover:text-white">
            {t.login.submit}
          </Button>
        </form>
      </div>
    </main>
  );
}
