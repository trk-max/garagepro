import { BookingConfirmationView } from "@/components/portal/booking-confirmation-view";

type PageProps = {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ t?: string; new?: string; sent?: string }>;
};

export default async function BookingConfirmationPage({ params, searchParams }: PageProps) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  return <BookingConfirmationView reference={reference} query={query} />;
}
