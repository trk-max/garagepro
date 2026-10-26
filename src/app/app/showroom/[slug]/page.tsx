import { ShowroomDetailView } from "@/components/showroom/showroom-detail-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export default async function AppListingPage({ params }: PageProps) {
  return <ShowroomDetailView slug={(await params).slug} base="/app" />;
}
