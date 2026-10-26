import { BookingConfirmationView } from "@/components/portal/booking-confirmation-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string; new?: string; sent?: string }> };

export default async function AppBookingConfirmationPage({ params, searchParams }: PageProps) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  return <BookingConfirmationView reference={reference} query={query} base="/app" />;
}
