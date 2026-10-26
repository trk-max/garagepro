import type { staffMobileFr } from "@/lib/i18n/staff-mobile-fr";

/** Staff interface on phones: tab bar, simple workshop, « new vehicle » alert. */
export const staffMobileEn: typeof staffMobileFr = {
  tabs: {
    nav: "Main navigation",
    home: "Home",
    myCars: "My vehicles",
    board: "Workshop",
    timeClock: "Time clock",
    todo: "To do",
    queue: "Queue",
    orders: "Orders",
    customers: "Customers",
    invoices: "Invoices",
    stock: "Stock",
    receipts: "Receipts",
    showroom: "Showroom",
    more: "More",
  },
  fullDashboard: "Full dashboard",
  moreActions: "More actions",
  assigned: {
    badge: "New",
    title: "New vehicle for you",
    body: "{plate} — {vehicle} has been assigned to you.",
    todo: "New vehicles for you",
  },
  push: {
    enable: "Get alerts on this phone",
    enabled: "Alerts enabled on this phone",
    denied: "Alerts blocked in the phone's settings",
    unsupported: "Alerts not available here (on iPhone: install the app on the home screen first)",
  },
};
