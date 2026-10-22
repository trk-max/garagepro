# RAPPORT V16 — Parcours atelier traçable

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
