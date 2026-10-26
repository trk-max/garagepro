import type { Metadata } from "next";
import { ShowroomListView } from "@/components/showroom/showroom-list-view";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.showroom.public.title, description: t.showroom.public.subtitle };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ShowroomPage({ searchParams }: PageProps) {
  return <ShowroomListView params={await searchParams} />;
}
