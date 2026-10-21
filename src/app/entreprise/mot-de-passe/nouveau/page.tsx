import type { Metadata } from "next";
import Link from "next/link";
import { CompanyResetForm } from "@/components/team/company-reset-forms";
import { getI18n } from "@/lib/i18n/server";
import { verifyCompanyResetToken } from "@/server/company-password";

// The token is in the address: never send it to another site in the Referer header.
export const metadata: Metadata = { referrer: "no-referrer" };

type PageProps = { searchParams: Promise<{ token?: string }> };

export default async function CompanyResetPage({ searchParams }: PageProps) {
  const { token = "" } = await searchParams;
  const [{ t }, user] = await Promise.all([getI18n(), token.length <= 500 ? verifyCompanyResetToken(token) : null]);
  const c = t.v7.company;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="f-display text-2xl">{c.newPasswordTitle}</h1>
      {user ? (
        <>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {user.email}
          </p>
          <CompanyResetForm token={token} />
        </>
      ) : (
        <>
          <p className="border border-dashed p-4 text-sm">{c.linkInvalid}</p>
          <Link href="/entreprise/mot-de-passe" className="block text-sm underline-offset-4 hover:underline">
            {c.forgot}
          </Link>
        </>
      )}
    </div>
  );
}
