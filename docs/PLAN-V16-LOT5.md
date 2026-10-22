# V16 — Plan du Lot 5 : qualité, suivi et pilotage

Base : branche `feat/v16-consolidation` (Lots 1 à 4 faits, non mis en production). Consigne du propriétaire : « avancer lot par lot, je vérifie à la fin ». Décisions en vigueur : une permission par passage, preuves en ajout seul, numérotation au PC du garage avec un hub, anciens ordres = ancien comportement, messages clients par la file existante (consentement / `reminderOptOut` respectés, jamais de faux envoi), **jamais** de fonction de parrainage. Aucune contradiction ci-dessous ne demande une décision sans choix prudent : les choix sont listés au § 8.

## 1. Migration `29_quality_followup` (additive, rejouable deux fois)

- Types créés (bloc `DO … EXCEPTION WHEN duplicate_object`) : `ComebackCategory` (SAME_FAULT, WORKMANSHIP, PART_FAILURE, OTHER), `LaborKind` (DIAGNOSIS, WORK, REWORK, WARRANTY), `InspectionColor` (GREEN, ORANGE, RED). Aucun `ALTER TYPE … ADD VALUE`.
- `WorkOrder` : `comebackOfWorkOrderId` (FK `WorkOrder`, SET NULL, index), `comebackCategory`, `comebackLinkedAt`, `comebackLinkedById` ; `workflowLot5` (false pour les ordres existants **sans UPDATE**, puis défaut true — même technique que `workflowV16` / `workflowLot4`).
- `WorkOrderLine.isRework` (false). `QualityCheck.roadTestKm` (km parcourus à l'essai, nullable), `QualityCheck.extraPoints` (Json `{}` : résultats des points ajoutés dans les réglages, avec leur libellé au moment du contrôle).
- `LaborEntry.workOrderLineId` (nullable, FK SET NULL), `LaborEntry.kind` (`LaborKind`, nullable) — facultatifs.
- `CustomerFeedback.handledAt`, `handledById`, `handledNote` (suite donnée à une note ≤ 3).
- `Setting` : `qualityPoints` (Json `[]`, points en plus des 6 points actuels), `autoSatisfactionSurvey` (true), `autoRefusedLineReminders` (true).
- Tables : `InspectionTemplate` (nom, points Json, actif), `Inspection` (ordre, modèle, nom copié, auteur, terminé le), `InspectionResult` (point, libellé, couleur, note, photo = `WorkOrderMedia` existante, ligne de devis créée). Un modèle « Inspection standard » inséré par la migration avec un id fixe (`ON CONFLICT DO NOTHING`, écrit avec `garagepro.sync = 'on'` : identique des deux côtés, rien dans le journal de sync).
- Bloc final `_sync_log_trg` identique à `24_accueil` (pose la sync sur les 3 tables).

## 2. Contrôle qualité

- Km de l'essai routier : obligatoire quand « essai effectué » est coché (nouveaux ordres `workflowLot5`), 1 à 500 km.
- Points paramétrables : *Paramètres › Parcours atelier* → liste de points en plus (libellés), les **6 points actuels restent** (colonnes inchangées). Chaque point réglé doit être coché pour valider (nouveaux ordres) ; le libellé est copié dans le contrôle (un point retiré plus tard ne casse pas un contrôle déjà fait).
- Retour en atelier (`QUALITY_CONTROL` / `WASHING` / `READY → IN_PROGRESS`) : en plus du motif (Lot 1), **cause obligatoire** (liste : travail incomplet, malfaçon, pièce défectueuse, essai routier, propreté, autre) pour les nouveaux ordres ; **compteur de reprises** = nombre de ces retours (calculé depuis les événements, ajout seul : aucun compteur partagé qui pourrait s'écraser à la sync), affiché sur la fiche et le contrôle qualité, journalisé.

## 3. Retour atelier (comeback)

- À l'ouverture de la fiche d'un nouvel ordre : si le même véhicule a un ordre **livré il y a moins de 30 jours**, carte « Retour atelier ? » (OR, date, travaux) avec catégorie (`SAME_FAULT`, `WORKMANSHIP`, `PART_FAILURE`, `OTHER`) → *Lier* ou *Ce n'est pas un retour* (événement, ajout seul). Permission `manageComebacks` (ADMIN, MANAGER, RECEPTION). Délier possible (motif, journal).
- **Main-d'œuvre de reprise non facturée par défaut** : sur un ordre lié, une ligne de main-d'œuvre est ajoutée à 0 DT et marquée `isRework` ; la facturer demande de cocher « Facturer cette main-d'œuvre » (permission `manageComebacks`, journalisé).
- Rapports : **taux de retour atelier** = ordres ouverts de la période liés à un ordre précédent / ordres ouverts ; l'ancien calcul (même véhicule revenu sous 30 jours) reste affiché sous le nom « revisites ».

## 4. Inspection rouge / orange / vert

- Modèles (permission `manageInspections` : ADMIN, MANAGER) : *Paramètres › Inspections* (nom, points un par ligne, actif).
- Sur la fiche (permission `performInspection` : ADMIN, MANAGER, RECEPTION, MECHANIC) : démarrer une inspection depuis un modèle ; pour chaque point vert / orange / rouge + note + photo (photo réduite dans le navigateur et envoyée par la route existante → `WorkOrderMedia`/`putObject`, déjà copiée par `media-sync.mjs`).
- Point rouge / orange → **ligne de devis `PENDING`** (priorité SAFETY / RECOMMENDED) par `addLine` (permission `manageQuotes` : le mécanicien signale, l'accueil chiffre) ; le lien point → ligne est gardé ; la ligne suit le parcours du devis (Lot 2).
- Portail : bloc « Inspection » (couleur, libellé, note, photo si visible, « proposé dans le devis »).

## 5. Suivi client

- **Relance des lignes refusées** à 30 et 90 jours après la livraison (réglage `autoRefusedLineReminders`, ordres V16) : un message par ordre et par palier (`refused-remind:<id>:<30|90>`, seulement le plus haut palier atteint, pas après 120 jours), jamais si le client refuse les messages (`reminderOptOut`) ni si le véhicule est revenu depuis.
- **Enquête de satisfaction à J+3** après la livraison (réglage `autoSatisfactionSurvey`, ordres `workflowLot5`, livrés il y a 3 à 7 jours — le suivi en ligne reste ouvert 7 jours) : message avec le lien du suivi où se trouve le formulaire de note existant (`CustomerFeedback`), une seule fois (`survey:<id>`), pas si déjà noté, jamais si `reminderOptOut`.
- **Alerte interne** : note ≤ 3 → ligne « Avis clients à traiter » dans *À traiter* (cloche) pour `manageClaims` ; *Réclamations* : bouton « Traité » + note (journal).

## 6. Pilotage (`lib/report.ts`, *Rapports*)

Bloc KPI, données réelles seulement, « — » quand il n'y a pas de quoi calculer : taux d'approbation des lignes (lignes décidées des devis envoyés dans la période, hors frais annoncés), ARO (CA HT net / factures), livré à la date promise initiale (Lot 3), taux de retour atelier, efficacité technicien (heures vendues / heures pointées, global et par mécanicien), taux de no-show (RDV de la période), balance âgée (Lot 4).

## 7. Pointage

`LaborEntry.workOrderLineId` et `kind` facultatifs : choix au démarrage du chrono et dans la saisie après coup ; REWORK proposé par défaut sur un ordre lié à un retour atelier ; affichés dans le détail du temps.

## 8. Contradictions avec le code réel et choix faits

1. **Motif déjà obligatoire** au retour en atelier (Lot 1, texte libre) : la « cause » ajoutée est une liste (exploitable dans les chiffres), en plus du motif ; nouveaux ordres seulement.
2. **Compteur de reprises** : pas de colonne compteur (une ligne partagée « le plus récent gagne » perdrait des incréments) → compté depuis les événements de statut (ajout seul).
3. **Les 6 points actuels sont des colonnes** : gardés tels quels ; les points paramétrables s'ajoutent (Json), sans pouvoir retirer les 6.
4. **Photo d'inspection** : réutilise `WorkOrderMedia` (aucune nouvelle table de fichiers → `media-sync.mjs` inchangé, la photo est déjà synchronisée).
5. **Date de refus d'une ligne** : pas de date par ligne (le garage peut refuser sans `QuoteApproval`) → relance comptée depuis la **livraison** de l'ordre (le client est reparti sans ces travaux).
6. **`reminderOptOut`** visait les rappels d'entretien : consigne du propriétaire, il s'applique aussi à l'enquête et aux relances de lignes refusées.
7. **Heures vendues par mécanicien** : les lignes n'ont pas d'auteur ; elles sont comptées au mécanicien de l'ordre (comme le bloc *Mécaniciens* existant).
8. **Taux de retour atelier** : dénominateur = ordres ouverts dans la période (même population que le numérateur).
9. **Audit n° 10** (montants vus par le mécanicien) : non traité ici (refonte de la fiche, pas « petit et sûr ») ; la conversion d'un point d'inspection en ligne chiffrée est réservée à `manageQuotes`.
