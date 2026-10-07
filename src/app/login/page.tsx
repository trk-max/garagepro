import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { LangSwitch } from "@/components/garage/lang-switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const { t } = await getI18n();

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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-end">
          <LangSwitch />
        </div>
        <form action={login} className="space-y-4 rounded-lg border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-semibold">{t.common.appName}</h1>
              <p className="text-sm text-muted-foreground">{t.login.subtitle}</p>
            </div>
          </div>
          <Input name="email" type="email" placeholder={t.login.email} autoComplete="email" dir="ltr" required />
          <Input name="password" type="password" placeholder={t.login.password} autoComplete="current-password" dir="ltr" required />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error === "locked" ? t.login.locked : t.login.error}
            </p>
          )}
          <Button type="submit" className="w-full">
            {t.login.submit}
          </Button>
        </form>
      </div>
    </main>
  );
}
