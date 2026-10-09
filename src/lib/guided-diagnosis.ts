/**
 * Guided car diagnosis (no AI, no internet, no quota).
 *
 * The customer answers 1-3 multiple-choice questions and gets the likely causes,
 * what they can safely check, the urgency, and which garage service to book.
 * Any "other / not this" choice hands over to the AI chat with the path as context.
 *
 * To add a case: add a Result, then point an option to it with `result: "<id>"`.
 * `tests/guided-diagnosis.test.ts` checks that every link points somewhere.
 */

export type L = { fr: string; ar: string };
export type Urgency = "low" | "medium" | "high" | "danger";
/** Which of the garage's bookable services fits (matched by keywords in the service name). */
export type ServiceHint = "diagnostic" | "brakes" | "oil" | "service" | "aircon" | "repair" | "none";

export type GuideOption = { label: L; next?: string; result?: string; ai?: true };
export type GuideQuestion = { id: string; text: L; options: GuideOption[] };
export type GuideResult = { id: string; title: L; causes: L[]; checks: L[]; urgency: Urgency; service: ServiceHint };

const AI: GuideOption = { label: { fr: "Autre / je ne sais pas", ar: "شيء آخر / لا أعرف" }, ai: true };

export const ROOT = "root";

export const QUESTIONS: Record<string, GuideQuestion> = {
  root: {
    id: "root",
    text: { fr: "Quel est le problème ?", ar: "ما هي المشكلة؟" },
    options: [
      { label: { fr: "Un voyant est allumé", ar: "ضوء تحذير مشتعل" }, next: "light" },
      { label: { fr: "Un bruit anormal", ar: "صوت غير عادي" }, next: "noise" },
      { label: { fr: "Freins", ar: "الفرامل" }, next: "brakes" },
      { label: { fr: "Démarrage / moteur", ar: "التشغيل / المحرك" }, next: "engine" },
      { label: { fr: "La voiture chauffe", ar: "السيارة تسخن" }, result: "overheat" },
      { label: { fr: "Climatisation", ar: "المكيّف" }, next: "aircon" },
      { label: { fr: "Pneus / direction", ar: "العجلات / المقود" }, next: "tires" },
      { label: { fr: "Fuite sous la voiture", ar: "تسرّب تحت السيارة" }, next: "leak" },
      { label: { fr: "Entretien / vidange", ar: "صيانة / تغيير الزيت" }, next: "maintenance" },
      { label: { fr: "Autre problème", ar: "مشكلة أخرى" }, ai: true },
    ],
  },
  light: {
    id: "light",
    text: { fr: "Quel voyant ?", ar: "أيّ ضوء؟" },
    options: [
      { label: { fr: "Moteur orange, fixe", ar: "المحرك برتقالي، ثابت" }, result: "engineLight" },
      { label: { fr: "Moteur orange qui clignote", ar: "المحرك برتقالي يومض" }, result: "engineFlash" },
      { label: { fr: "Huile (rouge)", ar: "الزيت (أحمر)" }, result: "oilRed" },
      { label: { fr: "Température (rouge)", ar: "الحرارة (أحمر)" }, result: "overheat" },
      { label: { fr: "Batterie", ar: "البطارية" }, result: "batteryLight" },
      { label: { fr: "Frein / ABS", ar: "الفرامل / ABS" }, result: "brakeLight" },
      AI,
    ],
  },
  noise: {
    id: "noise",
    text: { fr: "Quand entendez-vous le bruit ?", ar: "متى تسمع الصوت؟" },
    options: [
      { label: { fr: "En freinant : grincement aigu", ar: "عند الفرملة: صرير حاد" }, result: "brakeSqueal" },
      { label: { fr: "En freinant : frottement métallique", ar: "عند الفرملة: احتكاك معدني" }, result: "brakeGrind" },
      { label: { fr: "En tournant le volant", ar: "عند تدوير المقود" }, result: "steeringNoise" },
      { label: { fr: "Sur les bosses / trous", ar: "في المطبّات والحفر" }, result: "suspension" },
      { label: { fr: "Le moteur claque / cogne", ar: "المحرك يطقطق / يدقّ" }, result: "engineKnock" },
      { label: { fr: "Sifflement sous le capot", ar: "صفير تحت الغطاء" }, result: "belt" },
      AI,
    ],
  },
  brakes: {
    id: "brakes",
    text: { fr: "Que remarquez-vous au freinage ?", ar: "ماذا تلاحظ عند الفرملة؟" },
    options: [
      { label: { fr: "La pédale est molle / s'enfonce", ar: "الدواسة رخوة / تنزل كثيرًا" }, result: "brakePedal" },
      { label: { fr: "Le volant ou la pédale vibre", ar: "المقود أو الدواسة يهتزّ" }, result: "brakeVibration" },
      { label: { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة" }, result: "brakePull" },
      { label: { fr: "Bruit en freinant", ar: "صوت عند الفرملة" }, next: "noise" },
      AI,
    ],
  },
  engine: {
    id: "engine",
    text: { fr: "Que se passe-t-il ?", ar: "ماذا يحدث؟" },
    options: [
      { label: { fr: "Ne démarre pas : clic ou rien", ar: "لا تشتغل: نقرة أو لا شيء" }, result: "noStartBattery" },
      { label: { fr: "Le démarreur tourne mais le moteur ne part pas", ar: "المارش يدور لكن المحرك لا يشتغل" }, result: "noStartFuel" },
      { label: { fr: "Perte de puissance / à-coups", ar: "ضعف في القوة / تقطّع" }, result: "powerLoss" },
      { label: { fr: "Ralenti instable / cale", ar: "الدوران غير مستقر / يطفى" }, result: "idle" },
      { label: { fr: "De la fumée sort de l'échappement", ar: "دخان من العادم" }, next: "smoke" },
      AI,
    ],
  },
  smoke: {
    id: "smoke",
    text: { fr: "De quelle couleur est la fumée ?", ar: "ما لون الدخان؟" },
    options: [
      { label: { fr: "Blanche et épaisse (même moteur chaud)", ar: "أبيض وكثيف (حتى والمحرك ساخن)" }, result: "smokeWhite" },
      { label: { fr: "Bleue / grise", ar: "أزرق / رمادي" }, result: "smokeBlue" },
      { label: { fr: "Noire", ar: "أسود" }, result: "smokeBlack" },
      AI,
    ],
  },
  aircon: {
    id: "aircon",
    text: { fr: "Quel souci avec la climatisation ?", ar: "ما مشكلة المكيّف؟" },
    options: [
      { label: { fr: "Elle ne refroidit plus", ar: "لم يعد يبرّد" }, result: "acCold" },
      { label: { fr: "Mauvaise odeur", ar: "رائحة كريهة" }, result: "acSmell" },
      { label: { fr: "Bruit quand elle marche", ar: "صوت عند تشغيله" }, result: "acNoise" },
      AI,
    ],
  },
  tires: {
    id: "tires",
    text: { fr: "Que remarquez-vous ?", ar: "ماذا تلاحظ؟" },
    options: [
      { label: { fr: "Le volant vibre à vitesse élevée", ar: "المقود يهتزّ في السرعة" }, result: "wheelBalance" },
      { label: { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة" }, result: "alignment" },
      { label: { fr: "Pneu crevé / qui se dégonfle", ar: "عجلة مثقوبة / تفرغ من الهواء" }, result: "flat" },
      { label: { fr: "La direction est devenue dure", ar: "المقود أصبح ثقيلًا" }, result: "steeringHard" },
      AI,
    ],
  },
  leak: {
    id: "leak",
    text: { fr: "De quelle couleur est le liquide ?", ar: "ما لون السائل؟" },
    options: [
      { label: { fr: "Clair comme de l'eau (sous la clim)", ar: "شفاف كالماء (تحت المكيّف)" }, result: "leakWater" },
      { label: { fr: "Noir / marron (huile)", ar: "أسود / بنّي (زيت)" }, result: "leakOil" },
      { label: { fr: "Vert, rose ou bleu", ar: "أخضر أو وردي أو أزرق" }, result: "leakCoolant" },
      { label: { fr: "Rouge", ar: "أحمر" }, result: "leakRed" },
      { label: { fr: "Jaunâtre, près d'une roue", ar: "مصفرّ، قرب إحدى العجلات" }, result: "leakBrake" },
      AI,
    ],
  },
  maintenance: {
    id: "maintenance",
    text: { fr: "De quoi avez-vous besoin ?", ar: "ماذا تحتاج؟" },
    options: [
      { label: { fr: "Vidange (huile + filtres)", ar: "تغيير الزيت والفلاتر" }, result: "oilChange" },
      { label: { fr: "Révision complète", ar: "مراجعة شاملة" }, result: "revision" },
      AI,
    ],
  },
};

const r = (
  id: string,
  title: L,
  urgency: Urgency,
  service: ServiceHint,
  causes: [string, string][],
  checks: [string, string][],
): GuideResult => ({
  id,
  title,
  urgency,
  service,
  causes: causes.map(([fr, ar]) => ({ fr, ar })),
  checks: checks.map(([fr, ar]) => ({ fr, ar })),
});

export const RESULTS: Record<string, GuideResult> = Object.fromEntries(
  [
    r("engineLight", { fr: "Voyant moteur orange", ar: "ضوء المحرك البرتقالي" }, "medium", "diagnostic",
      [["Capteur défectueux (sonde lambda, débitmètre…)", "حسّاس معطّل (حسّاس الأكسجين، مقياس الهواء…)"], ["Bougies / bobines d'allumage", "شمعات أو بوبينات الإشعال"], ["Bouchon de réservoir mal fermé", "غطاء الخزّان غير محكم"]],
      [["Vérifiez que le bouchon d'essence est bien serré", "تأكّد أن غطاء البنزين مغلق جيدًا"], ["Vous pouvez rouler prudemment, mais faites lire les codes défaut rapidement", "يمكنك السياقة بحذر، لكن اقرأ رموز الأعطال قريبًا"]]),
    r("engineFlash", { fr: "Voyant moteur qui clignote", ar: "ضوء المحرك يومض" }, "high", "diagnostic",
      [["Ratés d'allumage importants", "انقطاع قوي في الإشعال"], ["Risque d'abîmer le catalyseur", "خطر إتلاف المحوّل الحفّاز"]],
      [["Réduisez la vitesse, évitez d'accélérer fort", "خفّف السرعة وتجنّب التسارع القوي"], ["Venez au garage au plus vite", "تعال إلى الورشة في أقرب وقت"]]),
    r("oilRed", { fr: "Voyant d'huile rouge", ar: "ضوء الزيت الأحمر" }, "danger", "diagnostic",
      [["Pression d'huile trop basse", "ضغط الزيت منخفض جدًا"], ["Niveau d'huile très bas ou fuite", "مستوى الزيت منخفض جدًا أو تسرّب"], ["Pompe à huile / capteur", "مضخة الزيت أو الحسّاس"]],
      [["Arrêtez le moteur immédiatement en lieu sûr", "أطفئ المحرك فورًا في مكان آمن"], ["Moteur froid, vérifiez la jauge d'huile", "والمحرك بارد، افحص مقياس الزيت"], ["Ne roulez pas : risque de casser le moteur", "لا تسق: خطر تلف المحرك"]]),
    r("overheat", { fr: "Le moteur surchauffe", ar: "المحرك يسخن كثيرًا" }, "danger", "diagnostic",
      [["Manque de liquide de refroidissement / fuite", "نقص في سائل التبريد أو تسرّب"], ["Ventilateur ou thermostat en panne", "المروحة أو الترموستات معطّل"], ["Pompe à eau / joint de culasse", "مضخة الماء أو جوان الكيلاص"]],
      [["Arrêtez-vous et coupez le moteur", "توقّف وأطفئ المحرك"], ["N'ouvrez JAMAIS le bouchon du radiateur à chaud", "لا تفتح أبدًا غطاء الرادياتير والمحرك ساخن"], ["Attendez 30 min avant de regarder le niveau du vase d'expansion", "انتظر 30 دقيقة قبل فحص مستوى خزّان التبريد"]]),
    r("batteryLight", { fr: "Voyant batterie", ar: "ضوء البطارية" }, "high", "diagnostic",
      [["Alternateur qui ne charge plus", "الدينامو لا يشحن"], ["Courroie d'accessoires cassée ou détendue", "سير الملحقات مقطوع أو مرتخٍ"], ["Batterie ou cosses abîmées", "البطارية أو أطرافها تالفة"]],
      [["Éteignez clim, radio et équipements inutiles", "أطفئ المكيّف والراديو وكل ما هو غير ضروري"], ["Roulez directement jusqu'au garage, la voiture peut s'arrêter", "اتجه مباشرة إلى الورشة، قد تتوقف السيارة"]]),
    r("brakeLight", { fr: "Voyant frein / ABS", ar: "ضوء الفرامل / ABS" }, "high", "brakes",
      [["Niveau de liquide de frein bas (plaquettes usées ou fuite)", "مستوى سائل الفرامل منخفض (وسادات بالية أو تسرّب)"], ["Capteur ABS défectueux", "حسّاس ABS معطّل"], ["Frein à main resté serré", "فرامل اليد مشدودة"]],
      [["Vérifiez que le frein à main est bien desserré", "تأكّد أن فرامل اليد غير مشدودة"], ["Si la pédale est molle : ne roulez pas", "إذا كانت الدواسة رخوة: لا تسق"]]),
    r("brakeSqueal", { fr: "Grincement au freinage", ar: "صرير عند الفرملة" }, "medium", "brakes",
      [["Plaquettes usées (témoin d'usure)", "وسادات الفرامل بالية (مؤشر التآكل)"], ["Poussière ou disques glacés", "غبار أو أقراص ملساء"]],
      [["Faites contrôler l'épaisseur des plaquettes", "افحص سماكة وسادات الفرامل"], ["Ne laissez pas traîner : le bruit peut devenir métallique", "لا تتأخر: قد يصبح الصوت معدنيًا"]]),
    r("brakeGrind", { fr: "Frottement métallique au freinage", ar: "احتكاك معدني عند الفرملة" }, "danger", "brakes",
      [["Plaquettes complètement usées : métal contre disque", "الوسادات انتهت: معدن على القرص"], ["Disque abîmé", "القرص تالف"]],
      [["Freinage moins efficace : limitez au maximum les trajets", "الفرملة أضعف: قلّل التنقّل قدر الإمكان"], ["Venez au garage immédiatement", "تعال إلى الورشة فورًا"]]),
    r("brakePedal", { fr: "Pédale de frein molle", ar: "دواسة الفرامل رخوة" }, "danger", "brakes",
      [["Fuite de liquide de frein", "تسرّب في سائل الفرامل"], ["Air dans le circuit", "هواء في الدورة"], ["Maître-cylindre défaillant", "الماستر معطّل"]],
      [["NE ROULEZ PAS", "لا تسق السيارة"], ["Appelez le garage pour un remorquage", "اتصل بالورشة لسحب السيارة"]]),
    r("brakeVibration", { fr: "Vibrations au freinage", ar: "اهتزاز عند الفرملة" }, "medium", "brakes",
      [["Disques de frein voilés", "أقراص الفرامل ملتوية"], ["Jantes mal serrées ou trains roulants usés", "الجنوط غير مشدودة أو أجزاء التعليق بالية"]],
      [["Évitez les freinages brusques en attendant le contrôle", "تجنّب الفرملة القوية حتى الفحص"]]),
    r("brakePull", { fr: "La voiture tire en freinant", ar: "السيارة تنحرف عند الفرملة" }, "high", "brakes",
      [["Étrier grippé d'un côté", "كاليبر عالق في جهة"], ["Plaquettes usées de façon inégale", "تآكل غير متساوٍ للوسادات"], ["Pression des pneus différente", "ضغط العجلات مختلف"]],
      [["Vérifiez la pression des 4 pneus", "افحص ضغط العجلات الأربع"], ["Roulez doucement jusqu'au contrôle", "سق بهدوء حتى الفحص"]]),
    r("steeringNoise", { fr: "Bruit en tournant le volant", ar: "صوت عند تدوير المقود" }, "high", "repair",
      [["Cardan / soufflet de transmission", "الكاردان أو جلدته"], ["Rotule ou roulement usé", "روتيل أو رولمان بالٍ"], ["Pompe de direction assistée", "مضخة المقود المساعد"]],
      [["Écoutez si le bruit est un « clac-clac » en braquant : souvent le cardan", "إذا كان الصوت «تك تك» عند الالتفاف: غالبًا الكاردان"], ["Faites contrôler avant un long trajet", "افحص السيارة قبل أي رحلة طويلة"]]),
    r("suspension", { fr: "Bruit sur les bosses", ar: "صوت في المطبّات" }, "medium", "repair",
      [["Amortisseurs fatigués", "الأمورتيسورات ضعيفة"], ["Biellettes, silentblocs ou coupelles usés", "قطع التعليق والمطاط بالية"]],
      [["Rebondit-elle plusieurs fois quand on appuie sur un coin ? Amortisseur usé", "إذا ارتدّت عدة مرات عند الضغط على زاوية: الأمورتيسور بالٍ"]]),
    r("engineKnock", { fr: "Le moteur claque ou cogne", ar: "المحرك يطقطق أو يدقّ" }, "high", "diagnostic",
      [["Manque d'huile", "نقص في الزيت"], ["Poussoirs / culbuteurs", "البوسوارات"], ["Cliquetis (carburant, allumage)", "طقطقة الإشعال أو الوقود"]],
      [["Vérifiez le niveau d'huile moteur froid", "افحص مستوى الزيت والمحرك بارد"], ["Si le bruit est fort et grave : arrêtez le moteur", "إذا كان الصوت قويًا وعميقًا: أطفئ المحرك"]]),
    r("belt", { fr: "Sifflement sous le capot", ar: "صفير تحت غطاء المحرك" }, "medium", "repair",
      [["Courroie d'accessoires usée ou détendue", "سير الملحقات بالٍ أو مرتخٍ"], ["Galet tendeur", "بكرة الشدّ"]],
      [["Siffle plus au démarrage à froid ou avec la clim ? Souvent la courroie", "يزيد الصفير عند التشغيل البارد أو مع المكيّف؟ غالبًا السير"], ["Une courroie cassée peut arrêter la charge et la direction assistée", "انقطاع السير قد يوقف الشحن والمقود المساعد"]]),
    r("noStartBattery", { fr: "Ne démarre pas (clic ou rien)", ar: "لا تشتغل (نقرة أو لا شيء)" }, "medium", "diagnostic",
      [["Batterie déchargée ou en fin de vie", "البطارية فارغة أو انتهت"], ["Cosses oxydées / mal serrées", "أطراف البطارية متأكسدة أو مرتخية"], ["Démarreur", "المارش"]],
      [["Les phares sont-ils faibles ? Batterie probable", "هل الأضواء ضعيفة؟ غالبًا البطارية"], ["Essayez des câbles de démarrage avec une autre voiture", "جرّب كابلات التشغيل مع سيارة أخرى"]]),
    r("noStartFuel", { fr: "Le moteur tourne mais ne démarre pas", ar: "المحرك يدور لكن لا يشتغل" }, "medium", "diagnostic",
      [["Panne d'essence / pompe à carburant", "نفاد البنزين أو مضخة الوقود"], ["Allumage (bougies, bobine) ou capteur vilebrequin", "الإشعال أو حسّاس الكرنك"], ["Antidémarrage (clé non reconnue)", "نظام منع التشغيل (المفتاح غير معروف)"]],
      [["Vérifiez la jauge de carburant", "افحص مؤشر الوقود"], ["N'insistez pas plus de 10 s à chaque essai (batterie)", "لا تحاول أكثر من 10 ثوانٍ في كل مرة"]]),
    r("powerLoss", { fr: "Perte de puissance / à-coups", ar: "ضعف في القوة / تقطّع" }, "high", "diagnostic",
      [["Mode dégradé (défaut capteur, turbo, vanne EGR)", "وضع الحماية (حسّاس، تربو، صمام EGR)"], ["Filtre à carburant / injecteurs", "فلتر الوقود أو البخاخات"], ["Allumage", "الإشعال"]],
      [["Un voyant est-il allumé ? Notez-le", "هل يوجد ضوء مشتعل؟ دوّنه"], ["Évitez les dépassements et les longs trajets", "تجنّب التجاوز والرحلات الطويلة"]]),
    r("idle", { fr: "Ralenti instable / le moteur cale", ar: "دوران غير مستقر / المحرك يطفى" }, "medium", "diagnostic",
      [["Boîtier papillon encrassé", "علبة الفراشة متّسخة"], ["Prise d'air / capteur", "تسرّب هواء أو حسّاس"], ["Bougies", "الشمعات"]],
      [["Notez si c'est à froid, à chaud ou avec la clim", "دوّن إن كان ذلك والمحرك بارد أو ساخن أو مع المكيّف"]]),
    r("smokeWhite", { fr: "Fumée blanche épaisse", ar: "دخان أبيض كثيف" }, "danger", "diagnostic",
      [["Liquide de refroidissement brûlé : joint de culasse possible", "احتراق سائل التبريد: احتمال جوان الكيلاص"]],
      [["Un peu de vapeur au démarrage à froid est normal", "قليل من البخار عند التشغيل البارد أمر عادي"], ["Si elle continue moteur chaud : arrêtez de rouler", "إذا استمر والمحرك ساخن: توقّف عن السياقة"], ["Surveillez la température et le niveau du vase d'expansion", "راقب الحرارة ومستوى خزّان التبريد"]]),
    r("smokeBlue", { fr: "Fumée bleue / grise", ar: "دخان أزرق / رمادي" }, "medium", "diagnostic",
      [["Le moteur brûle de l'huile (segments, joints de soupapes)", "المحرك يحرق الزيت (الحلقات أو جوانات الصمامات)"], ["Turbo qui fuit", "التربو يسرّب"]],
      [["Vérifiez souvent le niveau d'huile et complétez", "افحص مستوى الزيت باستمرار وأكمله"]]),
    r("smokeBlack", { fr: "Fumée noire", ar: "دخان أسود" }, "medium", "diagnostic",
      [["Trop de carburant : injecteurs, filtre à air bouché", "وقود زائد: البخاخات أو فلتر الهواء مسدود"], ["Vanne EGR / turbo (diesel)", "صمام EGR أو التربو (ديزل)"]],
      [["Vérifiez l'état du filtre à air", "افحص حالة فلتر الهواء"], ["La consommation va augmenter : faites contrôler", "سيرتفع الاستهلاك: افحص السيارة"]]),
    r("acCold", { fr: "La clim ne refroidit plus", ar: "المكيّف لا يبرّد" }, "low", "aircon",
      [["Manque de gaz (petite fuite)", "نقص الغاز (تسرّب صغير)"], ["Compresseur ou embrayage de compresseur", "الكومبرسور"], ["Filtre d'habitacle bouché", "فلتر المقصورة مسدود"]],
      [["Vérifiez que le ventilateur souffle fort", "تأكّد أن المروحة تنفخ بقوة"], ["Une recharge + contrôle d'étanchéité règle souvent le problème", "التعبئة مع فحص التسرّب تحلّ المشكلة غالبًا"]]),
    r("acSmell", { fr: "Mauvaise odeur de clim", ar: "رائحة كريهة من المكيّف" }, "low", "aircon",
      [["Bactéries / moisissures dans l'évaporateur", "بكتيريا أو عفن في المبخّر"], ["Filtre d'habitacle encrassé", "فلتر المقصورة متّسخ"]],
      [["Coupez la clim 2 min avant d'arrêter le moteur, ventilation allumée", "أطفئ المكيّف قبل دقيقتين من إطفاء المحرك مع إبقاء التهوية"]]),
    r("acNoise", { fr: "Bruit quand la clim marche", ar: "صوت عند تشغيل المكيّف" }, "medium", "aircon",
      [["Compresseur usé", "الكومبرسور بالٍ"], ["Courroie ou galet", "السير أو البكرة"]],
      [["Si le bruit s'arrête quand vous coupez la clim : c'est le circuit de clim", "إذا توقّف الصوت عند إطفاء المكيّف: المشكلة في دورة التكييف"]]),
    r("wheelBalance", { fr: "Le volant vibre à vitesse élevée", ar: "المقود يهتزّ في السرعة" }, "low", "repair",
      [["Roues mal équilibrées", "العجلات غير موزونة"], ["Pneu déformé / jante voilée", "عجلة مشوّهة أو جنط ملتوٍ"]],
      [["Vérifiez l'état des pneus (bosses, usure)", "افحص حالة العجلات (انتفاخ، تآكل)"], ["Un équilibrage règle souvent le problème", "التوزين يحلّ المشكلة غالبًا"]]),
    r("alignment", { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة" }, "medium", "repair",
      [["Parallélisme déréglé", "ضبط الاتجاه (البراليلّيسم) غير مضبوط"], ["Pression des pneus différente", "ضغط العجلات مختلف"], ["Pièce de train avant usée", "قطعة من الجزء الأمامي بالية"]],
      [["Vérifiez la pression des 4 pneus", "افحص ضغط العجلات الأربع"], ["Usure irrégulière d'un pneu = réglage à faire", "تآكل غير منتظم للعجلة = يلزم ضبط"]]),
    r("flat", { fr: "Pneu crevé ou qui se dégonfle", ar: "عجلة مثقوبة أو تفرغ" }, "high", "repair",
      [["Clou / vis dans le pneu", "مسمار أو برغي في العجلة"], ["Valve ou jante qui fuit", "الصمام أو الجنط يسرّب"]],
      [["Ne roulez pas avec un pneu à plat (risque d'abîmer la jante)", "لا تسق بعجلة فارغة (خطر إتلاف الجنط)"], ["Montez la roue de secours si vous le pouvez en sécurité", "ركّب العجلة الاحتياطية إن أمكن بأمان"]]),
    r("steeringHard", { fr: "Direction devenue dure", ar: "المقود أصبح ثقيلًا" }, "high", "diagnostic",
      [["Direction assistée (liquide, pompe, moteur électrique)", "المقود المساعد (السائل، المضخة، المحرك الكهربائي)"], ["Pneus sous-gonflés", "ضغط العجلات منخفض"]],
      [["Vérifiez la pression des pneus", "افحص ضغط العجلات"], ["Si c'est arrivé d'un coup en roulant : arrêtez-vous en sécurité", "إذا حدث فجأة أثناء السياقة: توقّف بأمان"]]),
    r("leakWater", { fr: "Eau claire sous la voiture", ar: "ماء شفاف تحت السيارة" }, "low", "none",
      [["Condensation normale de la climatisation", "تكثّف طبيعي من المكيّف"]],
      [["C'est normal par temps chaud, sans odeur ni couleur", "هذا طبيعي في الطقس الحار إذا لم يكن له لون ولا رائحة"], ["Si le liquide est gras ou coloré, refaites le guide", "إذا كان السائل دهنيًا أو ملوّنًا، أعد الاختبار"]]),
    r("leakOil", { fr: "Fuite d'huile", ar: "تسرّب الزيت" }, "medium", "repair",
      [["Joint de carter, de cache-culbuteurs ou bouchon de vidange", "جوان الكارتير أو غطاء الصمامات أو برغي التفريغ"], ["Filtre à huile mal serré", "فلتر الزيت غير مشدود"]],
      [["Vérifiez le niveau d'huile régulièrement", "افحص مستوى الزيت باستمرار"], ["Grosse flaque : ne roulez pas", "بقعة كبيرة: لا تسق"]]),
    r("leakCoolant", { fr: "Fuite de liquide de refroidissement", ar: "تسرّب سائل التبريد" }, "high", "diagnostic",
      [["Durite ou collier", "خرطوم أو مشبك"], ["Radiateur ou pompe à eau", "الرادياتير أو مضخة الماء"]],
      [["Surveillez l'aiguille de température", "راقب مؤشر الحرارة"], ["Liquide toxique : tenez enfants et animaux éloignés", "سائل سام: أبعد الأطفال والحيوانات"]]),
    r("leakRed", { fr: "Fuite de liquide rouge", ar: "تسرّب سائل أحمر" }, "high", "repair",
      [["Boîte automatique (ATF)", "علبة السرعات الأوتوماتيكية"], ["Direction assistée", "المقود المساعد"]],
      [["Notez si la boîte patine ou si la direction devient dure", "لاحظ إن كانت العلبة تنزلق أو المقود يثقل"]]),
    r("leakBrake", { fr: "Liquide près d'une roue", ar: "سائل قرب إحدى العجلات" }, "danger", "brakes",
      [["Fuite de liquide de frein (étrier, flexible)", "تسرّب سائل الفرامل (الكاليبر أو الخرطوم)"]],
      [["NE ROULEZ PAS : les freins peuvent lâcher", "لا تسق: قد تتعطّل الفرامل"], ["Appelez le garage", "اتصل بالورشة"]]),
    r("oilChange", { fr: "Vidange", ar: "تغيير الزيت" }, "low", "oil",
      [["Entretien périodique : huile moteur, filtre à huile et filtre à air", "صيانة دورية: زيت المحرك وفلتر الزيت وفلتر الهواء"]],
      [["Notez le kilométrage actuel et la dernière vidange", "دوّن عدد الكيلومترات وتاريخ آخر تغيير زيت"]]),
    r("revision", { fr: "Révision complète", ar: "مراجعة شاملة" }, "low", "service",
      [["Contrôle complet selon le carnet du constructeur", "فحص كامل حسب دفتر الصانع"]],
      [["Apportez le carnet d'entretien si vous l'avez", "أحضر دفتر الصيانة إن وجد"]]),
  ].map((x) => [x.id, x]),
);

const HINT_WORDS: Record<Exclude<ServiceHint, "none">, string[]> = {
  diagnostic: ["diagnostic", "تشخيص"],
  brakes: ["frein", "فرامل"],
  oil: ["vidange", "huile", "زيت"],
  service: ["révision", "revision", "entretien", "مراجعة"],
  aircon: ["clim", "مكي", "تكييف"],
  repair: ["spécifique", "specifique", "réparation", "reparation", "إصلاح"],
};

/**
 * Finds the garage's bookable service matching a hint, by keywords in its name.
 * Falls back to a diagnostic, then to a generic repair, then to none.
 */
export function matchService<T extends { id: string; name: string; nameAr?: string | null }>(hint: ServiceHint, services: T[]): T | null {
  if (hint === "none") return null;
  const find = (h: Exclude<ServiceHint, "none">) =>
    services.find((s) => HINT_WORDS[h].some((w) => `${s.name} ${s.nameAr ?? ""}`.toLowerCase().includes(w)));
  return find(hint) ?? find("diagnostic") ?? find("repair") ?? null;
}

export const tr = (l: L, lang: "fr" | "ar") => l[lang];
