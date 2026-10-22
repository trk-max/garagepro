# V16 — Plan du Lot 2 : devis versionné et accord tracé ligne par ligne

Base : branche `feat/v16-consolidation` (Lot 1 fait, non mis en production). Consigne du propriétaire : « avancer lot par lot, je vérifie à la fin ». Aucune décision bloquante sans réponse sûre n'a été trouvée : les choix ci-dessous sont les plus prudents et sont réversibles.

## 1. Migration `26_quotes` (additive, rejouable deux fois)

- Types (créés dans un bloc `DO … EXCEPTION WHEN duplicate_object`) : `QuoteKind` (INITIAL, SUPPLEMENT), `QuoteStatus` (SENT, APPROVED, PARTIAL, REFUSED, EXPIRED, SUPERSEDED), `ApprovalDecision` (APPROVED, PARTIAL, REFUSED), `ApprovalChannel` (PORTAL, PHONE, IN_PERSON, SMS, EMAIL, WHATSAPP), `LineApprovalStatus` (PENDING, APPROVED, REFUSED), `LinePriority` (SAFETY, RECOMMENDED, WATCH), `PartCondition` (NEW, USED, EXCHANGE, REUSED, CUSTOMER_SUPPLIED). Aucun `ALTER TYPE … ADD VALUE` : rien n'est ajouté à un type existant.
- Table `Quote` : id, workOrderId, number (unique, `D2026-0001`), version (unique par OR), kind, status, validUntil, snapshot (Json), snapshotHash (SHA-256), sentAt, sentById, sentChannel, createdAt.
- Table `QuoteApproval` (**ajout seul**) : id, quoteId, workOrderId, decision, approvedLineIds / refusedLineIds (Json), amountApprovedTtc, approverName, approverContact, channel, recordedById (null = portail), ip, userAgent, signatureKey (null au Lot 2), note, quoteHash (empreinte du devis accepté), createdAt. Trigger `QuoteApproval_readonly` (BEFORE UPDATE OR DELETE) identique à `_audit_log_readonly` : refuse tout, sauf quand `garagepro.sync = 'on'` (la synchronisation passe).
- `WorkOrderLine` : `approvalStatus` (PENDING / APPROVED / REFUSED), `priority`, `partCondition`, `quoteId` (FK `Quote`, SET NULL), `stockDeferred` (bool, défaut false = pièce déjà sortie du stock, comme aujourd'hui).
- `StockReservation.workOrderLineId` (nullable) : réservation rattachée à une ligne de devis.
- Bloc final `_sync_log_trg` identique à `24_accueil` (pose le trigger de sync sur `Quote` et `QuoteApproval`).

**Backfill** (non rétroactif, rien de journalisé pour la sync) :
- `approvalStatus` est ajoutée avec `DEFAULT 'APPROVED'` : toutes les lignes existantes deviennent APPROVED **sans UPDATE** (même technique que `workflowV16`), puis le défaut passe à `PENDING`.
- Seules les lignes des OR actuellement en `QUOTE_SENT` sans `quoteApprovedAt` repassent en `PENDING`, dans un bloc `set_config('garagepro.sync','on',true)` (valeur précédente restaurée), et **seulement au premier passage** (dans le même `IF` que l'ajout de la colonne) : rejouer la migration ne touche plus aux lignes et ne peut donc jamais annuler un accord enregistré depuis.
- Aucun total ne change : la facture des OR d'avant la V16 garde exactement sa règle (toutes les lignes non annulées).

## 2. Devis (`src/server/quotes.ts`)

- **Établir / envoyer le devis** (bouton « Envoyer le devis » existant = passage à `QUOTE_SENT`, plus un bouton « Renvoyer le devis ») : crée une `Quote` avec toutes les lignes `PENDING` non annulées ; version = nombre de devis + 1 ; `kind = SUPPLEMENT` si l'OR a déjà des lignes APPROVED, sinon INITIAL ; un devis précédent encore `SENT` passe `SUPERSEDED`. Snapshot : lignes (id, nature, priorité, état de la pièce, montants), totaux HT/TVA/timbre/TTC ; pour un supplément : ancien total accepté, supplément, nouveau total. Empreinte = SHA-256 (crypto de Node) du JSON aux clés triées (stable). Validité 15 jours (texte déjà imprimé « Devis valable 15 jours »).
- Numéro `D2026-0001` : `Sequence` `quote-2026` dans la transaction + `assertCanNumberDocuments()`.
- **En ligne avec un hub** : la numérotation n'est possible qu'au PC du garage. Décision (la plus sûre) : **envoyer / établir un devis en ligne est refusé** avec un message clair (« Le devis se numérote au garage : envoyez-le depuis le PC du garage »), comme pour les factures. Un devis sans numéro numéroté plus tard par le hub aurait demandé une mise à jour de la ligne `Quote` des deux côtés (risque d'écrasement par la règle « le plus récent gagne »). Ce qui reste possible en ligne : l'accord du client sur le portail et l'enregistrement d'un accord téléphonique sur un devis déjà envoyé.
- OR d'avant la V16 (`workflowV16 = false`) : comportement du Lot 1 conservé (pas de devis versionné obligatoire, un clic accepte tout), mais les lignes passent APPROVED à l'accord pour l'affichage.

## 3. Accord

Fonction commune `recordApproval` (même transaction : `QuoteApproval`, statut des lignes, statut du devis, événement `QUOTE_APPROVED`, `audit()`), double clic = un seul accord (mise à jour conditionnelle du devis `SENT → …`).
- **Portail** (`/suivi/vehicule`) : chaque ligne avec sa priorité et son état de pièce, case accepter / refuser, total recalculé en direct, nom saisi ; `QuoteApproval` canal `PORTAL`, IP, navigateur ; session portail + limite (10 décisions / heure / OR). Refusé si le devis est expiré. `approveQuoteByCustomer` reste = « tout accepter » par le même chemin.
- **Équipe** (téléphone, sur place, SMS, e-mail, WhatsApp) : nouvelle permission `recordQuoteApproval` (ADMIN, MANAGER, RECEPTION ; **pas** MECHANIC), libellés fr/ar/en. Formulaire : nom, contact, canal, lignes, note. Sans devis ouvert (OR V16 resté en devis depuis le Lot 1, assurance, travaux sans devis), le formulaire établit d'abord le devis (au garage seulement avec un hub). Signature sur tablette : prévue au Lot 4 (table `Signature`) ; `signatureKey` reste vide.
- **Après l'accord** : lignes APPROVED / REFUSED, devis APPROVED / PARTIAL / REFUSED, `quoteApprovedAt` renseigné ; passage automatique en réparation (devis initial accepté en tout ou partie, ou supplément décidé), ou en `QUOTE_REFUSED` (motif « refusé par le client ») si tout le devis initial est refusé.
- **Hors ligne / hub** : en ligne avec un hub, l'accord écrit seulement des lignes nouvelles (`QuoteApproval`, événement, journal) et le statut des lignes / du devis ; **la ligne `WorkOrder` n'est pas modifiée** (sinon une modification faite au garage pendant la coupure pourrait être écrasée, ou l'écraser). Au garage, la fiche affiche « Accord du client reçu » et le passage en réparation est autorisé par cet accord.
- **Règle de passage (OR V16)** : `QUOTE_SENT / WAITING_INSURANCE → IN_PROGRESS / WAITING_PARTS` exige un accord enregistré sur le dernier devis et au moins une ligne APPROVED ; la règle provisoire du Lot 1 (motif) disparaît pour les OR V16. OR d'avant la V16 : inchangé.

## 4. Lignes verrouillées, suppléments, facture

- Ligne APPROVED : ni supprimée ni modifiée (il n'existe pas de modification de ligne), seulement annulée avec motif (Lot 1). Ligne REFUSED : conservée (relance au Lot 5). Ligne PENDING : supprimable ; si elle figurait dans un devis envoyé, ce devis passe `SUPERSEDED` (le client ne peut plus accepter un contenu qui a changé) et la fiche demande de renvoyer le devis.
- Ligne ajoutée après accord : PENDING, la fiche affiche « Supplément en attente d'accord ». `IN_PROGRESS → QUOTE_SENT` crée le devis `SUPPLEMENT` (nouvelles lignes seulement, ancien total / supplément / nouveau total).
- Découverte du technicien : note + photo existantes (le mécanicien peut déjà ajouter une ligne, qui reste PENDING et ne sera facturée qu'après accord ; le chef d'atelier chiffre et envoie le supplément).
- **Facture (OR V16)** : seulement les lignes APPROVED non annulées ; s'il reste des lignes PENDING, la facture est **refusée** avec un message (« lignes en attente d'accord : enregistrez la décision du client ou supprimez-les ») plutôt que de les laisser tomber sans le dire. OR d'avant la V16 : inchangé (lignes refusées exclues, cas impossible avant la V16).

## 5. Notifications

Par la file existante (`queueItems` / `deliverPending`, table `Notification`) : `kind = QUOTE` (« devis à valider » / « supplément à valider », lien `/suivi?plate=…` + code) à l'envoi du devis ; `kind = QUOTE_REMINDER`, relance automatique client une fois, après `QUOTE_WAIT_DAYS` (3 jours) sans réponse, via la tâche des rappels (avec un hub, c'est le hub qui envoie).

## 6. Stock (point 8)

- **OR d'avant la V16 : aucun changement** (sortie de stock à l'ajout de la ligne, retour à la suppression / annulation).
- **OR V16** : à l'ajout d'une pièce au devis, la pièce est **réservée** (`StockReservation` liée à la ligne, quantité libre seulement ; avertissement si le libre ne suffit pas, comme aujourd'hui) et `stockDeferred = true` ; à l'accord de la ligne : sortie de stock (`WORK_ORDER`) et réservation consommée ; au refus ou à la suppression : réservation libérée, aucun mouvement de stock ; annulation de l'OR : seules les pièces vraiment sorties reviennent.
- Accord fait **en ligne sur le portail avec un hub** : la sortie de stock est faite au garage (au passage en réparation, à la facture ou à l'enregistrement d'un autre accord), pour ne pas modifier la ligne `Part` en ligne pendant que le garage la modifie (même règle « le plus récent gagne »).
- Tests : réservation à l'ajout, sortie à l'accord, libération au refus / à la suppression, annulation de l'OR, ancien OR inchangé.

## 7. Contradictions avec le code réel (règle 13) et choix faits

1. Numérotation en ligne avec un hub : voir § 2 (refus clair en ligne).
2. « Après l'accord … transition autorisée » et accord hors ligne : voir § 3 (pas d'écriture sur `WorkOrder` en ligne avec un hub).
3. `WAITING_CUSTOMER` n'a pas de passage vers `IN_PROGRESS` : un accord reçu en attente client fait passer l'OR en réparation comme conséquence de l'accord (événement marqué `approval`), sans ajouter de passage manuel.
4. Il n'existe pas de « modification » de ligne : « verrouillée » = pas de suppression (annulation avec motif seulement).
5. Travaux sans devis (`allowWorkWithoutQuote`) et assurance : les lignes sont PENDING ; il faut enregistrer l'accord avant de facturer (formulaire équipe).
6. `EXPIRED` : calculé à l'affichage (date de validité dépassée), le portail refuse un devis expiré ; l'équipe peut renvoyer une nouvelle version.
7. Problèmes de l'audit traités par ce lot : n° 11 / 12 en partie (les pièces d'un devis V16 sont réservées sur le stock libre de façon atomique) ; n° 10 (montants vus par le mécanicien) non traité ici (hors périmètre de l'accord, à faire avec la refonte de la fiche).
