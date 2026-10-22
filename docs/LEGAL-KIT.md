# Kit juridique (V10.6) — ordre de réparation, facture, CDI

Modèles fournis par le propriétaire du garage (« utilisez mes documents du kit juridique comme
modèles ») :

- `Master Legal Kit - Garage Automobile Tunisie.pdf` : ordre de réparation, contrat de travail
  CDI/CDD, convention de stage, attestations / certificat de travail, décharge d'outillage ;
- `Master_Legal_Kit_Garage_Automobile.pdf` : contrat de réparation, contrat flotte, contrats de
  travail par métier, contrat fournisseur, contrat vierge (tous marqués « Version 1 · À valider par
  un juriste ») ;
- `Contrat_de_Travail_CDI_Tunisie.pdf` : CDI en 22 articles ;
- un cahier des charges texte (« Ordre de réparation et prise en charge » + « Facture officielle »),
  **tronqué** après la ligne « Identification fiscale complète du garage et du client ».

**Rien ici n'est une validation juridique.** Les textes viennent des modèles du garage ; ils doivent
être relus par un juriste tunisien. Aucune référence d'article n'a été inventée : seules sont citées
celles qui figurent déjà dans `docs/PLAN-CONTRATS-SHOWROOM.md` ou dans le kit lui-même.

## 1. Prise en charge / ordre de réparation

Page imprimable A4 : `/garage/work-orders/[id]/prise-en-charge` (bouton « Prise en charge » en haut
de la réparation et dans la carte du même nom). Toujours en français. Cases de signature **vides** :
signature à la main, pas de signature électronique (loi n° 2000-83, voir le plan des contrats).

| Information | Où elle est saisie | Stockage |
|---|---|---|
| Garage : nom / raison sociale, MF, adresse, tél., e-mail, RC | Paramètres (garage) + Équipe → fiche légale de l'entreprise | `Setting.legalName`, `taxId`, `registryNumber` / `registryCity` (existants) |
| Client : nom, CIN / MF, adresse, tél. | Fiche client (nouveau champ CIN), accueil, carte « Prise en charge » | `Customer.nationalId` (nouveau), `taxId` |
| Véhicule : marque/modèle, immatriculation, VIN, km | Accueil (existant) | `Vehicle`, `WorkOrder.mileageIn` |
| Niveau de carburant 1/4 … 4/4 | Accueil (section repliable) ou carte « Prise en charge » | `WorkOrder.fuelLevel` |
| Carrosserie : zones cochées (facultatif) + constat libre | idem | `WorkOrder.bodyChecklist`, `bodyDamageNotes` |
| Origine des pièces : origine / adaptable / occasion / fournies par le client | idem | `WorkOrder.partsOrigin` |
| Montant estimatif TTC | total des lignes (comme le devis) ; sinon montant saisi à l'accueil | `WorkOrder.estimateTtc` |
| Acompte versé + mode | idem | `WorkOrder.depositAmount`, `depositMethod` |

L'acompte **n'est pas** un paiement comptable (les paiements sont rattachés à une facture). La page de
la facture rappelle de l'enregistrer comme paiement quand la facture est émise.

Migration `21_legal_kit` : colonnes ajoutées uniquement (nullables ou avec défaut), rejouable.

## 2. Clauses — Paramètres → « Conditions de l'ordre de réparation »

Articles éditables (titre + texte, 12 au plus ; vider le texte retire l'article). Montants séparés :
frais de gardiennage par jour (défaut 20,000 DT), franchise (48 h), délai d'abandon (30 jours) —
valeurs du kit. Variables dans les textes : `{storageFee}`, `{graceHours}`, `{abandonDays}`.

Sous les clauses, la page imprime **« Clauses à faire valider par un juriste (droit tunisien) »** tant
qu'un administrateur n'a pas coché « Un juriste a validé ces clauses » (permission
`reviewContractTemplates`, comme les modèles de contrats ; qui / quand enregistrés et audités). Toute
modification des textes ou des montants **annule** cette validation.

| Art. | Texte par défaut (source) | Prudence |
|---|---|---|
| 1 | Autorisation des travaux et des essais sur route (kit, OR art. 1) + « le garage ne répond pas des vices cachés ni des usures préexistantes » (cahier des charges) | L'exonération de responsabilité peut être une clause abusive envers un consommateur ; une clause excluant la garantie est nulle (loi n° 92-117, art. 17-18, cité dans le plan des contrats). À faire relire. |
| 2 | Travaux supplémentaires notifiés (tél., WhatsApp, e-mail) et accord préalable ; réparations conservatoires en cas d'urgence (kit + cahier des charges) | Les « réparations conservatoires » sans accord contredisent l'accord préalable : à préciser par un juriste. |
| 3 | Droit de rétention « conformément aux articles du COC » (kit, sans numéro d'article) | Le droit de rétention existe dans le Code des obligations et des contrats, mais ses conditions d’exercice sont à vérifier. Aucun numéro d'article n'est cité : le kit n'en donne pas. |
| 4 | Gardiennage : franchise `{graceHours}` h puis `{storageFee}` par jour (kit, OR art. 4) | Pénalité forfaitaire : peut être jugée abusive envers un consommateur (protection du consommateur, loi n° 92-117) ; montant et point de départ à faire valider. Le second PDF du kit propose 3 jours / 15 DT : le garage choisit. |
| 5 | Effets personnels non signalés : décharge de responsabilité (kit, OR art. 5) | Exclusion de responsabilité : portée limitée (faute du garage, objets confiés), à faire relire. |
| 6 | Abandon : après `{abandonDays}` jours de préavis sans réponse, vente aux enchères aux frais du client (cahier des charges) | Les conditions et la procédure d’une vente du véhicule (formalités, intervention d’un juge ou d’un officier public) sont à vérifier : la clause seule ne les remplace pas. Peut être abusive. À faire valider avant usage. |

## 3. Facture

Comparaison avec le cahier des charges « Facture officielle » :

| Exigence | Avant V10.6 | V10.6 |
|---|---|---|
| Numéro unique | `F2026-0001` (séquence annuelle continue) | **inchangé** (voir ci-dessous) |
| Date d'émission / d'échéance | date seulement | + échéance (`Invoice.dueDate`, « à réception » si vide) |
| Référence de l'ordre de réparation | « OR-0042 » | libellé « Réf. ordre de réparation » |
| Identification fiscale du garage | nom, adresse, MF | + raison sociale si différente, **RC** (figés) |
| Identification du client | nom, adresse, MF | + **CIN** (figé) |
| TVA par taux | montant par taux | + tableau base HT / taux / TVA, total TVA si plusieurs taux |
| Droit de timbre, totaux HT / TVA / TTC | oui | inchangé |
| Montant en lettres | non | « Arrêtée la présente facture à la somme de … dinars et … millimes. » (`src/lib/amount-words.ts`, testé) |
| Mode / conditions de paiement | non | texte des Paramètres, figé à l'émission |
| Pénalités de retard | non | imprimées **seulement si saisies** dans les Paramètres, figées |

**Numérotation non modifiée** : le cahier des charges propose `FAC-YYYY-XXXX`. Changer de format en
cours d'exploitation casserait la suite continue et chronologique des factures déjà émises (une
facture ne doit jamais être renumérotée, et deux formats dans la même année rendraient les trous
indétectables). Le format `F<année>-<n° sur 4 chiffres>` est donc gardé, numéroté seulement sur le PC
du garage quand un hub est installé.

**Factures figées** : les nouvelles mentions sont copiées dans `Invoice.snapshot.legal` pour les
factures émises à partir de la V10.6. Les anciennes factures n'en ont pas : elles s'affichent comme
avant, sans relire les Paramètres actuels (un document légal ne change pas). Le montant en lettres et
le tableau de TVA sont calculés à partir des totaux figés : ils s'affichent aussi sur les anciennes.

## 4. Contrat de travail (CDI) — modèle version 2

Les 12 modèles « Contrat de travail » passent en **version 2** (nouveau texte = nouvelle version, qui
repart « à valider par un juriste »). La version 1 reste en base pour les contrats déjà créés avec
elle. Règles inchangées (C. trav. modifié par la loi n° 2025-9) : CDI par défaut, CDD seulement pour
les 3 motifs avec date de fin et sans essai, essai de 6 mois au plus renouvelable une fois.

Correspondance avec le CDI du propriétaire (22 articles) :

| Modèle du garage | Version 2 |
|---|---|
| 1 Engagement, visite médicale | `hiring` (`employeeName`, `employerName`, `jobTitle`) |
| 2 Libre de tout engagement | `freeOfCommitment` |
| 3 Prise de fonction | `start` (`startDate`) |
| 4 Durée indéterminée | `cdi` / `cdd` (règles existantes) + `probation` |
| 5 Heures de travail | `hours` (`workHours`, saisi) |
| 6 Repos et congés | `leave` (`leave`, saisi) |
| 7 Échelle / échelon / salaire en chiffres et en lettres | `salary` (`grade`, `step` nouveaux, `salary`, `salaryWords` calculé) |
| 8 Lieu de travail / mobilité | `workplace` |
| 9 Engagements (7 points) | `obligations` (+ `duties` du métier) |
| 10 Primes | `bonuses` (facultatif, texte saisi) |
| 11 Sécurité sociale | `socialSecurity` |
| 12-13 | **illisibles** dans le PDF fourni (saut de page) : non reproduits |
| 14 Formation | `training` (facultatif) |
| 15 Secret professionnel | `confidentiality` |
| 16 Préavis | `notice` (`noticePeriod`, saisi) |
| 17 Restitution du matériel | `equipment` (facultatif) |
| 18 Code du travail / convention | `law` |
| 19 Divisibilité, 20 Intégralité, 21 Domicile | `severability`, `entireAgreement`, `domicile` |
| 22 Tribunaux | `disputes` (`jurisdictionCity`, saisi) |

Adaptations volontaires (signalées dans les « points non vérifiés » du modèle) : pas de mobilité « sur
tout le territoire » acceptée d'avance, pas de durée d'absence chiffrée pendant le préavis ni de règle
de report des congés affirmée, pas de « faute grave » pour un changement d'adresse non signalé,
« convention collective applicable » (aucune trouvée pour les garages). Aucun montant n'est proposé.
