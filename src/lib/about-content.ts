import type { Lang } from "@/lib/format";

/**
 * "L'atelier" page copy (FR / AR). Kept apart from the UI dictionaries so the
 * garage can rewrite its own marketing text in one place without touching code.
 * Promises written here (free wash, video walkaround…) are commitments to customers:
 * keep only what the workshop really does.
 */

export type AboutStep = { code: string; title: string; text: string; specs: string[] };
export type AboutRow = { topic: string; standard: string; ours: string; benefit: string };

export type AboutContent = {
  metaTitle: string;
  kicker: string;
  heroTitle: [string, string];
  heroText: string;
  enter: string;
  book: string;
  stats: { value: string; label: string }[];
  manifestoLabel: string;
  manifestoTitle: string;
  manifestoText: string[];
  protocolLabel: string;
  protocolTitle: string;
  steps: AboutStep[];
  compareLabel: string;
  compareTitle: string;
  compareHead: { topic: string; standard: string; ours: string; benefit: string };
  rows: AboutRow[];
  servicesLabel: string;
  servicesTitle: string;
  servicesText: string;
  configure: string;
  minutes: string;
  configLabel: string;
  configTitle: string;
  configSteps: { code: string; title: string; text: string }[];
  configCta: string;
  orCall: string;
  whatsapp: string;
  navLink: string;
  homeBandTitle: string;
  homeBandText: string;
};

const fr: AboutContent = {
  metaTitle: "L'atelier",
  kicker: "Atelier mécanique · Standard showroom",
  heroTitle: ["Votre voiture.", "Notre obsession."],
  heroText:
    "Votre voiture est un investissement. Nous la traitons comme telle : protégée, documentée, réparée selon les spécifications du constructeur, et rendue dans un état de showroom.",
  enter: "Entrer dans l'atelier",
  book: "Réserver",
  stats: [
    { value: "05", label: "Étapes de protocole" },
    { value: "0", label: "Surprise sur la facture" },
    { value: "100 %", label: "Transparence photo & vidéo" },
    { value: "Offert", label: "Lavage & aspiration" },
  ],
  manifestoLabel: "Philosophie",
  manifestoTitle: "Ce n'est pas une réparation. C'est une prise en charge.",
  manifestoText: [
    "Un garage ordinaire répare une panne. Nous prenons soin d'un véhicule, du moment où vous nous confiez les clés jusqu'à celui où vous les récupérez.",
    "Chaque étape est protégée, filmée, expliquée et validée par vous. Rien n'est fait dans votre dos. Rien n'est facturé sans votre accord.",
  ],
  protocolLabel: "Protocole de service",
  protocolTitle: "Cinq étapes. Aucun compromis.",
  steps: [
    {
      code: "01 / Prise en charge protégée",
      title: "Protection & propreté absolues",
      text: "Housses de siège et de volant, tapis de sol : tout est posé devant vous, avant même de démarrer le moteur. Votre habitacle ressort exactement comme il est entré.",
      specs: ["Housses siège & volant", "Tapis de protection", "Protections d'ailes"],
    },
    {
      code: "02 / État des lieux vidéo",
      title: "Tour du véhicule filmé",
      text: "Avant toute intervention, nous filmons le tour complet du véhicule : carrosserie, jantes, kilométrage. Une trace claire, partagée avec vous.",
      specs: ["Vidéo à l'arrivée", "Kilométrage relevé", "Partagée sur votre téléphone"],
    },
    {
      code: "03 / Diagnostic numérique",
      title: "Zéro surprise sur le prix",
      text: "Diagnostic électronique, photos et vidéos des pièces usées : vous voyez ce que nous voyons. Aucun travail supplémentaire n'est lancé sans votre accord, donné depuis votre téléphone.",
      specs: ["Photos & vidéos des pièces", "Devis validé à distance", "Aucun supplément caché"],
    },
    {
      code: "04 / Ingénierie de précision",
      title: "Bien fait, du premier coup",
      text: "Couples de serrage, fluides et références conformes aux données du constructeur. Une intervention exacte, contrôlée, qui ne revient pas à l'atelier.",
      specs: ["Données constructeur", "Pièces d'origine ou équivalentes", "Contrôle qualité final"],
    },
    {
      code: "05 / Finition showroom",
      title: "Rendue comme neuve",
      text: "Lavage extérieur et aspiration intérieure offerts à chaque passage. Vous récupérez une voiture prête à être exposée, et l'explication claire de ce qui a été fait.",
      specs: ["Lavage offert", "Aspiration offerte", "Restitution commentée"],
    },
  ],
  compareLabel: "Fiche comparative",
  compareTitle: "Standard contre préparé.",
  compareHead: { topic: "Critère", standard: "Ce que font les autres", ours: "Notre standard", benefit: "Ce que vous y gagnez" },
  rows: [
    {
      topic: "Habitacle",
      standard: "Sièges et volant non protégés, traces de graisse.",
      ours: "Housses et tapis posés devant vous avant de démarrer.",
      benefit: "Un intérieur intact, sans exception.",
    },
    {
      topic: "État des lieux",
      standard: "Aucun constat à l'arrivée.",
      ours: "Vidéo du tour complet du véhicule.",
      benefit: "Tout est documenté, aucun litige possible.",
    },
    {
      topic: "Diagnostic",
      standard: "« Il faut changer ça », sans preuve.",
      ours: "Photos et vidéos des pièces envoyées sur votre téléphone.",
      benefit: "Vous décidez en connaissance de cause.",
    },
    {
      topic: "Prix",
      standard: "Une facture plus élevée que prévu.",
      ours: "Aucun travail sans votre accord.",
      benefit: "Le prix validé est le prix payé.",
    },
    {
      topic: "Exécution",
      standard: "Approximations et retours à l'atelier.",
      ours: "Spécifications constructeur et contrôle qualité.",
      benefit: "Moins d'immobilisation, plus de sérénité.",
    },
    {
      topic: "Suivi",
      standard: "Il faut appeler pour savoir où en est la voiture.",
      ours: "Suivi en ligne en temps réel, avec plaque et code.",
      benefit: "Vous savez tout, sans décrocher le téléphone.",
    },
    {
      topic: "Restitution",
      standard: "Voiture rendue telle quelle, parfois plus sale.",
      ours: "Lavage et aspiration offerts.",
      benefit: "Le plaisir de reprendre une voiture impeccable.",
    },
  ],
  servicesLabel: "Prestations",
  servicesTitle: "Choisissez votre intervention.",
  servicesText: "Durées et tarifs indicatifs. Le prix final est toujours validé par vous avant les travaux.",
  configure: "Configurer",
  minutes: "min",
  configLabel: "Configurateur",
  configTitle: "Configurez votre rendez-vous.",
  configSteps: [
    { code: "01", title: "Prestation", text: "Choisissez l'intervention." },
    { code: "02", title: "Créneau", text: "Choisissez le jour et l'heure." },
    { code: "03", title: "Confirmation", text: "Recevez votre référence." },
  ],
  configCta: "Configurer mon rendez-vous",
  orCall: "Ou appelez-nous",
  whatsapp: "WhatsApp",
  navLink: "L'atelier",
  homeBandTitle: "Le protocole de l'atelier",
  homeBandText: "Cinq étapes, photos et vidéos à l'appui, zéro surprise sur la facture.",
};

const ar: AboutContent = {
  metaTitle: "الورشة",
  kicker: "ورشة ميكانيك · معيار صالة العرض",
  heroTitle: ["سيارتك.", "شغفنا."],
  heroText:
    "سيارتك استثمار، ونعاملها على هذا الأساس: محميّة، موثّقة، تُصلَح وفق مواصفات الصانع، وتُسلَّم إليك بحالة صالة العرض.",
  enter: "ادخل الورشة",
  book: "احجز موعدًا",
  stats: [
    { value: "05", label: "مراحل البروتوكول" },
    { value: "0", label: "مفاجأة في الفاتورة" },
    { value: "100 %", label: "شفافية بالصور والفيديو" },
    { value: "مجانًا", label: "غسيل وتنظيف داخلي" },
  ],
  manifestoLabel: "فلسفتنا",
  manifestoTitle: "ليست مجرد إصلاح، بل رعاية كاملة.",
  manifestoText: [
    "الورشة العادية تصلح العطل. أما نحن فنعتني بالسيارة من لحظة تسليمنا المفاتيح إلى لحظة استلامك لها.",
    "كل مرحلة محميّة ومصوّرة ومشروحة وتوافق عليها أنت. لا شيء يتمّ دون علمك، ولا شيء يُفوتَر دون موافقتك.",
  ],
  protocolLabel: "بروتوكول الخدمة",
  protocolTitle: "خمس مراحل. بلا تنازلات.",
  steps: [
    {
      code: "01 / استلام محمي",
      title: "حماية ونظافة تامّتان",
      text: "أغطية المقاعد والمقود وحماية الأرضية توضع أمامك قبل تشغيل المحرّك. تخرج مقصورتك تمامًا كما دخلت.",
      specs: ["أغطية المقاعد والمقود", "حماية الأرضية", "حماية الهيكل"],
    },
    {
      code: "02 / معاينة بالفيديو",
      title: "جولة مصوّرة حول السيارة",
      text: "قبل أي تدخّل نصوّر جولة كاملة حول السيارة: الهيكل، الجنوط، العدّاد. أثر واضح نشاركه معك.",
      specs: ["فيديو عند الوصول", "تسجيل العدّاد", "يُرسل إلى هاتفك"],
    },
    {
      code: "03 / تشخيص رقمي",
      title: "لا مفاجآت في السعر",
      text: "تشخيص إلكتروني، وصور وفيديوهات للقطع المهترئة: ترى ما نراه. لا نبدأ أي عمل إضافي دون موافقتك من هاتفك.",
      specs: ["صور وفيديو للقطع", "موافقة على التقدير عن بعد", "لا تكاليف خفيّة"],
    },
    {
      code: "04 / هندسة دقيقة",
      title: "عمل متقن من المرة الأولى",
      text: "عزم الشدّ والسوائل والقطع مطابقة لبيانات الصانع. تدخّل دقيق ومراقَب لا يعود إلى الورشة.",
      specs: ["بيانات الصانع", "قطع أصلية أو مكافئة", "مراقبة جودة نهائية"],
    },
    {
      code: "05 / لمسة صالة العرض",
      title: "تُسلَّم كأنها جديدة",
      text: "غسيل خارجي وتنظيف داخلي بالمكنسة مجانًا في كل زيارة. تستلم سيارة جاهزة للعرض مع شرح واضح لما تمّ.",
      specs: ["غسيل مجاني", "تنظيف داخلي مجاني", "تسليم مع الشرح"],
    },
  ],
  compareLabel: "جدول مقارنة",
  compareTitle: "العادي مقابل المُتقَن.",
  compareHead: { topic: "المعيار", standard: "ما يفعله الآخرون", ours: "معيارنا", benefit: "ما تكسبه أنت" },
  rows: [
    { topic: "المقصورة", standard: "مقاعد ومقود دون حماية، وآثار شحم.", ours: "أغطية وحماية توضع أمامك قبل التشغيل.", benefit: "مقصورة سليمة دون استثناء." },
    { topic: "المعاينة", standard: "لا معاينة عند الوصول.", ours: "فيديو لجولة كاملة حول السيارة.", benefit: "كل شيء موثّق، فلا خلاف ممكن." },
    { topic: "التشخيص", standard: "« يجب تغيير هذه » دون دليل.", ours: "صور وفيديو للقطع تُرسل إلى هاتفك.", benefit: "تقرّر وأنت على علم." },
    { topic: "السعر", standard: "فاتورة أعلى من المتوقّع.", ours: "لا عمل دون موافقتك.", benefit: "السعر الذي توافق عليه هو ما تدفعه." },
    { topic: "التنفيذ", standard: "تقريب وعودة إلى الورشة.", ours: "مواصفات الصانع ومراقبة الجودة.", benefit: "توقّف أقلّ وراحة بال أكبر." },
    { topic: "المتابعة", standard: "عليك الاتصال لتعرف حال السيارة.", ours: "متابعة مباشرة عبر الإنترنت بالرقم والرمز.", benefit: "تعرف كل شيء دون اتصال." },
    { topic: "التسليم", standard: "تُسلَّم كما هي، وأحيانًا أوسخ.", ours: "غسيل وتنظيف داخلي مجانًا.", benefit: "متعة استلام سيارة نظيفة تمامًا." },
  ],
  servicesLabel: "الخدمات",
  servicesTitle: "اختر التدخّل المناسب.",
  servicesText: "المدد والأسعار تقريبية. السعر النهائي توافق عليه دائمًا قبل بدء الأشغال.",
  configure: "اختيار",
  minutes: "دق",
  configLabel: "الإعداد",
  configTitle: "جهّز موعدك.",
  configSteps: [
    { code: "01", title: "الخدمة", text: "اختر نوع التدخّل." },
    { code: "02", title: "الموعد", text: "اختر اليوم والساعة." },
    { code: "03", title: "التأكيد", text: "استلم رقم الحجز." },
  ],
  configCta: "جهّز موعدي",
  orCall: "أو اتصل بنا",
  whatsapp: "واتساب",
  navLink: "الورشة",
  homeBandTitle: "بروتوكول الورشة",
  homeBandText: "خمس مراحل، بالصور والفيديو، دون أي مفاجأة في الفاتورة.",
};

export function aboutContent(lang: Lang): AboutContent {
  return lang === "ar" ? ar : fr;
}
