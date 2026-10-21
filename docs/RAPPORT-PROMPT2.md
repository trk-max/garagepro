# GaragePro — Prompt 2/5 (Finance, stock et automatisation) : rapport

Avancement par étape. Chaque étape est commitée séparément ; rien n'est poussé ni déployé sans accord.

| Étape | Contenu | État |
|---|---|---|
| A | Bénéfice réel par réparation | **Terminée et testée** (V7.3) |
| B | Stock : réservations, retours fournisseur, corrections liées | **Terminée et testée** (V7.4) |
| C | QR Code sécurisé par véhicule | **Terminée et testée** (V7.5) |
| D | Rappels clients et alertes (assignation, traitement, anti-répétition) | **Terminée et testée** (V7.6) |
| E | Sauvegardes chiffrées avec restauration testée | **Terminée et testée** (V7.7) |

## Bilan du Prompt 2/5

Toutes les étapes sont terminées et testées. Suite complète à la fin de l'étape E : **252 tests unitaires et 62 tests sur une vraie base PostgreSQL de test** réussis, `tsc`, `eslint` et `next build` réussis. Migrations 7 à 10 : ajouts uniquement, rejouables.

**Nécessite vos identifiants ou une action de votre part (non vérifié ici)** : envoi réel de SMS (Twilio) et d'e-mails ; Vercel Cron (`CRON_SECRET` sur Vercel et dans le `.env` du hub) ; clé de sauvegarde et 2e emplacement sur le PC du garage ; scan d'un QR avec un vrai téléphone (`APP_URL`) ; vérification visuelle des écrans réservés aux comptes connectés.

## Étape E — Sauvegardes chiffrées avec restauration testée (V7.7)

Procédure complète : [`docs/SAUVEGARDES.md`](SAUVEGARDES.md).

- Copie cohérente (`pg_dump` dans un instantané figé), **chiffrement AES-256-GCM** avec une clé hors du projet (`npm run backup:key`, jamais écrasée), empreintes SHA-256.
- **Vérification par restauration réelle** dans une base jetable, comparaison du nombre de lignes de **chaque table** avec l'instantané d'origine, base jetable supprimée ensuite. « Restauration testée » n'est affiché que si tout correspond ; sinon « intégrité seulement » ou « échouée ».
- **2e emplacement** (`BACKUP_COPY_DIR`), copie vérifiée par empreinte ; **versions** conservées (`BACKUP_KEEP`, 14).
- **Automatique** sur le hub : chaque jour à `BACKUP_HOUR` + au démarrage si la dernière a plus de 26 h. Désactivé tant que la clé n'existe pas.
- **Alerte** : menu *Sauvegardes* (administrateur) avec pastille si échec, ancienneté > 36 h ou restauration non testée ; message dans la fenêtre du hub ; code de sortie 1 pour le Planificateur de tâches.
- **Restauration** : `npm run backup:restore` uniquement dans une base **neuve et vide** (refus sinon) ; jamais par-dessus la base en service.

### Tests réellement exécutés

- `tests/backup.test.ts` (5) : chiffrement/déchiffrement identique (2 Mo binaires, illisible en clair) ; **un octet modifié ou une mauvaise clé ⇒ refus** ; clé créée une fois, jamais écrasée, validée ; conservation des N plus récentes sans toucher aux autres fichiers ; noms triables.
- `tests/backup.db.test.ts` (4, **vrais pg_dump / pg_restore** sur la base de test) : sauvegarde chiffrée + copie + **restauration prouvée** (plus de 30 tables, mêmes nombres de lignes), aucun fichier en clair ni base jetable laissés ; sauvegarde abîmée ⇒ vérification refusée ; restauration dans une base neuve (données présentes) et **refus dans une base non vide** ; conservation de 2 versions.
- **Commande réelle** `npm run backup:key`, `npm run backup`, `npm run backup:verify` exécutées sur la base de test (clé et dossiers temporaires) : 43 tables, 661 lignes, « RESTAURATION TESTÉE », copie faite, `status.json` écrit ; échec volontaire (base inexistante) ⇒ `ok: false`, erreur enregistrée, dernière réussite conservée.

**Non fait ici** : sauvegarde de **votre** base réelle (il faut d'abord créer **votre** clé avec `npm run backup:key` et en garder une copie) ; alerte par e-mail (alerte dans l'application seulement).

## Étape D — Rappels clients et alertes (V7.6)

### Rappels clients

- **Plans d'entretien par véhicule** (fiche client → véhicule → *Entretien*) : vidange, filtres, entretien périodique, freins, pneus, batterie, autre ; tous les N jours et/ou N km, à partir de la dernière fois (date + km). Bouton *Fait* : redémarre le compte ; le kilométrage du véhicule n'est relevé que s'il est saisi et plus élevé (jamais baissé, jamais inventé).
- **Échéance au km** : comparée au dernier kilométrage **enregistré**. Sans kilométrage, la règle au km est affichée « impossible à calculer » et **aucun rappel n'est envoyé sur cette base**.
- Rappels envoyés : entretien (N jours avant, réglable), rendez-vous dans les 24 h, livraison promise dans les 24 h.
- **Canaux** : SMS (Twilio) et e-mail (Resend / Gmail) **seulement s'ils sont configurés**. Rien n'est simulé : *Envoyé* uniquement si le fournisseur a accepté ; *Échec* avec le message du fournisseur, réessayé 3 fois (15 min, 30 min, 1 h) ; *Non envoyé* avec la raison (aucun canal configuré, pas de téléphone/e-mail).
- **Modèles de messages** modifiables (Paramètres → Rappels et alertes), variables `{garage} {plate} {item} {when} {date} {time} {km} {phone}`.
- **Consentement** : case « Refuse les rappels d'entretien » sur la fiche client ; respectée. Les messages de service (RDV, livraison) restent envoyés.
- **Pas de doublon** : (rappel, canal) unique en base ; chaque envoi est « réservé » avant d'être fait — deux exécutions simultanées n'envoient qu'une fois.
- **Historique** : menu *Rappels clients* (admin, responsable) : statut, erreurs, nombre d'essais, *Réessayer*, état de la configuration, *Lancer maintenant* (admin).
- **Planification** : en ligne, Vercel Cron chaque jour à 7 h UTC (`vercel.json`) ; avec le hub, le PC du garage toutes les heures et **la copie en ligne n'envoie pas** (pas de double message). Route `/api/cron/reminders` protégée par `CRON_SECRET` (comparaison à temps constant ; sans secret : tout est refusé).
- Espace entreprise : bloc « Entretiens à prévoir » limité aux véhicules de l'entreprise.

### Alertes (page Suivi & retards)

Nouvelles alertes : **réparation bloquée** (statut inchangé depuis N jours), **livraison à risque** (promise dans moins de N heures, pas en fin de travaux), **stock minimal**, en plus des livraisons dépassées, pièces en retard et assurance. Chaque alerte : dossier, durée, responsable, contact, action recommandée ; **assigner**, **traitée**, **reporter 1 ou 3 jours**, **rouvrir**. Une alerte traitée sort de la liste ; si la situation change (nouvelle heure promise…), c'est une nouvelle alerte. Seuils dans Paramètres → Rappels et alertes. Journal : `alert.*`, `maintenance.*`, `settings.reminders`.

Migration `prisma/migrations/10_reminders_alerts/migration.sql` — ajouts uniquement.

### Tests réellement exécutés

- `tests/maintenance.test.ts` (8) : échéances date/km, km inconnu jamais deviné, le premier atteint l'emporte, jamais fait, une clé par occurrence, modèles, délais de réessai.
- `tests/reminders.db.test.ts` (12, vraie base, faux fournisseurs SMS/e-mail) : envoi réel enregistré et pas de doublon au 2e passage ; refus du client respecté ; km inconnu ⇒ aucun rappel ; aucun canal ⇒ « non envoyé » avec la raison ; erreur fournisseur ⇒ échec, réessai au bon moment, abandon après 3 ; **deux exécutions simultanées ⇒ un seul SMS** ; RDV et livraison du lendemain ; hub ⇒ la copie en ligne n'envoie pas ; espace entreprise limité à ses véhicules ; route planifiée refusée sans le secret exact ; alertes bloquée / à risque / stock ; traitée, nouvelle alerte si nouvelle date, report, réouverture, journal, clé invalide refusée.
- Suite complète : 247 tests unitaires, 58 tests base de données, `tsc`, `eslint`, `next build` : réussis.

**Non vérifié** (nécessite vos identifiants) : envoi réel d'un SMS Twilio ou d'un e-mail, exécution réelle de Vercel Cron. À faire : ajouter `CRON_SECRET` dans le `.env` du PC du garage et sur Vercel.

## Étape C — QR Code sécurisé par véhicule (V7.5)

### Fonctionnement

- Fiche client → véhicule → **QR Code** (admin, responsable, réception) : créer, **imprimer l'étiquette** (QR + immatriculation + garage), **renouveler** (l'ancienne étiquette cesse de fonctionner), **révoquer**.
- Le QR contient `<APP_URL>/v/<jeton>` : jeton de 24 octets aléatoires (192 bits), unique, sans lien avec la plaque ou l'identifiant : impossible à deviner.
- Le **serveur** décide de ce que le scan ouvre :

| Qui scanne | Résultat |
|---|---|
| Équipe connectée autorisée à voir les clients (admin, responsable, réception, mécanicien) | Fiche du client, sur ce véhicule |
| Compte entreprise **propriétaire** du véhicule | Espace entreprise, sur ce véhicule (ses propres règles d'accès, montants selon le rôle) |
| Toute autre personne, **y compris une autre entreprise ou le magasinier** | Seulement : nom du garage, immatriculation, marque et modèle, boutons « Suivre ma réparation » (code à 4 chiffres toujours exigé), « Prendre rendez-vous », téléphone |
| Jeton faux, renouvelé ou révoqué | « QR Code non valable », sans aucune donnée ; 30 essais faux par adresse IP et 15 minutes, puis blocage |

- Posséder le QR ne donne **jamais** l'historique, les pièces, les devis, les factures, le nom du client ni les montants.
- Page sans indexation, sans envoi de l'adresse aux autres sites (`no-referrer`).
- Journal : `vehicle.qrIssue`, `vehicle.qrRenew`, `vehicle.qrRevoke` — **le jeton n'y est jamais écrit**.

Migration `prisma/migrations/9_vehicle_qr/migration.sql` : 2 colonnes optionnelles + index unique (ajouts uniquement).

### Tests réellement exécutés

- `tests/vehicle-qr.db.test.ts` (6, vraie base PostgreSQL) : scan anonyme = plaque/marque/modèle uniquement (comparaison exacte de l'objet renvoyé) ; mécanicien → fiche, magasinier → carte publique ; entreprise propriétaire → portail, **autre entreprise → carte publique** ; renouvellement tue l'ancien jeton, révocation tue l'actuel ; jeton absent du journal ; 20 jetons tous différents ; mécanicien ne peut pas créer de QR ; jetons malformés/devinés refusés puis blocage après 30 essais (une autre adresse non bloquée).
- **Vérifié dans un vrai navigateur** (serveur de test sur la base de test) : page de scan publique (plaque, modèle, deux actions, rien d'autre) et page « QR Code non valable ».
- Suite complète : 239 tests unitaires, 46 tests base de données, `tsc`, `eslint`, `next build` : réussis.

Non vérifié : impression physique de l'étiquette, scan avec un vrai téléphone (nécessite `APP_URL` accessible depuis le téléphone).

## Étape B — Stock : réservations, retours, corrections (V7.4)

### Ce qui existait déjà (réutilisé, pas dupliqué)

Catalogue (références, fournisseurs, coûts, prix), entrées (achat, bon de réception), sorties atelier et retours atelier, ajustements d'inventaire, seuil minimal et alertes, bons de commande avec date prévue, pièces manquantes et réparations bloquées (page *Suivi & retards*), historique des mouvements, journal.

### Ajouté

| Fonction | Règle |
|---|---|
| **Réservation** pour une réparation | Fiche de l'ordre → *Pièces réservées* (admin, responsable, réception, magasinier). La pièce reste en stock mais n'est plus **disponible** (disponible = stock − réservé, colonnes sur la page Stock). Contrôle **atomique** dans une seule requête SQL : deux réservations simultanées de la dernière unité libre → une seule réussit. |
| Utilisation d'une réservation | Quand la pièce est ajoutée à l'ordre, sa réservation pour cet ordre est consommée (en tout ou en partie) : les mêmes unités ne sont jamais comptées deux fois. |
| Libération | Manuelle avec motif, ou **automatique** à la livraison ou à l'annulation de l'ordre. Une réservation n'est libérée qu'une fois. |
| Sorties manuelles | Refusées si elles prennent des unités réservées (vérifié dans la même requête SQL que la sortie : pas de course entre deux sorties). Règle existante conservée : l'atelier peut utiliser une pièce même si le stock enregistré est insuffisant, avec un avertissement. |
| **Retour fournisseur** | Nouveau type de mouvement, fournisseur obligatoire, toujours une sortie. |
| **Correction** | *Corriger* sur un mouvement manuel (achat, inventaire, retour) : mouvement inverse « Correction » lié à l'original, motif obligatoire. L'original reste dans l'historique. **Une seule correction par mouvement** (contrainte unique en base, même en cas de clics simultanés). Les mouvements d'ordre ou de bon de réception se corrigent depuis leur document. |
| Base de données | Contraintes de sécurité : réservation toujours positive, compteur réservé jamais négatif. |

Journal : `stock.reserve`, `stock.release`, `stock.consumeReservation`, `stock.supplierReturn`, `stock.correct`.

Migration `prisma/migrations/8_stock_reservations/migration.sql` — ajouts uniquement (2 valeurs d'énumération, colonnes, table `StockReservation`, contraintes, synchronisation du hub). **Rejouée deux fois sur la base de test sans erreur** (avec la migration 7).

### Tests réellement exécutés

- `tests/stock-and-limits.test.ts` (+3) : sortie refusée si elle prend des unités réservées, deux sorties simultanées de la dernière unité libre, retour fournisseur.
- `tests/stock.db.test.ts` (8, vraie base PostgreSQL) : deux réservations simultanées de la dernière unité → une seule ; sortie manuelle bloquée par la réservation ; consommation partielle à l'ajout sur l'ordre ; libération manuelle unique et libération automatique à l'annulation ; contrainte « réservé ≥ 0 » en base ; retour fournisseur ; correction liée, unique même en simultané, original conservé ; mouvements d'ordre non corrigeables ici ; correction refusée si les unités sont réservées.
- Suite complète : 239 tests unitaires, 40 tests base de données, `tsc`, `eslint`, `next build` : réussis.

Non vérifié ici : affichage dans le navigateur avec un compte connecté.

## Étape A — Bénéfice réel par réparation (V7.3)

### Ce qui est calculé

Pour chaque réparation (fiche de l'ordre, administrateur) et sur une période (menu **Rentabilité**) :

| Ligne | Source | Règle |
|---|---|---|
| Chiffre d'affaires HT | Facture (`totalHt`) | Le timbre et la TVA sont des taxes, pas du CA. Pas encore facturée → lignes de l'ordre, marquée « estimé ». |
| Coût des pièces | Lignes « pièce » de l'ordre | Prix d'achat **enregistré au moment où la pièce est utilisée** (`WorkOrderLine.unitCost`). Une hausse de prix ultérieure ne réécrit pas le passé. |
| Dépenses directes | Nouvelle table `WorkOrderExpense` | Sous-traitance, remorquage… Jamais effacées : annulées avec motif. |
| Marge brute | | CA HT − pièces − dépenses directes |
| Coût main-d'œuvre | Chronomètres des mécaniciens (`LaborEntry`) | **Heures réellement travaillées** (heures-personnes) × coût horaire de l'employé (sinon celui du garage). Jamais les heures facturées. |
| Frais indirects | Paramètres → Rentabilité | Aucun / % du CA HT / montant par heure-personne. |
| Bénéfice estimé | | Marge brute − main-d'œuvre − frais indirects |
| Encaissé | Paiements | Affiché à part, réparti client / assurance. Une facture impayée n'est jamais comptée comme encaissement. |

**Pas de double comptage** : une pièce est comptée une seule fois, depuis la ligne de l'ordre qui l'a consommée (les mouvements de stock ne s'ajoutent pas) ; une ligne supprimée (pièce rendue au stock) disparaît du calcul ; une dépense annulée n'est plus comptée.

**Montants estimés ou incomplets** : chaque cas est signalé (astérisque dans le rapport, encadré sur la fiche) : non facturée, pièce utilisée avant la V7.3 (prix d'achat actuel utilisé, le prix d'origine n'ayant pas été enregistré), pièce saisie à la main sans coût, coût horaire non renseigné, chronomètre en cours, main-d'œuvre facturée sans temps enregistré.

### Rapport « Rentabilité »

Réparations **facturées** sur la période (date de facture), regroupées par réparation, véhicule, client, type d'intervention (même classement que les rapports existants) ou mois. Totaux, marge et bénéfice ; nombre de véhicules livrés non facturés (non comptés) ; export **Excel (.xlsx)**.

### Permissions

- Rentabilité (fiche et rapport) : **administrateur seulement** (`viewProfit`), vérifié côté serveur dans la page et dans l'export.
- Dépenses directes : administrateur et responsable (`manageExpenses`).
- Coût horaire d'un employé : administrateur seulement (donnée salariale).
- Toutes les modifications vont au journal : `expense.add`, `expense.void`, `settings.profit`, `employee.hourlyCost`, et le payeur dans `payment.record`.

### Base de données

Migration `prisma/migrations/7_profitability/migration.sql` — **ajouts uniquement** : `WorkOrderLine.unitCost`, `User.hourlyCost`, `Payment.payer` (défaut « CUSTOMER »), `Setting.laborCostPerHour / overheadMode / overheadValue`, table `WorkOrderExpense` (+ synchronisation du hub). Rejouable sans erreur. Les anciennes lignes de pièces ne sont **pas** complétées avec le prix actuel (ce serait présenter un prix d'aujourd'hui comme le coût réel passé).

### Tests réellement exécutés

- `tests/profit.test.ts` (11 tests, calcul pur) : exemple complet, 2 mécaniciens × 2 h = 4 h-personnes de coût pour 2 h facturées, facture impayée ≠ encaissement, répartition client/assurance, coût figé vs prix actuel, cas estimés/incomplets, frais indirects, totaux (taux calculé sur le total), CA nul.
- `tests/profit.db.test.ts` (5 tests, vraie base PostgreSQL de test) : coût figé malgré une hausse de prix, ligne supprimée non comptée, réparation complète (facture, dépenses dont une annulée, heures réelles de 2 personnes avec coûts différents, paiement assurance), journal et non-suppression, rapport par période et regroupement, permissions.
- Suite complète : 236 tests unitaires et 32 tests base de données passent ; `tsc`, `eslint` et `next build` réussis.

Non vérifié ici : affichage dans le navigateur avec un compte administrateur (nécessite votre connexion), base Supabase réelle.

### À faire par le garage

1. `npm run db:cloud` puis `git push` (quand vous le décidez) ; redémarrer `start-hub.cmd`.
2. **Paramètres → Rentabilité** : coût horaire moyen de la main-d'œuvre (et éventuellement frais indirects).
3. Facultatif : coût horaire de chaque employé sur sa fiche (administrateur).
