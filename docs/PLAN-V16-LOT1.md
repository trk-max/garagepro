# V16 — Parcours atelier traçable : étape 0 et plan du Lot 1

Lecture seule : rien n'a été modifié dans le code. Ce document répond à l'étape 0 de `PROMPT-V16-WORKFLOW.md`.

## A) Résumé du projet

1. GaragePro V15 : Next.js 15, Prisma 6, PostgreSQL, Auth.js v5, i18n fr/ar/en. Montants en millimes.
2. Cœur : l'OR (`WorkOrder`), statut = enum PostgreSQL, lignes `WorkOrderLine` (le stock est consommé dès l'ajout), journal `WorkOrderEvent`, photos `WorkOrderMedia`.
3. Facture : une seule par OR, `snapshot` figé, numéro via `Sequence` + `assertCanNumberDocuments()`. Paiements `Payment` (verrou de ligne).
4. Contrôle qualité vérifié au passage à READY, remis à zéro au retour en atelier.
5. `audit()` → `AuditLog` en ajout seul (trigger `_audit_log_readonly`, qui laisse passer la sync).
6. Droits : `MATRIX` (9 rôles) + exceptions par employé (`UserPermission`) ; `can()` : refus > ajout > rôle.
7. Hub : base locale du PC, échange toutes les 30 s avec Supabase via `_sync_log`.
8. Conflit : la ligne entière la plus récente gagne (égalité → garage). Photos copiées par `media-sync.mjs`.
9. Portail client `/suivi` (plaque + code) : étapes `CUSTOMER_STEPS`, accord du devis en un clic, message.
10. Migrations 1 à 24 additives et rejouables ; `db:cloud` sur Supabase, `prisma migrate deploy` au démarrage du hub.

Noms placés ailleurs que dans le prompt : `notifyVehicleReady` est dans `src/server/customer-notifications.ts` ; la file des messages (`queueItems`, `deliverPending`) dans `src/server/reminders.ts` ; `moveStock` et `changeStatusTx` sont privées dans `src/server/work-orders.ts` ; `QUOTE_WAIT_DAYS` est une constante (3) de `src/lib/todo.ts` ; la sync est dans `scripts/hub/sync-engine.mjs` et `run-sync.mjs`.

## B) Là où le prompt ne colle pas au code (règle 13)

1. **Rôles par transition** : des rôles écrits en dur contourneraient les accès sur mesure. Proposition : une *permission* par transition (réglable par employé).
2. **Transitions existantes absentes du schéma cible** : RECEIVED → WAITING_INSURANCE, DIAGNOSIS → WAITING_PARTS, WAITING_INSURANCE → WAITING_PARTS / IN_PROGRESS, IN_PROGRESS → WAITING_INSURANCE, WASHING → QUALITY_CONTROL, READY → IN_PROGRESS. La règle « ne rien supprimer » pousse à les garder.
3. **QUOTE_REFUSED → READY** : le contrôle qualité est exigé à toute arrivée en READY ; un véhicule refusé serait bloqué tant que la checklist n'est pas validée.
4. **« READY → DELIVERED exige le contrôle qualité (déjà) »** : le contrôle est vérifié à l'entrée en READY, pas à la livraison. Ajouter une ligne après validation ne le remet pas à zéro (audit n° 4).
5. **Facture obligatoire pour livrer** : seul l'ADMIN peut facturer ; avec le hub, aucune facture ne peut être émise en ligne ; l'acompte n'est pas un paiement, donc le solde reste positif. Sans changement, la réception ne pourrait plus livrer.
6. **CLOSED comme vrai statut** : environ 20 endroits testent « DELIVERED » (portail client, calendrier, rapports, tableau de bord, rentabilité…). Faisable avec des constantes communes ; le prompt ne dit pas si la clôture est automatique ou manuelle.
7. **Mise en production avec le hub** : si l'en-ligne écrit un nouveau statut avant que le PC du garage soit à jour, la sync échoue 20 fois sur cette ligne puis l'abandonne sans alerte. Le hub doit être mis à jour avant ou en même temps que le push. Le backfill de `promisedAtInitial` doit se faire sans être noté dans `_sync_log`, sinon il peut écraser un accord fait en ligne.
8. **« Accord enregistré » au Lot 1** : il n'existe pas encore de table d'accords, et `quoteApprovedAt` est remis à zéro à chaque devis complémentaire. Il faut une règle provisoire jusqu'au Lot 2.
9. **Avoirs avec `workOrderId` vide (Lot 4)** : impossible sans relâcher une contrainte existante. Solution sans perte : une table séparée `CreditNote`. À décider avant le Lot 4.
10. Divers : le gardiennage n'est calculé nulle part (seulement imprimé dans les clauses) ; `Notification.kind = "DELIVERY"` est déjà pris (il faut `READY`) ; le client n'a pas de langue enregistrée ; `media-sync.mjs` devra copier les futures signatures ; les motifs ne doivent pas apparaître sur le portail client.

## Décisions du propriétaire (22/10/2026)

- **Livraison** : facture + dérogation. La réception et le chef d'atelier (MANAGER) reçoivent aussi le droit de facturer. Sans facture ou avec un solde dû, la livraison est refusée, sauf dérogation ADMIN/MANAGER avec motif. L'acompte de la réception est déduit du solde.
- **Clôture** : automatique. Un OR livré dont la facture est entièrement payée passe à CLOSED tout seul (au paiement, ou à la livraison si c'est déjà payé).
- **Droits** : la proposition ci-dessous (permissions par transition, modifiables par employé).
- **Devis refusé** : contrôle qualité complet avant « Prêt ».
- **Par défaut, sauf avis contraire** : les transitions existantes sont gardées ; pour les nouveaux OR, RECEIVED/DIAGNOSIS → IN_PROGRESS est interdit sauf réglage `allowWorkWithoutQuote` ; un ajout ou retrait de ligne remet le contrôle qualité à zéro ; une ligne est annulée (et non supprimée) si elle existait au dernier accord connu.
- **Mise en production** : `npm run db:cloud`, redémarrage du hub (qui applique la migration sur la base du garage) et `git push` dans la foulée, pour que le garage connaisse les nouveaux statuts avant que l'en-ligne les écrive.

## C) Plan du Lot 1

### 1. Migration `25_workflow_v16`
- `ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS` : `QUOTE_REFUSED`, `WAITING_CUSTOMER`, `CLOSED` (jamais utilisées dans le même fichier).
- `Setting.allowWorkWithoutQuote` (défaut false), `Setting.requirePaidBeforeDelivery` (défaut true).
- `WorkOrder.promisedAtInitial` (nullable) ; backfill = `promisedAt`, fait avec `garagepro.sync = 'on'` pour ne pas toucher au journal de sync.
- `WorkOrder.workflowV16` : false pour les OR existants, true pour les nouveaux (sans `UPDATE` : colonne ajoutée avec défaut false, puis défaut passé à true). Les règles bloquantes ne s'appliquent qu'aux nouveaux OR.
- `WorkOrderLine.voidedAt`, `voidReason`, `voidedById` (mêmes noms que `LaborEntry`).
- Bloc final des triggers de sync, comme `24_accueil`.

### 2. Transitions (`src/server/workflow.ts`)
Une table « transition → permission (+ motif obligatoire) » ; `TRANSITIONS` reste exporté.

Nouvelles permissions : `manageQuotes` (ADMIN, MANAGER, RECEPTION), `cancelWorkOrder` (ADMIN, MANAGER), `deliverWorkOrder` (ADMIN, MANAGER, RECEPTION), `deliverWithBalance` (ADMIN, MANAGER), `closeWorkOrder` (ADMIN, MANAGER, RECEPTION). Réutilisées : `useWorkshop`, `manageRepairFollowUp`.

| De → vers | Permission | Motif |
|---|---|---|
| RECEIVED → DIAGNOSIS | useWorkshop | non |
| RECEIVED / DIAGNOSIS → QUOTE_SENT | manageQuotes | non |
| RECEIVED / DIAGNOSIS → WAITING_INSURANCE | manageRepairFollowUp | non |
| RECEIVED / DIAGNOSIS → IN_PROGRESS | useWorkshop, seulement si `allowWorkWithoutQuote` ou OR d'avant la migration | non |
| DIAGNOSIS → WAITING_PARTS | useWorkshop | non |
| QUOTE_SENT → IN_PROGRESS / WAITING_PARTS | manageQuotes | oui pour les nouveaux OR (en attendant l'accord tracé du Lot 2) |
| QUOTE_SENT → WAITING_CUSTOMER | manageQuotes | non |
| QUOTE_SENT / WAITING_CUSTOMER → QUOTE_REFUSED | manageQuotes | oui |
| QUOTE_SENT → WAITING_INSURANCE | manageRepairFollowUp | non |
| WAITING_CUSTOMER / WAITING_INSURANCE → QUOTE_SENT | manageQuotes | non |
| WAITING_INSURANCE → IN_PROGRESS / WAITING_PARTS | manageQuotes | oui pour les nouveaux OR |
| QUOTE_REFUSED → READY | manageQuotes | non |
| WAITING_PARTS ⇄ IN_PROGRESS, IN_PROGRESS → QUALITY_CONTROL, QUALITY_CONTROL → WASHING / READY, WASHING → READY / QUALITY_CONTROL | useWorkshop | non |
| IN_PROGRESS → QUOTE_SENT (supplément) | manageQuotes | non |
| IN_PROGRESS → WAITING_INSURANCE | manageRepairFollowUp | non |
| QUALITY_CONTROL → IN_PROGRESS | useWorkshop | oui |
| READY → IN_PROGRESS | useWorkshop | oui |
| READY → DELIVERED | deliverWorkOrder + contrôles de livraison | dérogation : oui |
| DELIVERED → CLOSED | closeWorkOrder, facture payée | non |
| Tout statut non final → CANCELLED | cancelWorkOrder | oui ; refusé si une facture existe (règle actuelle) |

### 3. Changement de statut (`changeStatus` / `changeStatusTx`)
- Nouveau paramètre `reason` (et `override: "deliverWithBalance"`).
- Contrôles dans la transaction : permission de la transition (403), motif de 3 à 500 caractères si exigé (422 « Motif obligatoire »).
- Droits et motifs valent pour tous les OR (correction de sécurité, audit n° 1). Les règles « sans devis » et « livraison » seulement pour les nouveaux OR.
- Livraison : pas de facture → refus ; solde positif → refus, sauf dérogation (permission + motif), enregistrée dans l'événement et le journal.
- Motif enregistré dans `WorkOrderEvent.data.reason` et dans l'audit ; jamais montré sur le portail client.
- Annulation : la remise en stock ignore les lignes déjà annulées.
- `promisedAtInitial` rempli à la création de l'OR et à la réservation en ligne.

### 4. Journal d'audit ajouté (même transaction)
`updateMeta` (avant → après, dont `promisedAt`), `addLine`, `removeLine`, `applyPackage`, `removeMedia`, `setMediaVisibility`, `approveQuoteByCustomer` (IP + navigateur, et un seul accord en cas de double clic, audit n° 7), `customerMessage`, `notifyVehicleReady` (passe par la file des messages, avec statut et erreur, comme la V15).
Option conseillée : un ajout ou retrait de ligne remet le contrôle qualité à zéro (audit n° 4).

### 5. Lignes annulées au lieu de supprimées
- Une ligne qui existait au moment du dernier accord connu est annulée (motif obligatoire), pas supprimée ; sinon suppression comme avant, avec audit.
- Les lignes annulées sont exclues des totaux, de la facture, du devis imprimé, de la prise en charge, du portail client, du portail entreprise, de la rentabilité, des rapports, de l'agenda, des compétences, du showroom et des garanties. Sur la page de l'OR, elles restent visibles, grisées et barrées, avec leur motif.

### 6. Interface
- Fenêtre « changer de statut » qui ne montre que les transitions permises, demande le motif quand il faut, et propose « livrer malgré le solde » à qui en a le droit. Même fenêtre pour annuler une ligne.
- Libellés et couleurs des 3 nouveaux statuts (fr/ar/en), étapes de la page OR et du portail, filtres de la liste, tableau de bord.
- « À traiter » : « attente client » et « livré sans facture soldée ».
- Paramètres → Ordre de réparation : les deux interrupteurs.
- Page OR : « date promise initiale » si elle a changé.

### 7. Tests
- Règles pures : matrice transition × rôle, motif obligatoire, non-rétroactivité, étapes du portail.
- Base de test : annulation sans motif refusée ; un mécanicien ne peut ni annuler ni livrer ; livraison bloquée avec solde puis dérogation tracée ; un OR d'avant la migration se livre normalement ; ligne annulée après accord (totaux, facture, stock rendu une seule fois) ; chacune des 9 actions écrit une ligne de journal ; double accord portail = un seul.
- Hub : nouveaux statuts synchronisés dans les deux sens, migration 25 rejouée deux fois.

### 8. Problèmes de l'audit V16 corrigés par le Lot 1
- Corrigés : n° 1 (mécanicien livre ou annule), n° 2 (livraison sans facture ni paiement), n° 7 (double accord portail), n° 9 (message « véhicule prêt » tracé), n° 4 si l'option est prise.
- En partie : n° 3, n° 27 (acompte), n° 36.
- Plus tard (stock, concurrence, paiements, avoirs…) : les autres, dans les lots suivants ou en correction séparée.
