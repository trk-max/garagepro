import type { Lang } from "@/lib/format";

/**
 * "L'atelier" page copy (FR / AR). Kept apart from the UI dictionaries so the
 * garage can rewrite its own marketing text in one place without touching code.
 * Every promise written here (free wash, cabin sanitization, 7-day follow-up…)
 * is a commitment to customers: keep only what the workshop really does.
 */

export type Spec = { k: string; v: string };
export type AboutStep = { code: string; title: string; text: string; ops: string[]; deliverable: string };
export type AboutModule = { code: string; title: string; text: string; specs: Spec[]; icon: "live" | "spec" | "air" | "shield"; cta?: { label: string; href: string } };
export type AboutRow = { topic: string; standard: string; ours: string; benefit: string };
export type CatalogGroup = { code: string; title: string; items: string[] };

export type AboutContent = {
  metaTitle: string;
  kicker: string;
  heroTitle: string;
  heroAccent: string;
  heroText: string;
  enter: string;
  book: string;
  summaryTitle: string;
  summary: Spec[];
  manifestoLabel: string;
  manifestoTitle: string;
  manifestoText: string[];
  modulesLabel: string;
  modulesTitle: string;
  modulesText: string;
  modules: AboutModule[];
  protocolLabel: string;
  protocolTitle: string;
  protocolHead: { step: string; ops: string; deliverable: string; status: string };
  verified: string;
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
  catalogLabel: string;
  catalogTitle: string;
  catalogText: string;
  catalog: CatalogGroup[];
  catalogCta: string;
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
  kicker: "Atelier mécanique · Protocole de service",
  heroTitle: "La mécanique, traitée comme de l'ingénierie.",
  heroAccent: "Protégée. Documentée. Exacte.",
  heroText:
    "Votre voiture est un investissement. Chaque intervention suit un protocole précis : protection de l'habitacle, preuves photo et vidéo, valeurs constructeur, contrôle final et restitution en état de showroom.",
  enter: "Entrer dans l'atelier",
  book: "Prendre rendez-vous",
  summaryTitle: "Configuration de service",
  summary: [
    { k: "Protocole", v: "5 étapes contrôlées" },
    { k: "Transparence", v: "Photo + vidéo" },
    { k: "Validation devis", v: "À distance" },
    { k: "Suivi", v: "Temps réel" },
    { k: "Finition", v: "Lavage offert" },
    { k: "Après-service", v: "Suivi 7 jours" },
  ],
  manifestoLabel: "Philosophie",
  manifestoTitle: "Ce n'est pas une réparation. C'est une prise en charge.",
  manifestoText: [
    "Un garage ordinaire répare une panne. Nous prenons soin d'un véhicule, du moment où vous nous confiez les clés jusqu'à celui où vous les récupérez.",
    "Chaque étape est protégée, filmée, expliquée et validée par vous. Rien n'est fait dans votre dos. Rien n'est facturé sans votre accord.",
  ],
  modulesLabel: "Modules de service",
  modulesTitle: "Inclus avec chaque intervention.",
  modulesText: "Quatre modules qui s'ajoutent au protocole, sans supplément.",
  modules: [
    {
      code: "Module A",
      icon: "live",
      title: "Suivi de réparation en direct",
      text: "Suivez votre véhicule étape par étape : réception, diagnostic, devis, réparation, contrôle, lavage, prêt. Le lien de suivi arrive par WhatsApp, SMS ou e-mail ; l'accès se fait avec la plaque et un code à 4 chiffres.",
      specs: [
        { k: "Actualisation", v: "Temps réel" },
        { k: "Canaux", v: "WhatsApp · SMS · e-mail" },
        { k: "Accès", v: "Plaque + code" },
      ],
      cta: { label: "Suivre ma réparation", href: "/suivi" },
    },
    {
      code: "Module B",
      icon: "spec",
      title: "Rapport de spécifications",
      text: "Une fiche technique remise avec votre véhicule : couples de serrage appliqués selon le constructeur, normes et quantités des fluides, mesures relevées avant et après l'intervention.",
      specs: [
        { k: "Couples", v: "Valeurs constructeur (N·m)" },
        { k: "Fluides", v: "Norme · quantité" },
        { k: "Mesures", v: "Avant / après" },
      ],
    },
    {
      code: "Module C",
      icon: "air",
      title: "Assainissement de l'habitacle",
      text: "Avant la restitution, traitement offert de l'habitacle par nébulisation ultrasonique ou ozone : bactéries et odeurs neutralisées, puis aération complète. Vous reprenez un intérieur sain, sans aucune trace.",
      specs: [
        { k: "Procédé", v: "Ultrasons / ozone" },
        { k: "Moment", v: "Avant restitution" },
        { k: "Tarif", v: "Offert" },
      ],
    },
    {
      code: "Module D",
      icon: "shield",
      title: "Assurance performance 7 jours",
      text: "Après l'intervention, nous vous contactons pour vérifier que tout fonctionne parfaitement. Au moindre doute, votre véhicule repasse en priorité au contrôle.",
      specs: [
        { k: "Contact", v: "J+1 et J+7" },
        { k: "Canal", v: "Appel ou WhatsApp" },
        { k: "Re-contrôle", v: "Prioritaire" },
      ],
    },
  ],
  protocolLabel: "Protocole de service",
  protocolTitle: "Cinq étapes. Une checklist d'ingénierie.",
  protocolHead: { step: "Étape", ops: "Opérations", deliverable: "Livrable", status: "Contrôle" },
  verified: "Vérifié",
  steps: [
    {
      code: "01 / Prise en charge intensive",
      title: "Protection & propreté absolues",
      text: "Tout est posé devant vous, avant même de démarrer le moteur. L'habitacle ressort exactement comme il est entré.",
      ops: ["Housses siège et volant", "Tapis de protection", "Protections d'ailes"],
      deliverable: "Habitacle protégé",
    },
    {
      code: "02 / État des lieux vidéo",
      title: "Tour du véhicule filmé",
      text: "Avant toute intervention : carrosserie, jantes et kilométrage filmés. Une trace claire, partagée avec vous.",
      ops: ["Tour complet filmé", "Kilométrage relevé", "Envoi sur votre téléphone"],
      deliverable: "Vidéo d'arrivée",
    },
    {
      code: "03 / Scan de diagnostic numérique",
      title: "Zéro surprise sur le prix",
      text: "Vous voyez ce que nous voyons. Aucun travail supplémentaire n'est lancé sans votre accord, donné depuis votre téléphone.",
      ops: ["Lecture des calculateurs", "Photos et vidéos des pièces", "Devis validé à distance"],
      deliverable: "Devis approuvé",
    },
    {
      code: "04 / Intervention aux spécifications",
      title: "Bien fait, du premier coup",
      text: "Couples de serrage, fluides et références conformes aux données du constructeur. Une intervention exacte, qui ne revient pas.",
      ops: ["Couples constructeur", "Pièces d'origine ou équivalentes", "Fluides à la norme"],
      deliverable: "Rapport de spécifications",
    },
    {
      code: "05 / Contrôle final & finition",
      title: "Restitution en état de showroom",
      text: "Essai, contrôle qualité, lavage et aspiration offerts, assainissement de l'habitacle. Puis l'explication claire de ce qui a été fait.",
      ops: ["Essai et contrôle qualité", "Lavage et aspiration", "Restitution commentée"],
      deliverable: "Véhicule prêt",
    },
  ],
  compareLabel: "Fiche comparative",
  compareTitle: "Standard contre protocole.",
  compareHead: { topic: "Critère", standard: "Garage standard", ours: "Notre protocole", benefit: "Ce que vous y gagnez" },
  rows: [
    { topic: "Habitacle", standard: "Sièges et volant non protégés, traces de graisse.", ours: "Housses et tapis posés devant vous avant de démarrer.", benefit: "Un intérieur intact, sans exception." },
    { topic: "État des lieux", standard: "Aucun constat à l'arrivée.", ours: "Vidéo du tour complet du véhicule.", benefit: "Tout est documenté, aucun litige possible." },
    { topic: "Diagnostic", standard: "« Il faut changer ça », sans preuve.", ours: "Photos et vidéos des pièces envoyées sur votre téléphone.", benefit: "Vous décidez en connaissance de cause." },
    { topic: "Prix", standard: "Une facture plus élevée que prévu.", ours: "Aucun travail sans votre accord.", benefit: "Le prix validé est le prix payé." },
    { topic: "Exécution", standard: "Approximations et retours à l'atelier.", ours: "Valeurs constructeur et rapport de spécifications.", benefit: "Moins d'immobilisation, plus de sérénité." },
    { topic: "Suivi", standard: "Il faut appeler pour savoir où en est la voiture.", ours: "Suivi en ligne en temps réel, avec plaque et code.", benefit: "Vous savez tout, sans décrocher le téléphone." },
    { topic: "Restitution", standard: "Voiture rendue telle quelle, parfois plus sale.", ours: "Lavage, aspiration et assainissement offerts.", benefit: "Le plaisir de reprendre une voiture impeccable." },
    { topic: "Après-service", standard: "Plus de nouvelles après le paiement.", ours: "Appel de suivi à J+1 et J+7.", benefit: "Un problème est traité avant de devenir une panne." },
  ],
  servicesLabel: "Prestations",
  servicesTitle: "Réservez en ligne.",
  servicesText: "Durées et tarifs indicatifs. Le prix final est toujours validé par vous avant les travaux.",
  configure: "Configurer",
  minutes: "min",
  catalogLabel: "Catalogue technique",
  catalogTitle: "Toutes nos compétences.",
  catalogText: "Une intervention qui n'est pas dans la liste ? Prenez rendez-vous et décrivez le besoin : nous établissons un devis.",
  catalog: [
    { code: "SYS 01", title: "Moteur", items: ["Vidange et filtres", "Distribution et pompe à eau", "Injection et allumage", "Refroidissement", "Turbo et admission"] },
    { code: "SYS 02", title: "Transmission", items: ["Embrayage et volant moteur", "Vidange boîte automatique", "Cardans et soufflets", "Ponts et différentiels"] },
    { code: "SYS 03", title: "Châssis", items: ["Freinage (disques, plaquettes, liquide)", "Suspension et amortisseurs", "Géométrie et parallélisme", "Pneumatiques et équilibrage", "Direction"] },
    { code: "SYS 04", title: "Électronique", items: ["Diagnostic des calculateurs", "Batterie, alternateur, démarreur", "Éclairage et faisceaux", "Capteurs et voyants"] },
    { code: "SYS 05", title: "Confort", items: ["Climatisation (recharge, étanchéité)", "Filtre d'habitacle", "Assainissement de l'habitacle", "Lève-vitres et verrouillage"] },
    { code: "SYS 06", title: "Préparation", items: ["Pré-contrôle technique", "Révision avant voyage", "Inspection avant achat", "Entretien selon carnet constructeur"] },
  ],
  catalogCta: "Demander un devis",
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
  kicker: "ورشة ميكانيك · بروتوكول الخدمة",
  heroTitle: "الميكانيك، بمنطق الهندسة.",
  heroAccent: "محميّة. موثّقة. دقيقة.",
  heroText:
    "سيارتك استثمار. كل تدخّل يتبع بروتوكولًا دقيقًا: حماية المقصورة، إثبات بالصور والفيديو، قيم الصانع، مراقبة نهائية، وتسليم بحالة صالة العرض.",
  enter: "ادخل الورشة",
  book: "احجز موعدًا",
  summaryTitle: "إعداد الخدمة",
  summary: [
    { k: "البروتوكول", v: "5 مراحل مراقَبة" },
    { k: "الشفافية", v: "صور + فيديو" },
    { k: "الموافقة على التقدير", v: "عن بعد" },
    { k: "المتابعة", v: "مباشرة" },
    { k: "اللمسة الأخيرة", v: "غسيل مجاني" },
    { k: "ما بعد الخدمة", v: "متابعة 7 أيام" },
  ],
  manifestoLabel: "فلسفتنا",
  manifestoTitle: "ليست مجرد إصلاح، بل رعاية كاملة.",
  manifestoText: [
    "الورشة العادية تصلح العطل. أما نحن فنعتني بالسيارة من لحظة تسليمنا المفاتيح إلى لحظة استلامك لها.",
    "كل مرحلة محميّة ومصوّرة ومشروحة وتوافق عليها أنت. لا شيء يتمّ دون علمك، ولا شيء يُفوتَر دون موافقتك.",
  ],
  modulesLabel: "وحدات الخدمة",
  modulesTitle: "مشمولة في كل تدخّل.",
  modulesText: "أربع وحدات تُضاف إلى البروتوكول دون أي تكلفة إضافية.",
  modules: [
    {
      code: "الوحدة A",
      icon: "live",
      title: "متابعة الإصلاح مباشرة",
      text: "تابع سيارتك مرحلة بمرحلة: الاستلام، التشخيص، التقدير، الإصلاح، المراقبة، الغسيل، الجاهزية. يصلك رابط المتابعة عبر واتساب أو إرسالية أو بريد، والدخول برقم السيارة ورمز من 4 أرقام.",
      specs: [
        { k: "التحديث", v: "مباشر" },
        { k: "القنوات", v: "واتساب · إرسالية · بريد" },
        { k: "الدخول", v: "الرقم + الرمز" },
      ],
      cta: { label: "تابع إصلاح سيارتي", href: "/suivi" },
    },
    {
      code: "الوحدة B",
      icon: "spec",
      title: "تقرير المواصفات الدقيقة",
      text: "بطاقة تقنية تُسلَّم مع سيارتك: عزم الشدّ المطبَّق حسب الصانع، معايير وكميات السوائل، والقياسات قبل التدخّل وبعده.",
      specs: [
        { k: "عزم الشدّ", v: "قيم الصانع (N·m)" },
        { k: "السوائل", v: "المعيار · الكمية" },
        { k: "القياسات", v: "قبل / بعد" },
      ],
    },
    {
      code: "الوحدة C",
      icon: "air",
      title: "تعقيم المقصورة",
      text: "قبل التسليم، معالجة مجانية للمقصورة بالرذاذ فوق الصوتي أو بالأوزون: القضاء على البكتيريا والروائح ثم تهوية كاملة. تستلم مقصورة نظيفة دون أي أثر.",
      specs: [
        { k: "الطريقة", v: "فوق صوتي / أوزون" },
        { k: "التوقيت", v: "قبل التسليم" },
        { k: "السعر", v: "مجانًا" },
      ],
    },
    {
      code: "الوحدة D",
      icon: "shield",
      title: "ضمان الأداء 7 أيام",
      text: "بعد التدخّل نتصل بك للتأكّد من أن كل شيء يعمل على أكمل وجه. عند أدنى شك، تمرّ سيارتك بالأولوية إلى المراقبة.",
      specs: [
        { k: "الاتصال", v: "اليوم 1 واليوم 7" },
        { k: "القناة", v: "مكالمة أو واتساب" },
        { k: "إعادة المراقبة", v: "بالأولوية" },
      ],
    },
  ],
  protocolLabel: "بروتوكول الخدمة",
  protocolTitle: "خمس مراحل. قائمة تحقّق هندسية.",
  protocolHead: { step: "المرحلة", ops: "العمليات", deliverable: "المُخرَج", status: "المراقبة" },
  verified: "تمّ التحقّق",
  steps: [
    {
      code: "01 / استلام دقيق",
      title: "حماية ونظافة تامّتان",
      text: "كل شيء يوضع أمامك قبل تشغيل المحرّك. تخرج المقصورة تمامًا كما دخلت.",
      ops: ["أغطية المقاعد والمقود", "حماية الأرضية", "حماية الهيكل"],
      deliverable: "مقصورة محميّة",
    },
    {
      code: "02 / معاينة بالفيديو",
      title: "جولة مصوّرة حول السيارة",
      text: "قبل أي تدخّل: تصوير الهيكل والجنوط والعدّاد. أثر واضح نشاركه معك.",
      ops: ["تصوير جولة كاملة", "تسجيل العدّاد", "إرسال إلى هاتفك"],
      deliverable: "فيديو الاستلام",
    },
    {
      code: "03 / فحص تشخيصي رقمي",
      title: "لا مفاجآت في السعر",
      text: "ترى ما نراه. لا نبدأ أي عمل إضافي دون موافقتك من هاتفك.",
      ops: ["قراءة الحواسيب", "صور وفيديو للقطع", "موافقة على التقدير عن بعد"],
      deliverable: "تقدير موافَق عليه",
    },
    {
      code: "04 / تدخّل حسب المواصفات",
      title: "عمل متقن من المرة الأولى",
      text: "عزم الشدّ والسوائل والقطع مطابقة لبيانات الصانع. تدخّل دقيق لا يعود إلى الورشة.",
      ops: ["عزم الصانع", "قطع أصلية أو مكافئة", "سوائل حسب المعيار"],
      deliverable: "تقرير المواصفات",
    },
    {
      code: "05 / مراقبة نهائية ولمسة أخيرة",
      title: "تسليم بحالة صالة العرض",
      text: "تجربة ومراقبة جودة، غسيل وتنظيف مجاني، تعقيم المقصورة، ثم شرح واضح لما تمّ.",
      ops: ["تجربة ومراقبة الجودة", "غسيل وتنظيف داخلي", "تسليم مع الشرح"],
      deliverable: "سيارة جاهزة",
    },
  ],
  compareLabel: "جدول مقارنة",
  compareTitle: "العادي مقابل البروتوكول.",
  compareHead: { topic: "المعيار", standard: "ورشة عادية", ours: "بروتوكولنا", benefit: "ما تكسبه أنت" },
  rows: [
    { topic: "المقصورة", standard: "مقاعد ومقود دون حماية، وآثار شحم.", ours: "أغطية وحماية توضع أمامك قبل التشغيل.", benefit: "مقصورة سليمة دون استثناء." },
    { topic: "المعاينة", standard: "لا معاينة عند الوصول.", ours: "فيديو لجولة كاملة حول السيارة.", benefit: "كل شيء موثّق، فلا خلاف ممكن." },
    { topic: "التشخيص", standard: "« يجب تغيير هذه » دون دليل.", ours: "صور وفيديو للقطع تُرسل إلى هاتفك.", benefit: "تقرّر وأنت على علم." },
    { topic: "السعر", standard: "فاتورة أعلى من المتوقّع.", ours: "لا عمل دون موافقتك.", benefit: "السعر الذي توافق عليه هو ما تدفعه." },
    { topic: "التنفيذ", standard: "تقريب وعودة إلى الورشة.", ours: "قيم الصانع وتقرير المواصفات.", benefit: "توقّف أقلّ وراحة بال أكبر." },
    { topic: "المتابعة", standard: "عليك الاتصال لتعرف حال السيارة.", ours: "متابعة مباشرة عبر الإنترنت بالرقم والرمز.", benefit: "تعرف كل شيء دون اتصال." },
    { topic: "التسليم", standard: "تُسلَّم كما هي، وأحيانًا أوسخ.", ours: "غسيل وتنظيف وتعقيم مجانًا.", benefit: "متعة استلام سيارة نظيفة تمامًا." },
    { topic: "ما بعد الخدمة", standard: "لا أخبار بعد الدفع.", ours: "اتصال متابعة في اليوم 1 واليوم 7.", benefit: "تُعالَج المشكلة قبل أن تصبح عطلًا." },
  ],
  servicesLabel: "الخدمات",
  servicesTitle: "احجز عبر الإنترنت.",
  servicesText: "المدد والأسعار تقريبية. السعر النهائي توافق عليه دائمًا قبل بدء الأشغال.",
  configure: "اختيار",
  minutes: "دق",
  catalogLabel: "الدليل التقني",
  catalogTitle: "كل اختصاصاتنا.",
  catalogText: "تدخّل غير موجود في القائمة؟ احجز موعدًا وصِف حاجتك، ونعدّ لك تقديرًا.",
  catalog: [
    { code: "SYS 01", title: "المحرّك", items: ["تغيير الزيت والمصافي", "سير التوقيت ومضخة الماء", "الحقن والإشعال", "التبريد", "التوربو والسحب"] },
    { code: "SYS 02", title: "ناقل الحركة", items: ["القابض والحدّافة", "تغيير زيت العلبة الأوتوماتيكية", "أعمدة الدوران والأغطية", "الجسور والفرق"] },
    { code: "SYS 03", title: "الهيكل السفلي", items: ["الفرامل (أقراص، وسادات، سائل)", "التعليق والممتصّات", "ضبط الزوايا والتوازي", "الإطارات والموازنة", "التوجيه"] },
    { code: "SYS 04", title: "الإلكترونيك", items: ["تشخيص الحواسيب", "البطارية والمولّد والمُشغّل", "الإنارة والأسلاك", "الحسّاسات والأضواء التحذيرية"] },
    { code: "SYS 05", title: "الراحة", items: ["المكيّف (شحن، إحكام)", "مصفاة المقصورة", "تعقيم المقصورة", "النوافذ والأقفال"] },
    { code: "SYS 06", title: "التحضير", items: ["فحص ما قبل الفحص الفني", "مراجعة قبل السفر", "فحص قبل الشراء", "صيانة حسب دفتر الصانع"] },
  ],
  catalogCta: "اطلب تقديرًا",
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
