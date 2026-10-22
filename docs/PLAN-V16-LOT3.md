# V16 — Plan du Lot 3 : refus de devis, attente client, retards, attente pièces

Base : branche `feat/v16-consolidation` (Lots 1 et 2 faits, non mis en production). Consigne du propriétaire : « avancer lot par lot, je vérifie à la fin ». Aucune contradiction ci-dessous ne demande une décision sans choix prudent : les choix retenus sont réversibles et notés au § 7.

## 1. Migration `27_delays_refusal` (additive, rejouable deux fois)

- Type créé (bloc `DO … EXCEPTION WHEN duplicate_object`) : `PromiseReason` (PARTS, EXTRA_WORK, CUSTOMER_DECISION, INSURANCE, WORKSHOP_LOAD, OTHER). Aucun `ALTER TYPE … ADD VALUE` sur un type existant.
- Table **`PromiseRevision`** (**ajout seul**, id `cuid`) : `workOrderId` (FK `WorkOrder`, RESTRICT), `partNeedId` (null = date promise de l'ordre ; sinon date prévue d'une pièce, sans FK pour ne jamais devoir modifier la ligne), `oldDate`, `newDate`, `reason`, `note` (interne), `notified` (message mis en file vers un vrai canal), `dedupeKey` (lien vers `Notification`), `createdById`, `createdAt`. Trigger `PromiseRevision_readonly` identique à `QuoteApproval_readonly` (UPDATE / DELETE refusés sauf `garagepro.sync = 'on'`).
- `Setting.diagnosticFee` (millimes HT, nullable = pas de frais proposés), `Setting.requireSafetyWaiver` (défaut true), `Setting.autoWaitingParts` (défaut true).
- `WorkOrderLine.isAnnouncedFee` (défaut false : toutes les lignes existantes inchangées, sans UPDATE).
- `WorkOrderPartNeed.workOrderLineId` (nullable, index).
- Aucun backfill (colonnes nullables ou avec défaut neutre). Bloc final `_sync_log_trg` identique à `24_accueil` (pose la sync sur `PromiseRevision`).

## 2. Refus de devis

- **Frais annoncés** (`isAnnouncedFee`, main-d'œuvre seulement) : ligne automatique « Frais de diagnostic » à la création de l'ordre quand `Setting.diagnosticFee` est réglé et que la case (cochée par défaut) de la réception est laissée ; ou ajoutée à la main (« frais annoncé au client ») **seulement avant le devis** (Réceptionné / Diagnostic, permission `manageQuotes`). Elle est **acceptée dès la création** (annoncée et acceptée à la réception, tracée dans le journal), ne fait pas partie de la décision sur le devis, et n'est jamais comptée comme « travaux acceptés » (pas de passage en réparation, devis toujours INITIAL). Le devis imprimé et le portail affichent « Frais annoncés à la réception, dus même en cas de refus ».
- **Refus** : par le client (portail, accord équipe tout refusé) ou par le garage (`QUOTE_SENT / WAITING_CUSTOMER → QUOTE_REFUSED`, motif obligatoire) : les lignes en attente passent REFUSED (conservées pour la relance du Lot 5), le devis ouvert passe REFUSED, réservations des lignes **et** réservations faites à la main pour l'ordre libérées (`releaseAllFor`). Facture = lignes acceptées = **frais annoncés seulement**. Rien à facturer → la livraison n'exige pas de facture et l'ordre se clôture à la livraison.
- **Remontage** : case « Véhicule remonté » au passage `QUOTE_REFUSED → READY` (enregistrée dans l'événement). Contrôle qualité complet gardé (décision du propriétaire).
- **Décharge sécurité** : si une ligne `SAFETY` est refusée, page imprimable « Décharge de sécurité » (lignes refusées, texte, nom, date, signature sur papier). Au passage à *Prêt*, case « Décharge signée par le client (papier) » obligatoire (réglage `requireSafetyWaiver`, nouveaux ordres seulement), nouvelle permission `recordSafetyWaiver` (ADMIN, MANAGER, RECEPTION). Enregistrée comme événement (lignes couvertes) + journal. La signature sur tablette viendra avec la table `Signature` du Lot 4.

## 3. Retards (date promise)

- `updateMeta` : changer ou effacer une date promise existante exige un **motif** (liste) et crée une `PromiseRevision` (ancienne / nouvelle date, motif, note) dans la même transaction que l'ordre et `audit()`. Première date : pas de révision (elle devient `promisedAtInitial`, comme au Lot 1).
- **Message au client** à chaque révision, par la file existante (`queueItems`, kind `PROMISE`, clé `promise:<id>`) : pas de message si le client a refusé les messages automatiques (`reminderOptOut`) ; sans téléphone / e-mail / canal configuré, la file écrit une ligne « ignoré + raison » (jamais de faux envoi). `notified` = message mis en file vers un vrai canal ; le statut réel reste dans *Historique des envois*.
- Fiche : historique des révisions (date, motif, envoyé ou non). Portail : nouvelle date avec un **libellé client** du motif (jamais la note interne).
- **KPI** « Livré à la date promise initiale » dans *Rapports* (ordres livrés de la période qui avaient une date promise : nombre, %), à côté de « à la date promise actuelle ».

## 4. Attente pièces

- `WorkOrderPartNeed.workOrderLineId` : la pièce manquante est rattachée à une ligne de l'ordre (choix dans le formulaire).
- **Date prévue** : chaque changement (y compris la première date) crée une `PromiseRevision` liée au besoin (motif, PARTS par défaut) + message au client (mêmes règles que § 3). Date prévue visible sur le portail (« Pièce attendue le … »).
- **Passage automatique en `WAITING_PARTS`** (réglage `autoWaitingParts`, activé par défaut, nouveaux ordres) : quand une ligne **acceptée** attend une pièce (besoin ouvert lié à la ligne) — à l'accord (au lieu de *En réparation*) ou à l'ajout du besoin pendant la réparation. Événement marqué automatique. En ligne avec un hub, l'accord du portail ne touche toujours pas l'ordre (Lot 2).
- **Décision** « Le client garde… / laisse le véhicule » ou « restituer et revenir » : boutons dans *Pièces manquantes* (permission `manageRepairFollowUp`), événement + journal, avec « attente imputable au garage » (oui par défaut).
- **Bon de réception** (audit n° 13, A-12) : à la réception d'une pièce, les besoins ouverts de cette pièce (liés à ce bon d'abord, puis les plus anciens) passent « reçue », la quantité est réservée pour l'ordre (ou complète la réservation de la ligne du devis), événement « pièce reçue » sur l'ordre.
- Audit n° 14 en partie : nouvelle permission `managePartNeeds` (ADMIN, MANAGER, RECEPTION, STOREKEEPER) pour mettre à jour une pièce manquante (en plus de `manageRepairFollowUp`).

## 5. Gardiennage (point 5, règle pour le Lot 4)

Rien n'est facturé au Lot 3. Ce que le Lot 4 lira : périodes `WAITING_PARTS` (événements `STATUS_CHANGED` horodatés), décision « garder / restituer » et « imputable au garage » (événement), dates prévues et révisions des pièces (`PromiseRevision`). Règle notée : pas de gardiennage pendant une attente pièces imputable au garage ni quand le véhicule a été restitué.

## 6. Interface, droits, i18n, tests

- Fenêtre de statut : case « Véhicule remonté », case « Décharge signée » + lien d'impression ; formulaire *Diagnostic & planning* : motif / note si la date promise change ; bloc *Retards* (révisions) ; pièces manquantes : ligne liée, motif de la date, décision garder / restituer ; *Paramètres › Parcours atelier* : frais de diagnostic, décharge, attente pièces automatique ; réception : case frais de diagnostic. Tout en fr / ar / en.
- Permissions : `recordSafetyWaiver`, `managePartNeeds` (MATRIX, `PERMISSION_GROUPS`, libellés fr/ar/en).
- Tests base : refus → facture limitée aux frais annoncés (portail et garage), livraison sans rien à facturer, décharge exigée, chaque changement de date = une révision + un message (opt-out, sans canal), date pièce sur le portail, passage auto en attente pièces, bon de réception → besoin reçu + réservation, KPI sur un jeu de test ; unitaires : KPI, règles pures ; hub : `PromiseRevision` dans les deux sens, non modifiable, migration 27 rejouée deux fois.

## 7. Contradictions avec le code réel (règle 13) et choix faits

1. **Frais annoncés et accord par ligne (Lot 2)** : une ligne n'est facturable que si elle est APPROVED. Les frais annoncés sont donc acceptés à la création (annonce à la réception), exclus du devis et de la règle « au moins une ligne acceptée » ; ajout manuel limité à avant le devis pour qu'on ne puisse pas facturer après coup une ligne refusée.
2. **Refus fait par le garage** (statut à la main) : pas de `QuoteApproval` (ce serait une fausse preuve du client) ; lignes et devis REFUSED + motif dans l'événement et le journal.
3. **Livraison d'un refus sans frais** : la règle du Lot 1 exige une facture ; sans ligne facturable il n'y a rien à facturer → pas de blocage, clôture à la livraison.
4. **`reminderOptOut`** ne visait que les rappels d'entretien (les messages de service partent toujours). Consigne reçue : le respecter pour les messages de date ; le message n'est donc pas envoyé à un client qui a refusé les messages (révision notée « non notifié »).
5. **« notifié oui/non »** sur une ligne en ajout seul : écrit au moment de la révision (= mis en file vers un vrai canal) ; l'état réel de l'envoi est dans `Notification` (clé `promise:<id>`).
6. **Décharge signée** : pas encore de table `Signature` (Lot 4) → papier imprimé + case « signée » tracée.
7. **Passage automatique en attente pièces** : seulement pour une ligne acceptée liée à un besoin ouvert, et pas de retour automatique en réparation (fait à la main à l'arrivée de la pièce, signalée sur l'ordre).
