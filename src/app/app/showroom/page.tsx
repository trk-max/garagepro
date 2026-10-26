import { ShowroomListView } from "@/components/showroom/showroom-list-view";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** App showroom: the website's list (search, filters, favourites), vehicle pages under /app/showroom/…. */
export default async function AppShowroomPage({ searchParams }: PageProps) {
  return <ShowroomListView params={await searchParams} base="/app" />;
}
