import { BookingPageView } from "@/components/portal/booking-page-view";

type PageProps = { searchParams: Promise<{ service?: string; notes?: string }> };

export default async function BookingPage({ searchParams }: PageProps) {
  return <BookingPageView params={await searchParams} />;
}
