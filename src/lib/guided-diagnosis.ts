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

export type L = { fr: string; ar: string; en: string };
export type Urgency = "low" | "medium" | "high" | "danger";
/** Which of the garage's bookable services fits (matched by keywords in the service name). */
export type ServiceHint = "diagnostic" | "brakes" | "oil" | "service" | "aircon" | "repair" | "none";

export type GuideOption = { label: L; next?: string; result?: string; ai?: true };
export type GuideQuestion = { id: string; text: L; options: GuideOption[] };
export type GuideResult = { id: string; title: L; causes: L[]; checks: L[]; urgency: Urgency; service: ServiceHint };

const AI: GuideOption = { label: { fr: "Autre / je ne sais pas", ar: "شيء آخر / لا أعرف", en: "Other / I don't know" }, ai: true };

export const ROOT = "root";

export const QUESTIONS: Record<string, GuideQuestion> = {
  root: {
    id: "root",
    text: { fr: "Quel est le problème ?", ar: "ما هي المشكلة؟", en: "What is the problem?" },
    options: [
      { label: { fr: "Un voyant est allumé", ar: "ضوء تحذير مشتعل", en: "A warning light is on" }, next: "light" },
      { label: { fr: "Un bruit anormal", ar: "صوت غير عادي", en: "An unusual noise" }, next: "noise" },
      { label: { fr: "Freins", ar: "الفرامل", en: "Brakes" }, next: "brakes" },
      { label: { fr: "Démarrage / moteur", ar: "التشغيل / المحرك", en: "Starting / engine" }, next: "engine" },
      { label: { fr: "La voiture chauffe", ar: "السيارة تسخن", en: "The car is overheating" }, result: "overheat" },
      { label: { fr: "Climatisation", ar: "المكيّف", en: "Air conditioning" }, next: "aircon" },
      { label: { fr: "Pneus / direction", ar: "العجلات / المقود", en: "Tyres / steering" }, next: "tires" },
      { label: { fr: "Fuite sous la voiture", ar: "تسرّب تحت السيارة", en: "Leak under the car" }, next: "leak" },
      { label: { fr: "Entretien / vidange", ar: "صيانة / تغيير الزيت", en: "Maintenance / oil change" }, next: "maintenance" },
      { label: { fr: "Autre problème", ar: "مشكلة أخرى", en: "Other problem" }, ai: true },
    ],
  },
  light: {
    id: "light",
    text: { fr: "Quel voyant ?", ar: "أيّ ضوء؟", en: "Which warning light?" },
    options: [
      { label: { fr: "Moteur orange, fixe", ar: "المحرك برتقالي، ثابت", en: "Orange engine light, steady" }, result: "engineLight" },
      { label: { fr: "Moteur orange qui clignote", ar: "المحرك برتقالي يومض", en: "Orange engine light, flashing" }, result: "engineFlash" },
      { label: { fr: "Huile (rouge)", ar: "الزيت (أحمر)", en: "Oil (red)" }, result: "oilRed" },
      { label: { fr: "Température (rouge)", ar: "الحرارة (أحمر)", en: "Temperature (red)" }, result: "overheat" },
      { label: { fr: "Batterie", ar: "البطارية", en: "Battery" }, result: "batteryLight" },
      { label: { fr: "Frein / ABS", ar: "الفرامل / ABS", en: "Brake / ABS" }, result: "brakeLight" },
      AI,
    ],
  },
  noise: {
    id: "noise",
    text: { fr: "Quand entendez-vous le bruit ?", ar: "متى تسمع الصوت؟", en: "When do you hear the noise?" },
    options: [
      { label: { fr: "En freinant : grincement aigu", ar: "عند الفرملة: صرير حاد", en: "When braking: high-pitched squeal" }, result: "brakeSqueal" },
      { label: { fr: "En freinant : frottement métallique", ar: "عند الفرملة: احتكاك معدني", en: "When braking: metal grinding" }, result: "brakeGrind" },
      { label: { fr: "En tournant le volant", ar: "عند تدوير المقود", en: "When turning the steering wheel" }, result: "steeringNoise" },
      { label: { fr: "Sur les bosses / trous", ar: "في المطبّات والحفر", en: "Over bumps / potholes" }, result: "suspension" },
      { label: { fr: "Le moteur claque / cogne", ar: "المحرك يطقطق / يدقّ", en: "The engine knocks / clatters" }, result: "engineKnock" },
      { label: { fr: "Sifflement sous le capot", ar: "صفير تحت الغطاء", en: "Whistling under the bonnet" }, result: "belt" },
      AI,
    ],
  },
  brakes: {
    id: "brakes",
    text: { fr: "Que remarquez-vous au freinage ?", ar: "ماذا تلاحظ عند الفرملة؟", en: "What do you notice when braking?" },
    options: [
      { label: { fr: "La pédale est molle / s'enfonce", ar: "الدواسة رخوة / تنزل كثيرًا", en: "The pedal is soft / sinks" }, result: "brakePedal" },
      { label: { fr: "Le volant ou la pédale vibre", ar: "المقود أو الدواسة يهتزّ", en: "The steering wheel or pedal vibrates" }, result: "brakeVibration" },
      { label: { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة", en: "The car pulls to one side" }, result: "brakePull" },
      { label: { fr: "Bruit en freinant", ar: "صوت عند الفرملة", en: "Noise when braking" }, next: "noise" },
      AI,
    ],
  },
  engine: {
    id: "engine",
    text: { fr: "Que se passe-t-il ?", ar: "ماذا يحدث؟", en: "What happens?" },
    options: [
      { label: { fr: "Ne démarre pas : clic ou rien", ar: "لا تشتغل: نقرة أو لا شيء", en: "Won't start: a click or nothing" }, result: "noStartBattery" },
      { label: { fr: "Le démarreur tourne mais le moteur ne part pas", ar: "المارش يدور لكن المحرك لا يشتغل", en: "The starter turns but the engine won't fire" }, result: "noStartFuel" },
      { label: { fr: "Perte de puissance / à-coups", ar: "ضعف في القوة / تقطّع", en: "Loss of power / jerking" }, result: "powerLoss" },
      { label: { fr: "Ralenti instable / cale", ar: "الدوران غير مستقر / يطفى", en: "Rough idle / stalls" }, result: "idle" },
      { label: { fr: "De la fumée sort de l'échappement", ar: "دخان من العادم", en: "Smoke comes out of the exhaust" }, next: "smoke" },
      AI,
    ],
  },
  smoke: {
    id: "smoke",
    text: { fr: "De quelle couleur est la fumée ?", ar: "ما لون الدخان؟", en: "What colour is the smoke?" },
    options: [
      { label: { fr: "Blanche et épaisse (même moteur chaud)", ar: "أبيض وكثيف (حتى والمحرك ساخن)", en: "White and thick (even with a warm engine)" }, result: "smokeWhite" },
      { label: { fr: "Bleue / grise", ar: "أزرق / رمادي", en: "Blue / grey" }, result: "smokeBlue" },
      { label: { fr: "Noire", ar: "أسود", en: "Black" }, result: "smokeBlack" },
      AI,
    ],
  },
  aircon: {
    id: "aircon",
    text: { fr: "Quel souci avec la climatisation ?", ar: "ما مشكلة المكيّف؟", en: "What is wrong with the air conditioning?" },
    options: [
      { label: { fr: "Elle ne refroidit plus", ar: "لم يعد يبرّد", en: "It no longer cools" }, result: "acCold" },
      { label: { fr: "Mauvaise odeur", ar: "رائحة كريهة", en: "Bad smell" }, result: "acSmell" },
      { label: { fr: "Bruit quand elle marche", ar: "صوت عند تشغيله", en: "Noise when it runs" }, result: "acNoise" },
      AI,
    ],
  },
  tires: {
    id: "tires",
    text: { fr: "Que remarquez-vous ?", ar: "ماذا تلاحظ؟", en: "What do you notice?" },
    options: [
      { label: { fr: "Le volant vibre à vitesse élevée", ar: "المقود يهتزّ في السرعة", en: "The steering wheel vibrates at high speed" }, result: "wheelBalance" },
      { label: { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة", en: "The car pulls to one side" }, result: "alignment" },
      { label: { fr: "Pneu crevé / qui se dégonfle", ar: "عجلة مثقوبة / تفرغ من الهواء", en: "Flat tyre / slowly deflating" }, result: "flat" },
      { label: { fr: "La direction est devenue dure", ar: "المقود أصبح ثقيلًا", en: "The steering has become heavy" }, result: "steeringHard" },
      AI,
    ],
  },
  leak: {
    id: "leak",
    text: { fr: "De quelle couleur est le liquide ?", ar: "ما لون السائل؟", en: "What colour is the fluid?" },
    options: [
      { label: { fr: "Clair comme de l'eau (sous la clim)", ar: "شفاف كالماء (تحت المكيّف)", en: "Clear like water (under the A/C)" }, result: "leakWater" },
      { label: { fr: "Noir / marron (huile)", ar: "أسود / بنّي (زيت)", en: "Black / brown (oil)" }, result: "leakOil" },
      { label: { fr: "Vert, rose ou bleu", ar: "أخضر أو وردي أو أزرق", en: "Green, pink or blue" }, result: "leakCoolant" },
      { label: { fr: "Rouge", ar: "أحمر", en: "Red" }, result: "leakRed" },
      { label: { fr: "Jaunâtre, près d'une roue", ar: "مصفرّ، قرب إحدى العجلات", en: "Yellowish, near a wheel" }, result: "leakBrake" },
      AI,
    ],
  },
  maintenance: {
    id: "maintenance",
    text: { fr: "De quoi avez-vous besoin ?", ar: "ماذا تحتاج؟", en: "What do you need?" },
    options: [
      { label: { fr: "Vidange (huile + filtres)", ar: "تغيير الزيت والفلاتر", en: "Oil change (oil + filters)" }, result: "oilChange" },
      { label: { fr: "Révision complète", ar: "مراجعة شاملة", en: "Full service" }, result: "revision" },
      AI,
    ],
  },
};

const r = (
  id: string,
  title: L,
  urgency: Urgency,
  service: ServiceHint,
  causes: [string, string, string][],
  checks: [string, string, string][],
): GuideResult => ({
  id,
  title,
  urgency,
  service,
  causes: causes.map(([fr, ar, en]) => ({ fr, ar, en })),
  checks: checks.map(([fr, ar, en]) => ({ fr, ar, en })),
});

export const RESULTS: Record<string, GuideResult> = Object.fromEntries(
  [
    r("engineLight", { fr: "Voyant moteur orange", ar: "ضوء المحرك البرتقالي", en: "Orange engine light" }, "medium", "diagnostic",
      [["Capteur défectueux (sonde lambda, débitmètre…)", "حسّاس معطّل (حسّاس الأكسجين، مقياس الهواء…)", "Faulty sensor (lambda probe, air-flow meter…)"], ["Bougies / bobines d'allumage", "شمعات أو بوبينات الإشعال", "Spark plugs / ignition coils"], ["Bouchon de réservoir mal fermé", "غطاء الخزّان غير محكم", "Fuel cap not closed properly"]],
      [["Vérifiez que le bouchon d'essence est bien serré", "تأكّد أن غطاء البنزين مغلق جيدًا", "Check that the fuel cap is tight"], ["Vous pouvez rouler prudemment, mais faites lire les codes défaut rapidement", "يمكنك السياقة بحذر، لكن اقرأ رموز الأعطال قريبًا", "You can drive carefully, but have the fault codes read soon"]]),
    r("engineFlash", { fr: "Voyant moteur qui clignote", ar: "ضوء المحرك يومض", en: "Flashing engine light" }, "high", "diagnostic",
      [["Ratés d'allumage importants", "انقطاع قوي في الإشعال", "Serious misfires"], ["Risque d'abîmer le catalyseur", "خطر إتلاف المحوّل الحفّاز", "Risk of damaging the catalytic converter"]],
      [["Réduisez la vitesse, évitez d'accélérer fort", "خفّف السرعة وتجنّب التسارع القوي", "Slow down and avoid hard acceleration"], ["Venez au garage au plus vite", "تعال إلى الورشة في أقرب وقت", "Come to the garage as soon as possible"]]),
    r("oilRed", { fr: "Voyant d'huile rouge", ar: "ضوء الزيت الأحمر", en: "Red oil light" }, "danger", "diagnostic",
      [["Pression d'huile trop basse", "ضغط الزيت منخفض جدًا", "Oil pressure too low"], ["Niveau d'huile très bas ou fuite", "مستوى الزيت منخفض جدًا أو تسرّب", "Very low oil level or a leak"], ["Pompe à huile / capteur", "مضخة الزيت أو الحسّاس", "Oil pump / sensor"]],
      [["Arrêtez le moteur immédiatement en lieu sûr", "أطفئ المحرك فورًا في مكان آمن", "Stop the engine immediately in a safe place"], ["Moteur froid, vérifiez la jauge d'huile", "والمحرك بارد، افحص مقياس الزيت", "With the engine cold, check the oil dipstick"], ["Ne roulez pas : risque de casser le moteur", "لا تسق: خطر تلف المحرك", "Do not drive: risk of destroying the engine"]]),
    r("overheat", { fr: "Le moteur surchauffe", ar: "المحرك يسخن كثيرًا", en: "The engine is overheating" }, "danger", "diagnostic",
      [["Manque de liquide de refroidissement / fuite", "نقص في سائل التبريد أو تسرّب", "Low coolant / leak"], ["Ventilateur ou thermostat en panne", "المروحة أو الترموستات معطّل", "Faulty fan or thermostat"], ["Pompe à eau / joint de culasse", "مضخة الماء أو جوان الكيلاص", "Water pump / head gasket"]],
      [["Arrêtez-vous et coupez le moteur", "توقّف وأطفئ المحرك", "Stop and switch off the engine"], ["N'ouvrez JAMAIS le bouchon du radiateur à chaud", "لا تفتح أبدًا غطاء الرادياتير والمحرك ساخن", "NEVER open the radiator cap when hot"], ["Attendez 30 min avant de regarder le niveau du vase d'expansion", "انتظر 30 دقيقة قبل فحص مستوى خزّان التبريد", "Wait 30 min before checking the expansion tank level"]]),
    r("batteryLight", { fr: "Voyant batterie", ar: "ضوء البطارية", en: "Battery light" }, "high", "diagnostic",
      [["Alternateur qui ne charge plus", "الدينامو لا يشحن", "Alternator no longer charging"], ["Courroie d'accessoires cassée ou détendue", "سير الملحقات مقطوع أو مرتخٍ", "Accessory belt broken or loose"], ["Batterie ou cosses abîmées", "البطارية أو أطرافها تالفة", "Damaged battery or terminals"]],
      [["Éteignez clim, radio et équipements inutiles", "أطفئ المكيّف والراديو وكل ما هو غير ضروري", "Switch off A/C, radio and anything not needed"], ["Roulez directement jusqu'au garage, la voiture peut s'arrêter", "اتجه مباشرة إلى الورشة، قد تتوقف السيارة", "Drive straight to the garage; the car may stop"]]),
    r("brakeLight", { fr: "Voyant frein / ABS", ar: "ضوء الفرامل / ABS", en: "Brake / ABS light" }, "high", "brakes",
      [["Niveau de liquide de frein bas (plaquettes usées ou fuite)", "مستوى سائل الفرامل منخفض (وسادات بالية أو تسرّب)", "Low brake fluid (worn pads or a leak)"], ["Capteur ABS défectueux", "حسّاس ABS معطّل", "Faulty ABS sensor"], ["Frein à main resté serré", "فرامل اليد مشدودة", "Handbrake still on"]],
      [["Vérifiez que le frein à main est bien desserré", "تأكّد أن فرامل اليد غير مشدودة", "Check that the handbrake is fully released"], ["Si la pédale est molle : ne roulez pas", "إذا كانت الدواسة رخوة: لا تسق", "If the pedal is soft: do not drive"]]),
    r("brakeSqueal", { fr: "Grincement au freinage", ar: "صرير عند الفرملة", en: "Squealing when braking" }, "medium", "brakes",
      [["Plaquettes usées (témoin d'usure)", "وسادات الفرامل بالية (مؤشر التآكل)", "Worn pads (wear indicator)"], ["Poussière ou disques glacés", "غبار أو أقراص ملساء", "Dust or glazed discs"]],
      [["Faites contrôler l'épaisseur des plaquettes", "افحص سماكة وسادات الفرامل", "Have the pad thickness checked"], ["Ne laissez pas traîner : le bruit peut devenir métallique", "لا تتأخر: قد يصبح الصوت معدنيًا", "Don't wait: the noise can turn metallic"]]),
    r("brakeGrind", { fr: "Frottement métallique au freinage", ar: "احتكاك معدني عند الفرملة", en: "Metal grinding when braking" }, "danger", "brakes",
      [["Plaquettes complètement usées : métal contre disque", "الوسادات انتهت: معدن على القرص", "Pads completely worn: metal on disc"], ["Disque abîmé", "القرص تالف", "Damaged disc"]],
      [["Freinage moins efficace : limitez au maximum les trajets", "الفرملة أضعف: قلّل التنقّل قدر الإمكان", "Braking is weaker: keep trips to a minimum"], ["Venez au garage immédiatement", "تعال إلى الورشة فورًا", "Come to the garage immediately"]]),
    r("brakePedal", { fr: "Pédale de frein molle", ar: "دواسة الفرامل رخوة", en: "Soft brake pedal" }, "danger", "brakes",
      [["Fuite de liquide de frein", "تسرّب في سائل الفرامل", "Brake fluid leak"], ["Air dans le circuit", "هواء في الدورة", "Air in the system"], ["Maître-cylindre défaillant", "الماستر معطّل", "Faulty master cylinder"]],
      [["NE ROULEZ PAS", "لا تسق السيارة", "DO NOT DRIVE"], ["Appelez le garage pour un remorquage", "اتصل بالورشة لسحب السيارة", "Call the garage for a tow"]]),
    r("brakeVibration", { fr: "Vibrations au freinage", ar: "اهتزاز عند الفرملة", en: "Vibration when braking" }, "medium", "brakes",
      [["Disques de frein voilés", "أقراص الفرامل ملتوية", "Warped brake discs"], ["Jantes mal serrées ou trains roulants usés", "الجنوط غير مشدودة أو أجزاء التعليق بالية", "Loose wheels or worn suspension parts"]],
      [["Évitez les freinages brusques en attendant le contrôle", "تجنّب الفرملة القوية حتى الفحص", "Avoid hard braking until it is checked"]]),
    r("brakePull", { fr: "La voiture tire en freinant", ar: "السيارة تنحرف عند الفرملة", en: "The car pulls when braking" }, "high", "brakes",
      [["Étrier grippé d'un côté", "كاليبر عالق في جهة", "Caliper stuck on one side"], ["Plaquettes usées de façon inégale", "تآكل غير متساوٍ للوسادات", "Unevenly worn pads"], ["Pression des pneus différente", "ضغط العجلات مختلف", "Different tyre pressures"]],
      [["Vérifiez la pression des 4 pneus", "افحص ضغط العجلات الأربع", "Check the pressure of all 4 tyres"], ["Roulez doucement jusqu'au contrôle", "سق بهدوء حتى الفحص", "Drive gently until it is checked"]]),
    r("steeringNoise", { fr: "Bruit en tournant le volant", ar: "صوت عند تدوير المقود", en: "Noise when turning the wheel" }, "high", "repair",
      [["Cardan / soufflet de transmission", "الكاردان أو جلدته", "CV joint / boot"], ["Rotule ou roulement usé", "روتيل أو رولمان بالٍ", "Worn ball joint or bearing"], ["Pompe de direction assistée", "مضخة المقود المساعد", "Power steering pump"]],
      [["Écoutez si le bruit est un « clac-clac » en braquant : souvent le cardan", "إذا كان الصوت «تك تك» عند الالتفاف: غالبًا الكاردان", "If it goes “click-click” on full lock, it is often the CV joint"], ["Faites contrôler avant un long trajet", "افحص السيارة قبل أي رحلة طويلة", "Have it checked before a long trip"]]),
    r("suspension", { fr: "Bruit sur les bosses", ar: "صوت في المطبّات", en: "Noise over bumps" }, "medium", "repair",
      [["Amortisseurs fatigués", "الأمورتيسورات ضعيفة", "Worn shock absorbers"], ["Biellettes, silentblocs ou coupelles usés", "قطع التعليق والمطاط بالية", "Worn links, bushes or top mounts"]],
      [["Rebondit-elle plusieurs fois quand on appuie sur un coin ? Amortisseur usé", "إذا ارتدّت عدة مرات عند الضغط على زاوية: الأمورتيسور بالٍ", "Does it bounce several times when you push a corner down? Worn shock absorber"]]),
    r("engineKnock", { fr: "Le moteur claque ou cogne", ar: "المحرك يطقطق أو يدقّ", en: "The engine knocks or clatters" }, "high", "diagnostic",
      [["Manque d'huile", "نقص في الزيت", "Low oil"], ["Poussoirs / culbuteurs", "البوسوارات", "Tappets / rocker arms"], ["Cliquetis (carburant, allumage)", "طقطقة الإشعال أو الوقود", "Pinking (fuel, ignition)"]],
      [["Vérifiez le niveau d'huile moteur froid", "افحص مستوى الزيت والمحرك بارد", "Check the oil level with the engine cold"], ["Si le bruit est fort et grave : arrêtez le moteur", "إذا كان الصوت قويًا وعميقًا: أطفئ المحرك", "If the noise is loud and deep: stop the engine"]]),
    r("belt", { fr: "Sifflement sous le capot", ar: "صفير تحت غطاء المحرك", en: "Whistling under the bonnet" }, "medium", "repair",
      [["Courroie d'accessoires usée ou détendue", "سير الملحقات بالٍ أو مرتخٍ", "Worn or loose accessory belt"], ["Galet tendeur", "بكرة الشدّ", "Tensioner pulley"]],
      [["Siffle plus au démarrage à froid ou avec la clim ? Souvent la courroie", "يزيد الصفير عند التشغيل البارد أو مع المكيّف؟ غالبًا السير", "Whistles more on cold starts or with the A/C? Often the belt"], ["Une courroie cassée peut arrêter la charge et la direction assistée", "انقطاع السير قد يوقف الشحن والمقود المساعد", "A broken belt can stop charging and the power steering"]]),
    r("noStartBattery", { fr: "Ne démarre pas (clic ou rien)", ar: "لا تشتغل (نقرة أو لا شيء)", en: "Won't start (a click or nothing)" }, "medium", "diagnostic",
      [["Batterie déchargée ou en fin de vie", "البطارية فارغة أو انتهت", "Flat or worn-out battery"], ["Cosses oxydées / mal serrées", "أطراف البطارية متأكسدة أو مرتخية", "Corroded / loose terminals"], ["Démarreur", "المارش", "Starter motor"]],
      [["Les phares sont-ils faibles ? Batterie probable", "هل الأضواء ضعيفة؟ غالبًا البطارية", "Are the headlights dim? Probably the battery"], ["Essayez des câbles de démarrage avec une autre voiture", "جرّب كابلات التشغيل مع سيارة أخرى", "Try jump leads with another car"]]),
    r("noStartFuel", { fr: "Le moteur tourne mais ne démarre pas", ar: "المحرك يدور لكن لا يشتغل", en: "The engine turns but won't start" }, "medium", "diagnostic",
      [["Panne d'essence / pompe à carburant", "نفاد البنزين أو مضخة الوقود", "Out of fuel / fuel pump"], ["Allumage (bougies, bobine) ou capteur vilebrequin", "الإشعال أو حسّاس الكرنك", "Ignition (plugs, coil) or crankshaft sensor"], ["Antidémarrage (clé non reconnue)", "نظام منع التشغيل (المفتاح غير معروف)", "Immobiliser (key not recognised)"]],
      [["Vérifiez la jauge de carburant", "افحص مؤشر الوقود", "Check the fuel gauge"], ["N'insistez pas plus de 10 s à chaque essai (batterie)", "لا تحاول أكثر من 10 ثوانٍ في كل مرة", "Don't crank for more than 10 s each try (battery)"]]),
    r("powerLoss", { fr: "Perte de puissance / à-coups", ar: "ضعف في القوة / تقطّع", en: "Loss of power / jerking" }, "high", "diagnostic",
      [["Mode dégradé (défaut capteur, turbo, vanne EGR)", "وضع الحماية (حسّاس، تربو، صمام EGR)", "Limp mode (sensor fault, turbo, EGR valve)"], ["Filtre à carburant / injecteurs", "فلتر الوقود أو البخاخات", "Fuel filter / injectors"], ["Allumage", "الإشعال", "Ignition"]],
      [["Un voyant est-il allumé ? Notez-le", "هل يوجد ضوء مشتعل؟ دوّنه", "Is a warning light on? Write it down"], ["Évitez les dépassements et les longs trajets", "تجنّب التجاوز والرحلات الطويلة", "Avoid overtaking and long trips"]]),
    r("idle", { fr: "Ralenti instable / le moteur cale", ar: "دوران غير مستقر / المحرك يطفى", en: "Rough idle / the engine stalls" }, "medium", "diagnostic",
      [["Boîtier papillon encrassé", "علبة الفراشة متّسخة", "Dirty throttle body"], ["Prise d'air / capteur", "تسرّب هواء أو حسّاس", "Air leak / sensor"], ["Bougies", "الشمعات", "Spark plugs"]],
      [["Notez si c'est à froid, à chaud ou avec la clim", "دوّن إن كان ذلك والمحرك بارد أو ساخن أو مع المكيّف", "Note whether it happens cold, warm or with the A/C"]]),
    r("smokeWhite", { fr: "Fumée blanche épaisse", ar: "دخان أبيض كثيف", en: "Thick white smoke" }, "danger", "diagnostic",
      [["Liquide de refroidissement brûlé : joint de culasse possible", "احتراق سائل التبريد: احتمال جوان الكيلاص", "Burning coolant: possible head gasket"]],
      [["Un peu de vapeur au démarrage à froid est normal", "قليل من البخار عند التشغيل البارد أمر عادي", "A little vapour on a cold start is normal"], ["Si elle continue moteur chaud : arrêtez de rouler", "إذا استمر والمحرك ساخن: توقّف عن السياقة", "If it continues with a warm engine: stop driving"], ["Surveillez la température et le niveau du vase d'expansion", "راقب الحرارة ومستوى خزّان التبريد", "Watch the temperature and the expansion tank level"]]),
    r("smokeBlue", { fr: "Fumée bleue / grise", ar: "دخان أزرق / رمادي", en: "Blue / grey smoke" }, "medium", "diagnostic",
      [["Le moteur brûle de l'huile (segments, joints de soupapes)", "المحرك يحرق الزيت (الحلقات أو جوانات الصمامات)", "The engine is burning oil (piston rings, valve seals)"], ["Turbo qui fuit", "التربو يسرّب", "Leaking turbo"]],
      [["Vérifiez souvent le niveau d'huile et complétez", "افحص مستوى الزيت باستمرار وأكمله", "Check the oil level often and top up"]]),
    r("smokeBlack", { fr: "Fumée noire", ar: "دخان أسود", en: "Black smoke" }, "medium", "diagnostic",
      [["Trop de carburant : injecteurs, filtre à air bouché", "وقود زائد: البخاخات أو فلتر الهواء مسدود", "Too much fuel: injectors, blocked air filter"], ["Vanne EGR / turbo (diesel)", "صمام EGR أو التربو (ديزل)", "EGR valve / turbo (diesel)"]],
      [["Vérifiez l'état du filtre à air", "افحص حالة فلتر الهواء", "Check the air filter"], ["La consommation va augmenter : faites contrôler", "سيرتفع الاستهلاك: افحص السيارة", "Fuel consumption will rise: have it checked"]]),
    r("acCold", { fr: "La clim ne refroidit plus", ar: "المكيّف لا يبرّد", en: "The A/C no longer cools" }, "low", "aircon",
      [["Manque de gaz (petite fuite)", "نقص الغاز (تسرّب صغير)", "Low refrigerant (small leak)"], ["Compresseur ou embrayage de compresseur", "الكومبرسور", "Compressor or compressor clutch"], ["Filtre d'habitacle bouché", "فلتر المقصورة مسدود", "Blocked cabin filter"]],
      [["Vérifiez que le ventilateur souffle fort", "تأكّد أن المروحة تنفخ بقوة", "Check that the fan blows strongly"], ["Une recharge + contrôle d'étanchéité règle souvent le problème", "التعبئة مع فحص التسرّب تحلّ المشكلة غالبًا", "A recharge + leak test often solves it"]]),
    r("acSmell", { fr: "Mauvaise odeur de clim", ar: "رائحة كريهة من المكيّف", en: "Bad smell from the A/C" }, "low", "aircon",
      [["Bactéries / moisissures dans l'évaporateur", "بكتيريا أو عفن في المبخّر", "Bacteria / mould in the evaporator"], ["Filtre d'habitacle encrassé", "فلتر المقصورة متّسخ", "Dirty cabin filter"]],
      [["Coupez la clim 2 min avant d'arrêter le moteur, ventilation allumée", "أطفئ المكيّف قبل دقيقتين من إطفاء المحرك مع إبقاء التهوية", "Switch off the A/C 2 min before stopping the engine, fan on"]]),
    r("acNoise", { fr: "Bruit quand la clim marche", ar: "صوت عند تشغيل المكيّف", en: "Noise when the A/C runs" }, "medium", "aircon",
      [["Compresseur usé", "الكومبرسور بالٍ", "Worn compressor"], ["Courroie ou galet", "السير أو البكرة", "Belt or pulley"]],
      [["Si le bruit s'arrête quand vous coupez la clim : c'est le circuit de clim", "إذا توقّف الصوت عند إطفاء المكيّف: المشكلة في دورة التكييف", "If the noise stops when you switch off the A/C, it is the A/C system"]]),
    r("wheelBalance", { fr: "Le volant vibre à vitesse élevée", ar: "المقود يهتزّ في السرعة", en: "The steering wheel vibrates at high speed" }, "low", "repair",
      [["Roues mal équilibrées", "العجلات غير موزونة", "Unbalanced wheels"], ["Pneu déformé / jante voilée", "عجلة مشوّهة أو جنط ملتوٍ", "Deformed tyre / bent rim"]],
      [["Vérifiez l'état des pneus (bosses, usure)", "افحص حالة العجلات (انتفاخ، تآكل)", "Check the tyres (bulges, wear)"], ["Un équilibrage règle souvent le problème", "التوزين يحلّ المشكلة غالبًا", "Wheel balancing often solves it"]]),
    r("alignment", { fr: "La voiture tire d'un côté", ar: "السيارة تنحرف لجهة", en: "The car pulls to one side" }, "medium", "repair",
      [["Parallélisme déréglé", "ضبط الاتجاه (البراليلّيسم) غير مضبوط", "Wheel alignment out"], ["Pression des pneus différente", "ضغط العجلات مختلف", "Different tyre pressures"], ["Pièce de train avant usée", "قطعة من الجزء الأمامي بالية", "Worn front suspension part"]],
      [["Vérifiez la pression des 4 pneus", "افحص ضغط العجلات الأربع", "Check the pressure of all 4 tyres"], ["Usure irrégulière d'un pneu = réglage à faire", "تآكل غير منتظم للعجلة = يلزم ضبط", "Uneven tyre wear = alignment needed"]]),
    r("flat", { fr: "Pneu crevé ou qui se dégonfle", ar: "عجلة مثقوبة أو تفرغ", en: "Flat or slowly deflating tyre" }, "high", "repair",
      [["Clou / vis dans le pneu", "مسمار أو برغي في العجلة", "Nail / screw in the tyre"], ["Valve ou jante qui fuit", "الصمام أو الجنط يسرّب", "Leaking valve or rim"]],
      [["Ne roulez pas avec un pneu à plat (risque d'abîmer la jante)", "لا تسق بعجلة فارغة (خطر إتلاف الجنط)", "Do not drive on a flat tyre (risk of damaging the rim)"], ["Montez la roue de secours si vous le pouvez en sécurité", "ركّب العجلة الاحتياطية إن أمكن بأمان", "Fit the spare wheel if you can do it safely"]]),
    r("steeringHard", { fr: "Direction devenue dure", ar: "المقود أصبح ثقيلًا", en: "Steering has become heavy" }, "high", "diagnostic",
      [["Direction assistée (liquide, pompe, moteur électrique)", "المقود المساعد (السائل، المضخة، المحرك الكهربائي)", "Power steering (fluid, pump, electric motor)"], ["Pneus sous-gonflés", "ضغط العجلات منخفض", "Under-inflated tyres"]],
      [["Vérifiez la pression des pneus", "افحص ضغط العجلات", "Check the tyre pressures"], ["Si c'est arrivé d'un coup en roulant : arrêtez-vous en sécurité", "إذا حدث فجأة أثناء السياقة: توقّف بأمان", "If it happened suddenly while driving: stop safely"]]),
    r("leakWater", { fr: "Eau claire sous la voiture", ar: "ماء شفاف تحت السيارة", en: "Clear water under the car" }, "low", "none",
      [["Condensation normale de la climatisation", "تكثّف طبيعي من المكيّف", "Normal condensation from the air conditioning"]],
      [["C'est normal par temps chaud, sans odeur ni couleur", "هذا طبيعي في الطقس الحار إذا لم يكن له لون ولا رائحة", "This is normal in hot weather if it has no smell or colour"], ["Si le liquide est gras ou coloré, refaites le guide", "إذا كان السائل دهنيًا أو ملوّنًا، أعد الاختبار", "If the fluid is oily or coloured, run the guide again"]]),
    r("leakOil", { fr: "Fuite d'huile", ar: "تسرّب الزيت", en: "Oil leak" }, "medium", "repair",
      [["Joint de carter, de cache-culbuteurs ou bouchon de vidange", "جوان الكارتير أو غطاء الصمامات أو برغي التفريغ", "Sump gasket, rocker cover gasket or drain plug"], ["Filtre à huile mal serré", "فلتر الزيت غير مشدود", "Loose oil filter"]],
      [["Vérifiez le niveau d'huile régulièrement", "افحص مستوى الزيت باستمرار", "Check the oil level regularly"], ["Grosse flaque : ne roulez pas", "بقعة كبيرة: لا تسق", "Large puddle: do not drive"]]),
    r("leakCoolant", { fr: "Fuite de liquide de refroidissement", ar: "تسرّب سائل التبريد", en: "Coolant leak" }, "high", "diagnostic",
      [["Durite ou collier", "خرطوم أو مشبك", "Hose or clamp"], ["Radiateur ou pompe à eau", "الرادياتير أو مضخة الماء", "Radiator or water pump"]],
      [["Surveillez l'aiguille de température", "راقب مؤشر الحرارة", "Watch the temperature gauge"], ["Liquide toxique : tenez enfants et animaux éloignés", "سائل سام: أبعد الأطفال والحيوانات", "Toxic fluid: keep children and pets away"]]),
    r("leakRed", { fr: "Fuite de liquide rouge", ar: "تسرّب سائل أحمر", en: "Red fluid leak" }, "high", "repair",
      [["Boîte automatique (ATF)", "علبة السرعات الأوتوماتيكية", "Automatic gearbox (ATF)"], ["Direction assistée", "المقود المساعد", "Power steering"]],
      [["Notez si la boîte patine ou si la direction devient dure", "لاحظ إن كانت العلبة تنزلق أو المقود يثقل", "Note whether the gearbox slips or the steering gets heavy"]]),
    r("leakBrake", { fr: "Liquide près d'une roue", ar: "سائل قرب إحدى العجلات", en: "Fluid near a wheel" }, "danger", "brakes",
      [["Fuite de liquide de frein (étrier, flexible)", "تسرّب سائل الفرامل (الكاليبر أو الخرطوم)", "Brake fluid leak (caliper, hose)"]],
      [["NE ROULEZ PAS : les freins peuvent lâcher", "لا تسق: قد تتعطّل الفرامل", "DO NOT DRIVE: the brakes may fail"], ["Appelez le garage", "اتصل بالورشة", "Call the garage"]]),
    r("oilChange", { fr: "Vidange", ar: "تغيير الزيت", en: "Oil change" }, "low", "oil",
      [["Entretien périodique : huile moteur, filtre à huile et filtre à air", "صيانة دورية: زيت المحرك وفلتر الزيت وفلتر الهواء", "Routine maintenance: engine oil, oil filter and air filter"]],
      [["Notez le kilométrage actuel et la dernière vidange", "دوّن عدد الكيلومترات وتاريخ آخر تغيير زيت", "Note the current mileage and the last oil change"]]),
    r("revision", { fr: "Révision complète", ar: "مراجعة شاملة", en: "Full service" }, "low", "service",
      [["Contrôle complet selon le carnet du constructeur", "فحص كامل حسب دفتر الصانع", "Full check following the manufacturer's service book"]],
      [["Apportez le carnet d'entretien si vous l'avez", "أحضر دفتر الصيانة إن وجد", "Bring the service book if you have it"]]),
  ].map((x) => [x.id, x]),
);

const HINT_WORDS: Record<Exclude<ServiceHint, "none">, string[]> = {
  diagnostic: ["diagnostic", "تشخيص"],
  brakes: ["frein", "brake", "فرامل"],
  oil: ["vidange", "huile", "oil", "زيت"],
  service: ["révision", "revision", "entretien", "service", "مراجعة"],
  aircon: ["clim", "air con", "a/c", "مكي", "تكييف"],
  repair: ["spécifique", "specifique", "réparation", "reparation", "repair", "إصلاح"],
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

export const tr = (l: L, lang: "fr" | "ar" | "en") => l[lang];
