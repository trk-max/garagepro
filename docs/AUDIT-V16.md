# AUDIT V16 — problèmes reproduits (phase A)

**Règle suivie : chaque problème ci-dessous a été reproduit** — par un test sur une vraie base PostgreSQL jetable (`tests/audit-v16/reproductions.audit.ts`, identifiant « A-xx »), par le navigateur (Edge sans interface, base de démo, `next start -p 3300`) ou par une requête HTTP. Ce qui n'a pas pu être reproduit est rangé à part (§ 4), sans compter.
Aucune correction n'a été faite (phase C, après accord).

Rejouer les reproductions :
```
TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres TEST_DB_NAME=gp_test_v16_audit \
npx vitest run --config tests/audit-v16/vitest.config.ts        → 30 tests réussis = 30 problèmes présents
```
Ces tests vérifient le comportement **fautif actuel** ; en phase C, chaque test sera inversé (test de régression) au moment de la correction. Ils ne font pas partie de `npm run test:db`.

**Suivi des corrections — V16 Lot 1 (voir docs/RAPPORT-V16.md)** : corrigés n° 1, 2, 4, 7, 9 (tests A-01, A-04, A-07, A-09 et la moitié « livraison sans facture » de A-02/A-03 inversés et déplacés dans `tests/workflow-v16.db.test.ts`, qui fait partie de `npm run test:db`) ; en partie n° 3, 27 et 36. Il reste 26 reproductions dans `tests/audit-v16` (26 réussies = 26 problèmes encore présents ou en partie).

**Suivi des corrections — V16 Lot 2 (voir docs/RAPPORT-V16.md)** : n° 11 et 12 en partie (pour un nouvel ordre, les pièces d'un devis ne sont plus sorties du stock à l'ajout mais réservées atomiquement sur le stock libre, et sortent à l'accord ; A-10 / A-11 restent reproduits sur des ordres d'avant la V16). Les reproductions qui facturent passent maintenant par un accord enregistré (aide `agreeAll`). 26 réussies.

**Suivi des corrections — V16 Lot 3 (voir docs/RAPPORT-V16.md)** : n° 13 corrigé (le bon de réception passe la pièce manquante à « reçue », la rattache au bon, la réserve pour l’ordre et le signale ; A-12 inversé et déplacé dans `tests/delays-v16.db.test.ts`) ; n° 14 en partie (le magasinier met à jour les pièces manquantes avec le nouveau droit `managePartNeeds` ; le lien de sa cloche vers `/garage/suivi` reste refusé, A-13 réduit à cela). 25 réussies.

**Suivi des corrections — V16 Lot 4 (voir docs/RAPPORT-V16.md)** : n° 3 corrigé pour les nouveaux ordres (garantie créée à la facture ; à la livraison seulement si la facture existe ; A-03 inversé) ; n° 19 corrigé (clé anti double clic du formulaire, vérifiée par le serveur ; A-20 inversé) ; n° 26 corrigé (date du paiement saisie, annulation d’un paiement par un responsable avec motif ; A-27 inversé) ; n° 27 corrigé pour les nouveaux acomptes (vrai paiement à la facture, daté du jour de l’acompte ; anciens acomptes laissés tels quels ; A-28 inversé). Tests inversés dans `tests/lot4-v16.db.test.ts`. Les reproductions qui livrent un ordre (A-08, A-26) utilisent un ordre « d’avant le Lot 4 ». 21 réussies.

**Suivi des corrections — V16 Lot 5 (voir docs/RAPPORT-V16.md)** : aucun problème de cette liste corrigé (le n° 10 — montants vus par le mécanicien — n’était ni petit ni sans risque ; seule précaution : chiffrer un point d’inspection est réservé au droit `manageQuotes`). Les reproductions qui passent par le contrôle qualité donnent maintenant les km de l’essai (règle du Lot 5). 21 réussies. Bilan des 5 lots et liste des 28 problèmes encore ouverts : fin de docs/RAPPORT-V16.md.

## Bilan

| Gravité | Nombre |
|---|---|
| **Bloquant** (argent, stock ou données faux dans l'usage courant, ou droit dangereux) | **5** |
| **Important** | **22** |
| **Mineur** | **15** |
| Total reproduit | **42** |
| Doublons de fonctions (§ 3, non comptés comme bugs) | 7 |
| Observé mais non reproduit à coup sûr (§ 4, non compté) | 2 |

Aucun problème de perte de données ni de faille ouverte sur Internet n'a été trouvé. Points forts vérifiés : refus du trop-perçu (client et fournisseur), numéros de factures et de bons sans doublon, isolation du portail entreprise (testée), toutes les tables métier synchronisées par le hub, accès sur mesure appliqué partout où une permission est contrôlée, aucune page en erreur 500/404 sur les liens visibles, aucun débordement horizontal à 390 px et 768 px sur les pages parcourues, pages serveur < 160 ms avec la base de démo.

## 1. Liste numérotée

### Bloquants

**1. Un mécanicien peut livrer un ordre non facturé et annuler un ordre en cours.** — *Ordres / permissions* — A-01
- Reproduction : `changeStatus(<ordre prêt>, "DELIVERED", mécanicien)` et `changeStatus(<ordre en réparation>, "CANCELLED", mécanicien)` réussissent. Les actions `changeStatusAction` et `workshopStatusAction` ne demandent que `viewWorkOrders` / `useWorkshop`, que le rôle MECHANIC possède. L'annulation remet les pièces en stock.
- Correction proposée : permissions distinctes « livrer » (A, M, R) et « annuler » (A, M) vérifiées dans `changeStatus` ; atelier mobile limité aux étapes techniques.

**2. Un ordre peut être livré sans facture ni paiement, sans aucun avertissement.** — *Ordres / argent* — A-01, et dans le navigateur
- Reproduction navigateur (admin) : ordre OR-0169 « Prêt » → bouton « Étape suivante : Livré » → livré, sans facture (vérifié en base : `status = DELIVERED`, aucune facture). Rien dans « À traiter » ensuite (seule la page Rentabilité, admin, compte les livrés non facturés).
- Correction proposée : livraison refusée tant qu'il n'y a pas de facture (ou dérogation d'un responsable avec motif, tracée) ; ligne « livré non facturé / non payé » dans « À traiter ».

**11. Un ordre consomme une pièce réservée pour un autre ordre (disponible négatif).** — *Stock / réservations* — A-10
- Reproduction : pièce stock 1, réservée 1 pour l'ordre A ; `addLine(ordre B, pièce, 1)` par un mécanicien réussit → stock 0, réservé 1, disponible −1. Seul un avertissement est affiché.
- Correction proposée : refuser (ou demander une confirmation de responsable) quand la quantité dépasse le disponible ; verrou de la ligne pièce (`FOR UPDATE`) comme pour les sorties manuelles.

**13. Pièce reçue au bon de réception, mais la pièce manquante de l'ordre reste « commandée ».** — *Achats → atelier* — A-12
- Reproduction : pièce manquante ajoutée à un ordre puis « commandée » ; bon de commande puis bon de réception de cette pièce → le besoin reste `ORDERED`, `purchaseOrderId` vide, aucune réservation pour l'ordre. L'interface ne permet jamais de relier un besoin à un bon.
- Correction proposée : lier le besoin au bon (choix à la commande) ; à la réception, besoin → « reçue », pièce réservée pour l'ordre, ordre signalé « pièce arrivée » au mécanicien et dans « À traiter ».

**19. Double clic sur « Encaisser » un montant partiel : deux paiements.** — *Paiements* — A-20
- Reproduction : facture de 500 DT ; deux `recordPayment(100 DT)` simultanés → 2 paiements, payé 200 DT. Le verrou de ligne empêche seulement le dépassement du reste dû.
- Correction proposée : jeton anti-doublon (clé unique envoyée par le formulaire) vérifié dans la transaction.

### Importants

**3. Garantie liée à la livraison, pas à la facture.** — *Garanties* — A-02/A-03
- Reproduction : ordre livré sans facture → 1 garantie créée ; ordre facturé mais non livré → 0 garantie (réglage 6 mois).
- Correction : garantie créée (ou proposée) à la facture ; à la livraison seulement si la facture existe.

**4. Contrôle qualité validé puis pièce ajoutée : « Prêt » accepté sans nouveau contrôle.** — *Contrôle qualité* — A-04
- Reproduction : CQ rempli et validé, puis `addLine(pièce)`, puis `changeStatus(READY)` → accepté.
- Correction : toute modification des lignes après validation annule la validation (comme le passage en réparation le fait déjà).

**5. Deux ordres ouverts en même temps pour le même véhicule.** — *Ordres* — A-05
- Reproduction : véhicule avec un ordre « en réparation » ; `createWorkOrder` (bouton « Nouvel ordre » de la fiche client) → 2 ordres ouverts. Seule la recherche par plaque redirige vers l'ordre existant.
- Correction : à la création, proposer l'ordre ouvert existant ; créer un second seulement après confirmation.

**6. Accueil d'un RDV : deux clics simultanés → deux ordres pour un seul RDV.** — *RDV* — A-06
- Reproduction : client et véhicule connus ; deux `checkInAppointment` simultanés → 2 ordres, dont 1 sans lien avec le RDV. (Avec un véhicule nouveau, la plaque unique empêche le doublon.)
- Correction : passage du RDV `CONFIRMED → CHECKED_IN` conditionnel, dans la même transaction que la création de l'ordre.

**8. Livraison : le plan d'entretien (V7.6) n'est pas mis à jour.** — *Entretien* — A-08
- Reproduction : plan « vidange » dû ; ordre avec ligne « Vidange moteur » livré → `lastDoneAt` du plan inchangé ; le rappel V7.6 reste dû (seul l'agenda V12 est recalculé).
- Correction : fusion des deux systèmes (voir doublon D2 et proposition) ; à défaut, la livraison met à jour le plan.

**9. Message « véhicule prêt » envoyé en direct, sans file ni trace.** — *Notifications* — A-09
- Reproduction : `notifyVehicleReady` (appelée après « Prêt ») → aucune ligne dans l'historique des envois (`Notification`). Sur le hub sans internet, le message est perdu sans que personne le sache ; il part dans la langue de l'employé, pas du client.
- Correction : passer par la même file que les rappels (nouvelle tentative, historique, langue du client).

**10. Le mécanicien voit les montants, peut saisir un prix, et reçoit le prix d'achat des pièces.** — *Ordres / confidentialité* — navigateur
- Reproduction (karim, mécanicien, fiche d'un ordre) : totaux TTC affichés ; champ « prix unitaire » présent ; le code HTML de la page contient 13 fois `costPrice` (prix d'achat de toutes les pièces, envoyé au composant d'ajout de ligne). La page « nouvel ordre » cache pourtant l'argent sans `viewFinance`.
- Correction : sans `viewFinance`, pas de montants, pas de champ prix (prix du catalogue imposé), liste de pièces sans prix d'achat.

**12. Deux sorties simultanées de la dernière pièce depuis deux ordres : stock −1.** — *Stock* — A-11
- Reproduction : stock 1 ; deux `addLine` simultanés sur deux ordres → stock −1.
- Correction : même verrou que n° 11.

**14. Le magasinier ne peut pas mettre à jour une pièce manquante, et le lien de sa cloche le renvoie à l'accueil.** — *Suivi / permissions* — A-13 + navigateur
- Reproduction : `reportMissingPart` = oui pour STOREKEEPER, `manageRepairFollowUp` (exigé par `updatePartNeedAction`) = non. Navigateur (stock@) : « À traiter » → « Pièces manquantes · Ouvrir la liste » → `/garage/suivi` → renvoyé sur `/garage`.
- Correction : permission « gérer les pièces manquantes » donnée au magasinier ; lien vers une liste qu'il peut ouvrir.

**15. Deux réceptions simultanées du même bon : quantité reçue au double.** — *Réceptions* — A-14
- Reproduction : bon de 1 pièce ; deux `createReceipt` simultanés → les deux réussissent, reçu 2, stock 2.
- Correction : verrou des lignes du bon (`FOR UPDATE`) avant le contrôle du reste à recevoir.

**16. Facture fournisseur rattachée au bon annulé d'un autre fournisseur : acceptée.** — *Factures fournisseurs* — A-15
- Reproduction : bon du fournisseur B annulé ; facture du fournisseur A sur ce bon → créée. Le formulaire liste les bons de tous les fournisseurs. Aucun lien facture ↔ bon de réception.
- Correction : contrôler fournisseur et statut du bon ; proposer les réceptions non facturées.

**18. Suggestions « stock bas » : proposent de recommander une pièce déjà commandée.** — *Achats* — A-17
- Reproduction : stock 0, minimum 2, bon approuvé de 4 en cours → la pièce est encore suggérée.
- Correction : comparer (stock − réservé + commandé non reçu) au minimum.

**21. Facture fournisseur sans timbre : impossible de payer le montant réel.** — *Factures fournisseurs* — A-22
- Reproduction : HT 100 + TVA 19 (réel 120 avec timbre) → paiement de 120 refusé « trop-perçu ».
- Correction : champ timbre sur la facture fournisseur.

**22. Rapports et Rentabilité donnent deux coûts de pièces différents pour la même facture.** — *Rapports / rentabilité* — A-23
- Reproduction : pièce coût 10 DT utilisée et facturée, puis coût passé à 15 DT → Rentabilité 10 000, Rapports (jour) 15 000 millimes.
- Correction : un seul calcul (coût figé sur la ligne) partagé par les deux pages.

**23. « Solde de trésorerie » des Rapports différent de la page Trésorerie.** — *Rapports / trésorerie* — A-24
- Reproduction : échéance de 500 DT payée aujourd'hui → solde des Rapports inchangé (200 000 avant et après) ; la Trésorerie la déduit.
- Correction : supprimer ce solde des Rapports ou le lire depuis la Trésorerie (un seul endroit).

**25. Réclamation de garantie à 0 DT réclamé : acceptée pour 50 000 DT, sans plafond.** — *Garanties* — A-26
- Reproduction : `setClaimAmounts(… amountClaimed 0)` puis `ACCEPTED` avec 50 000 000 millimes → enregistré ; la trésorerie attend ce remboursement.
- Correction : montant réclamé obligatoire avant « soumise », ou plafond = coût pièces + main-d'œuvre.

**26. Paiement toujours daté « maintenant » : un encaissement d'hier saisi aujourd'hui fausse la trésorerie.** — *Paiements / trésorerie* — A-27
- Reproduction : solde saisi pour hier (incluant 200 DT reçus hier) ; paiement de 200 DT saisi aujourd'hui → ouverture de la trésorerie +200 000 (compté deux fois). Pas de correction ni d'annulation possible d'un paiement.
- Correction : date du paiement (par défaut aujourd'hui) ; annulation d'un paiement par un responsable, avec motif (avoir pour la facture).

**27. Acompte saisi à l'ordre jamais enregistré comme paiement.** — *Paiements* — A-28
- Reproduction : ordre avec acompte 100 DT, facture 420 DT → payé 0, aucun paiement ; la facture entière reste « à encaisser » ; le rappel d'acompte de la facture disparaît au premier paiement partiel.
- Correction : l'acompte encaissé à la réception crée un vrai paiement rattaché à la facture dès sa création.

**29. Les accès sur mesure restent après un changement de rôle.** — *Accès* — A-31
- Reproduction : mécanicien avec ajout « voir la rentabilité » ; rôle changé en réception → l'ajout reste actif.
- Correction : à chaque changement de rôle, montrer les accès sur mesure et demander de les garder ou de les retirer.

**32. Le CIN des employés est visible et modifiable par le responsable d'atelier.** — *Équipe / données RH* — navigateur
- Reproduction (chef@, responsable) : `/garage/equipe/<karim>` → le numéro de CIN est dans la page et le champ `nationalId` est modifiable. Les contrats de travail (qui le contiennent) sont pourtant réservés à A et RH.
- Correction : CIN, date de naissance, salaires réservés à une permission « données RH sensibles » (A, RH).

**37. Fiche ordre surchargée.** — *Ergonomie* — navigateur
- Reproduction : fiche d'un ordre en contrôle qualité (admin, PC) : **112 boutons / champs visibles**, page de **5 880 px** de haut (≈ 6,5 écrans) ; au téléphone **6 674 px**. Tous les blocs sont ouverts quelle que soit l'étape (photos, garanties, contrats, dépenses, prise en charge, OBD…). Capture `ordre-fiche-admin-pc-fr.png`, `ordre-fiche-telephone-ar.png`.
- Correction : point 4 de la proposition (étapes, blocs utiles seulement).

**38. Hub : numéros des réclamations de garantie et des annonces non séparés pair / impair si le hub a été installé avant ces modules.** — *Hub* — script d'audit
- Reproduction : base aux migrations 0–13, `splitSequences` (hub:init), puis migrations 14–24 → `WarrantyClaim_number_seq` et `Listing_number_seq` en +1 (pas +2) ; `splitSequences` n'est relancé ni par `prehub`, ni par `start`, ni par `migrate-cloud`. Deux réclamations créées hors ligne et en ligne prendraient le même numéro → ligne de synchro en échec.
- À vérifier sur le PC du garage (lecture seule, sans rien changer) : `SELECT sequencename, increment_by FROM pg_sequences WHERE sequencename IN ('WarrantyClaim_number_seq','Listing_number_seq');` — si `1`, le problème est présent.
- Correction : relancer `splitSequences` (idempotent) à chaque démarrage du hub et après `db:cloud`.

### Mineurs

**7. Accord du devis par le client : deux clics → deux événements « devis accepté ».** — *Portail* — A-07. Correction : mise à jour conditionnelle `where status = QUOTE_SENT`.

**17. Bon partiellement reçu impossible à solder.** — *Achats* — A-16 : 1 reçu sur 4, annulation refusée, le bon reste « partiel » pour toujours. Correction : action « Solder le reliquat ».

**20. Réparation gratuite : 1,000 DT de timbre facturé.** — *Factures* — A-21 : facture HT 0 → TTC 1 000 millimes. Correction : pas de timbre si le total est nul (à confirmer avec le comptable).

**24. « En retard » calculé de deux façons.** — *Rapports* — A-25 : délai de paiement 0, facture du jour → Rapports « 1 en retard », liste des factures 0. Correction : une seule fonction `isOverdue`.

**28. Deux définitions de « présent ».** — *Pointage / tableau de bord* — A-30 : entrée pointée il y a 20 h sans sortie → Équipe « sorti » (règle des 16 h), tableau de bord « 1 présent ». Correction : une seule fonction.

**30. Une personne RH peut se délivrer sa propre attestation.** — *Attestations* — A-32. Correction : « pas sur soi-même sauf ADMIN », comme pour les congés et les pointages.

**31. Congé enregistré, déjà approuvé, pour un employé désactivé.** — *Congés* — A-33. Correction : refuser.

**33. Bloc « Stock pièces » du tableau de bord montré à des rôles qui ne voient pas le stock.** — *Tableau de bord* — navigateur : comptable, RH, vendeur, responsable showroom voient « Stock pièces » ; le lien les renvoie sur `/garage`. Correction : bloc filtré par `viewStock`.

**34. Liens qui renvoient à l'accueil faute de droit.** — *Navigation* — navigateur : comptable, facture → lien de l'ordre → `/garage` ; magasinier, stock → lien d'un ordre → `/garage`. Correction : afficher le lien seulement si la page est permise (ou une vue lecture seule).

**35. Documents imprimés en français seulement.** — *i18n* — navigateur, interface en arabe : prise en charge, devis, facture (« Arrêtée la présente facture… »), modèles de contrats (« Loi organique… ») restent en français. À confirmer : choix légal voulu ou manque.

**36. Journal en arabe : noms de champs et valeurs bruts.** — *Journal* — navigateur (`journal-admin-pc-ar.png`) : « Cost », « NoteRef », « OrderId », « PENDING_APPROVAL », « QUALITY_CONTROL », « CASH »… ; les filtres ne couvrent que 19 types d'éléments. Correction : libellés traduits.

**39. Sans proxy (hub sur le réseau du garage), l'adresse IP est prise dans l'en-tête `X-Forwarded-For` envoyé par le client.** — *Sécurité* — A-40 + HTTP : 3 connexions avec `X-Forwarded-For: 6.6.6.1/2/3` → compteurs `login:ip:6.6.6.1/2/3` en base. Les limites par IP se contournent ; les limites par e-mail / plaque tiennent. En ligne (Vercel) ce n'est pas le cas. Correction : `TRUSTED_PROXY_HOPS=0` au lancement du hub.

**40. Un tiers peut bloquer un compte 15 min.** — *Connexion* — HTTP : 5 mauvais mots de passe sur `rh@demo.tn` depuis une autre IP → le bon mot de passe est refusé (`code=locked`). Choix anti-force brute connu ; correction possible : blocage par couple e-mail + IP, ou délai progressif.

**41. La migration `0_init` n'est pas rejouable.** — *Migrations* — rejeu complet deux fois : 24/25 rejouées, `0_init` refuse. Sans effet en pratique (migration de départ, jamais rejouée). À documenter seulement.

**42. 43 clés étrangères sans index.** — *Performance* — requête sur `pg_constraint` (base de démo). Surtout des colonnes « auteur » sans importance ; à surveiller : `WorkOrderLine.partId`, `GoodsReceipt.purchaseOrderId`, `SupplierInvoice.purchaseOrderId`, `Appointment.vehicleId`, `WorkOrderPartNeed.purchaseOrderId`. Aucune lenteur mesurée avec la base de démo.

## 2. Résumé par catégorie demandée

- **Liens morts / pages 404-500** : 0 sur les liens visibles des 9 rôles ; 2 sortes de liens « visibles mais refusés » (n° 14, 33, 34).
- **Boutons sans effet** : aucun trouvé sur les 5 tâches jouées ; aucun bouton sans nom accessible sur les pages parcourues.
- **Traductions** : écrans traduits ; restent en français : documents imprimés et modèles de contrats (n° 35), journal (n° 36), textes enregistrés en base (« Main d'œuvre », « ordre annulé », « Saisi par le responsable », « Stock initial »), export Excel / CSV de l'équipe, contenu des rappels SMS V7.6 (constatés dans le code, non comptés).
- **RTL / téléphone / tablette** : aucun débordement horizontal (pages parcourues à 390 px ar, 390 px fr, 768 px ar) ; la fiche ordre au téléphone fait 6 674 px (n° 37).
- **Ruptures de chaîne** : n° 2, 3, 8, 9, 13, 27 ; « paiement → trésorerie » fonctionne (testé par `cash.db`) sauf la date (n° 26) ; « prévision d'entretien → RDV » : le RDV est relié à la prévision (`linkAppointment`, V12), testé par `agenda.db`.
- **Incohérences d'argent** : n° 19, 20, 21, 22, 23, 24, 25, 26, 27 (chiffres dans chaque reproduction).
- **Permissions** : n° 1, 10, 14, 29, 30, 32.
- **Concurrence** : n° 6, 7, 12, 15, 19.
- **Hors ligne** : toutes les tables métier ont leur trigger ; photos synchronisées (WorkOrderMedia, ListingMedia, certificats de compétences) mais **pas les scans de contrats signés** (limite documentée dans CONTRATS.md, non comptée) ; n° 9 et 38. Aucun écran ne signale « internet nécessaire » (SMS, e-mail, IA, RDV en ligne, portails) — constaté, à traiter dans la proposition.
- **Performance** : aucune page > 2 s ; médiane serveur max 150 ms ; n° 42.
- **Sécurité** : aucun secret en dur trouvé (recherche dans `src`, `scripts`) ; n° 39, 40.

## 3. Doublons (deux endroits pour la même notion)

| | Doublon constaté | Où |
|---|---|---|
| D1 | **Rappels / alertes à 7 endroits** | Notifications (historique), Agenda + messages d'agenda, Suivi & retards (alertes), cloche / À traiter, blocs du tableau de bord, fiche entretien du véhicule, portail entreprise. Le stock bas apparaît à 3 endroits. |
| D2 | **Deux systèmes d'entretien** | Plans V7.6 (`VehicleMaintenance`, rappels SMS) et agenda prévisionnel V12 (`MaintenanceForecast`), sur la même page `/vehicules/[id]/entretien`, avec deux clés de dédoublonnage (risque de deux SMS pour la même vidange, non reproduit). |
| D3 | **Trois « agendas »** | `/garage/appointments` (RDV), `/garage/agenda` (prévisions d'entretien), `/garage/calendrier` (congés + RDV + dates promises). |
| D4 | **Trois « messages »** | Messagerie showroom, messages d'agenda, messages client dans la chronologie de l'ordre. |
| D5 | **Deux « réclamations »** | Réclamations clients (`/reclamations`) et réclamations de garantie au fournisseur (`/garanties/reclamations`). |
| D6 | **Personnel géré à deux endroits** | Comptes dans Paramètres, fiches et accès dans Équipe. |
| D7 | **Deux calculs de temps** | Présence (pointage) et temps sur réparation (chronos), sans rapprochement (un chrono peut tourner sans pointage) ; deux définitions de « présent » (n° 28). |

Pas de doublon pour : contrats (une seule notion, par catégories), journal (une seule page).

## 4. Observé mais non reproduit à coup sûr (non compté)

- Erreur React n° 418 (différence serveur / navigateur au premier affichage) vue 4 fois pendant l'exploration (admin bon de commande, réception facture en arabe, RH tableau de bord et compétences) ; non revue en rechargeant les mêmes pages. Probablement une date / heure formatée différemment côté serveur et navigateur.
- Pistes de lecture du code **non reproduites** (à vérifier en phase C, pas des constats) : contournement de la taille maximale des envois en `Transfer-Encoding: chunked`, année des numéros prise sur l'heure du serveur (nuit du 1er janvier), réservation non recréée après suppression d'une ligne, une personne RH qui crée son propre contrat de travail, deux SMS pour la même vidange (D2).
