import { BookingPageView } from "@/components/portal/booking-page-view";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ service?: string; notes?: string }> };

/** App « Prendre rendez-vous »: the website's booking wizard; the confirmation opens in /app/rdv/confirmation. */
export default async function AppBookingPage({ searchParams }: PageProps) {
  return <BookingPageView params={await searchParams} />;
}
