import type { TemplateClause, TemplateField } from "@/lib/contracts";

/**
 * Employment contract, version 2 (V10.6): structure of the owner's CDI model
 * ("Contrat de travail à durée indéterminée", 22 articles) mapped onto the existing variables.
 * A text change = a new version, which starts again "à valider par un juriste".
 * Kept from version 1 (Law 2025-9, Labour Code art. 6-2 / 6-3 / 6-4): CDI by default, CDD only
 * for the 3 legal reasons with an end date and no probation, probation ≤ 6 months renewable once.
 * Salary, hours, leave, notice and court are typed by the garage: never suggested here.
 * Articles 12-13 of the owner's PDF could not be read (page break) and are not reproduced.
 */

/** Fields added in version 2 (all others are those of version 1). */
export const CDI_V2_EXTRA_FIELDS: TemplateField[] = [
  { key: "grade", type: "text", required: false },
  { key: "step", type: "text", required: false },
  { key: "bonuses", type: "textarea", required: false },
  { key: "noticePeriod", type: "text", required: true },
  { key: "jurisdictionCity", type: "text", required: true },
];

const SHOW_CDI = { key: "employmentType", equals: "CDI" } as const;
const SHOW_CDD = { key: "employmentType", equals: "CDD" } as const;

/** Articles of version 2, in the order of the owner's model (signature / data clauses appended by the catalogue). */
export const CDI_V2_CLAUSES: TemplateClause[] = [
  {
    key: "hiring",
    title: "Engagement",
    body: "{{employeeName}} est engagé(e) par {{employerName}} pour exercer la fonction de {{jobTitle}}, sous réserve des résultats de la visite médicale d'embauche et du maintien de son aptitude physique et mentale à exercer cette fonction.",
    required: true,
  },
  { key: "freeOfCommitment", title: "Liberté d'engagement", body: "Le salarié déclare n'être lié à aucun autre employeur ou, le cas échéant, l'avoir quitté libre de tout engagement.", required: true },
  { key: "start", title: "Prise de fonction", body: "La prise de fonction du salarié interviendra le {{startDate}}.", required: true },
  { key: "cdi", title: "Durée du contrat", body: "Le présent contrat est conclu pour une durée indéterminée.", required: true, showIf: SHOW_CDI },
  {
    key: "cdd",
    title: "Durée du contrat",
    body:
      "Le présent contrat est conclu pour une durée déterminée, du {{startDate}} au {{endDate}}, pour le motif suivant : {{cddReason}}{{replacedText}}. Il ne comporte pas de période d'essai. La poursuite du travail après son terme le transforme en contrat à durée indéterminée. Il n'est jamais renouvelé automatiquement.",
    required: true,
    showIf: SHOW_CDD,
  },
  { key: "probation", title: "Période d'essai", body: "Période d'essai : {{probationText}}.", required: true, showIf: SHOW_CDI },
  { key: "hours", title: "Durée du travail", body: "Le salarié assure la durée de travail suivante : {{workHours}}.", required: true },
  { key: "leave", title: "Repos et congés", body: "Le salarié a droit à un jour de repos par semaine. Congés payés : {{leave}}.", required: true },
  {
    key: "salary",
    title: "Classification et rémunération",
    body: "Le salarié est classé à l'échelle {{grade}}, échelon {{step}}, et perçoit un salaire mensuel brut de {{salary}} ({{salaryWords}}).",
    required: true,
  },
  {
    key: "workplace",
    title: "Lieu de travail",
    body: "Le salarié exerce ses fonctions à : {{workplace}}. Ce lieu ou le service d'affectation peut être modifié pour les besoins de l'organisation de l'employeur, dans le respect des délais de prévenance et des dispositions légales en vigueur.",
    required: true,
  },
  {
    key: "obligations",
    title: "Fonctions et obligations",
    body:
      "Missions : {{duties}} Le salarié s'engage à : 1. consacrer son temps de service au bon déroulement du travail et défendre les intérêts de l'employeur ; 2. reconnaître que toute réalisation effectuée dans le cadre du contrat et dans les locaux de l'employeur est la propriété de celui-ci ; 3. ne sortir aucun document ou support de l'entreprise sans autorisation expresse de son supérieur ; 4. respecter les horaires de travail et les consignes de pointage ; 5. suivre les instructions de ses supérieurs hiérarchiques ; 6. respecter le règlement intérieur, les consignes de sécurité de l'atelier (équipements de protection individuelle) et les dispositions légales et conventionnelles en vigueur ; 7. respecter les règles de discipline et d'hygiène.",
    required: true,
  },
  { key: "bonuses", title: "Primes", body: "{{bonuses}}", required: false },
  { key: "socialSecurity", title: "Sécurité sociale", body: "Le salarié est affilié au régime de sécurité sociale selon la législation en vigueur.", required: true },
  {
    key: "training",
    title: "Formation",
    body: "Le salarié peut bénéficier de formations. En cas de rupture unilatérale et abusive du présent contrat de son fait, il rembourse le reliquat des frais de formation selon les engagements écrits qu'il aura signés pour chaque formation.",
    required: false,
  },
  {
    key: "confidentiality",
    title: "Secret professionnel",
    body: "Pendant le contrat et après sa cessation, quelle qu'en soit la cause, le salarié garde le secret professionnel et s'interdit de divulguer à des tiers les informations ou documents, notamment ceux des clients du garage, dont il a eu connaissance dans ses fonctions.",
    required: true,
  },
  {
    key: "notice",
    title: "Préavis",
    body: "Le délai de préavis est fixé à {{noticePeriod}}. Lorsque la rupture est à l'initiative de l'employeur, le salarié peut s'absenter pendant le préavis pour rechercher un autre emploi selon les modalités légales et conventionnelles applicables, sans réduction de salaire. Lorsque la rupture est à l'initiative du salarié, celui-ci effectue régulièrement son travail pendant le préavis, sauf dispense accordée par l'employeur.",
    required: true,
  },
  {
    key: "equipment",
    title: "Restitution du matériel",
    body: "À la fin du contrat, le salarié restitue l'uniforme, le badge, l'outillage et tout équipement de travail qui lui ont été confiés. À défaut, une retenue au prorata de la valeur des objets non restitués, compte tenu de l'usure normale, est appliquée sur le solde de tout compte dans les limites prévues par la loi.",
    required: false,
  },
  { key: "law", title: "Droit applicable", body: "Pour tout ce qui n'est pas prévu au présent contrat, les parties se réfèrent au Code du travail et à la convention collective applicable.", required: true },
  { key: "severability", title: "Divisibilité", body: "Si une disposition du présent contrat est jugée invalide ou inapplicable, les autres dispositions restent valables.", required: true },
  { key: "entireAgreement", title: "Intégralité", body: "Le présent contrat contient l'intégralité des accords des parties et ne peut être modifié que par un écrit signé des deux parties.", required: true },
  {
    key: "domicile",
    title: "Élection de domicile",
    body: "Pour l'exécution du présent contrat, les parties font élection de domicile à leurs adresses indiquées en tête. Tout changement d'adresse du salarié est communiqué à l'employeur dans les meilleurs délais.",
    required: true,
  },
  { key: "special", title: "Conditions particulières", body: "{{specialConditions}}", required: false },
  {
    key: "disputes",
    title: "Litiges",
    body: "En cas de litige relatif à l'application ou à l'interprétation du présent contrat, et à défaut d'accord amiable, compétence est attribuée aux juridictions de {{jurisdictionCity}}.",
    required: true,
  },
];
