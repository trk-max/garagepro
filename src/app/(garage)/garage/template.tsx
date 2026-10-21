import type { ReactNode } from "react";

/** Re-mounted on every staff navigation: the page blur-fades in (350 ms; none under "reduce motion"). */
export default function GarageTemplate({ children }: { children: ReactNode }) {
  return <div className="gp-enter">{children}</div>;
}
