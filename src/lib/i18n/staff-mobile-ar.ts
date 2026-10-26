import type { staffMobileFr } from "@/lib/i18n/staff-mobile-fr";

/** واجهة الفريق على الهاتف: شريط التبويب، ورشة مبسطة، تنبيه « سيارة جديدة ». */
export const staffMobileAr: typeof staffMobileFr = {
  tabs: {
    nav: "التنقل الرئيسي",
    home: "الرئيسية",
    myCars: "سياراتي",
    board: "الورشة",
    timeClock: "الحضور",
    todo: "للمعالجة",
    queue: "الطابور",
    orders: "الأوامر",
    customers: "الحرفاء",
    invoices: "الفواتير",
    stock: "المخزون",
    receipts: "الاستلامات",
    showroom: "المعرض",
    more: "المزيد",
  },
  fullDashboard: "لوحة القيادة الكاملة",
  moreActions: "إجراءات أخرى",
  assigned: {
    badge: "جديد",
    title: "سيارة جديدة لك",
    body: "{plate} — {vehicle} أُسندت إليك.",
    todo: "سيارات جديدة لك",
  },
  push: {
    enable: "تلقي التنبيهات على هذا الهاتف",
    enabled: "التنبيهات مفعّلة على هذا الهاتف",
    denied: "التنبيهات محظورة في إعدادات الهاتف",
    unsupported: "التنبيهات غير متاحة هنا (على الآيفون: ثبّت التطبيق أولًا على الشاشة الرئيسية)",
  },
};
