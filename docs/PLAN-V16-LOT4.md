# V16 — Plan du Lot 4 : réception signée, restitution, facture et paiements

Base : branche `feat/v16-consolidation` (Lots 1 à 3 faits, non mis en production). Consigne du propriétaire : « avancer lot par lot, je vérifie à la fin ». Décisions du propriétaire pour ce lot : avoirs dans une **table séparée** `CreditNote` (numéro `AV-AAAA-…`, `Invoice.workOrderId` reste `@unique NOT NULL`), livraison = facture + dérogation, acompte compté dans le solde, clôture automatique, numérotation au PC du garage seulement avec un hub, preuves en lignes ajout seul, pas de gardiennage pendant une attente pièces imputable au garage, acompte → vrai paiement **pour les nouveaux acomptes seulement**. Aucune contradiction ci-dessous ne demande une décision sans choix prudent : les choix sont listés au § 9.

## 1. Migration `28_signed_handover_billing` (additive, rejouable deux fois)

- Types créés (bloc `DO … EXCEPTION WHEN duplicate_object`) : `SignatureKind` (INTAKE, QUOTE, DELIVERY, SAFETY_WAIVER), `MediaStage` (INTAKE, WORK, DELIVERY). Une seule valeur ajoutée à un type existant : `InvoiceStatus` + `CREDITED` (`ADD VALUE IF NOT EXISTS`, jamais utilisée dans le fichier).
- `WorkOrder` : `warningLights` (Json, défaut `[]`), `itemsLeft`, `keyCount`, `authorizationCeiling` (millimes TTC), `diagnosticFeeAccepted` (null = pas de frais proposés), `depositReceivedAt`, `workflowLot4` (false pour les ordres existants **sans UPDATE**, puis défaut true : même technique que `workflowV16`).
- `WorkOrderMedia.stage` (nullable, pas de backfill). `WorkOrderLine.isStorageFee` (false).
- `Invoice.snapshotHash` (nullable : les anciennes factures n'en ont pas). `Payment` : `requestKey` (unique, anti double clic), `isDeposit`, `reversalOfId` (unique : un paiement ne s'annule qu'une fois), `reason`.
- `InvoiceReminder.level` (7 / 15 / 30, null = relance à la main).
- `Setting` : `requireSignedHandover` (true), `autoStorageFee` (true), `autoInvoiceReminders` (true).
- Tables **ajout seul** (trigger `_…_readonly`, la synchronisation passe avec `garagepro.sync = 'on'`) : `Signature`, `VehicleHandover`, `CreditNote` ; `Payment` devient aussi ajout seul (une annulation = une nouvelle ligne négative).
- Trigger **`Invoice_frozen`** : `UPDATE` d'une facture refusé si une autre colonne que `paidAmount` / `status` change, `DELETE` refusé ; la synchronisation passe.
- Pas de backfill de données (colonnes nullables ou avec défaut neutre). Bloc final `_sync_log_trg` identique à `24_accueil`.

## 2. Réception (`updateIntake`, fiche, prise en charge)

- Champs : voyants allumés (liste cochable), objets laissés, nombre de clés, plafond d'autorisation (DT TTC), frais de diagnostic acceptés (enregistré à la création quand des frais sont réglés).
- Kilométrage inférieur au dernier connu (`Vehicle.mileage`) : refusé avec le dernier relevé, sauf case « je confirme » (journalisée) ; jamais d'écrasement vers le bas sans elle (création d'ordre, complément du véhicule).
- **Signature de la réception** (permission `signIntake` : ADMIN, MANAGER, RECEPTION) : canvas maison sur tablette, image PNG réduite dans le navigateur (< 300 Ko, bien sous la limite Vercel), envoyée par `putObject`. Dans la même transaction : document **HTML figé** de la prise en charge (client, véhicule, km, carburant, carrosserie, voyants, objets, clés, plafond, frais, acompte, clauses, liste des photos de réception) stocké par `putObject` + empreinte SHA-256, ligne `Signature` (INTAKE, nom, IP, navigateur, empreinte), événement + `audit()`.
- Après signature : fiche de réception et km d'entrée **verrouillés** ; photos `INTAKE` non supprimables (seulement masquées, journalisé) ; une nouvelle photo est rangée en `WORK`. Document figé consultable (`/api/signatures/[id]/document`), empreinte recalculée à l'affichage (« copie intacte »).
- `WorkOrderMedia.stage` choisi à l'envoi (défaut : réception avant signature et avant les travaux, livraison quand l'ordre est *Prêt*, sinon travaux).
- Plafond : `Réceptionné / Diagnostic → En réparation` sans devis est permis si la réception est **signée** et que le total TTC des lignes reste sous le plafond (règle de la section 2 du prompt) ; les lignes en attente sont alors acceptées « pré-autorisées (plafond signé) » (événement + journal).

## 3. Restitution (`VehicleHandover`)

- Permission `recordHandover` (ADMIN, MANAGER, RECEPTION). Formulaire sur un ordre *Prêt* : km de sortie (≥ km d'entrée), carburant, checklist (travaux expliqués, pièces remplacées rendues / laissées / garantie, clés rendues, propreté), note, **signature DELIVERY obligatoire** (nom + canvas). Ligne `VehicleHandover` + `Signature` DELIVERY (document HTML figé du bon + empreinte) dans la même transaction ; `Vehicle.mileage` mis à jour si plus haut.
- Bon de restitution imprimable (`/garage/work-orders/[id]/restitution`). Photos `DELIVERY` par l'envoi de photos existant.
- `READY → DELIVERED` exige une restitution signée faite depuis le dernier passage à *Prêt* (réglage `requireSignedHandover`, nouveaux ordres = `workflowLot4`) ; erreur `handoverRequired`. Pas de dérogation (la dérogation du Lot 1 concerne le solde).

## 4. Facture (`server/invoices.ts`)

- Lignes `APPROVED` non annulées (Lot 2, inchangé) ; **nature de la pièce** dans la copie figée ; `snapshotHash` SHA-256 (JSON aux clés triées, même fonction que les devis).
- Trigger `Invoice_frozen` (§ 1) : une facture émise ne change plus en SQL direct.
- **Avoir** (`CreditNote`, permission `issueCreditNote` : ADMIN, ACCOUNTANT) : annule **toute** la facture (montants HT / TVA / timbre / TTC, copie figée + empreinte), numéro `AV-2026-0001` par `Sequence` `credit-AAAA` + `assertCanNumberDocuments()`, motif obligatoire, un seul avoir par facture (unique). La facture n'est ni modifiée ni supprimée : seul son `status` passe `CREDITED` (colonne permise). Reste dû = 0 ; ce que le client avait payé devient un **trop-perçu à rembourser** (annulation de paiement, § 5). Un ordre livré dont la facture est annulée par avoir se clôture (prompt : « facture soldée (ou avoir) »).
- Rapports, tableau de bord, fiche client, rentabilité : CA = factures de la période − avoirs de la période (jamais deux fois) ; « à encaisser » sans les factures annulées ; trésorerie : seuls les paiements (les remboursements sont des paiements négatifs).

## 5. Paiements

- **Date du paiement** saisie (défaut aujourd'hui, jamais dans le futur, pas avant la facture − 1 an) (audit n° 26).
- **Anti double clic** côté serveur : clé `requestKey` envoyée par le formulaire, unique en base ; un second envoi renvoie le même paiement (audit n° 19).
- **Annulation d'un paiement** (permission `reversePayment` : ADMIN, MANAGER) : nouvelle ligne `Payment` de montant négatif liée à l'original (`reversalOfId` unique), motif obligatoire, `paidAmount` / statut recalculés, journal ; un ordre clôturé repasse *Livré* automatiquement (il n'est plus soldé). L'original n'est jamais modifié.
- **Acompte** (nouveaux ordres, `workflowLot4`) : à la création de la facture, un vrai `Payment` (`isDeposit`, mode de l'acompte, daté du jour où il a été reçu, plafonné au total) ; la règle de solde du Lot 1 ne déduit plus l'acompte de ces ordres (`depositOutstanding`) → jamais compté deux fois. Anciens ordres : acompte inchangé (déduit comme au Lot 1) et listé dans le rapport.
- **Gardiennage** (`lib/storage-fee.ts`) : à partir du premier passage à *Prêt* après lequel le client a été **prévenu** (message « véhicule prêt » envoyé, ou « client prévenu » noté à la main) + `storageGraceHours` ; compté pendant *Prêt* et pendant une attente pièces **non** imputable au garage avec le véhicule gardé ; jamais pendant une attente imputable au garage (décision Lot 3, oui par défaut), un retour en atelier, ni quand le véhicule a été restitué. Jours entamés × `storageFeePerDay`. Ajouté comme ligne `isStorageFee` (acceptée, journalisée) **à la création de la facture** (nouveaux ordres, réglage `autoStorageFee`) ; avant, la fiche montre le montant dû ; « Ne pas facturer le gardiennage » = permission `waiveStorageFee` (ADMIN, MANAGER) + motif (événement + journal).
- **Relances graduées** J+7 / J+15 / J+30 après l'échéance (factures des nouveaux ordres, réglage `autoInvoiceReminders`) par la tâche des rappels : message en file (`INVOICE_REMINDER`, clé `invoice-remind:<id>:<niveau>`) + ligne `InvoiceReminder` (niveau) ; jamais à un client qui refuse les messages.
- **Balance âgée** (0–30, 31–60, 61–90, > 90 jours depuis la date de facture) dans *Rapports*.
- Garantie automatique (audit n° 3, nouveaux ordres) : créée à la facture ; à la livraison seulement si elle n'existe pas encore.

## 6. Signatures réutilisées

- Accord du devis enregistré par l'équipe (Lot 2) : signature facultative sur tablette → `Signature` QUOTE + `QuoteApproval.signatureKey` (écrit à la création de la preuve).
- Décharge de sécurité (Lot 3) : signature facultative sur tablette au passage à *Prêt* → `Signature` SAFETY_WAIVER (le papier reste possible).

## 7. Hub

- `media-sync.mjs` copie aussi les images de signature et les documents figés (`Signature.imageKey`, `Signature.documentKey`).
- `test:hub` : nouvelles tables dans les deux sens, ajout seul des deux côtés, migration 28 rejouée deux fois, trigger de facture qui laisse passer la sync, fichiers de signature copiés par `syncMedia`.

## 8. Droits, i18n, tests

- Nouvelles permissions : `signIntake`, `recordHandover`, `issueCreditNote`, `reversePayment`, `waiveStorageFee` (MATRIX, `PERMISSION_GROUPS`, libellés fr / ar / en). `audit()` dans la même transaction partout. Textes fr / ar / en (`v16-lot4-*.ts`). Montants en millimes.
- Tests unitaires : gardiennage (attente imputable / non imputable, restitué, franchise, sans message), balance âgée, empreinte, date de paiement, contrôle de signature PNG, km. Tests base : facture non modifiable en SQL direct, avoir (numéro sans trou, facture gardée), livraison refusée sans restitution signée, gardiennage, acompte → paiement sans double comptage, annulation de paiement, double clic, réception signée verrouillée, relances graduées, balance âgée.

## 9. Contradictions avec le code réel (règle 13) et choix faits

1. **`Payment.invoiceId` est obligatoire** : l'acompte de la réception ne peut pas être un paiement avant la facture. Choix (correction proposée par l'audit n° 27) : le paiement est créé **à la création de la facture**, daté du jour de l'acompte. Aucune contrainte relâchée.
2. **Gardiennage « au moment de la sortie »** alors que la facture (figée) est exigée avant la livraison : la ligne est ajoutée **à la facturation** (au moment où le client vient chercher le véhicule) ; ce qui court après la facture n'est pas facturé (un avoir puis une nouvelle facture n'est pas possible : voir 3).
3. **Avoir et `workOrderId @unique`** (décision du propriétaire) : un ordre dont la facture est annulée par avoir **ne peut pas être refacturé**. Avoir total seulement (pas d'avoir partiel) ; à revoir si le garage veut refacturer après correction.
4. **Statut d'une facture annulée** : nouvelle valeur `CREDITED` de `InvoiceStatus` (sinon elle resterait « à encaisser » partout). Ajoutée par `ADD VALUE IF NOT EXISTS`, utilisée seulement par l'application ; mise en production dans l'ordre habituel (`db:cloud`, hub, push).
5. **Annuler un paiement d'un ordre clôturé** : `CLOSED` est final ; l'ordre repasse automatiquement *Livré* (inverse exact de la clôture automatique), événement + journal.
6. **Plafond d'autorisation** : le prompt ne dit pas ce qu'il devient pour les lignes ; choix : il ne vaut que s'il est **signé** (réception signée) et accepte les lignes présentes au passage en travaux ; les lignes ajoutées ensuite passent par un devis / supplément.
7. **« Notification enregistrée »** : sans SMS / e-mail configuré, aucun message ne part ; une case « client prévenu (téléphone / sur place) » permet de dater la notification à la main, sinon aucun gardiennage n'est compté.
8. **Relances graduées et anciens ordres** : seulement les factures des nouveaux ordres (pas de vague de SMS sur l'historique le jour de la mise en ligne).
