# INVENTAIRE V16 — état réel de chaque module (phase A)

Branche `feat/v16-consolidation` (depuis `main` 8500f87, V12 + V14 + V15 fusionnées). **Aucun code de l'application n'a été modifié.**
Base de démonstration jetable `gp_test_v16_demo` (local), remplie par `scripts/demo-data/` (voir § 4).

Légende de l'état :
- **Fonctionne** : pages ouvertes sans erreur dans le navigateur, tests verts, parcours fait.
- **Partiel** : fonctionne, mais au moins un problème reproduit (numéro de `docs/AUDIT-V16.md`).
- **Cassé** : la fonction principale ne marche pas. *(Aucun module n'est dans cet état.)*
- **Jamais testé** : pas de test automatique **et** pas de vérification dans un vrai navigateur pendant cet audit.

## 1. Vérifications exécutées (résultats exacts)

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` (tsc + `eslint .` + vitest) | réussi : 53 fichiers, **506 tests réussis**, 10 ignorés (tests base / hub sans variables) |
| `TEST_DATABASE_URL=… TEST_DB_NAME=gp_test_v16 npm run test:db` | 27 fichiers, **201 réussis** |
| `TEST_PG_URL=… TEST_HUB_DB_PREFIX=gp_test_v16_hub npm run test:hub` | **11 réussis** |
| `node scripts/verify-migrations.mjs … gp_test_v16_mig` | 25 migrations appliquées, la dernière (`24_accueil`) rejouée sans erreur ; structure = schéma Prisma |
| Rejeu de **toutes** les migrations deux fois (script d'audit) | 1er passage 25/25 ; 2e passage 24/25 : seule `0_init` refuse (`type "Role" already exists`) — c'est la migration de départ, jamais rejouée en vrai (Prisma la marque appliquée) |
| Tables sans trigger de synchro `_sync_log_trg` | 3 sur 74 : `PortalAttempt` (voulu), `_sync_log`, `_sync_state` (tables du hub) → **toutes les tables métier sont synchronisées** |
| `npx next build` | réussi |
| `npm run doctor` | sans `.env` : 4 bloquants (normal : pas de `.env` dans la copie de travail). Avec les variables de la base de démo : 1 bloquant (« Fichier .env absent ») et 5 avertissements (pas de `?pgbouncer=true`, historique des migrations absent, pas de stockage Supabase, pas d'e-mail, pas de clé IA). Les vérifications « en ligne » (Supabase) ne sont pas faites : interdit dans cet audit. |
| Reproductions d'audit `tests/audit-v16/` (base `gp_test_v16_audit`) | **30 réussis** = 30 problèmes reproduits (chaque test vérifie le comportement fautif actuel) |
| Parcours navigateur (Edge sans interface via CDP, `next start -p 3300`) | 9 rôles × 64 pages en accès direct + exploration des liens visibles ; PC 1366 fr, téléphone 390 fr et ar, tablette 768 ar ; 5 tâches mesurées en clics ; 24 captures dans `docs/media/v16/avant/` |
| Temps de réponse serveur (64 pages, 3 mesures, admin) | médiane max **150 ms** (`/garage/garanties`), aucune page > 500 ms ; dans le navigateur, aucune page > 2 s (max 1,8 s au premier affichage) |

Limites de ces chiffres : base de démo de 172 ordres, 161 factures, 73 véhicules (un garage réel sur plusieurs années en aura plus) ; pas de vrai SMS / e-mail / Supabase ; une seule machine.

## 2. Modules

Abréviations des rôles : A admin, M responsable, R réception, Méca mécanicien, Mag magasinier, RH, Compta comptable, V vendeur, SR responsable showroom.
Les pages sont protégées par `requirePageAccess(perm)` et les actions par `requirePermission(perm)` ; les deux passent par `can()` qui applique l'accès sur mesure (`UserPermission` : refus > ajout > rôle). Aucune action contrôlée ne contourne `can()`.

### Atelier

| Module | Pages | Actions serveur principales | Permissions | Tables | Tests existants | Doc | État |
|---|---|---|---|---|---|---|---|
| Rendez-vous (RDV) | `/garage/appointments`, public `/rdv`, `/rdv/confirmation/[ref]` | `checkInAppointmentAction`, `appointmentStatusAction`, `appointmentMechanicAction` (`actions/workshop.ts`) ; `createAppointment`, `checkInAppointment` (`server/booking.ts`) ; API `/api/booking/*` | viewAppointments, manageAppointments | Appointment, BookableService | booking (12), rate-limit-atomic (5) ; **aucun test de l'accueil d'un RDV** | README | **Partiel** (n° 6, 7 de l'audit) |
| Accueil / file d'attente (V15) | `/garage/accueil`, `/rapports`, `/reglages`, public `/accueil/borne`, `/ecran`, `/t/[token]` | `src/actions/accueil.ts` | useReception, viewReceptionReports, configureReception, manageReceptionDevices | QueueSetting, QueueReason, QueueCounter, QueueTicket, QueueDevice | accueil (14), accueil.db (17) | ACCUEIL.md, RAPPORT-V15 | **Fonctionne** |
| Ordres de réparation + prise en charge (état des lieux) + devis | `/garage/work-orders`, `/new`, `/[id]`, `/[id]/prise-en-charge`, `/[id]/quote` | `createWorkOrderAction`, `changeStatusAction`, `assignAction`, `addLineAction`, `applyPackageAction`, `createInvoiceAction` ; `updateIntakeAction` | viewWorkOrders (lecture **et** toutes les écritures), printQuote, createInvoice | WorkOrder, WorkOrderLine, WorkOrderEvent, WorkOrderMedia | v5-features (15), repair-order (11), permissions (12), stock.db (8), journal.db (7), fixes-v78.db (6), legal-kit.db (5), check-in-claims (5), api-work-orders (3), cancel-race (1) | LEGAL-KIT.md, README | **Partiel** (n° 1–5, 8–10) |
| Atelier mobile | `/garage/atelier` | `workshopStatusAction`, `start/stopLaborAction` | useWorkshop, logOwnLabor | WorkOrder, LaborEntry | **aucun** | README §V7 | **Partiel** (n° 1) |
| Contrôle qualité | bloc de la fiche ordre | `saveQualityCheckAction`, `approveQualityCheckAction` | fillQualityCheck, approveQualityCheck | QualityCheck | pas de test dédié (touché par skills.db, team.db) | README §V7 | **Partiel** (n° 4) |
| Suivi des retards / pièces manquantes | `/garage/suivi` | `addPartNeedAction`, `updatePartNeedAction`, `updateInsuranceAction`, `alertAction` | manageRepairFollowUp, reportMissingPart | WorkOrderPartNeed, AlertState | journal.db (1), alerts (4), team.db (1) | RAPPORT-V7 | **Partiel** (n° 13, 14) |
| OBD | `/garage/vehicules/[id]/obd` | `saveObdReadingAction` | obdDiagnose | VehicleReading | obd (13), obd.db (7), obd-session (4) | OBD.md | **Fonctionne** (page ouverte ; la lecture Bluetooth/USB réelle n'a pas été testée : pas d'adaptateur) |
| QR véhicule | `/garage/vehicules/[id]/qr`, public `/v/[token]` | `issueVehicleQrAction`, `revokeVehicleQrAction` | manageVehicleQr | Vehicle.qrToken | vehicle-qr.db (6) | README §V7.5 | **Fonctionne** (page publique vérifiée au téléphone) |
| Compétences (V14) | `/garage/competences`, `/[id]`, `/moi`, `/reglages` | `src/actions/skills.ts` | viewSkills, manageSkills, overrideSkillBlock | Skill, EmployeeSkill, SkillLevelHistory, SkillCertificate, SkillGoal, SkillReviewRequest | skills (15), skills.db (10) | COMPETENCES.md, RAPPORT-V14 | **Fonctionne** |
| Fiche véhicule / entretien | `/garage/vehicules`, `/[id]/entretien` (**pas de page `/garage/vehicules/[id]`** : la fiche est un ancre de la fiche client) | `createPlanAction`, `markPlanDoneAction` (plans V7.6) | manageMaintenance ou viewAgenda | VehicleMaintenance | maintenance (8), reminders.db (12), vehicle-list.db (3) | README §V7.6 | **Partiel** (n° 8 ; doublon D2) |
| Agenda d'entretien prévisionnel (V12) | `/garage/agenda`, `/messages`, `/reglages` | `src/actions/agenda.ts` | viewAgenda, manageAgenda, configureAgenda | MaintenanceItem, MaintenanceEvent, MaintenanceForecast | agenda (18), agenda.db (16) | AGENDA-ENTRETIEN.md, RAPPORT-V12 | **Fonctionne** (doublon D2) |

### Pièces / achats

| Module | Pages | Actions | Permissions | Tables | Tests | Doc | État |
|---|---|---|---|---|---|---|---|
| Stock | `/garage/parts` | `createPartAction`, `updatePartAction`, `moveStockAction`, `correctMovementAction` | viewStock, manageStock | Part, StockMovement | stock-and-limits (14), stock.db (8), stock-list (5), stock-list.db (2) | dispersée (RAPPORT-V7, PROMPT2) | **Partiel** (n° 11, 12) |
| Réservations de pièces | bloc de la fiche ordre | `reservePartAction`, `releaseReservationAction` | reserveStock | StockReservation | stock.db (4) | — | **Partiel** (n° 11) |
| Fournisseurs | `/garage/suppliers` | `createSupplierAction`, `updateSupplierAction` | viewSuppliers, manageSuppliers | Supplier | **aucun** | — | **Fonctionne** (pas de désactivation ni de journal) |
| Demandes d'achat → bons de commande | `/garage/purchase-orders`, `/new`, `/[id]`, `/[id]/print` | create / approve / reject / cancel | requestPurchase, approvePurchase | PurchaseOrder, PurchaseOrderLine | journal.db (1) | — | **Partiel** (n° 17, 18) |
| Bons de réception | `/garage/receipts`, `/new`, `/[id]` | `createReceiptAction` | receiveGoods | GoodsReceipt, GoodsReceiptLine | fixes-v6 (1), journal.db | — | **Partiel** (n° 13, 15) |
| Factures et paiements fournisseurs | `/garage/supplier-invoices`, `/[id]` | `createSupplierInvoiceAction`, `paySupplierInvoiceAction` | viewSupplierInvoices, manageSupplierInvoices, paySupplier | SupplierInvoice, SupplierPayment | cash.db (1), journal.db (2) | — | **Partiel** (n° 16, 21) |

### Argent

| Module | Pages | Actions | Permissions | Tables | Tests | Doc | État |
|---|---|---|---|---|---|---|---|
| Factures clients | `/garage/invoices`, `/[id]` | `createInvoiceAction`, `recordReminderAction` | viewClientInvoices, createInvoice (A), sendReminder | Invoice, InvoiceReminder, Sequence | money (14), invoice-snapshot (3), legal-kit.db | README, RAPPORT-V7/V12 | **Partiel** (n° 2, 20) |
| Paiements clients | formulaire de la facture | `recordPaymentAction` (verrou de ligne, refus du trop-perçu) | recordPayment (A, M, R) | Payment | cash.db (9), journal.db | — | **Partiel** (n° 19, 26, 27) |
| « Caisse » | **il n'existe pas de module caisse** : seulement un solde caisse + banque saisi à la main (Trésorerie) | `recordCashBalanceAction` | viewCashForecast / readCashForecast | CashBalance | cash.db | GARANTIES-TRESORERIE.md | **Partiel** (pas de clôture ni de rapprochement des espèces) |
| Trésorerie prévisionnelle | `/garage/tresorerie` | `cashForecast` | readCashForecast | (lit Payment, SupplierPayment, ExpenseOccurrence, WarrantyRefund…) | cash-forecast (21), cash.db (9) | GARANTIES-TRESORERIE.md | **Partiel** (n° 23, 26) |
| Dépenses / échéances | `/garage/depenses` | create / update / pay / cancel ; dépenses d'une réparation (`actions/profit.ts`) | manageExpenses | RecurringExpense, ExpenseOccurrence, WorkOrderExpense | expenses (6), expenses.db (5) | GARANTIES-TRESORERIE.md | **Fonctionne** |
| Garanties + réclamations fournisseur | `/garage/garanties`, `/[id]`, `/reclamations/[id]` | création, réclamation, montants, remboursements | manageWarranties, viewWarrantyMoney | Warranty, WarrantyClaim, WarrantyRefund | warranty (14), warranty.db (6) | GARANTIES-TRESORERIE.md | **Partiel** (n° 3, 25) |
| Rentabilité | `/garage/rentabilite`, `/api/rentabilite` (Excel) | `profitReport`, `workOrderProfit` | viewProfit (A) | (lit WorkOrderLine.unitCost, LaborEntry) | profit (11), profit.db (5) | RAPPORT-PROMPT2 | **Partiel** (n° 22) |
| Rapports | `/garage/rapports` | `getReport` | viewReports (A) | — | v5-features (partie) | — | **Partiel** (n° 22, 23, 24) |

### Clients

| Module | Pages | Actions | Permissions | Tables | Tests | Doc | État |
|---|---|---|---|---|---|---|---|
| Clients / véhicules | `/garage/customers`, `/[id]`, `/garage/vehicules` ; API `/api/customers/search` | `createCustomerAction`, `updateCustomerAction`, `addVehicleAction` | viewCustomers (lecture **et** écriture : pas de `manageCustomers`) | Customer, Vehicle | vehicle-list.db (3), journal.db (partie) | — | **Fonctionne** (remarque : un mécanicien peut créer / modifier un client) |
| Entreprises clientes + portail entreprise | `/garage/entreprises`, public `/entreprise/*` | `actions/company.ts` | manageCompanyAccess | CompanyUser | team.db (isolation), company-reset.db (4) | — | **Fonctionne** (connexion vérifiée dans le navigateur ; isolation testée) |
| Portail client par PIN / QR | `/suivi`, `/suivi/vehicule`, `/v/[token]` | `actions/portal.ts` (connexion, accord du devis, message, avis, réclamation) | public + limites | WorkOrder.trackingPin, PortalAttempt | rate-limit-atomic (5), vehicle-qr.db (6) | README | **Partiel** (n° 7) |
| Réclamations / avis | `/garage/reclamations`, public `/reclamation` | `actions/claims.ts` | manageClaims | CustomerClaim, CustomerFeedback | check-in-claims (5) | — | **Fonctionne** |
| Rappels / alertes / notifications | `/garage/notifications` (historique), `/garage/suivi` (alertes), cron `/api/cron/reminders` | `runRemindersAction`, `retryNotificationAction`, `alertAction` | viewNotifications, manageSettings | Notification, AlertState | reminders.db (12), alerts (4) | AGENDA-ENTRETIEN.md | **Partiel** (n° 9 ; doublon D1) — envoi réel SMS / e-mail **jamais testé** (aucun compte) |
| Messagerie (acheteurs showroom) | `/garage/messages`, `/[id]`, public `/messages/[token]` | `actions/messaging.ts` | useShowroomMessages | Conversation, Message | messaging (3), messaging.db (7) | SHOWROOM-MESSAGERIE.md | **Fonctionne** (aucune conversation dans la démo : page vide vérifiée) |

### Équipe

| Module | Pages | Actions | Permissions | Tables | Tests | Doc | État |
|---|---|---|---|---|---|---|---|
| Pointage + borne | `/garage/pointage`, `/pointage/borne`, API `/api/clock/kiosk` | `punchAction`, `correctPunchAction`, `voidPunchAction` | useTimeClock (tous sauf V et SR), manageTeam, showClockKiosk | ClockEvent | team.db (4), team-pure (6) | — | **Partiel** (n° 28) |
| Congés | dans Pointage | `requestLeaveAction`, `decideLeaveAction`, `cancelLeaveAction` | useTimeClock, manageTeam | LeaveRequest | team.db (3), team-pure (3) | — | **Partiel** (n° 31) |
| Calendrier | `/garage/calendrier` | — | useTimeClock | (congés, RDV, dates promises) | team.db (1) | — | **Fonctionne** (doublon D3) |
| Équipe / fiches / accès sur mesure | `/garage/equipe`, `/[id]`, API `/api/team/[id]/report` ; comptes dans `/garage/settings` | `updateEmployeeProfileAction`, `setUserPermissionsAction` ; `createStaffAction`… | manageTeam, ADMIN pour les accès | User, UserPermission, LaborEntry | staff-admin (14), access (9), access.db (7), permissions (12) | — | **Partiel** (n° 29, 32) |
| Attestations de travail | fiche employé, API `/api/team/certificates/[id]` | `issueCertificateAction` | issueCertificates (A, M, RH) | WorkCertificate | team.db (1) | — | **Partiel** (n° 30) |
| Contrats (travail, réparation, flotte, fournisseur) | `/garage/contrats`, `/[id]`, `/nouveau`, `/modeles` ; API pdf / scan | `src/actions/contracts.ts` | viewContracts + accès par catégorie (travail = A et RH) | Contract, ContractTemplate, ContractVehicle, ContractEvent | contracts (35), contracts.db (11), legal-kit.db (5) | CONTRATS.md, LEGAL-KIT.md | **Fonctionne** (une seule notion de « contrat », par catégories) |

### Ventes, direction, plateforme

| Module | Pages / scripts | Permissions | Tables | Tests | Doc | État |
|---|---|---|---|---|---|---|
| Showroom | `/garage/showroom*`, public `/showroom*` | viewShowroom, createListing, manageAllListings | Listing, ListingMedia, ListingEvent | showroom (24), showroom.db (8), showroom-permissions (5) | SHOWROOM-MESSAGERIE.md, PLAN-CONTRATS-SHOWROOM.md | **Fonctionne** (publication refusée sans photo : règle voulue) |
| Tableau de bord | `/garage` + blocs personnalisables, `/api/staff/live` | requireStaff + blocs par permission | — | dashboard-v10 (13), dashboard-v10.db (11), dashboard-layout (7), dashboard-series (8) | — | **Partiel** (n° 33) |
| « À traiter » | `/garage/a-traiter` (cloche) | tous | — | todo (8), todo.db (5) | — | **Partiel** (n° 14) |
| Journal | `/garage/journal` | viewAuditLog (A) | AuditLog (ajout seul) | journal.db (7) | — | **Partiel** (n° 36) |
| Sauvegardes | `/garage/sauvegardes`, `scripts/backup/*` | manageSettings | — | backup (5), backup.db (4) | SAUVEGARDES.md | **Fonctionne** (base seulement ; photos et scans non sauvegardés — documenté) |
| Hub hors ligne | `scripts/hub/*`, `/api/hub/status` | — | `_sync_log`, `_sync_state` | hub-sync (11), hub-unit (7) | README §V6 | **Partiel** (n° 38) |
| Installateur | `scripts/installer/build.mjs` | — | — | aucun | INSTALLATEUR.md | **Jamais testé** (non lancé : construit un exécutable Windows) |
| Accès sur mesure | éditeur dans la fiche employé | ADMIN | UserPermission | access (9), access.db (7) | — | **Partiel** (n° 29) |
| Aide | `/garage/aide` (19 lignes, une page pour tous) | tous | — | — | — | **Fonctionne** (contenu très court, pas d'aide par page) |
| Assistant IA public | `/assistant`, `/api/assistant` | public + limites | — | assistant (30), assistant-route-limit (2) | README | **Jamais testé** en vrai (pas de clé IA ; le guide à choix s'affiche) |
| Connexion du personnel | `/login` | — | PortalAttempt | login-lockout (3), client-ip (6), security-hardening (12) | — | **Partiel** (n° 39, 40) |
| Téléversements (photos, vidéos, scans) | API `/api/work-orders/[id]/media/*`, `/api/media/[id]`… | uploadMedia | WorkOrderMedia… | direct-upload (7) | — | **Jamais testé** dans le navigateur pendant cet audit |

## 3. Navigation actuelle (`src/components/shell/nav.ts`)

- **Barre du haut** : Vue d'ensemble, Stock, Factures, Trésorerie, Rentabilité, Rapports (+ recherche d'immatriculation, cloche « À traiter », menu du compte).
- **Rail gauche** : Ordres, Atelier, Rendez-vous, Clients, Véhicules, Suivi & retards, Messages, bouton « Plus ».
- **Menu du compte** : Mon compte, Équipe, Contrats, Aide, Paramètres, langue, état du hub, déconnexion.
- **Panneau « Plus »** (capture `docs/media/v16/avant/menu-plus-admin-pc-fr.png`) : *Espace client* (Accueil, Agenda, Rappels clients, Comptes entreprises, Réclamations & avis, Garanties), *Espace fournisseur* (Fournisseurs, Bons de commande, Bons de réception, Factures fournisseurs), *Équipe* (Pointage & congés, Calendrier, Compétences, Mes compétences), *Showroom* (Annonces), sans titre (Dépenses, Journal, Sauvegardes).
- Pages réellement ouvrables par rôle (accès direct aux 64 pages, PC fr) : A 62, M 49, R 32, Méca 21, Mag 16, RH 11, Compta 13, V 7, SR 7 sur 64 (pages ouvertes sans renvoi vers l'accueil ; `competences/[id]` et `competences/moi` exclues car elles répondent « introuvable » ou redirigent vers sa propre fiche ; pages publiques non comptées).

## 4. Données de démonstration (script ajouté)

`scripts/demo-data/demo.run.ts` + `scripts/demo-data/vitest.config.ts` : base **jetable** recréée depuis `prisma/migrations`, puis tout est créé par les fonctions serveur de l'application :
11 comptes (un par rôle, 3 mécaniciens), 12 pièces, 2 fournisseurs, 1 forfait, 60 clients + 1 entreprise (4 véhicules, 1 compte portail), 160 ordres livrés / facturés / payés sur 8 mois, 11 ordres « en cours » (un par étape, dont attente pièces avec pièce manquante commandée, en réparation avec chrono, prêt facturé), achats (BC en attente, BC reçu, facture fournisseur partiellement payée, facture en retard), pointages sur 10 jours, congés, attestation, charges fixes, solde de caisse, 3 RDV, réclamation + avis, agenda d'entretien, plan d'entretien, annonce showroom, 2 tickets d'accueil.

```
TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres TEST_DB_NAME=gp_test_v16_demo \
DEMO_PASSWORD=<mot de passe de test> DEMO_OUT=<fichier.json> \
npx vitest run --config scripts/demo-data/vitest.config.ts
```
Résultat : 172 ordres, 161 factures, 142 paiements, 61 clients, 73 véhicules. Une seule étape refusée par l'application : publication de l'annonce sans photo (règle voulue).
