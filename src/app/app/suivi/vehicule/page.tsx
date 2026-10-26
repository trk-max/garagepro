import { TrackerView } from "@/components/portal/tracker-view";

export const dynamic = "force-dynamic";

/** App tracking screen: the website's tracker (progress, quote line by line, supplements, photos, messages). */
export default function AppTrackerPage() {
  return <TrackerView base="/app" />;
}
