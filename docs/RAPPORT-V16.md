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
