"use client";

import Link from "next/link";
import { ChevronDown, Languages, LogOut, UserRound } from "lucide-react";
import type { Role } from "@prisma/client";
import { HubStatus } from "@/components/pwa/hub-status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LANGS, type Lang } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { can } from "@/lib/permissions";
import { initials } from "@/components/shell/initials";
import { MENU_KEYS, navLabel, pick, type NavBadges } from "@/components/shell/nav";

export type ShellUser = { id: string; name: string; email: string; role: Role };

export const SIGN_OUT_FORM = "gp-sign-out";
const LANG_NAMES: Record<Lang, string> = { fr: "Français", ar: "العربية", en: "English" };


/**
 * Account pill (initials, name, e-mail, chevron) and its menu: account page,
 * team, contracts, help and settings (V10.4, with their badges), language, garage hub status, sign-out. Pages appear only when the
 * role may open them; there is no billing page, so no "Plan & Billing" entry.
 */
export function UserMenu({ user, badges }: { user: ShellUser; badges: NavBadges }) {
  const { t, lang } = useI18n();
  const goLang = (code: Lang) => {
    if (code === lang) return;
    // Same route as the language switch: the server sets the cookie and comes back here.
    window.location.assign(`/api/lang?l=${code}&next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };
  // Dot on the pill when a page of this menu has a counter (team leaves, contracts ending…).
  const menuBadge = MENU_KEYS.some((k) => (badges[k] ?? 0) > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t.v10.shell.userMenu} — ${user.name}`}
        className="gp-lift flex h-14 items-center gap-3 rounded-full border border-gp-line bg-gp-card p-1.5 text-start shadow-gp outline-none hover:bg-gp-hover focus-visible:ring-2 focus-visible:ring-gp-accent sm:pe-4"
      >
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gp-primary text-sm font-semibold text-gp-primary-ink" aria-hidden>
          {initials(user.name)}
          {menuBadge && <span className="absolute end-0 top-0 size-3 rounded-full border-2 border-gp-card bg-gp-accent" />}
        </span>
        {/* 1280–1535 px: the page pills share this row, so only the initials (name and e-mail are in the menu). */}
        <span className="hidden min-w-0 lg:block xl:hidden 2xl:block">
          <span className="block max-w-40 truncate text-sm font-semibold">{user.name}</span>
          <span className="block max-w-40 truncate text-xs text-gp-muted">{user.email}</span>
        </span>
        <ChevronDown className="hidden size-4 text-gp-muted sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} className="w-72 rounded-[20px] p-2">
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-semibold text-gp-ink">{user.name}</span>
          <span className="block truncate text-xs font-normal">{user.email}</span>
          <span className="block text-xs font-normal">{t.roles[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {can(user.role, "manageTeam") && (
          <DropdownMenuItem asChild className="rounded-full px-3 py-2.5">
            <Link href={`/garage/equipe/${user.id}`}>
              <UserRound aria-hidden /> {t.v10.shell.account}
            </Link>
          </DropdownMenuItem>
        )}
        {pick(user.role, MENU_KEYS).map(({ key, href, icon: Icon }) => {
          const badge = badges[key];
          return (
            <DropdownMenuItem key={key} asChild className="rounded-full px-3 py-2.5">
              <Link href={href}>
                <Icon aria-hidden /> <span className="flex-1">{key === "settings" ? t.v10.shell.settings : navLabel(t, key)}</span>
                {badge ? (
                  <>
                    <span className="sr-only">, </span>
                    <span className="min-w-6 rounded-full bg-gp-accent-tint px-2 text-center text-xs font-semibold text-gp-accent-ink tabular-nums">{badge > 99 ? "99+" : badge}</span>
                  </>
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuLabel className="flex items-center gap-2 px-3 pt-2">
          <Languages className="size-3.5" aria-hidden /> {t.common.language}
        </DropdownMenuLabel>
        <div className="flex gap-1 px-1 pb-1">
          {LANGS.map((code) => (
            <DropdownMenuItem
              key={code}
              lang={code}
              onSelect={() => goLang(code)}
              aria-current={code === lang ? "true" : undefined}
              className={`flex-1 justify-center rounded-full py-2 text-xs font-medium ${code === lang ? "bg-gp-primary text-gp-primary-ink focus:bg-gp-primary focus:text-gp-primary-ink" : ""}`}
            >
              {LANG_NAMES[code]}
            </DropdownMenuItem>
          ))}
        </div>
        <div className="px-1 empty:hidden">
          <HubStatus />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-full px-3 py-2.5 text-gp-danger-ink">
          <button type="submit" form={SIGN_OUT_FORM} className="w-full">
            <LogOut className="rtl:rotate-180" aria-hidden /> {t.common.signOut}
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
