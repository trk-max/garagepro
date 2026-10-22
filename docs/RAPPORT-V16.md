# RAPPORT V16 — Parcours atelier traçable

## Résumé pour le propriétaire (les 5 lots)

Tout est sur la branche `feat/v16-consolidation` : **rien n'est fusionné dans `main`, rien n'est poussé, `npm run db:cloud` n'a jamais été lancé, la base du garage et Supabase n'ont jamais été touchées.** Les essais ont été faits sur des bases jetables `gp_test_v16l1*` à `gp_test_v16l5*`. Les anciens ordres (ouverts avant chaque migration) gardent leur ancien comportement ; les nouvelles règles valent pour les nouveaux ordres.

- **Lot 1 — Statuts et motifs** : 3 statuts en plus (*Attente client*, *Devis refusé*, *Clôturé*) ; un droit par passage (le mécanicien ne livre plus et n'annule plus) ; motif obligatoire pour annuler, refuser, renvoyer en atelier ; livraison seulement avec une facture soldée (ou dérogation motivée d'un responsable) ; clôture automatique quand c'est payé ; plus aucune modification d'un ordre sans trace dans le journal ; message « véhicule prêt » par la file des messages.
- **Lot 2 — Devis et accord** : devis numérotés et versionnés (D2026-…), copie figée + empreinte ; le client accepte ou refuse **ligne par ligne** (portail ou téléphone / sur place, jamais le mécanicien) ; preuve de l'accord non modifiable ; une ligne acceptée ne se supprime plus ; un supplément = un nouveau devis ; on ne facture que ce qui est accepté ; la pièce sort du stock à l'accord (réservée avant).
- **Lot 3 — Refus, retards, pièces** : frais de diagnostic annoncés à la réception (seuls facturés si le devis est refusé) ; décharge de sécurité si une ligne *Sécurité* est refusée ; chaque changement de date promise = un motif + une trace + un message au client ; date de la pièce visible par le client ; passage automatique en *Attente pièces* ; KPI « livré à la date promise initiale ».
- **Lot 4 — Réception, restitution, argent** : réception signée sur tablette (figée, verrouillée), plafond d'autorisation, bon de restitution signé avant la livraison, facture émise impossible à modifier (même en SQL), avoirs AV-…, paiements datés, anti double clic, annulation de paiement motivée, acompte = vrai paiement, gardiennage (jamais pendant une attente imputable au garage), relances J+7/15/30, balance âgée.
- **Lot 5 — Qualité, suivi, pilotage** : contrôle qualité avec km d'essai et points du garage, cause et compteur de reprise ; retour atelier proposé sous 30 jours (main-d'œuvre de reprise à 0 DT par défaut) ; inspection rouge / orange / vert avec photo, un point rouge / orange devient une ligne du devis, visible par le client ; enquête de satisfaction J+3, relance des travaux refusés à 30 / 90 jours (consentement respecté), alerte des notes ≤ 3 ; bloc *Pilotage* dans les rapports ; pointage par nature et par ligne.

**Ordre de mise en production (une seule fois pour les 5 lots)** : `npm install` → `npm run db:cloud` (migrations 25 à 29) **avant** le `git push` → **tout de suite** au garage : fermer puis relancer `start-hub.cmd` → `npm run check` → `git push` → vérifier le déploiement Vercel. Sans hub : `npx prisma db execute --file prisma/migrations/<NN_nom>/migration.sql --schema prisma/schema.prisma` pour 25, 26, 27, 28 puis 29, dans cet ordre. Les vérifications à la main des 5 lots sont regroupées à la fin de ce rapport (§ « Vérifications à la main — les 5 lots »).

## Lot 1 — Statuts, motifs et trous d'audit

Branche `feat/v16-consolidation`. Plan suivi : [PLAN-V16-LOT1.md](PLAN-V16-LOT1.md) (décisions du propriétaire du 22/10/2026). Rien n'a été fusionné dans `main`, rien n'a été poussé, `db:cloud` n'a pas été lancé.

### 1. Ce qui a été fait

1. **3 nouveaux statuts** : `WAITING_CUSTOMER` (attente client), `QUOTE_REFUSED` (devis refusé), `CLOSED` (clôturé). Tous les passages existants sont gardés ; ajoutés : devis → attente client / refus, attente client → devis / refus, refus → prêt, annulation depuis tout statut non final, livré → clôturé.
2. **Une permission par passage** (`server/workflow.ts`, `transitionPermission`), réglable par employé : `manageQuotes`, `cancelWorkOrder`, `deliverWorkOrder`, `deliverWithBalance`, `closeWorkOrder` (nouvelles) ; `useWorkshop`, `manageRepairFollowUp` (existantes). Contrôle **côté serveur** dans `changeStatusTx`, pour tous les ordres (audit n° 1). `createInvoice` donné aussi à RECEPTION et MANAGER.
3. **Motif obligatoire** (3 à 500 caractères) : annulation, devis refusé, retour en atelier depuis le contrôle qualité ou depuis *Prêt*, et — pour les nouveaux ordres — passage en travaux depuis un devis (ou l'assurance) sans accord enregistré (règle provisoire en attendant l'accord tracé du Lot 2). Motif dans `WorkOrderEvent.data.reason` et dans le journal ; retiré des événements envoyés au portail client.
4. **Non-rétroactivité** : colonne `WorkOrder.workflowV16` (false pour les ordres existants, true pour les nouveaux). Les règles « travaux sans devis » et « livraison » ne s'appliquent qu'aux nouveaux ordres ; droits et motifs s'appliquent à tous.
5. **Livraison** (nouveaux ordres, réglage `requirePaidBeforeDelivery` activé par défaut) : refusée sans facture ou avec un reste dû (acompte de la réception déduit) ; dérogation `deliverWithBalance` + motif, enregistrée dans l'événement (`override`, `block`, `balanceDue`) et le journal.
6. **Clôture automatique** : un ordre livré dont la facture est soldée (paiements + acompte ≥ total) passe en `CLOSED`, à la livraison si c'est déjà payé, sinon au paiement qui solde (`closeIfSettled`, même transaction). Clôture manuelle possible seulement si soldé.
7. **Travaux sans devis** : `RECEIVED / DIAGNOSIS → IN_PROGRESS` refusé pour les nouveaux ordres sauf réglage `allowWorkWithoutQuote` (désactivé par défaut).
8. **Devis refusé → Prêt** : contrôle qualité complet exigé (même règle que les autres passages à *Prêt*).
9. **Lignes annulées** : une ligne qui existait au dernier accord connu (le plus récent entre `quoteApprovedAt`, l'accord en ligne et un passage devis/assurance → travaux) est annulée avec motif (`voidedAt`, `voidReason`, `voidedById`) au lieu d'être supprimée ; pièces rendues au stock une seule fois ; exclue des totaux, facture, devis imprimé, prise en charge, portail client et entreprise, rentabilité, rapports, agenda, compétences, showroom, garanties, temps facturé. Visible barrée sur la fiche avec son motif.
10. **Contrôle qualité remis à zéro** quand on ajoute / retire une ligne ou applique un forfait (audit n° 4).
11. **Journal (`audit()` dans la même transaction)** : `updateMeta` (avant → après, dont la date promise), `addLine`, `removeLine` (suppression ou annulation), `applyPackage`, `removeMedia`, `setMediaVisibility`, `approveQuoteByCustomer` (IP, navigateur, montant, canal PORTAL ; écriture conditionnelle : un seul accord en cas de double clic, audit n° 7), `customerMessage` (IP), `notifyVehicleReady`, réglages du parcours.
12. **« Véhicule prêt »** (audit n° 9) : passe par la file des messages (`queueItems` / `deliverPending` de `server/reminders.ts`, nouveau `kind = READY`), avec statut, erreur, nouvel essai et l'historique *Notifications* ; un seul message par passage à *Prêt* ; avec un hub, la copie en ligne met en file et le hub envoie.
13. **Date promise initiale** (`promisedAtInitial`) remplie à la création de l'ordre (et à la réservation en ligne qui passe par la même fonction), ou à la première date saisie ; affichée barrée sur la fiche quand la date a changé.
14. **Interface** : fenêtre « Changer le statut… » (seulement les passages permis, motif quand il faut, « livrer quand même » pour un responsable, message clair sinon) ; bouton *Étape suivante* qui ouvre la même fenêtre quand un motif ou un contrôle est nécessaire ; atelier mobile limité aux passages permis (motif dans une fenêtre) ; libellés, couleurs, étapes et filtres des 3 statuts en fr / ar / en ; *Paramètres › Parcours atelier* (2 interrupteurs) ; *À traiter* : « Devis en attente de la décision du client », « Véhicules livrés sans facture soldée (dérogation) » ; journal : filtres *Lignes des ordres*, *Photos des ordres*, *Messages des clients*.
15. Données de démonstration (`scripts/demo-data`) mises au nouveau parcours : historique marqué « avant V16 », ordres d'exemple en attente client, devis refusé, ligne annulée, prêt avec reste dû.

### 2. Fichiers modifiés / créés

**Créés** : `prisma/migrations/25_workflow_v16/migration.sql`, `src/components/garage/status-dialog.tsx`, `src/lib/i18n/v16-fr.ts`, `v16-ar.ts`, `v16-en.ts`, `tests/workflow-v16.test.ts`, `tests/workflow-v16.db.test.ts`, `docs/RAPPORT-V16.md`, `docs/media/v16/lot1/*`.

**Modifiés — fichiers partagés avec d'autres modules** (à surveiller lors des fusions) : `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/i18n/fr.ts` / `ar.ts` / `en.ts` (statuts, erreurs, branchement `v16`), `src/lib/i18n/v103-*` (libellés des permissions), `src/lib/i18n/v7-*` (type de message READY, filtres du journal), `src/lib/i18n/todo-*`, `src/lib/todo.ts`, `src/server/workflow.ts`, `src/server/work-orders.ts`, `src/server/invoices.ts`, `src/server/portal.ts`, `src/server/reminders.ts` (paramètre `db` facultatif de `queueItems`), `tests/hub-sync.test.ts`.

**Modifiés — autres** : `src/actions/work-orders.ts`, `workshop.ts`, `portal.ts`, `repair-order.ts` ; `src/server/customer-notifications.ts`, `media.ts`, `repair-order.ts`, `todo.ts`, `todo-details.ts`, `accueil.ts`, `agenda.ts`, `calendar.ts`, `company-portal.ts`, `contracts.ts`, `dashboard-v10.ts`, `follow-up.ts`, `labor.ts`, `overview-orders.ts`, `parts.ts`, `portal-session.ts`, `profit.ts`, `quality.ts`, `reports.ts`, `showroom.ts`, `skills.ts`, `warranties.ts` ; pages `work-orders/[id]` (+ `quote`, `prise-en-charge`), `atelier`, `settings`, `suivi/vehicule` ; composants `badges`, `status-stepper`, `timeline`, `warranty`, `settings-repair-order`, `recent-orders`, `todo-icons` ; tests existants adaptés au nouveau parcours (`permissions`, `cancel-race`, `agenda.db`, `stock.db`, `team.db`, `warranty.db`, `audit-v16/reproductions.audit.ts`) ; `scripts/demo-data/demo.run.ts` ; `README.md`, `docs/AUDIT-V16.md`.

### 3. Migration `25_workflow_v16`

- `ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS` : `QUOTE_REFUSED`, `WAITING_CUSTOMER`, `CLOSED` (jamais utilisées dans le même fichier).
- `Setting.allowWorkWithoutQuote` (false), `Setting.requirePaidBeforeDelivery` (true).
- `WorkOrder.promisedAtInitial` (nullable) — **backfill** = `promisedAt` pour les lignes vides seulement, écrit avec `garagepro.sync = 'on'` (valeur précédente restaurée) : non noté dans `_sync_log`, donc il ne peut pas écraser une modification faite de l'autre côté.
- `WorkOrder.workflowV16` : ajoutée avec `DEFAULT false` (les ordres existants reçoivent false **sans UPDATE**, `updatedAt` inchangé, rien dans le journal de sync), puis défaut passé à `true` pour les nouveaux ordres.
- `WorkOrderLine.voidedAt`, `voidReason`, `voidedById` (nullables).
- Bloc final des triggers `_sync_log_trg` identique à `24_accueil` (aucune nouvelle table : il ne change rien ici).
- Additive, rien de supprimé ni renommé ; rejouée deux fois sans erreur (vérifié par `verify-migrations` et `test:hub`).

### 4. Tests et résultats (chiffres réels, base jetable `gp_test_v16l1*`)

| Vérification | Résultat |
|---|---|
| `npx prisma generate` | OK (client 6.19.3) |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` | 54 fichiers, **523 tests réussis**, 11 ignorés (tests base / hub sans variable) |
| `npm run test:db` (`TEST_DB_NAME=gp_test_v16l1`) | 28 fichiers, **221 tests réussis** (dont 20 nouveaux dans `workflow-v16.db.test.ts`) |
| `npm run test:hub` (`TEST_HUB_DB_PREFIX=gp_test_v16l1_hub`) | **12 tests réussis** (dont « V16 : migration 25 rejouée deux fois sans journaliser son backfill ; nouveaux statuts et lignes annulées dans les deux sens ») |
| `node scripts/verify-migrations.mjs … gp_test_v16l1_mig` | 26 migrations appliquées, la 25 rejouée sans erreur ; structure identique au schéma Prisma |
| Suite d'audit `tests/audit-v16` (`gp_test_v16l1_audit`) | **26 réussies** (30 avant : A-01, A-04, A-07, A-09 inversés et déplacés dans `test:db`) |
| `npx next build` | compilé sans erreur |

**Tests ajoutés** : matrice transitions × rôles (9 rôles), accès sur mesure, motifs, non-rétroactivité, contrôle de livraison, étapes du portail, traductions (unitaires, 16 tests) ; base : droits (A-01), annulation sans motif refusée, devis refusé → contrôle qualité complet, retour atelier avec motif, travaux sans devis (réglage, ancien ordre), accord daté, ancien ordre livré normalement jusqu'à *Livré*, date promise initiale, livraison sans facture refusée (A-02), solde dû / dérogation refusée à la réception / motif / trace / clôture au paiement, acompte déduit → clôture immédiate, réglage désactivé, ligne annulée après accord (totaux, facture, stock rendu une fois, suppression d'une ligne ajoutée après), annulation d'ordre après ligne annulée, CQ remis à zéro par une ligne (A-04), double accord portail (A-07), « véhicule prêt » en file avec statut et erreur (A-09), journal de chaque action, motif jamais sur le portail.

**Contrôle des tests** (code de contrôle retiré temporairement, puis remis — `git checkout`, 20/20 ensuite) :
- contrôle de permission du passage retiré → `workflow-v16.db.test.ts` : **1 échec / 19 réussis** (A-01 : le mécanicien livre et annule) ;
- contrôle de livraison (facture / solde) retiré → **2 échecs / 18 réussis** (A-02 et « solde dû … dérogation … clôture »).

**Vérification dans le navigateur** (`next start -p 3300` depuis la branche, base de démo `gp_test_v16l1_demo`, comptes de test) : mécanicien → fenêtre de statut avec seulement « En réparation » + motif, ni annuler ni livrer ; accueil → livraison refusée « Reste à payer : 36,367 DT (acompte déduit) », bouton bloqué, « Seul un responsable peut livrer par dérogation » ; chef d'atelier → « Livrer quand même » + motif → livré, historique « Livré par dérogation (reste dû : 36,367 DT) » + motif ; ligne annulée barrée avec date et motif, totaux sans elle ; liste des ordres et fiche en arabe avec « في انتظار الحريف », « تقدير مرفوض », « مغلق » ; « À traiter » avec les deux nouvelles lignes ; *Paramètres › Parcours atelier* présent. Captures : `docs/media/v16/lot1/`.

### 5. Mise en production

- **En ligne + garage (hub)** — dans cet ordre, sans attendre entre les étapes :
  1. `npm run db:cloud` **avant** le `git push` (migration 25 sur la base en ligne) ;
  2. **tout de suite** au garage : fermer puis relancer `start-hub.cmd` (le hub applique la migration à la base du PC) ;
  3. `git push`, puis vérifier le déploiement Vercel.
  Raison : si l'en-ligne écrit un nouveau statut avant que le PC du garage le connaisse, la ligne de sync échoue (20 essais) puis est abandonnée.
- **Sans hub** : `npx prisma db execute --file prisma/migrations/25_workflow_v16/migration.sql --schema prisma/schema.prisma`

### 6. Points à vérifier à la main

1. *Paramètres* (administrateur) › **Parcours atelier** : les deux cases (travaux sans devis décochée, livrer seulement avec facture soldée cochée) ; enregistrer.
2. Avec un compte **mécanicien** : fiche d'un ordre *Prêt* › **Changer le statut…** : seul « En réparation » (avec motif) est proposé ; pas d'annulation, pas de livraison. Atelier mobile (*Atelier*) : mêmes boutons techniques.
3. Avec l'**accueil** : ordre *Prêt* facturé avec un reste dû › **Étape suivante : Livré** : message « Reste à payer … (acompte déduit) », bouton *Valider* grisé.
4. Avec le **chef d'atelier** : même ordre › cocher « Livrer quand même », saisir un motif › *Valider* : statut *Livré* ; *Historique* : « Livré par dérogation (reste dû …) » et le motif.
5. Encaisser le reste sur la facture (*Factures* › la facture › *Encaisser*) : l'ordre passe tout seul en **Clôturé**.
6. Nouvel ordre › essayer *Changer le statut…* depuis *Réceptionné* : « En réparation » n'est pas proposé ; passer par *Devis envoyé*, puis *En réparation* avec un motif.
7. Ordre en *Devis envoyé* › *Attente client* puis *Devis refusé* (motif) › valider le contrôle qualité › *Prêt*.
8. Ordre accepté (en réparation) › icône ⊘ d'une ligne ancienne › motif : ligne barrée, totaux recalculés ; une ligne ajoutée après l'accord se supprime normalement (corbeille).
9. Portail client (`/suivi`, plaque + code) d'un ordre annulé / refusé : le nouveau statut s'affiche, **jamais le motif**.
10. *Journal* (administrateur) : filtres *Lignes des ordres*, *Photos des ordres*, *Messages des clients* ; lignes `workOrder.update` (date promise avant → après), `workOrder.quoteApprovedByCustomer` (IP).
11. *Notifications* (historique des envois) : après un passage à *Prêt*, une ligne « Véhicule prêt » avec son statut (envoyé / échec + erreur / ignoré + raison).
12. Interface en **arabe** : liste des ordres (filtres des 3 statuts), fiche d'un ordre refusé, fenêtre de statut (sens RTL).
13. *À traiter* : « Devis en attente de la décision du client », « Véhicules livrés sans facture soldée (dérogation) ».
14. *Équipe › Accès* d'un employé : les 5 nouveaux droits apparaissent dans le groupe *Atelier* et se règlent par employé.

### 7. Ce qui n'a pas été fait (et pourquoi)

- **Lots 2 à 5** : non commencés (le prompt demande de s'arrêter après le Lot 1). En particulier, l'« accord enregistré » reste provisoire : motif + date au passage en travaux ; les lignes annulées se basent sur la date du dernier accord connu.
- **Problème n° 3** (garantie liée à la livraison) : en partie — une livraison sans facture n'est plus possible sans dérogation tracée ; la garantie reste créée à la livraison (et pas à la facture), y compris en cas de dérogation (A-03 reste reproduit).
- **Problème n° 27** (acompte) : en partie — l'acompte compte dans le contrôle de livraison et la clôture, mais il **n'est toujours pas un vrai paiement** (Lot 4). Conséquence visible : un ordre peut être *Clôturé* alors que sa facture reste « Émise » / « Partiellement payée » dans la liste des factures (reste = l'acompte).
- **Problème n° 36** (journal en arabe) : en partie — nouveaux filtres traduits ; les noms de champs / valeurs bruts du détail « avant → après » restent non traduits.
- **Langue du client** : pas de langue enregistrée pour le client ; le message « véhicule prêt » part en français (comme les autres rappels clients), plus dans la langue de l'employé.
- **« Livrés sans facture soldée »** dans *À traiter* : seulement les ordres V16 (sinon tout l'historique des anciens ordres livrés sans facture apparaîtrait).

### À savoir avant la mise en ligne

- Le **mécanicien ne peut plus livrer ni annuler** (par défaut) ; l'**accueil et le chef d'atelier peuvent facturer**. Un droit particulier se rend par employé dans *Équipe › Accès*.
- Avec le hub, une facture ne peut être émise **qu'au garage** : livrer **depuis l'en-ligne** un nouvel ordre non facturé demande une dérogation d'un responsable.
- Les **anciens ordres** gardent l'ancien comportement pour le devis et la livraison, mais les **droits et motifs** s'appliquent à tous (correction de sécurité).
- Le message « véhicule prêt » n'est plus envoyé par la copie en ligne quand un hub existe : il est mis en file et c'est le hub qui l'envoie (comme les rappels).
- Incident pendant la vérification : l'outil d'aperçu du navigateur a lancé quelques secondes `next dev -p 3100` **dans le dossier principal** (fichier `.claude/launch.json` du dossier principal) ; arrêté aussitôt, aucun fichier de `.next` du dossier principal modifié (vérifié), client Prisma du dossier principal inchangé, hub du port 3000 jamais arrêté. Le serveur de vérification a ensuite été lancé depuis la branche sur le port 3300 avec la base de démo.


---

## Lot 2 — Devis versionné et accord tracé ligne par ligne

Branche `feat/v16-consolidation` (suite du Lot 1). Plan suivi : [PLAN-V16-LOT2.md](PLAN-V16-LOT2.md) (aucune question bloquante : les choix ci-dessous sont les plus prudents). Rien n'a été fusionné dans `main`, rien n'a été poussé, `db:cloud` n'a pas été lancé.

### 1. Ce qui a été fait

1. **Devis versionné** (`src/server/quotes.ts`, `src/lib/quote.ts`) : « Devis envoyé » crée une `Quote` (numéro `D2026-0001` par `Sequence` `quote-AAAA` + `assertCanNumberDocuments`, version 1, 2…, `INITIAL` ou `SUPPLEMENT`, validité 15 jours) avec la copie figée des lignes `PENDING` (nature, priorité, état de la pièce, montants, totaux HT / TVA / timbre / TTC ; pour un supplément : ancien total, supplément, nouveau total) et son empreinte **SHA-256** (JSON aux clés triées : stable malgré le réordonnancement de PostgreSQL). Renvoyer le même contenu ne crée pas de version ; un contenu changé crée une nouvelle version et l'ancienne passe `SUPERSEDED`.
2. **Numérotation en ligne avec un hub** : décision la plus sûre — **refus clair** (« Le devis se numérote au garage… »), comme les factures. Un devis numéroté plus tard par le hub aurait demandé de modifier la ligne `Quote` des deux côtés (risque d'écrasement « le plus récent gagne »). L'accord du client en ligne et l'accord téléphonique sur un devis déjà envoyé restent possibles en ligne.
3. **Accord tracé** : `QuoteApproval` **en ajout seul** (trigger `QuoteApproval_readonly`, identique à celui d'`AuditLog`, qui laisse passer la synchronisation) : décision `APPROVED / PARTIAL / REFUSED`, lignes acceptées et refusées, montant TTC accepté, nom, contact, canal, employé (vide = portail), IP, navigateur, note, empreinte du devis accepté. Écrit dans la même transaction que le statut des lignes, le statut du devis, l'événement et `audit()` ; double clic = une seule décision (verrou + mise à jour conditionnelle).
4. **Portail** (`/suivi/vehicule`) : accepter / refuser par ligne, total recalculé en direct, nom obligatoire, session portail + limite (10 décisions / heure / ordre), devis expiré ou remplacé refusé. `approveQuoteByCustomer` = « tout accepter » par le même chemin (ordres V16) ; ordres d'avant la V16 : accord en un clic du Lot 1, inchangé.
5. **Accord par l'équipe** (téléphone, sur place, SMS, e-mail, WhatsApp) : nouvelle permission `recordQuoteApproval` (ADMIN, MANAGER, RECEPTION — **pas** MECHANIC), contrôlée par l'action **et** par le serveur ; libellés fr / ar / en dans *Équipe › Accès*. Si aucun devis ouvert ne contient les lignes en attente (ordre resté en devis depuis le Lot 1, assurance, travaux sans devis), le formulaire établit d'abord le devis (au garage seulement avec un hub). Signature sur tablette : non faite (Lot 4, table `Signature`) ; `signatureKey` reste vide.
6. **Après l'accord** : lignes `APPROVED` / `REFUSED`, devis décidé, `quoteApprovedAt` renseigné ; passage automatique en réparation (quelque chose d'accepté, ou supplément décidé) ou en `QUOTE_REFUSED` (tout le devis initial refusé, motif interne « Devis refusé par le client »). Un accord reçu en *Attente client* fait aussi passer en réparation (conséquence de l'accord, aucun passage manuel ajouté). **Règle de passage** des nouveaux ordres : `QUOTE_SENT / WAITING_INSURANCE → IN_PROGRESS / WAITING_PARTS` exige une décision enregistrée sur le dernier devis et au moins une ligne acceptée — la règle provisoire du Lot 1 (motif) est retirée ; la fenêtre de statut affiche le passage bloqué avec « Pas encore d'accord du client enregistré ».
7. **Hors ligne / hub** : en ligne avec un hub, la décision du client n'écrit que des lignes nouvelles (`QuoteApproval`, événement, journal) et le statut des lignes / du devis ; **ni la ligne `WorkOrder` ni le stock** (`Part`), pour ne jamais écraser une modification faite au garage. Au garage, la fiche affiche « Accord du client reçu… vous pouvez passer en réparation » ; le passage et la sortie de stock se font au garage. Si un conflit de synchronisation faisait perdre un statut de ligne, il est **rétabli depuis la preuve** (`reapplyApprovals`) au prochain changement de statut, à la facture ou au prochain accord.
8. **Lignes verrouillées** : une ligne acceptée ne se supprime plus (annulation motivée du Lot 1) ; une ligne refusée est conservée (relance au Lot 5) ; une ligne en attente se supprime, et si elle était dans le devis envoyé, ce devis passe `SUPERSEDED` (le client ne peut plus accepter un contenu qui a changé). Ligne ajoutée après l'accord = `PENDING`, bandeau « Supplément en attente d'accord du client » ; `IN_PROGRESS → QUOTE_SENT` = devis `SUPPLEMENT` avec les seules nouvelles lignes. Le technicien signale une découverte avec la note et la photo existantes ; la ligne qu'il ajoute reste en attente jusqu'à l'accord.
9. **Facture** : ordres V16 = lignes `APPROVED` non annulées seulement ; une ligne `PENDING` restante **bloque** la facture avec un message (« enregistrez la décision du client ou supprimez-les »). Ordres d'avant la V16 : inchangé (lignes refusées exclues, cas impossible avant la V16). Totaux, documents et statistiques (fiche, prise en charge, portail client et entreprise, contrats, rentabilité, rapports, compétences, temps vendu) excluent les lignes refusées ; détection d'entretien (agenda), garanties et historique showroom ne comptent que les lignes acceptées.
10. **Stock (point 8)** — décision : **réservation au devis, sortie à l'accord**, seulement pour les nouveaux ordres (colonne `stockDeferred`, réservation liée à la ligne `StockReservation.workOrderLineId`). À l'ajout : réservation atomique sur le stock **libre** (les réservations faites à la main pour cet ordre et cette pièce sont reprises d'abord), avertissement si le libre ne suffit pas (comme avant). À l'accord : sortie `WORK_ORDER`, réservation consommée, une seule fois. Refus ou suppression : réservation libérée, aucun mouvement. Annulation de l'ordre : seules les pièces vraiment sorties reviennent. **Ordres d'avant la V16 : aucun changement** (sortie à l'ajout).
11. **Messages au client** par la file existante (`queueItems` / `deliverPending`, *Historique des envois*) : `QUOTE` (« devis / supplément à valider », lien du suivi + code) à l'envoi, `QUOTE_REMINDER` (une relance après `QUOTE_WAIT_DAYS` = 3 jours sans réponse, devis encore valable) par la tâche des rappels ; avec un hub, c'est le hub qui envoie.
12. **Interface** : bloc *Devis et accords* sur la fiche (versions, statut, validité, totaux, empreinte « copie intacte », décisions : qui, quand, canal, montant, lignes acceptées / refusées, enregistré par) ; colonne *Accord* et priorité / nature / « réservée » sur chaque ligne ; *Enregistrer l'accord* (fenêtre ligne par ligne) ; *Renvoyer le devis* (pendant l'attente du client) ; devis imprimé = copie figée de la version (`?v=2`), avec version, validité, priorité, nature, supplément et empreinte ; priorité et nature dans l'ajout de ligne ; journal de l'ordre (« a envoyé le supplément D… », « décision sur le devis… »). Tout en fr / ar / en.
13. Données de démonstration : ordre accepté en partie (ligne refusée), supplément en attente, priorités et natures de pièces ; accords enregistrés par l'accueil.

### 2. Fichiers modifiés / créés

**Créés** : `prisma/migrations/26_quotes/migration.sql`, `src/lib/quote.ts`, `src/server/quotes.ts`, `src/components/garage/quote-panel.tsx`, `quote-decision-dialog.tsx`, `quote-line-choices.tsx`, `src/components/portal/quote-decision.tsx`, `tests/quotes-v16.db.test.ts`, `tests/quote-v16.test.ts`, `docs/PLAN-V16-LOT2.md`, `docs/media/v16/lot2/*`.

**Modifiés — fichiers partagés avec d'autres modules** (à surveiller lors des fusions) : `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/i18n/fr.ts` / `ar.ts` / `en.ts` (erreurs), `v16-*` (textes du lot), `v103-*` (libellé de la permission), `v7-*` (types de messages), `src/server/work-orders.ts`, `workflow.ts`, `invoices.ts`, `portal.ts`, `parts.ts`, `reminders.ts`, `tests/helpers/db.ts` (aide `agreeAll`), `tests/hub-sync.test.ts`.

**Modifiés — autres** : `src/actions/work-orders.ts`, `portal.ts` ; `src/server/agenda.ts`, `company-portal.ts`, `contracts.ts`, `labor.ts`, `overview-orders.ts`, `profit.ts`, `reports.ts`, `showroom.ts`, `skills.ts` ; pages `work-orders/[id]` (+ `quote`, `prise-en-charge`), `atelier`, `suivi/vehicule` ; composants `document-view`, `line-adder`, `status-dialog`, `timeline`, `warranty` ; tests existants adaptés au nouvel accord (`workflow-v16`, `workflow-v16.db`, `agenda.db`, `cash.db`, `journal.db`, `legal-kit.db`, `profit.db`, `stock.db`, `audit-v16/reproductions.audit.ts`) ; `scripts/demo-data/demo.run.ts` ; `README.md`, `docs/AUDIT-V16.md`.

### 3. Migration `26_quotes`

- Types créés (jamais d'`ALTER TYPE … ADD VALUE`) : `QuoteKind`, `QuoteStatus`, `ApprovalDecision`, `ApprovalChannel`, `LineApprovalStatus`, `LinePriority`, `PartCondition`.
- Tables `Quote` (numéro unique, version unique par ordre) et `QuoteApproval` + trigger `QuoteApproval_readonly` (refuse `UPDATE` / `DELETE` sauf `garagepro.sync = 'on'`).
- `WorkOrderLine` : `approvalStatus` (défaut `PENDING`), `priority`, `partCondition`, `quoteId` (FK `SET NULL`), `stockDeferred` (défaut false) ; `StockReservation.workOrderLineId`.
- **Backfill** : `approvalStatus` ajoutée avec `DEFAULT 'APPROVED'` → toutes les lignes existantes APPROVED **sans UPDATE** (rien dans le journal de sync), puis défaut `PENDING`. Au **premier passage seulement**, les lignes des ordres actuellement `QUOTE_SENT` sans `quoteApprovedAt` repassent `PENDING`, écrites avec `garagepro.sync = 'on'` (non journalisé, valeur restaurée). Aucun total ni comportement d'un ordre existant ne change.
- Bloc final `_sync_log_trg` identique à `24_accueil` (pose la sync sur `Quote` et `QuoteApproval`). Rejouée deux fois sans erreur.

### 4. Tests et résultats (chiffres réels, bases jetables `gp_test_v16l2*`)

| Vérification | Résultat |
|---|---|
| `npx prisma generate` | OK (client 6.19.3) |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` | 55 fichiers, **530 tests réussis**, 13 ignorés (tests base / hub sans variable) |
| `npm run test:db` (`TEST_DB_NAME=gp_test_v16l2`) | 29 fichiers, **237 tests réussis** (dont 16 nouveaux dans `quotes-v16.db.test.ts`) |
| `npm run test:hub` (`TEST_HUB_DB_PREFIX=gp_test_v16l2_hub`) | **14 tests réussis** (dont 2 nouveaux : migration 26 rejouée deux fois sans journaliser son backfill ; décision portail faite en ligne pendant que le garage est hors ligne → arrive au hub sans écraser le diagnostic, la ligne et la note ajoutés au garage ; preuve non modifiable des deux côtés) |
| `node scripts/verify-migrations.mjs … gp_test_v16l2_mig2` | 27 migrations, la 26 rejouée sans erreur ; structure identique au schéma Prisma |
| Suite d'audit `tests/audit-v16` (`gp_test_v16l2_audit`) | **26 réussies** (adaptées : accord enregistré avant facture ; A-10 / A-11 reproduits sur des ordres d'avant la V16) |
| `npx next build` | compilé sans erreur |

**Tests ajoutés** : unitaires (7) — empreinte stable quel que soit l'ordre des clés et changée par 1 millime, totaux initial / supplément, décision, montant accepté, découpage accepté / refusé, expiration, droit `recordQuoteApproval` (jamais MECHANIC), traductions ; base (16) — version 1 + empreinte recalculée depuis la base, renvoi sans changement = même version, nouvelle version et `SUPERSEDED`, accord partiel (statuts, montant exact, journal, facture), refus total → `QUOTE_REFUSED`, mécanicien refusé (`forbidden`, `statusForbidden`), travaux refusés sans accord même avec motif (`approvalRequired`), lignes verrouillées / refusée gardée / attente supprimable, facture = lignes acceptées non annulées et blocage `pendingLines`, supplément (seulement les nouvelles lignes, ancien / nouveau total, refus → retour en réparation), portail (nom, IP, navigateur, double envoi, devis changé, expiré), `QuoteApproval` non modifiable sauf sync, en ligne avec hub (ni ordre ni stock écrits, numérotation refusée, appliqué au garage), statut perdu rétabli, stock (réservé / sorti / libéré / rendu une fois, avertissement), ordre d'avant la V16 inchangé, messages « devis à valider » et relance.

**Contrôle des tests** (code retiré temporairement, puis remis — 16/16 ensuite) :
- contrôle « un mécanicien ne peut pas enregistrer d'accord » retiré de `recordStaffDecision` → `quotes-v16.db.test.ts` : **1 échec / 15 réussis** ;
- filtre « facture = lignes APPROVED » retiré de `invoiceLineWhere` → **3 échecs / 13 réussis** (accord partiel, refus total, facture = lignes acceptées).

**Vérification dans le navigateur** (`next start -p 3300` depuis la branche, base de démo `gp_test_v16l2_demo`, Edge sans interface ; serveur arrêté ensuite, hub du port 3000 jamais touché) : portail au téléphone (390 px) en **français** — devis ligne par ligne, une ligne refusée → total passé à 55,740 DT en direct, nom, validation, « Merci, votre décision est enregistrée » ; en **arabe** (sens RTL) — ordre en attente client, total 426,425 → 405,600 د.ت, décision enregistrée, l'ordre passe « الإصلاح جارٍ » et le portail affiche « قرارك بتاريخ … قُبل جزئياً ». Mécanicien : bloc *Devis et accords* visible, **pas** de bouton *Enregistrer l'accord*. Accueil : supplément en attente (bandeau), accord téléphonique ligne par ligne (canal, note), puis historique : supplément D2026-0013 v2 (déjà accepté 426,425, supplément 65,450, nouveau total 491,875, empreinte « copie intacte », « Tout accepté », contact, « enregistré par Sonia Accueil ») au-dessus du devis v1 ; ordre accepté en partie : deux lignes « Accepté » avec seulement l'icône d'annulation, ligne « Refusé » barrée sans action ; devis imprimé de la version 2 avec « Version 2 », « Déjà accepté », « Nouveau total » et l'empreinte ; historique en arabe. Captures : `docs/media/v16/lot2/`.

### 5. Mise en production

- **En ligne + garage (hub)** — dans cet ordre, sans attendre entre les étapes :
  1. `npm run db:cloud` **avant** le `git push` (migrations 25 et 26 sur la base en ligne si le Lot 1 n'y est pas encore) ;
  2. **tout de suite** au garage : fermer puis relancer `start-hub.cmd` (le hub applique les migrations à la base du PC) ;
  3. `git push`, puis vérifier le déploiement Vercel.
- **Sans hub** : `npx prisma db execute --file prisma/migrations/26_quotes/migration.sql --schema prisma/schema.prisma` (après la 25 du Lot 1).

### 6. Points à vérifier à la main

1. Nouvel ordre › ajouter 2 lignes (choisir *Priorité* et, pour une pièce, *Nature de la pièce*) › *Changer le statut… › Devis envoyé* : bloc *Devis et accords* avec D…-… version 1, empreinte « copie intacte » ; *Historique des envois* : une ligne « Devis à valider ».
2. *Changer le statut…* sur cet ordre : « En réparation » bloqué, message « Pas encore d'accord du client enregistré ».
3. Portail client au téléphone (`/suivi`, plaque + code) : refuser une ligne, le total change ; saisir le nom, *Valider ma décision* ; l'ordre passe *En réparation* (sans hub). Recommencer en arabe.
4. Avec l'**accueil** : *Enregistrer l'accord* (canal *Téléphone*, une ligne refusée, note) ; la fiche montre la décision, le montant et « enregistré par … ». Avec un **mécanicien** : le bouton n'apparaît pas.
5. Ordre accepté › ligne acceptée : seule l'annulation avec motif est proposée ; la ligne refusée n'a aucune action.
6. Ordre en réparation › ajouter une ligne : bandeau « Supplément en attente » ; *Facturer* grisé ; *Changer le statut… › Devis envoyé* → devis *Supplément* v2 (ancien total, supplément, nouveau total) ; *Imprimer le devis* de la v2.
7. Pièce de stock ajoutée à un devis : *Stock* › la pièce : « réservé » augmente, le stock ne baisse qu'à l'accord ; refuser la ligne → réservation libérée.
8. Avec le hub : accepter un devis sur le portail **en ligne** pendant que le PC du garage est déconnecté ; au retour, la fiche au garage montre « Accord du client reçu », passer en réparation (la pièce sort du stock à ce moment).
9. En ligne avec un hub : *Renvoyer le devis* depuis le site → message « Le devis se numérote au garage… ».
10. Interface en **arabe** : bloc *التقديرات والموافقات*, fenêtre d'accord, portail.

### 7. Ce qui n'a pas été fait (et pourquoi)

- **Signature sur tablette** pour l'accord : prévue avec la table `Signature` du Lot 4 (facultative ici) ; `QuoteApproval.signatureKey` est prêt.
- **Numérotation d'un devis en ligne avec un hub** : refusée (voir § 1.2) ; à revoir seulement si le garage veut envoyer des devis depuis l'extérieur.
- **Passage automatique en réparation après un accord fait en ligne avec un hub** : volontairement fait au garage (un clic, autorisé par l'accord) pour ne pas écraser une modification de l'ordre faite au garage.
- **Découverte du technicien** : pas de nouvel écran ; elle passe par la note + photo existantes et une ligne en attente.
- **Statut `EXPIRED`** : calculé à l'affichage (date de validité dépassée) ; la ligne `Quote` reste `SENT` jusqu'à une nouvelle version.
- **Problème n° 10** (montants vus par le mécanicien) : non traité (hors de l'accord ; à faire avec la refonte de la fiche).
- **Problèmes n° 11 / 12** : en partie — pour un nouvel ordre, une pièce de devis n'est réservée que sur le stock libre, de façon atomique ; la sortie à l'accord garde la règle d'avant (autorisée avec un avertissement si le stock enregistré manque) et les ordres d'avant la V16 ne changent pas.
- Devis refusé : suite du parcours (frais annoncés, décharge sécurité, relance) au Lot 3.

### À savoir avant la mise en ligne (Lot 2)

- Pour un **nouvel ordre**, plus aucun passage en réparation depuis un devis sans **accord enregistré** (portail ou *Enregistrer l'accord*) ; et la **facture refuse les lignes en attente** : un ordre lancé sans devis (réglage) ou par l'assurance doit aussi recevoir son accord avant facturation.
- Les ordres en devis ouverts depuis la mise en ligne du Lot 1 n'ont pas de devis versionné : *Enregistrer l'accord* le crée (au garage avec un hub).
- Avec le hub, **envoyer un devis se fait au garage** ; l'accord du client en ligne arrive par la synchronisation et c'est au garage qu'on passe en réparation.
- Le mécanicien n'enregistre pas d'accord par défaut ; un droit particulier se donne dans *Équipe › Accès*.


---

## Lot 3 — Refus de devis, attente client, retards, attente pièces

Branche `feat/v16-consolidation` (suite des Lots 1 et 2). Plan suivi : [PLAN-V16-LOT3.md](PLAN-V16-LOT3.md) (aucune question bloquante : les contradictions avec le code ont un choix prudent, listé au § 7 du plan et ci-dessous). Rien n'a été fusionné dans `main`, rien n'a été poussé, `db:cloud` n'a pas été lancé.

### 1. Ce qui a été fait

1. **Frais annoncés** (`WorkOrderLine.isAnnouncedFee`) : `Setting.diagnosticFee` (millimes HT, vide = aucun) proposé à la réception (case cochée par défaut) → ligne *Frais de diagnostic* **acceptée dès la création** (annonce faite à la réception, tracée dans le journal). Un autre frais annoncé (démontage…) : main-d'œuvre seulement, nouveaux ordres, **avant l'envoi du devis** (Réceptionné / Diagnostic), permission `manageQuotes` — sinon refus `announcedFeeNotAllowed`. Ces lignes ne font pas partie de la décision sur le devis et ne lancent jamais les travaux (`AGREED_WORK_LINE`) : le premier devis reste `INITIAL` et affiche à part le TTC des frais (`snapshot.announcedTtc`, absent des copies sans frais : empreintes anciennes inchangées).
2. **Devis refusé** : par le client (portail), par l'accueil (*Enregistrer l'accord*, tout refusé) ou par le garage (*Devis refusé* + motif, depuis *Devis envoyé* ou *Attente client*) → `refuseOpenQuoteTx` : lignes en attente → `REFUSED` (conservées pour la relance du Lot 5), devis ouvert → `REFUSED`, réservations des lignes **et** réservations faites à la main pour l'ordre libérées (`releaseAllFor`), journal. Un refus fait par le garage **n'écrit pas de `QuoteApproval`** (ce serait une fausse preuve du client) : motif dans l'événement et le journal. Facture = lignes acceptées = **frais annoncés seulement**. Rien de facturable : la livraison n'exige pas de facture (`deliveryBlock(..., billable: false)`) et l'ordre se clôture à la livraison (`closeIfSettled`).
3. **Remontage** : case « Véhicule remonté » au passage `QUOTE_REFUSED → READY`, enregistrée dans l'événement (`reassembled`). Contrôle qualité complet gardé (décision du propriétaire).
4. **Décharge de sécurité** : une ligne `SAFETY` refusée → page imprimable `/garage/work-orders/[id]/decharge` (fr / ar / en, lignes refusées, texte, lieu / date, deux cadres de signature). Avant *Prêt* (réglage `requireSafetyWaiver`, activé par défaut, nouveaux ordres) : case « Décharge signée par le client (papier) » obligatoire (`safetyWaiverRequired`), nouvelle permission `recordSafetyWaiver` (ADMIN, MANAGER, RECEPTION ; jamais MECHANIC) ; enregistrée comme événement (lignes couvertes) + journal `workOrder.safetyWaiver`. Une décharge couvre ses lignes (un nouveau passage à *Prêt* ne la redemande pas).
5. **Retards** : table **`PromiseRevision`** (ajout seul, trigger `PromiseRevision_readonly`, la synchronisation passe) : ancienne / nouvelle date, motif (`PARTS`, `EXTRA_WORK`, `CUSTOMER_DECISION`, `INSURANCE`, `WORKSHOP_LOAD`, `OTHER`), note interne, `notified`, clé du message. `updateMeta` : changer ou effacer une date promise existante exige le motif (`promiseReasonRequired`) et crée la révision dans la même transaction (journal `workOrder.promiseRevision`, événement) ; même minute = pas de changement (la date enregistrée est gardée) ; première date = date initiale, pas de révision.
6. **Message au client** à chaque révision par la file existante (`queueItems`, kinds `PROMISE` / `PART_DATE`, clé `promise:` / `part-date:`), envoyé après la validation (`deliverQuoteNotice`, avec un hub c'est le hub qui envoie) : jamais à un client qui a refusé les messages (`reminderOptOut`) ; sans canal ni contact, ligne « non envoyé + raison ». Libellé client du motif seulement, jamais la note.
7. **KPI** « Livrés à la date promise initiale » (et « à la date promise actuelle ») dans *Rapports* (`promiseKpi`, ordres livrés de la période qui avaient une date promise).
8. **Attente pièces** : `WorkOrderPartNeed.workOrderLineId` (choix de la ligne au signalement) ; chaque date prévue (première ou changée) = révision motivée (PARTS par défaut) + message au client ; date prévue sur le portail (« Pièce attendue le … », nom de la ligne du devis). **Passage automatique en `WAITING_PARTS`** (réglage `autoWaitingParts`, activé par défaut, nouveaux ordres) quand une ligne **acceptée** attend une pièce : à l'accord (au lieu de *En réparation*) ou au signalement pendant la réparation ; événement marqué `autoParts`. Pas de retour automatique (fait à la main quand la pièce est là). Décision « le véhicule reste au garage » / « restitué, le client reviendra » + « attente imputable au garage » (événement + journal `workOrder.partsWaitDecision`).
9. **Bon de réception → pièce manquante** (audit n° 13, A-12) : `createReceipt` passe à *Reçue* les besoins ouverts de la pièce (ceux du bon d'abord, puis les plus anciens ; seulement si la quantité reçue couvre le besoin), les rattache au bon, réserve la pièce pour l'ordre (ou complète la réservation de la ligne du devis encore en attente ; rien si la pièce de la ligne est déjà sortie), événement « pièce reçue » + journal.
10. **Magasinier** (audit n° 14, en partie) : nouvelle permission `managePartNeeds` (ADMIN, MANAGER, RECEPTION, STOREKEEPER) pour mettre à jour une pièce manquante, vérifiée par l'action **et** le serveur.
11. **Gardiennage (point 5, règle pour le Lot 4)** : rien n'est facturé au Lot 3 ; données prêtes : périodes `WAITING_PARTS` (événements `STATUS_CHANGED`), décision garder / restituer et « imputable au garage » (événement `partsWait`, `garageCaused`), dates prévues des pièces (`PromiseRevision`). Règle à appliquer au Lot 4 : pas de gardiennage pendant une attente imputable au garage ni quand le véhicule a été restitué.
12. **Interface** (fr / ar / en) : bandeaux *Devis refusé* et décharge sur la fiche, badge « Frais annoncé », case dans l'ajout de ligne, fenêtre de statut (remontage, décharge + lien d'impression), motif et note dans *Diagnostic & planning*, bloc *Changements de date* (état réel du message), pièces manquantes (ligne, motif de la date, note), bloc *Pendant l'attente des pièces*, case des frais à la réception, *Paramètres › Parcours atelier* (3 réglages), historique (révisions, pièce reçue, décharge, remontage, passage automatique), portail (nouvelle date, pièces attendues, frais annoncés), devis imprimé (frais annoncés), *Historique des envois* (2 nouveaux types).
13. Données de démonstration : frais de diagnostic réglé, ordre refusé avec frais annoncés et ligne Sécurité, date promise décalée avec motif, pièce manquante liée à une ligne avec date prévue, historique avec dates promises (KPI).

### 2. Fichiers modifiés / créés

**Créés** : `prisma/migrations/27_delays_refusal/migration.sql`, `src/lib/delays.ts`, `src/server/delays.ts`, `src/app/(garage)/garage/work-orders/[id]/decharge/page.tsx`, `tests/delays-v16.test.ts`, `tests/delays-v16.db.test.ts`, `docs/PLAN-V16-LOT3.md`, `docs/media/v16/lot3/*`.

**Modifiés — fichiers partagés avec d'autres modules** (à surveiller lors des fusions) : `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/i18n/fr.ts` / `ar.ts` / `en.ts` (erreurs), `v16-*` (bloc `lot3`), `v103-*` (2 libellés de droits), `v7-*` (2 types de messages), `src/lib/quote.ts`, `src/lib/report.ts`, `src/lib/validators.ts`, `src/server/work-orders.ts`, `workflow.ts`, `quotes.ts`, `parts.ts` (`reserveFree`, `releaseAllFor` accepte un acteur vide), `purchasing.ts` (`createReceipt`), `portal.ts`, `reminders.ts` (types de messages), `reports.ts`, `tests/hub-sync.test.ts`, `tests/audit-v16/reproductions.audit.ts`.

**Modifiés — autres** : `src/actions/follow-up.ts`, `work-orders.ts`, `repair-order.ts` ; `src/server/follow-up.ts`, `repair-order.ts` ; pages `work-orders/[id]` (+ `quote`), `work-orders/new`, `suivi/vehicule` ; composants `check-in-form`, `document-view`, `line-adder`, `repair-panels`, `report-view`, `settings-repair-order`, `status-dialog`, `timeline` ; `tests/workflow-v16.db.test.ts` (date promise changée avec motif) ; `scripts/demo-data/demo.run.ts` ; `README.md`, `docs/AUDIT-V16.md`.

### 3. Migration `27_delays_refusal`

- Type créé (jamais d'`ALTER TYPE … ADD VALUE`) : `PromiseReason`.
- Table `PromiseRevision` (FK `WorkOrder` RESTRICT ; `partNeedId` sans FK pour ne jamais devoir modifier la ligne) + trigger `PromiseRevision_readonly` (refuse `UPDATE` / `DELETE` sauf `garagepro.sync = 'on'`).
- `Setting.diagnosticFee` (nullable), `Setting.requireSafetyWaiver` (true), `Setting.autoWaitingParts` (true) ; `WorkOrderLine.isAnnouncedFee` (false) ; `WorkOrderPartNeed.workOrderLineId` (nullable, index).
- **Aucun backfill** : colonnes nullables ou avec un défaut neutre ; les ordres existants gardent exactement leur comportement (aucune ligne de frais annoncé, aucune pièce liée).
- Bloc final `_sync_log_trg` identique à `24_accueil` (pose la sync sur `PromiseRevision`). Rejouée deux fois sans erreur.

### 4. Tests et résultats (chiffres réels, bases jetables `gp_test_v16l3*`)

| Vérification | Résultat |
|---|---|
| `npx prisma generate` | OK (client 6.19.3) |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` | 56 fichiers, **539 tests réussis**, 14 ignorés (tests base / hub sans variable) |
| `npm run test:db` (`TEST_DB_NAME=gp_test_v16l3`) | 30 fichiers, **251 tests réussis** (dont 14 nouveaux dans `delays-v16.db.test.ts`) |
| `npm run test:hub` (`TEST_HUB_DB_PREFIX=gp_test_v16l3_hub`) | **15 tests réussis** (dont « V16 Lot 3 : migration 27 rejouée deux fois sans rien journaliser ; révisions de date (ajout seul) dans les deux sens ; frais annoncé et pièce liée à une ligne synchronisés ; preuve non modifiable des deux côtés ») |
| `node scripts/verify-migrations.mjs … gp_test_v16l3_mig` | 28 migrations, la 27 rejouée sans erreur ; structure identique au schéma Prisma |
| Suite d'audit `tests/audit-v16` (`gp_test_v16l3_audit`) | **25 réussies** (26 avant : A-12 corrigé, inversé et déplacé dans `test:db` ; A-13 réduit à ce qui reste) |
| `npx next build` | compilé sans erreur (nouvelle page `/garage/work-orders/[id]/decharge`) |

**Tests ajoutés** : unitaires (9) — même minute / révision nécessaire, client qui refuse les messages, KPI (première et actuelle, à l'heure pile, sans promesse), lignes à couvrir par la décharge, livraison sans rien à facturer, case de remontage, frais annoncés dans la copie figée (empreinte inchangée sans frais), droits, traductions des motifs ; base (14) — frais de diagnostic à la réception → devis INITIAL avec frais à part → refus du client → facture = 30 000 + TVA + timbre seulement ; frais annoncé à la main (pièce, mécanicien, après le devis refusés ; accord → réparation) ; refus par le garage (motif, lignes refusées gardées, devis fermé, aucune `QuoteApproval`, réservations libérées, `noLines`, remontage, livraison sans facture puis clôture) ; décharge exigée / mécanicien refusé / tracée / déjà couverte / réglage désactivé ; date promise (motif obligatoire, même minute, révision + message SMS en file avec libellé client sans note, date initiale intacte, 2ᵉ changement, effacement, ajout seul) ; client sans messages et sans canal ; pièce liée à une ligne acceptée (passage auto, révisions + messages, portail sans note) ; besoin avant l'accord (passage auto à l'accord, réglage désactivé) ; nouvelle date sur le portail ; A-12 corrigé ; réception partielle puis complète d'une ligne de devis ; magasinier / mécanicien ; décision garder / restituer ; KPI sur une période isolée (2031).

**Contrôle des tests** (code retiré temporairement, puis remis par `git checkout` — 14/14 ensuite) :
- règle « devis refusé → seuls les frais annoncés facturables » retirée (frais comptés comme accord dans `applyDecisionEffects` + refus du garage sans `refuseOpenQuoteTx`) → `delays-v16.db.test.ts` : **2 échecs / 12 réussis** ;
- « changement de date = une révision » retiré de `updateMeta` → **3 échecs / 11 réussis**.

**Vérification dans le navigateur** (`next start -p 3300` depuis la branche, base de démo `gp_test_v16l3_demo`, Edge sans interface ; serveur arrêté ensuite, hub du port 3000 jamais touché) : fiche d'un ordre refusé par téléphone (chef d'atelier) — bandeau « seuls les frais annoncés sont facturables (36,700 DT TTC) », bandeau décharge, ligne « Frais annoncé » acceptée, lignes refusées barrées ; décharge imprimable (nom, véhicule, ligne Sécurité, texte, cadres de signature) ; contrôle qualité validé puis *Étape suivante : Prêt* → fenêtre avec « Véhicule remonté » et la case décharge (bouton *Valider* grisé tant qu'elle n'est pas cochée) → *Prêt*, « Décharge de sécurité signée (papier) le … », total 36,700 DT ; accueil — date promise changée sans motif → « Choisissez le motif du changement de date promise », avec motif *Travaux supplémentaires* + note → bloc *Changements de date* (2 révisions, « client non prévenu (— : non envoyé) » car aucun canal SMS / e-mail sur la base de démo) ; *Historique des envois* (administrateur) : lignes « Date promise modifiée » / « Date prévue d'une pièce » avec le libellé client et sans la note ; chef d'atelier — pièce manquante signalée pour la ligne acceptée avec une date → l'ordre passe tout seul *Attente pièces* (« Passage automatique : une ligne acceptée attend une pièce ») ; portail au téléphone (390 px) en **français** et en **arabe** (RTL) : « Nouvelle date de livraison : 27/10/2026 17:45 (travaux supplémentaires) » / « موعد التسليم الجديد … (أشغال إضافية) », « Pièce attendue le 27 oct. 2026 : Amortisseur AV », jamais la note interne ; *Rapports* (3 mois) : « Livrés à la date promise initiale 35 / 53 (66 %) », « à la date promise actuelle 53 / 53 (100 %) » ; *Paramètres › Parcours atelier* : les 3 nouveaux réglages. Captures : `docs/media/v16/lot3/`.

### 5. Mise en production

- **En ligne + garage (hub)** — dans cet ordre, sans attendre entre les étapes :
  1. `npm run db:cloud` **avant** le `git push` (migration 27, et 25 / 26 si les Lots 1 et 2 n'y sont pas encore) ;
  2. **tout de suite** au garage : fermer puis relancer `start-hub.cmd` (le hub applique les migrations à la base du PC) ;
  3. `git push`, puis vérifier le déploiement Vercel.
- **Sans hub** : `npx prisma db execute --file prisma/migrations/27_delays_refusal/migration.sql --schema prisma/schema.prisma` (après `25_workflow_v16` puis `26_quotes`).

### 6. Points à vérifier à la main

1. *Paramètres › Parcours atelier* (administrateur) : saisir les *Frais de diagnostic* (ex. 30), laisser « Exiger la décharge » et « Attente pièces automatique » cochés ; enregistrer.
2. *Nouvel ordre* : la case « Frais de diagnostic annoncés au client : 30,000 DT HT » est cochée ; créer → la fiche montre la ligne *Frais de diagnostic* « Frais annoncé », *Accepté*.
3. Ajouter 2 lignes (dont une *Priorité : Sécurité*), *Devis envoyé*, *Imprimer le devis* : ligne « Frais annoncés à la réception (dus même en cas de refus) ».
4. Portail client (`/suivi`) : tout refuser → l'ordre passe *Devis refusé* ; la fiche affiche « seuls les frais annoncés sont facturables » ; *Facturer* → facture des seuls frais.
5. *Imprimer la décharge* (bandeau rouge) : nom, véhicule, ligne Sécurité ; contrôle qualité validé, *Étape suivante : Prêt* → cases « Véhicule remonté » et « Décharge signée » (avec un **mécanicien** : message « Seul l'accueil ou un responsable… »).
6. Un autre ordre en devis → *Changer le statut… › Attente client* puis *Devis refusé* + motif : lignes *Refusé* gardées ; *Stock* : la réservation de la pièce du devis est libérée ; sans frais annoncés → livraison sans facture → *Clôturé*.
7. *Diagnostic & planning* : changer la date promise sans motif → message ; avec motif → bloc *Changements de date* ; *Historique des envois* : « Date promise modifiée » (envoyé, ou « non envoyé » + raison sans SMS / e-mail configuré).
8. Ordre en réparation → *Signaler une pièce manquante* liée à une ligne acceptée, avec une date → l'ordre passe *Attente pièces* ; changer la date (motif) → nouvelle révision + message ; portail : « Pièce attendue le … » en français et en arabe.
9. *Pendant l'attente des pièces* : « Véhicule restitué, le client reviendra » → historique « attente pièces : véhicule restitué » (+ « imputable au garage » si coché).
10. *Achats* : bon de commande puis bon de réception de la pièce manquante → la pièce passe *Reçue*, réservée pour l'ordre (*Pièces réservées* de la fiche), historique « pièce reçue … (bon BR…) ».
11. Compte **magasinier** : mettre à jour une pièce manquante (statut, date) depuis la fiche d'un ordre.
12. *Rapports* : lignes « Livrés à la date promise initiale » et « … actuelle ».
13. Client marqué « refuse les rappels » : changer la date promise → la révision dit « client non prévenu », aucune ligne dans *Historique des envois*.

### 7. Ce qui n'a pas été fait (et pourquoi)

- **Signature sur tablette** de la décharge : table `Signature` du Lot 4 ; au Lot 3, papier imprimé + case « signée » tracée.
- **Gardiennage** : calculé et facturé au Lot 4 ; la règle et les données sont prêtes (§ 1.11).
- **Relance des lignes refusées** : Lot 5 (les lignes refusées sont gardées).
- **Retour automatique en réparation** à l'arrivée de la pièce : non (la pièce reçue est signalée sur l'ordre ; l'équipe peut travailler sur les autres lignes pendant l'attente) — choix prudent, à confirmer.
- **Pièce reçue partiellement** : le besoin reste ouvert tant que la quantité reçue ne le couvre pas en entier (pas de besoin « reçu en partie »).
- **Problème n° 14** : en partie — le magasinier met à jour les pièces manquantes, mais le lien de sa cloche mène toujours à `/garage/suivi`, réservé à `manageRepairFollowUp` (A-13 garde cette reproduction).
- **Messages en arabe** : les SMS / e-mails au client restent en français (comme les autres messages ; pas de langue enregistrée pour le client).

### À savoir avant la mise en ligne (Lot 3)

- **Changer une date promise demande maintenant un motif** (tous les ordres, comme les motifs du Lot 1) et prévient le client par SMS / e-mail s'il n'a pas refusé les messages.
- Après un **devis refusé** sur un nouvel ordre, **seuls les frais annoncés** sont facturables ; un ordre refusé sans frais annoncés se livre sans facture et se clôture tout seul.
- Une ligne **Sécurité refusée** bloque *Prêt* tant que la décharge signée n'est pas confirmée (réglage désactivable).
- Un nouvel ordre dont une ligne acceptée attend une pièce passe **tout seul en *Attente pièces*** (réglage désactivable) ; le retour en réparation reste manuel.
- Un **bon de réception** réserve désormais la pièce reçue pour l'ordre qui l'attendait (le stock « libre » baisse d'autant).
- `reminderOptOut` (« refuse les rappels ») s'applique désormais aussi aux messages de changement de date (consigne reçue) ; les autres messages de service (véhicule prêt, devis) partent comme avant.


---

## Lot 4 — Réception signée, restitution, facture et paiements

Branche `feat/v16-consolidation` (suite des Lots 1 à 3). Plan suivi : [PLAN-V16-LOT4.md](PLAN-V16-LOT4.md) (décisions du propriétaire : avoirs dans une table séparée `CreditNote`, `Invoice.workOrderId` gardé `@unique NOT NULL`, acompte → vrai paiement pour les nouveaux acomptes seulement, pas de gardiennage pendant une attente pièces imputable au garage). Aucune question bloquante : les contradictions avec le code ont un choix prudent (§ 9 du plan, rappelées au § 7 ci-dessous). Rien n'a été fusionné dans `main`, rien n'a été poussé, `db:cloud` n'a pas été lancé.

### 1. Ce qui a été fait

1. **Réception** : voyants allumés (12 codes), objets laissés, nombre de clés, **plafond d'autorisation** (millimes TTC), réponse aux frais de diagnostic (`diagnosticFeeAccepted`), date de l'acompte. Km d'entrée **inférieur au dernier relevé** : refus `mileageLower` sauf confirmation (case), journal `vehicle.mileageLowered` ; jamais de baisse silencieuse (création d'ordre, complément du véhicule).
2. **Signature** (`Signature`, ajout seul, trigger ; la sync passe) : cadre de signature maison (`<canvas>` 600 × 220, PNG de quelques Ko, contrôle des octets PNG et 300 Ko max côté serveur, bien sous 4,5 Mo), image et document figé envoyés par `putObject`, `documentHash` SHA-256, IP, navigateur, employé. **Prise en charge signée** (`signIntake`) : document HTML figé (client, véhicule, km, carburant, carrosserie, voyants, objets, clés, plafond, frais, acompte, travaux, photos de réception, clauses, signataire, empreinte de l'image) + empreinte ; ensuite fiche de réception et km d'entrée **verrouillés** (`intakeLocked`), photos `INTAKE` non supprimables (`intakePhotoLocked`, masquables, journalisé), une nouvelle photo devient `WORK`. Document consultable (`/api/signatures/[id]/document`, équipe seulement, servi en bac à sable CSP), « copie intacte » recalculée à l'affichage.
3. **Photos par étape** : `WorkOrderMedia.stage` (`INTAKE`, `WORK`, `DELIVERY`), choisi dans l'envoi de photos (proposé selon le statut), badge sur la fiche.
4. **Plafond signé** (section 2 du prompt) : `Réceptionné / Diagnostic → En réparation` sans devis permis si la réception est signée et le total TTC ≤ plafond ; lignes en attente acceptées « pré-autorisées » (événement + journal `workOrder.preAuthorized`).
5. **Restitution** (`VehicleHandover` + `Signature DELIVERY`, ajout seul) : km (≥ km d'entrée) et carburant à la sortie, checklist (travaux expliqués, pièces remplacées rendues / laissées / garantie / aucune, clés, propreté), remarques, signature, document figé + empreinte, `Vehicle.mileage` monté si plus haut ; bon imprimable `/garage/work-orders/[id]/restitution`. **`READY → DELIVERED` exige une restitution signée faite depuis le dernier passage à *Prêt*** (réglage `requireSignedHandover`, activé ; nouveaux ordres `workflowLot4` ; pas de dérogation, vérifié après la facture / le solde). Fenêtre de statut : « Bon de restitution signé exigé avant la livraison ». Droit `recordHandover`.
6. **Facture** : lignes acceptées non annulées (Lot 2) + **nature de la pièce** dans la copie figée, **`snapshotHash`** (SHA-256, même JSON canonique que les devis), « copie intacte » sur la page. Trigger **`Invoice_frozen`** : `UPDATE` refusé si une autre colonne que `paidAmount` / `status` change, `DELETE` refusé, la synchronisation passe (`garagepro.sync = 'on'`).
7. **Avoir** (`CreditNote`, ajout seul, droit `issueCreditNote` : ADMIN, ACCOUNTANT) : annule **toute** la facture, numéro `AV-2026-0001` (`Sequence credit-AAAA` + `assertCanNumberDocuments`, au PC du garage avec un hub), motif obligatoire, un seul par facture (unique), copie figée + empreinte ; la facture n'est ni modifiée ni supprimée, seul son statut passe **`CREDITED`** (« Annulée par avoir »). Reste dû 0, trop-perçu affiché ; ordre livré → clôturé. Avoir imprimable `/garage/invoices/[id]/avoir`. Rapports (CA = factures − avoirs de la période, ligne « Avoirs émis »), tableau de bord (CA du mois, 14 jours), fiche client, rentabilité, « à encaisser » (factures annulées exclues) : jamais compté deux fois.
8. **Paiements** (`Payment` en ajout seul, trigger ; seule exception : l'auteur effacé quand un compte d'employé est supprimé) : **date du paiement** (champ date, jour du garage ; jamais dans le futur, pas plus d'un an avant la facture ; audit n° 26), **anti double clic** (clé `requestKey` unique envoyée par le formulaire ; un 2ᵉ envoi renvoie le même paiement, message « déjà enregistré » ; audit n° 19), **annulation** (`reversePayment` : ADMIN, MANAGER ; ligne négative liée `reversalOfId` unique, motif, statut recalculé, ordre `CLOSED` → `DELIVERED` automatique ; une annulation ne s'annule pas).
9. **Acompte → vrai paiement** (audit n° 27, nouveaux ordres) : à la création de la facture, `Payment` `isDeposit` (mode de l'acompte, daté du jour où il a été reçu, plafonné au total) ; la règle de solde du Lot 1 ne déduit plus l'acompte de ces ordres (`depositOutstanding`). Anciens ordres : inchangés (voir § 5).
10. **Gardiennage** (`lib/storage-fee.ts`) : départ = premier message « véhicule prêt » **envoyé** (ou « Client prévenu » noté à la main) pendant que l'ordre est *Prêt*, + `storageGraceHours` ; compté pendant *Prêt* et pendant une attente pièces **non** imputable au garage avec le véhicule gardé (décision du Lot 3) ; jamais pendant une attente imputable au garage (ou sans décision : imputable par défaut), un retour en atelier, ni si le véhicule a été restitué ; jours entamés × `storageFeePerDay`. Carte *Gardiennage* sur la fiche (*Prêt*, avant facture) ; ligne `isStorageFee` ajoutée **à la création de la facture** (réglage `autoStorageFee`, journal `workOrder.storageFee`) ; *Ne pas facturer le gardiennage* (`waiveStorageFee` + motif, journal).
11. **Relances graduées** J+7 / J+15 / J+30 après l'échéance (`queueInvoiceReminders`, appelé par la tâche des rappels ; réglage `autoInvoiceReminders`) : plus haut niveau atteint, une fois (clé `invoice-remind:<id>:<niveau>`), ligne `InvoiceReminder` avec `level`, événement, journal ; factures des nouveaux ordres seulement, jamais à un client qui refuse les messages ; type « Relance de facture » dans *Historique des envois*.
12. **Balance âgée** (0–30, 31–60, 61–90, > 90 jours depuis la date de facture) dans *Rapports* (fr / ar / en).
13. **Garantie à la facture** (audit n° 3, nouveaux ordres) : créée à la facture ; à la livraison seulement si la facture existe.
14. **Signatures réutilisées** : accord du devis par l'équipe → signature facultative sur tablette (`Signature QUOTE` + `QuoteApproval.signatureKey` écrit à la création de la preuve) ; décharge de sécurité (Lot 3) → signature sur tablette depuis la page de la décharge (`Signature SAFETY_WAIVER` + même événement que la case papier).
15. **Hub** : `media-sync.mjs` copie aussi `Signature.imageKey` et `Signature.documentKey` (dans les deux sens).
16. Réglages *Parcours atelier* (3 cases), 5 droits (MATRIX, `PERMISSION_GROUPS`, libellés fr / ar / en), textes fr / ar / en (`v16-lot4-*.ts`, erreurs, statut de facture, type de message), données de démonstration (réception signée, gardiennage dû, restitution signée + clôture, avoir + remboursement, chèque refusé).

### 2. Fichiers modifiés / créés

**Créés** : `prisma/migrations/28_signed_handover_billing/migration.sql`, `src/lib/billing.ts`, `src/lib/handover.ts`, `src/lib/storage-fee.ts`, `src/lib/i18n/v16-lot4-fr.ts` / `-ar.ts` / `-en.ts`, `src/server/signatures.ts`, `handover.ts`, `storage-fees.ts`, `src/actions/lot4.ts`, `src/app/api/signatures/[id]/[which]/route.ts`, pages `invoices/[id]/avoir`, `work-orders/[id]/restitution`, composants `signature-pad.tsx`, `lot4-cards.tsx`, `tests/lot4-v16.test.ts`, `tests/lot4-v16.db.test.ts`, `docs/PLAN-V16-LOT4.md`, `docs/media/v16/lot4/*` (18 captures).

**Modifiés — fichiers partagés avec d'autres modules** (à surveiller lors des fusions) : `prisma/schema.prisma`, `scripts/hub/media-sync.mjs`, `src/lib/permissions.ts`, `src/lib/report.ts`, `src/lib/repair-order-forms.ts`, `src/lib/i18n/fr.ts` / `ar.ts` / `en.ts` (statut `CREDITED`, erreurs), `v16-*` (branchement `lot4`), `v103-*` (5 droits), `v7-*` (type de message), `src/server/work-orders.ts`, `workflow.ts`, `invoices.ts`, `quotes.ts`, `media.ts`, `repair-order.ts`, `reminders.ts`, `reports.ts`, `portal.ts`, `cash.ts`, `customers.ts`, `dashboard.ts`, `dashboard-v10.ts`, `profit.ts`, `tests/hub-sync.test.ts`.

**Modifiés — autres** : `src/actions/catalog.ts` (paiement daté + clé), `work-orders.ts`, `repair-order.ts` ; API d'envoi de photos (`stage`) ; pages `work-orders/[id]` (+ `decharge`), `invoices/[id]` ; composants `badges`, `check-in-form`, `document-view`, `intake-card`, `intake-fields`, `media-uploader`, `quote-decision-dialog`, `report-view`, `settings-repair-order`, `status-dialog`, `timeline`, `vehicle-completion` ; tests existants adaptés (`agenda.db`, `cash.db`, `check-in-claims`, `delays-v16.db`, `repair-order`, `warranty.db`, `workflow-v16.db`, `audit-v16/reproductions.audit.ts`) ; `scripts/demo-data/demo.run.ts` ; `README.md`, `docs/AUDIT-V16.md`.

### 3. Migration `28_signed_handover_billing`

- Types créés : `SignatureKind`, `MediaStage`. Une valeur ajoutée à un type existant : `InvoiceStatus` + `CREDITED` (`ADD VALUE IF NOT EXISTS`, jamais utilisée dans le fichier).
- Tables **ajout seul** `Signature`, `VehicleHandover`, `CreditNote` (trigger `_v16_lot4_readonly` : `UPDATE` / `DELETE` refusés sauf `garagepro.sync = 'on'`) ; `CreditNote.number` et `creditOfInvoiceId` uniques.
- Colonnes : `WorkOrder.warningLights` (Json `[]`), `itemsLeft`, `keyCount`, `authorizationCeiling`, `diagnosticFeeAccepted`, `depositReceivedAt`, `workflowLot4` ; `WorkOrderMedia.stage` ; `WorkOrderLine.isStorageFee` ; `Invoice.snapshotHash` ; `Payment.requestKey` (unique), `isDeposit`, `reversalOfId` (unique, FK), `reason` ; `InvoiceReminder.level` ; `Setting.requireSignedHandover`, `autoStorageFee`, `autoInvoiceReminders` (true).
- Triggers : `Invoice_frozen` (facture émise figée), `Payment_append_only`.
- **Pas de backfill de données** : colonnes nullables ou avec défaut neutre ; `workflowLot4` ajoutée avec `DEFAULT false` (ordres existants à false **sans UPDATE**, rien dans le journal de sync), puis défaut `true`. Anciennes factures : `snapshotHash` vide (non recalculé : la forme JSON exacte de l'époque n'est pas garantie).
- Bloc final `_sync_log_trg` identique à `24_accueil`. Rejouée deux fois sans erreur.

### 4. Tests et résultats (chiffres réels, bases jetables `gp_test_v16l4*`)

| Vérification | Résultat |
|---|---|
| `npx prisma generate` | OK (client 6.19.3) |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` | 57 fichiers, **557 tests réussis**, 15 ignorés (tests base / hub sans variable) |
| `npm run test:db` (`TEST_DB_NAME=gp_test_v16l4`) | 31 fichiers, **268 tests réussis** (dont 17 nouveaux dans `lot4-v16.db.test.ts`) |
| `npm run test:hub` (`TEST_HUB_DB_PREFIX=gp_test_v16l4_hub`) | **16 tests réussis** (dont « V16 Lot 4 : migration 28 rejouée deux fois sans rien journaliser ; ordres existants `workflowLot4 = false` sans UPDATE ; signatures, restitutions, avoirs dans les deux sens ; ajout seul des deux côtés ; facture figée qui laisse passer la sync (paiement en ligne → garage, avoir garage → en ligne) ; fichiers de signature copiés / rapatriés par `syncMedia` ») |
| `node scripts/verify-migrations.mjs … gp_test_v16l4_migfinal` | 29 migrations, la 28 rejouée sans erreur ; structure identique au schéma Prisma |
| Suite d'audit `tests/audit-v16` (`gp_test_v16l4_audit`) | **21 réussies** (25 avant : A-03, A-20, A-27, A-28 corrigés, inversés et déplacés dans `test:db`) |
| `npx next build` | compilé sans erreur (nouvelles pages `invoices/[id]/avoir`, `work-orders/[id]/restitution`, route `/api/signatures/[id]/[which]`) |

**Tests ajoutés** : unitaires (18) — gardiennage (départ au message + franchise, sans message, dans la franchise, attente imputable au garage / sans décision / véhicule restitué / imputable au client, retour en atelier), avoir (reste dû 0, trop-perçu), acompte compté une fois, statut après annulation, balance âgée, niveaux de relance, date de paiement, numéro d'avoir, km, plafond, voyants / checklist, restitution exigée, image de signature (vrai PNG, 300 Ko), droits, traductions. Base (17) — **facture émise non modifiable / non supprimable en SQL direct** (sauf `paidAmount` / `status` et la sync) ; **avoir** (droits, motif, AV-…-0001 puis 0002 sans trou, un seul, facture identique sauf statut, ajout seul, plus de paiement, rapport net) ; avoir d'un ordre livré → clôturé ; **livraison refusée sans restitution signée** (même avec dérogation), mécanicien refusé, km de sortie, signature vide, document figé + empreinte, ajout seul, puis livré → clôturé ; réglage désactivé / ordre d'avant le Lot 4 ; **gardiennage non compté pendant une attente pièces imputable au garage** (décision ou aucune) ; compté si imputable au client ; dispense motivée ; acompte → paiement daté, solde exact, clôture ; paiement daté + double envoi simultané = 1 paiement ; annulation (droits, motif, ligne négative, réouverture, jamais deux fois, ajout seul) ; A-03 garantie à la facture ; A-27 trésorerie non comptée deux fois ; réception signée (document, verrous, photos) ; km inférieur ; plafond signé ; signature de l'accord du devis ; relances graduées + balance âgée.

**Contrôle des tests** (code retiré temporairement, puis remis — 17/17 ensuite) :
- contrôle « facture émise figée » retiré du trigger (`RAISE` remplacés) → `lot4-v16.db.test.ts` : **1 échec / 16 réussis** (facture modifiée et supprimée en SQL direct) ;
- contrôle « restitution signée exigée » retiré de `changeStatusTx` → **1 échec / 16 réussis** (livraison acceptée sans bon).

**Vérification dans le navigateur** (`next start -p 3300` depuis la branche, base de démo `gp_test_v16l4_demo`, Edge sans interface piloté par le protocole DevTools ; serveur arrêté ensuite, hub du port 3000 jamais touché) : tablette 768 px en **français** — cadre de signature dessiné, « Prise en charge signée par … », fiche verrouillée ; en **arabe** (RTL) — « أمضى … وثيقة الاستلام », empreinte « نسخة سليمة » ; document figé ouvert (prise en charge, signataire, empreinte) ; ordre de démo avec voyants / objets / clés / plafond, « copie intacte » ; ordre *Prêt* facturé et payé → *Étape suivante : Livré* : « Bon de restitution signé exigé avant la livraison » ; restitution signée → *Livré* puis *Clôturé* tout seul ; bon de restitution imprimable ; gardiennage « 4 jour(s) × 20,000 DT = 80,000 DT » (prévenu il y a 6 jours, franchise 48 h) puis facture avec la ligne *Frais de gardiennage (4 jour(s))* ; paiement daté d'hier puis annulé (« Chèque refusé ») : ligne barrée « annulé » + ligne « Annulation −20,000 DT » ; avoir AV-2026-0002 (« Facture annulée par l'avoir … », trop-perçu à rembourser) et avoir imprimable ; *Rapports* (trimestre) : balance âgée 0–30 / 31–60 / 61–90 / > 90 jours en français et en arabe ; *Paramètres › Parcours atelier* : 3 nouveaux réglages. Captures : `docs/media/v16/lot4/`.

### 5. Mise en production

- **En ligne + garage (hub)** — dans cet ordre, sans attendre entre les étapes :
  1. `npm run db:cloud` **avant** le `git push` (migration 28, et 25 à 27 si les Lots précédents n'y sont pas encore) ;
  2. **tout de suite** au garage : fermer puis relancer `start-hub.cmd` (le hub applique la migration à la base du PC ; la valeur `CREDITED` et les 3 tables doivent exister au garage avant que l'en-ligne les écrive) ;
  3. `git push`, puis vérifier le déploiement Vercel.
- **Sans hub** : `npx prisma db execute --file prisma/migrations/28_signed_handover_billing/migration.sql --schema prisma/schema.prisma` (après 25, 26, 27).
- **Anciens acomptes non convertis** (consigne : pas de backfill, à signaler) : la base réelle n'a pas été lue (interdit). Liste à sortir en lecture seule au garage : `SELECT number, "depositAmount", "depositMethod", status FROM "WorkOrder" WHERE NOT "workflowLot4" AND "depositAmount" > 0 ORDER BY number;` (ou *Prisma Studio*). Ces ordres gardent la règle du Lot 1 (acompte déduit du solde, aucun `Payment`).

### 6. Points à vérifier à la main

1. *Paramètres › Parcours atelier* : « Exiger le bon de restitution signé », « Ajouter le gardiennage à la facture », « Relances automatiques » cochés ; *Conditions de l'ordre de réparation* : frais de gardiennage par jour et franchise (défaut 20 DT / 48 h — à confirmer avant la mise en ligne).
2. *Nouvel ordre* : voyants, objets, clés, plafond ; avec un véhicule connu, taper un km plus petit → case de confirmation obligatoire.
3. Fiche de l'ordre sur la tablette › *Signature de la prise en charge* : nom + signature → « Prise en charge signée … », *Document signé* (empreinte « copie intacte ») ; la fiche *Prise en charge* et le km ne se modifient plus ; une photo de réception n'a plus de corbeille (cadenas), seulement *Masquer*.
4. Ordre signé avec plafond 250 DT et lignes < 250 DT TTC : *Changer le statut… › En réparation* sans devis ; au-dessus : refusé.
5. *Enregistrer l'accord* : déplier « Signature du client sur la tablette (facultatif) », signer → la signature est gardée avec la décision.
6. Ordre *Prêt* : carte *Gardiennage* (ou « Client prévenu (téléphone / sur place) » si aucun SMS n'est parti) ; chef d'atelier : *Ne pas facturer le gardiennage* + motif. *Facturer* → ligne *Frais de gardiennage*.
7. Ordre *Prêt* facturé et payé : *Étape suivante : Livré* refusée (« Bon de restitution signé exigé ») ; carte *Restitution du véhicule* : km, carburant, checklist, signature → *Livré* puis *Clôturé* ; *Imprimer le bon de restitution*.
8. *Factures › une facture* : *Date du paiement* d'hier, *Encaisser* ; double clic rapide → un seul paiement ; chef d'atelier : *Annuler* un paiement + motif → ligne « Annulation » ; un ordre clôturé repasse *Livré*.
9. Administrateur ou comptable : *Émettre un avoir* + motif → « Annulée par avoir », numéro AV-… ; *Voir l'avoir* (imprimable) ; *Rapports* : « Avoirs émis » et CA net.
10. Nouvel ordre avec acompte → facture : un paiement « Acompte (réception) » daté du jour de l'acompte, reste dû = total − acompte.
11. *Rapports* : bloc *Balance âgée* ; en arabe.
12. *Historique des envois* : après une facture échue de plus de 7 jours (nouvel ordre), une ligne « Relance de facture » ; la facture montre la relance dans son historique.
13. Avec le hub : signer une restitution **en ligne** puis vérifier au garage que l'image et le bon apparaissent (copie par la sync des fichiers) ; et l'inverse.

### 7. Ce qui n'a pas été fait (et pourquoi)

- **Avoir partiel** et **refacturation après avoir** : non (décision : avoir total ; `Invoice.workOrderId @unique` gardé → un ordre ne peut avoir qu'une facture). À trancher si le garage veut corriger une facture puis en refaire une.
- **Acompte avant la facture** : l'acompte n'est pas un `Payment` tant que la facture n'existe pas (`Payment.invoiceId` obligatoire, aucune contrainte relâchée) ; il le devient à la facture, daté du jour reçu. La trésorerie ne le voit donc qu'à partir de la facturation.
- **Gardiennage après la facture** : ce qui court entre la facture et la sortie n'est pas facturé (facture figée) — facturer au moment où le client vient chercher le véhicule.
- **Document figé en PDF** : HTML figé (autorisé par le prompt), imprimable depuis le navigateur.
- **Empreinte des anciennes factures** : non calculée (pas de backfill).
- **Textes** : l'aide « acompte : à enregistrer comme paiement » de la fiche *Prise en charge* reste générale (pour les nouveaux ordres c'est automatique) ; les documents figés sont en français (comme les autres documents imprimés, audit n° 35).
- **Problèmes de l'audit** encore ouverts liés à l'argent : n° 20 à 25 (timbre à 0 DT, timbre fournisseur, coûts rapports / rentabilité, solde de trésorerie des rapports, « en retard » double, plafond de réclamation) — hors du périmètre du Lot 4.

### À savoir avant la mise en ligne (Lot 4)

- Pour un **nouvel ordre**, plus de livraison sans **bon de restitution signé** (réglage désactivable) — même un responsable ne peut pas déroger : la restitution se fait depuis la fiche (*Prêt*).
- Une **facture émise ne se corrige plus** : erreur → avoir (administrateur ou comptable), et l'ordre ne peut pas être refacturé.
- Un **paiement ne se supprime plus** : il s'annule (ligne négative, motif). Le formulaire demande maintenant la **date** du paiement (aujourd'hui par défaut).
- Le **gardiennage** (20 DT / jour après 48 h par défaut) sera ajouté **automatiquement** aux factures des nouveaux ordres dès que le client a été prévenu : vérifier les montants dans *Conditions de l'ordre de réparation* avant la mise en ligne, ou décocher le réglage.
- Les **relances automatiques** de factures (J+7, J+15, J+30) partent par SMS / e-mail pour les nouveaux ordres ; décocher le réglage pour les garder à la main.
- Bucket Supabase : les signatures (`image/png`) et documents figés (`text/html`) y sont envoyés ; vérifier qu'aucune restriction de type de fichier n'est réglée sur le bucket (non vérifiable d'ici).


---

## Lot 5 — Qualité, suivi et pilotage

Branche `feat/v16-consolidation` (suite des Lots 1 à 4). Plan suivi : [PLAN-V16-LOT5.md](PLAN-V16-LOT5.md). Aucune question bloquante : les contradictions avec le code ont un choix prudent (§ 8 du plan, rappelées au § 7 ci-dessous). Rien n'a été fusionné dans `main`, rien n'a été poussé, `db:cloud` n'a pas été lancé.

### 1. Ce qui a été fait

1. **Contrôle qualité** : `QualityCheck.roadTestKm` (km parcourus à l'essai, obligatoire si l'essai est fait, 1 à 500 km, `roadTestKmRequired`) ; **points réglables** dans *Paramètres › Contrôle qualité* (`Setting.qualityPoints`, un point par ligne, clés stables), **en plus des 6 points actuels** (colonnes inchangées) ; résultats dans `QualityCheck.extraPoints` avec le libellé copié. Validation refusée tant qu'un point réglé n'est pas coché ; un point ajouté **après** la validation n'annule pas le passage à *Prêt* (on vérifie les points enregistrés). Nouveaux ordres seulement (`workflowLot5`).
2. **Reprise** : `QUALITY_CONTROL / WASHING / READY → IN_PROGRESS` demande, en plus du motif du Lot 1, une **cause** (travail incomplet, malfaçon, pièce défectueuse, essai routier, propreté, autre ; `reworkCauseRequired`). **Compteur de reprises** calculé depuis les événements de statut (ajout seul : pas de compteur partagé qui pourrait s'écraser à la synchronisation), écrit dans l'événement (`rework`, `reworkCause`) et le journal ; jamais envoyé au portail. Fenêtre de statut de la fiche et de l'atelier mobile.
3. **Retour atelier** : `WorkOrder.comebackOfWorkOrderId` + `comebackCategory` (`SAME_FAULT`, `WORKMANSHIP`, `PART_FAILURE`, `OTHER`) + qui / quand. Carte « Retour atelier ? » proposée automatiquement quand le même véhicule a été **livré moins de 30 jours** avant l'ouverture (nouveaux ordres) ; *Lier* (droit `manageComebacks`), *Ce n'est pas un retour* (événement, la proposition ne revient pas), *Retirer le lien* avec motif. **Main-d'œuvre de reprise non facturée par défaut** : sur un ordre lié, une ligne de main-d'œuvre est créée à **0 DT** et marquée `isRework` (badge « Reprise ») ; *Facturer cette main-d'œuvre* = droit `manageComebacks`, journalisé. Les pièces restent facturées.
4. **Taux de retour atelier** (`lib/report.ts`) : ordres de la période liés à un ordre précédent / ordres ouverts. L'ancienne heuristique (même véhicule revenu sous 30 jours) est gardée et affichée sous le nom **« revisites »**.
5. **Inspection rouge / orange / vert** : tables `InspectionTemplate`, `Inspection`, `InspectionResult` ; modèle **« Inspection standard »** (15 points) créé par la migration ; modèles réglables (*Paramètres › Modèles d'inspection*, droit `manageInspections`). Sur la fiche (droit `performInspection`, mécanicien compris) : couleur + note + **photo** par point (photo réduite dans le navigateur, envoyée par la route existante des photos → `putObject` → `WorkOrderMedia`, donc déjà copiée par `media-sync.mjs`), *Terminer l'inspection* (chaque point doit avoir une couleur). Point rouge / orange → **ligne de devis `PENDING`** avec priorité `SAFETY` / `RECOMMENDED` par `addLine` (même chemin que les autres lignes : réservation de la pièce, contrôle qualité remis à zéro, journal) — droit `manageQuotes`, une seule ligne par point (double clic refusé), couleur verrouillée ensuite. **Portail** : bloc « Inspection de votre véhicule » (couleur en toutes lettres, note, photo si visible au client, « Proposé dans le devis »).
6. **Suivi client** (file existante `queueItems`, *Historique des envois*) : **enquête de satisfaction J+3** après la livraison (`SURVEY`, une fois par ordre, ordres livrés il y a 3 à 7 jours — le suivi en ligne où se trouve le formulaire de note reste ouvert 7 jours —, pas si l'ordre est déjà noté, réglage `autoSatisfactionSurvey`) ; **relance des travaux refusés** à 30 puis 90 jours après la livraison (`REFUSED_LINES`, plus haut palier atteint, rien après 120 jours, pas si le véhicule est revenu depuis, lignes *Sécurité* d'abord, réglage `autoRefusedLineReminders`). **Jamais** à un client qui refuse les messages (`reminderOptOut`) ; sans SMS / e-mail configuré, ligne « non envoyé + raison » (jamais de faux envoi) ; avec un hub, c'est le hub qui envoie.
7. **Alerte interne note ≤ 3** : ligne « Avis clients (note ≤ 3) à traiter » dans *À traiter* (cloche, droit `manageClaims`, 30 derniers jours) ; note dans l'historique de l'ordre ; *Réclamations › Marquer comme traité* + note (`CustomerFeedback.handledAt / handledById / handledNote`, journal).
8. **KPI** (`lib/report.ts` `buildKpis`, bloc *Pilotage* des *Rapports*, fr / ar / en) : taux d'acceptation des lignes (lignes décidées des devis envoyés dans la période, hors frais annoncés et gardiennage ; en nombre et en montant), **ARO** (CA HT net des avoirs / factures), livrés à la date promise initiale (Lot 3), taux de retour atelier, **efficacité des techniciens** (heures de main-d'œuvre facturées avec un prix / heures pointées aux chronos ; global et par technicien), **taux de no-show** (RDV non honorés / RDV non annulés de la période), balance âgée (Lot 4). Données réelles seulement, **« — »** quand le dénominateur est nul (jamais un 0 % inventé).
9. **Pointage** : `LaborEntry.workOrderLineId` et `kind` (`DIAGNOSIS`, `WORK`, `REWORK`, `WARRANTY`), facultatifs, au démarrage du chrono et dans la saisie après coup (REWORK proposé sur un ordre lié à un retour) ; une ligne d'un autre ordre est refusée ; affichés dans le détail du temps.
10. 3 droits (MATRIX, `PERMISSION_GROUPS`, libellés fr / ar / en) : `manageComebacks` (ADMIN, MANAGER, RECEPTION), `performInspection` (ADMIN, MANAGER, RECEPTION, MECHANIC), `manageInspections` (ADMIN, MANAGER). `audit()` dans la même transaction partout. Textes fr / ar / en (`v16-lot5-*.ts`, erreurs, types de messages, *À traiter*).
11. Données de démonstration : points du garage, inspection avec un point rouge et un orange mis au devis, deux retours atelier (proposé / lié avec reprise à 0 DT), une reprise après contrôle, enquête en file, note de 2/5, temps pointé, rendez-vous passés (no-show).

### 2. Fichiers modifiés / créés

**Créés** : `prisma/migrations/29_quality_followup/migration.sql`, `src/lib/lot5.ts`, `src/server/comebacks.ts`, `src/server/inspections.ts`, `src/actions/lot5.ts`, `src/components/garage/lot5-cards.tsx`, `inspection-photo.tsx`, `settings-lot5.tsx`, `src/lib/i18n/v16-lot5-fr.ts` / `-ar.ts` / `-en.ts`, `tests/lot5-v16.test.ts`, `tests/lot5-v16.db.test.ts`, `docs/PLAN-V16-LOT5.md`, `docs/media/v16/lot5/*` (16 captures).

**Modifiés — fichiers partagés avec d'autres modules** (à surveiller lors des fusions) : `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/report.ts`, `src/lib/todo.ts`, `src/lib/validators.ts`, `src/lib/i18n/fr.ts` / `ar.ts` / `en.ts` (erreurs), `v16-*` (branchement `lot5`), `v103-*` (3 droits), `v7-*` (2 types de messages), `todo-*`, `src/server/work-orders.ts` (cause de reprise, main-d'œuvre de reprise, `addLineTx`), `quality.ts`, `reminders.ts`, `reports.ts`, `claims.ts`, `labor.ts`, `portal.ts` (clés internes), `todo.ts`, `todo-details.ts`, `tests/hub-sync.test.ts`. `scripts/hub/media-sync.mjs` **inchangé** (photos d'inspection = `WorkOrderMedia`).

**Modifiés — autres** : `src/actions/follow-up.ts`, `work-orders.ts`, `workshop.ts` ; pages `work-orders/[id]`, `atelier`, `settings`, `reclamations`, `suivi/vehicule` ; composants `line-adder`, `repair-panels`, `report-view`, `status-dialog`, `timeline`, `shell/todo-icons` ; tests existants adaptés (km de l'essai et cause de reprise dans `delays-v16.db`, `lot4-v16.db`, `skills.db`, `team.db`, `workflow-v16.db`, `audit-v16/reproductions.audit.ts` ; « revisites » dans `v5-features` ; transaction de la note dans `check-in-claims`) ; `scripts/demo-data/demo.run.ts` ; `README.md`, `docs/AUDIT-V16.md`.

### 3. Migration `29_quality_followup`

- Types créés (jamais d'`ALTER TYPE … ADD VALUE`) : `ComebackCategory`, `LaborKind`, `InspectionColor`.
- Tables `InspectionTemplate`, `Inspection` (FK ordre CASCADE, modèle SET NULL), `InspectionResult` (FK inspection CASCADE, photo `WorkOrderMedia` et ligne `WorkOrderLine` SET NULL ; un résultat par point).
- Colonnes : `WorkOrder.comebackOfWorkOrderId` (FK SET NULL, index), `comebackCategory`, `comebackLinkedAt`, `comebackLinkedById`, `workflowLot5` ; `WorkOrderLine.isRework` (false) ; `QualityCheck.roadTestKm`, `extraPoints` (`{}`) ; `LaborEntry.workOrderLineId` (FK SET NULL), `kind` ; `CustomerFeedback.handledAt`, `handledById`, `handledNote` ; `Setting.qualityPoints` (`[]`), `autoSatisfactionSurvey` (true), `autoRefusedLineReminders` (true).
- **Pas de backfill** : colonnes nullables ou avec un défaut neutre ; `workflowLot5` ajoutée avec `DEFAULT false` (ordres existants à false **sans UPDATE**, rien dans le journal de sync), puis défaut `true`. Une seule ligne écrite : le modèle « Inspection standard » à **id fixe** (`inspection-standard`), `ON CONFLICT DO NOTHING`, écrit avec `garagepro.sync = 'on'` (même ligne créée par la migration au garage et en ligne, rien de journalisé, aucun conflit).
- Bloc final `_sync_log_trg` identique à `24_accueil` (pose la sync sur les 3 tables). Rejouée deux fois sans erreur.

### 4. Tests et résultats (chiffres réels, bases jetables `gp_test_v16l5*`)

| Vérification | Résultat |
|---|---|
| `npx prisma generate` | OK (client 6.19.3) |
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` | 58 fichiers, **571 tests réussis**, 16 ignorés (tests base / hub sans variable) |
| `npm run test:db` (`TEST_DB_NAME=gp_test_v16l5`) | 32 fichiers, **279 tests réussis** (dont 11 nouveaux dans `lot5-v16.db.test.ts`) |
| `npm run test:hub` (`TEST_HUB_DB_PREFIX=gp_test_v16l5_hub`) | **17 tests réussis** (dont « V16 Lot 5 : migration 29 rejouée deux fois sans rien journaliser ; modèle par défaut identique des deux côtés ; ordres existants `workflowLot5 = false` sans UPDATE ; inspections, lien de retour atelier, ligne de reprise, nature du temps, km de l'essai / points, suite d'une note basse dans les deux sens ») |
| `node scripts/verify-migrations.mjs … gp_test_v16l5_mig` | 30 migrations, la 29 rejouée sans erreur ; structure identique au schéma Prisma |
| Suite d'audit `tests/audit-v16` (`gp_test_v16l5_audit`) | **21 réussies** (inchangé : aucun problème de l'audit corrigé par ce lot) |
| `npx next build` | compilé sans erreur |

**Tests ajoutés** : unitaires (14) — points réglés (lignes → clés stables, doublons, données invalides), points tous cochés, km de l'essai (fait / pas nécessaire / ancien ordre / bornes), reprise et compteur depuis les événements, clés internes jamais au portail, candidat retour atelier (< 30 jours, le plus récent, jamais lui-même), **main-d'œuvre de reprise non facturée par défaut**, couleur → priorité, fenêtre de l'enquête (3 à 7 jours), paliers des relances (30 / 90 / rien après 120), KPI sur un jeu chiffré et « — » sans données, taux de retour / revisites dans le rapport, droits, traductions. Base (11) — km obligatoire, point réglé exigé, point ajouté après la validation sans effet sur *Prêt* ; ancien ordre inchangé ; cause de reprise obligatoire, compteur 1 puis 2, journal ; retour atelier (proposition, mécanicien refusé, lien, double lien refusé, main-d'œuvre à 0 DT, pièce au prix, « facturer » refusé au mécanicien et accepté à l'accueil, retrait motivé) ; « ce n'est pas un retour », > 30 jours, ancien ordre ; inspection complète (modèle de la migration, rouge + note + photo, incomplète refusée, mécanicien refusé pour chiffrer, point vert refusé, double ajout refusé, ligne `PENDING` `SAFETY`, couleur verrouillée, ligne dans le devis envoyé, portail avec / sans photo visible) ; enquête (réglage, une fois, opt-out, déjà noté, trop tôt, ancien ordre) ; note ≤ 3 (alerte, événement, mécanicien refusé, traité + journal) ; relance des travaux refusés (opt-out, véhicule revenu, une fois, ligne refusée seulement) ; nature / ligne du temps (ligne d'un autre ordre refusée) ; KPI sur une période isolée (mai 2020).

**Contrôle des tests** (code retiré temporairement, puis remis par `git checkout` — 14/14 et 11/11 ensuite) :
- règle « main-d'œuvre de reprise non facturée par défaut » retirée (`reworkLine` garde le prix) → `lot5-v16.test.ts` : **1 échec / 13 réussis** ; `lot5-v16.db.test.ts` : **1 échec / 10 réussis** ;
- filtre « l'enquête respecte le refus des messages » retiré de `queueSatisfactionSurveys` → `lot5-v16.db.test.ts` : **1 échec / 10 réussis**.

**Vérification dans le navigateur** (`next start -p 3300` lancé depuis la branche, base de démo `gp_test_v16l5_demo`, Edge sans interface piloté par le protocole DevTools ; serveur arrêté ensuite, hub du port 3000 jamais touché) : chef d'atelier, PC en **français** — fiche d'un ordre inspecté : 15 points (1 rouge, 2 orange, 12 verts), « Dans le devis : Remplacement plaquettes AV (inspection) · En attente », « Dans le devis : Balais d'essuie-glace · En attente » ; ordre en contrôle qualité : « Reprises après contrôle : 1 », points du garage « Pression des pneus contrôlée », « Niveau lave-glace complété », km de l'essai saisi (8) et points cochés puis enregistrés (relus après rechargement : 8, [oui, oui]) ; fenêtre *Changer le statut… › En réparation* : liste des 6 causes ; carte « Retour atelier ? » (livré le 13 oct., OR-0187) → *Lier* → « Retour atelier de OR-0187 (Même panne), lié le 22 oct. 2026 » ; ligne « Reprise montage plaquettes » badge *Reprise* à 0,000 DT ; administrateur — *Rapports* (30 jours) bloc *Pilotage* : acceptation des lignes 78,4 % (29 / 37, 93,9 % du montant), ARO 176,219 DT, date promise initiale 66,7 %, retour atelier 4,8 % (2 / 42), efficacité 151,3 % (14 h vendues / 9,3 h pointées, par technicien), no-show 25 % (2 / 8), balance âgée ; même bloc en **arabe** ; *Paramètres* (points du contrôle, modèles d'inspection) ; *Historique des envois* : « Enquête de satisfaction … non envoyé · Aucun canal configuré » (la démo n'a ni SMS ni e-mail : jamais de faux envoi) ; *Réclamations* : note 2/5 « à traiter » ; *À traiter* : « Avis clients (note ≤ 3) à traiter 1 » ; **portail au téléphone (390 px)** en **français** puis en **arabe** (sens RTL, sans débordement horizontal) : bloc d'inspection (couleurs en toutes lettres, « Proposé dans le devis ») et devis à valider avec la ligne de l'inspection *Sécurité*. Captures : `docs/media/v16/lot5/`.

### 5. Mise en production

- **En ligne + garage (hub)** — dans cet ordre, sans attendre entre les étapes :
  1. `npm run db:cloud` **avant** le `git push` (migration 29, et 25 à 28 si les Lots précédents n'y sont pas encore) ;
  2. **tout de suite** au garage : fermer puis relancer `start-hub.cmd` (le hub applique la migration à la base du PC ; les 3 tables et les nouvelles colonnes doivent exister au garage avant que l'en-ligne les écrive) ;
  3. `git push`, puis vérifier le déploiement Vercel.
- **Sans hub** : `npx prisma db execute --file prisma/migrations/29_quality_followup/migration.sql --schema prisma/schema.prisma` (après 25, 26, 27, 28).

### 6. Points à vérifier à la main (Lot 5)

Voir la liste regroupée des 5 lots ci-dessous (n° 51 à 63).

### 7. Ce qui n'a pas été fait (et pourquoi)

- **Audit n° 10** (montants et prix d'achat visibles par le mécanicien) : non traité — ce n'est ni petit ni sans risque (refonte de la fiche, du formulaire d'ajout de ligne et des listes de pièces). Seule précaution prise : chiffrer un point d'inspection est réservé à `manageQuotes`.
- **Date de refus par ligne** : il n'y en a pas (un refus par le garage n'écrit pas de preuve client) ; la relance compte depuis la **livraison**.
- **Libellés des modèles d'inspection** : ce sont des données (en français dans le modèle par défaut) ; ils s'affichent tels quels sur le portail arabe. Un modèle en arabe peut être créé dans *Paramètres*.
- **KPI** : les heures vendues sont attribuées au mécanicien de l'ordre (les lignes n'ont pas d'auteur) ; l'efficacité compare les heures facturées de la période aux heures pointées de la période (pas ordre par ordre) — un garage qui ne pointe pas tout verra plus de 100 %.
- **Modèles d'inspection** : réglés dans *Paramètres*, page réservée à l'administrateur (`manageSettings`) ; le droit `manageInspections` du chef d'atelier n'a pas encore d'écran à lui.
- **Retour atelier sur les anciens ordres** : jamais proposé automatiquement (non-rétroactivité) ; le lien manuel n'existe que depuis la carte de proposition.
- Erreur connue de la démo sans lien avec ce lot : « publication: listingIncomplete » (annonce showroom de démonstration incomplète).

### À savoir avant la mise en ligne (Lot 5)

- Pour un **nouvel ordre**, le contrôle qualité demande les **km de l'essai** quand l'essai est fait, et un renvoi en réparation demande une **cause** (liste) en plus du motif.
- Sur un ordre **lié comme retour atelier**, la main-d'œuvre est ajoutée à **0 DT** sauf case *Facturer* (accueil / chef d'atelier / administrateur).
- **Enquête de satisfaction** et **relance des travaux refusés** partent automatiquement (SMS / e-mail) aux clients qui n'ont pas refusé les messages ; décocher les réglages pour les arrêter.
- Le **mécanicien** peut faire une inspection et proposer une couleur, mais seul l'accueil (ou un responsable) met un point au devis avec un prix.

---

## Vérifications à la main — les 5 lots (liste regroupée)

**Lot 1 — statuts, motifs, journal**
1. *Paramètres › Parcours atelier* : « travaux sans devis » décoché, « livrer seulement avec facture soldée » coché ; enregistrer.
2. Compte **mécanicien**, ordre *Prêt* › *Changer le statut…* : seul « En réparation » (avec motif et cause) ; ni annulation ni livraison ; même chose dans *Atelier*.
3. **Accueil**, ordre *Prêt* facturé avec un reste dû › *Étape suivante : Livré* : « Reste à payer … », *Valider* grisé.
4. **Chef d'atelier**, même ordre › « Livrer quand même » + motif : *Livré* ; historique « Livré par dérogation » + motif.
5. Encaisser le reste : l'ordre passe tout seul *Clôturé*.
6. Nouvel ordre : « En réparation » n'est pas proposé depuis *Réceptionné* sans devis (ni plafond signé).
7. Ordre en devis › *Attente client* puis *Devis refusé* (motif).
8. Ordre accepté › icône ⊘ d'une ligne ancienne › motif : ligne barrée, totaux recalculés.
9. Portail d'un ordre annulé / refusé : le statut s'affiche, **jamais le motif**.
10. *Journal* : filtres *Lignes des ordres*, *Photos des ordres*, *Messages des clients* ; date promise avant → après.
11. *Historique des envois* : « Véhicule prêt » avec son vrai statut.
12. Interface en **arabe** : filtres des 3 statuts, fenêtre de statut (RTL).
13. *À traiter* : « Devis en attente de la décision du client », « Véhicules livrés sans facture soldée ».
14. *Équipe › Accès* : les droits du parcours (Lots 1 à 5) réglables par employé.

**Lot 2 — devis et accord**
15. Nouvel ordre, 2 lignes (priorité, nature) › *Devis envoyé* : D…-… v1, « copie intacte » ; *Historique des envois* : « Devis à valider ».
16. *Changer le statut…* : « En réparation » bloqué « Pas encore d'accord du client enregistré ».
17. Portail au téléphone : refuser une ligne (total qui change), nom, *Valider ma décision* ; recommencer en arabe.
18. **Accueil** › *Enregistrer l'accord* (téléphone, une ligne refusée, note) ; **mécanicien** : pas de bouton.
19. Ligne acceptée : seulement l'annulation motivée ; ligne refusée : aucune action.
20. Ligne ajoutée en réparation : bandeau « Supplément », *Facturer* grisé, *Devis envoyé* → supplément v2, impression v2.
21. Pièce au devis : réservée (*Stock*), sortie à l'accord, libérée si refusée.
22. Avec le hub : accord du client **en ligne** pendant que le garage est déconnecté → au retour « Accord du client reçu » au garage.
23. En ligne avec un hub : *Renvoyer le devis* → « Le devis se numérote au garage ».
24. Bloc *Devis et accords* en arabe.

**Lot 3 — refus, retards, pièces**
25. *Paramètres › Parcours atelier* : frais de diagnostic (ex. 30), décharge et attente pièces automatiques cochées.
26. *Nouvel ordre* : case « Frais de diagnostic annoncés » cochée → ligne *Frais annoncé* acceptée.
27. Devis imprimé : « Frais annoncés à la réception ».
28. Portail : tout refuser → *Devis refusé* ; facture = frais seulement.
29. Décharge imprimable ; *Prêt* demande « Véhicule remonté » et « Décharge signée » (mécanicien refusé).
30. *Attente client* → *Devis refusé* + motif ; réservation libérée ; sans frais → livré sans facture → *Clôturé*.
31. Date promise changée sans motif → message ; avec motif → *Changements de date* + message.
32. Pièce manquante liée à une ligne acceptée avec date → *Attente pièces* automatique ; date sur le portail fr / ar.
33. *Pendant l'attente des pièces* : « Véhicule restitué » (+ imputable au garage).
34. Bon de réception de la pièce manquante → *Reçue*, réservée pour l'ordre.
35. **Magasinier** : met à jour une pièce manquante.
36. *Rapports* : « Livrés à la date promise initiale ».
37. Client qui refuse les rappels : date changée → « client non prévenu », aucun envoi.

**Lot 4 — réception, restitution, argent**
38. *Paramètres* : restitution signée, gardiennage à la facture, relances ; *Conditions* : 20 DT / jour, 48 h (à confirmer).
39. *Nouvel ordre* : voyants, objets, clés, plafond ; km plus petit que le dernier → case de confirmation.
40. Tablette : *Signature de la prise en charge* → document « copie intacte », fiche et km verrouillés, photo de réception sans corbeille.
41. Ordre signé avec plafond : *En réparation* sans devis sous le plafond, refusé au-dessus.
42. *Enregistrer l'accord* avec signature sur la tablette.
43. Ordre *Prêt* : carte *Gardiennage* (ou « Client prévenu ») ; *Ne pas facturer* + motif ; facture avec la ligne de gardiennage.
44. *Livré* refusé sans bon de restitution ; restitution signée → *Livré* puis *Clôturé* ; bon imprimable.
45. Paiement daté d'hier ; double clic = un paiement ; *Annuler* un paiement + motif.
46. Administrateur / comptable : *Émettre un avoir* + motif → AV-… ; avoir imprimable ; *Rapports* nets.
47. Nouvel ordre avec acompte → facture : paiement « Acompte (réception) » daté du jour de l'acompte.
48. *Rapports* : balance âgée (fr / ar).
49. Facture échue de plus de 7 jours (nouvel ordre) : « Relance de facture » dans *Historique des envois*.
50. Avec le hub : restitution signée **en ligne** → image et bon visibles au garage (et l'inverse).

**Lot 5 — qualité, suivi, pilotage**
51. *Paramètres › Contrôle qualité* : saisir 2 points (un par ligne), laisser « Enquête de satisfaction » et « Relancer les travaux refusés » cochés ; enregistrer.
52. Nouvel ordre en *Contrôle qualité* : « Essai effectué » sans km → message ; avec km et les 2 points cochés → *Valider le contrôle* possible ; sans un des points → refusé.
53. *Changer le statut… › En réparation* depuis le contrôle qualité : cause obligatoire (liste) + motif ; le contrôle affiche « Reprises après contrôle : 1 » ; l'historique « Reprise n° 1 : … ».
54. Ouvrir un ordre pour un véhicule livré il y a moins de 30 jours : carte « Retour atelier ? » → choisir la catégorie → *Lier* ; ou *Ce n'est pas un retour* (la carte disparaît).
55. Sur l'ordre lié, ajouter une main-d'œuvre : ligne à **0,000 DT** badge *Reprise* ; avec *Facturer cette main-d'œuvre* coché (accueil) : prix normal ; un **mécanicien** ne voit pas la case.
56. Fiche › *Inspection* › *Commencer l'inspection* (mécanicien) : couleurs, notes, *Ajouter une photo* au téléphone ; *Terminer* refusé tant qu'un point n'a pas de couleur.
57. Avec l'**accueil**, point rouge › *Ajouter au devis* (prix) : ligne *Sécurité* « En attente » ; *Devis envoyé* ; portail au téléphone en **français** puis en **arabe** : bloc *Inspection* et la ligne au devis.
58. *Paramètres › Modèles d'inspection* : créer un modèle (un point par ligne), le désactiver.
59. Ordre livré il y a 3 jours (nouvel ordre, client sans refus des messages) : *Historique des envois* « Enquête de satisfaction » (envoyée, ou « non envoyé » + raison sans SMS / e-mail) ; client « refuse les rappels » : rien.
60. Ordre livré il y a 30 jours avec une ligne refusée : « Relance travaux refusés » ; pas si le véhicule est revenu depuis.
61. Note de 2/5 laissée sur le suivi : *À traiter* « Avis clients (note ≤ 3) à traiter » ; *Réclamations* › *Marquer comme traité* + note → la ligne disparaît.
62. *Rapports* (30 jours) : bloc *Pilotage* (acceptation des lignes, ARO, date promise, retour atelier, efficacité par technicien, no-show, balance âgée), « — » sur une période vide ; en arabe.
63. Fiche › *Temps passé* : démarrer le chrono avec une nature (*Reprise*) et une ligne ; elles apparaissent dans le détail des pointages.

## Ce qui n'a pas été fait — les 5 lots

- **Lot 1** : la garantie reste liée à la livraison pour les ordres d'avant le Lot 4 ; journal en arabe en partie (noms de champs bruts) ; pas de langue enregistrée par client (messages en français) ; « Livrés sans facture soldée » limité aux ordres V16.
- **Lot 2** : numérotation d'un devis en ligne avec un hub refusée (au garage seulement) ; passage en réparation après un accord fait en ligne fait au garage (un clic) ; découverte du technicien = note + photo + ligne en attente (pas d'écran dédié) ; statut `EXPIRED` calculé à l'affichage.
- **Lot 3** : pas de retour automatique en réparation à l'arrivée de la pièce ; pas de besoin « reçu en partie » ; lien de la cloche du magasinier vers `/garage/suivi` toujours refusé (n° 14) ; messages au client en français.
- **Lot 4** : avoir total seulement, pas de refacturation après avoir (`Invoice.workOrderId @unique` gardé) ; acompte = paiement seulement à la facture ; gardiennage couru après la facture non facturé ; document figé en HTML (pas PDF) ; pas d'empreinte pour les anciennes factures ; anciens acomptes non convertis (liste SQL dans le README) ; bucket Supabase à vérifier (types `image/png`, `text/html`).
- **Lot 5** : audit n° 10 non traité ; relance des refus comptée depuis la livraison ; modèles d'inspection en français (données) ; efficacité par période, pas par ordre ; écran des modèles réservé à l'administrateur.

## Problèmes de l'audit V16 encore ouverts après les 5 lots

Sur 42 problèmes reproduits : **corrigés** n° 1, 2, 4, 7, 9, 13, 19, 26 ; **corrigés pour les nouveaux ordres** n° 3 (garantie à la facture) et 27 (acompte = vrai paiement) ; **en partie** n° 11 et 12 (stock : réservation atomique pour les nouveaux devis, anciens ordres inchangés), 14 (le magasinier met à jour les pièces manquantes ; lien de sa cloche toujours refusé), 36 (filtres du journal traduits, détails bruts). **Encore ouverts (28)** :

- Bloquant : aucun bloquant entièrement ouvert ; n° 11 et 12 restent possibles sur les ordres d'avant la V16 (sortie de stock à l'ajout).
- Importants : n° 5 (deux ordres ouverts pour le même véhicule), 6 (double accueil d'un RDV), 8 (plan d'entretien V7.6 non mis à jour à la livraison), **10 (montants et prix d'achat visibles par le mécanicien)**, 15 (double réception d'un bon), 16 (facture fournisseur sur le bon d'un autre fournisseur), 18 (suggestion de recommander une pièce déjà commandée), 21 (timbre de la facture fournisseur), 22 (coût des pièces différent Rapports / Rentabilité), 23 (solde de trésorerie des Rapports), 25 (réclamation de garantie sans plafond), 29 (accès sur mesure gardés après changement de rôle), 32 (CIN des employés visible par le chef d'atelier), 37 (fiche ordre surchargée — encore plus longue avec les blocs ajoutés), 38 (séquences pair / impair du hub pour les réclamations de garantie et annonces).
- Mineurs : n° 17 (bon partiel impossible à solder), 20 (timbre sur une facture à 0), 24 (« en retard » calculé de deux façons), 28 (deux définitions de « présent »), 30 (RH qui se délivre sa propre attestation), 31 (congé pour un employé désactivé), 33 (bloc « Stock pièces » montré sans droit), 34 (liens qui renvoient à l'accueil), 35 (documents imprimés en français), 39 (`X-Forwarded-For` sans proxy sur le hub), 40 (blocage d'un compte par un tiers), 41 (`0_init` non rejouable, sans effet), 42 (clés étrangères sans index).

La suite `tests/audit-v16` (21 reproductions encore vraies) les rejoue : `TEST_DATABASE_URL=… TEST_DB_NAME=gp_test_… npx vitest run --config tests/audit-v16/vitest.config.ts`.
