import type { Metadata } from "next";
import { ShowroomDetailView, loadPublicListing } from "@/components/showroom/showroom-detail-view";
import { getI18n } from "@/lib/i18n/server";
import { formatPriceDt } from "@/lib/showroom";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const l = await loadPublicListing((await params).slug);
  if (!l) return {};
  const { lang } = await getI18n();
  const title = [l.make, l.model, l.version, l.year].filter(Boolean).join(" ");
  return { title, description: l.price ? `${title} — ${formatPriceDt(l.price, lang)}` : title };
}


export default async function ListingPublicPage({ params }: PageProps) {
  return <ShowroomDetailView slug={(await params).slug} />;
}
