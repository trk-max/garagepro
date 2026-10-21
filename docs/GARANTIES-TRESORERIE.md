# Garanties, dépenses et trésorerie prévisionnelle (V8.4)

Trois pages, toutes dans le menu :

| Page | Adresse | Qui |
| --- | --- | --- |
| Garanties (+ fiche garantie, fiche réclamation) | `/garage/garanties` | Admin, Responsable, Réception, Mécanicien — **montants : Admin et Responsable seulement** |
| Dépenses et échéances | `/garage/depenses` | Admin, Responsable |
| Trésorerie prévisionnelle | `/garage/tresorerie` | Admin, Responsable |
| Réglages (garantie automatique, alerte de trésorerie) | Paramètres | Admin |

Les droits sont vérifiés **sur le serveur** (pas seulement cachés dans la page) : un mécanicien qui appelle
directement le serveur ne reçoit aucun montant de garantie et ne peut pas ouvrir la trésorerie
(`src/lib/permissions.ts` : `manageWarranties`, `viewWarrantyMoney`, `viewCashForecast`, `manageExpenses`).
La réception continue de voir les factures clients comme avant.

## Garanties

- **Réparation** : garantie donnée par le garage au client. **Pièce** : garantie donnée par le fournisseur
  (fournisseur obligatoire, pièce de la réparation facultative).
- **Automatique à la livraison** : Paramètres → « Garantie automatique des réparations », N mois et/ou N km.
  `0` et `0` (réglage initial) = pas de garantie automatique. Quand un ordre passe à **Livré**, une seule
  garantie est créée pour cet ordre (une 2ᵉ tentative ne fait rien : colonne unique `autoWorkOrderId`).
  Le kilométrage de départ est celui de la réception (sinon celui de la fiche du véhicule).
- **À la main** : sur l'ordre de réparation, carte « Garanties » → « Ajouter une garantie ». Elle commence à
  la livraison (ou aujourd'hui si le véhicule n'est pas livré). Durée en mois et/ou date de fin (la plus proche
  l'emporte) et/ou kilométrage. Un kilométrage couvert exige un kilométrage de départ connu.
- **Validité** : valable jusqu'au dernier jour inclus et/ou jusqu'au kilométrage de fin — **la première limite
  atteinte l'emporte** (fonction pure `warrantyValidity`, `src/lib/warranty.ts`). Si rien ne permet de conclure
  (pas de date de fin et kilométrage actuel du véhicule inconnu), la garantie est « **À vérifier** » : rien
  n'est supposé. Le kilométrage actuel est celui de la fiche du véhicule.
- **Annulation** (Admin, Responsable) : avec un motif ; jamais effacée.

### Réclamations

`Ouverte → Envoyée → Acceptée | Acceptée en partie | Refusée → Clôturée` (une réclamation ouverte peut
aussi être clôturée directement si elle est abandonnée).

- Tout le monde (sauf magasinier) peut **ouvrir** une réclamation, sur une garantie en cours ou « à vérifier »
  (refusé si expirée ou annulée). Le mécanicien et l'accueil voient l'état, jamais les montants ni la décision.
- Admin / Responsable : coûts (pièces, main-d'œuvre), montant réclamé, décision (« Acceptée » sans montant =
  montant réclamé ; « Acceptée en partie » = montant obligatoire ; « Refusée » = 0), remboursements reçus.
- **Remboursements** : seulement sur une réclamation acceptée (totalement ou en partie) et non clôturée,
  jamais au-delà du reste attendu. Un remboursement saisi par erreur s'annule avec un motif.
- **Clôturée** = dossier terminé : plus aucun remboursement n'est attendu, même si tout n'a pas été reçu.

Chaque création, changement d'état, montant, remboursement et annulation est écrit dans le **Journal**
(`audit`, avant / après), dans la même transaction.

## Dépenses et échéances

Charges du garage : loyer, salaires, électricité, crédit… **une fois**, **tous les mois**, **trimestres** ou
**ans**, avec une dernière échéance facultative.

- **Première échéance** = la prochaine à payer : les échéances déjà réglées avant ne sont pas à saisir.
- Les échéances sont créées **au fur et à mesure** jusqu'à 90 jours, sans doublon (clé unique charge + date) ;
  une charge due le 31 tombe le dernier jour des mois courts puis revient au 31.
- **Marquer payée** : date, montant réellement payé, mode, référence. Une échéance payée est **soldée**, même si
  le montant diffère (facture d'électricité variable). Paiement saisi par erreur : « Annuler le paiement » + motif.
- Modifier une charge : libellé, catégorie, montant, dernière échéance, fournisseur, notes. Le nouveau montant
  ne change que les échéances **non payées à partir d'aujourd'hui**. Fréquence et première échéance ne
  changent pas : arrêter la charge et en créer une nouvelle.
- **Arrêter** une charge : ses échéances non payées ne sont plus prévues (rien n'est effacé). La reprendre
  recrée les échéances manquantes depuis la première échéance : marquez payées celles déjà réglées.

## Trésorerie prévisionnelle

Calcul : fonction **pure** `forecastCash()` dans `src/lib/cash-forecast.ts` (aucun accès à la base ;
`src/server/cash.ts` charge les données). Résultat par **semaine**, sur **30, 60 ou 90 jours**.

### Point de départ

Le **solde caisse + banque** saisi à la main (page Trésorerie), **en fin de journée** à la date indiquée.
L'historique est conservé ; c'est la **date la plus récente** qui est utilisée (pas forcément la dernière saisie).
Une date dans le futur est refusée.

### Réel, attendu, sans double comptage

| Catégorie | Ce qui est compté |
| --- | --- |
| Encaissements **réels** | paiements clients (client ou assurance) et remboursements de garantie **datés après le jour du solde** |
| Décaissements **réels** | paiements fournisseurs et échéances payées **datés après le jour du solde** |
| Factures clients **impayées** | `total TTC − déjà payé` (jamais le total), à l'échéance de la facture |
| Remboursements **attendus** | `accepté − déjà reçu`, réclamations acceptées non clôturées |
| Dettes fournisseurs | `total TTC − déjà payé`, à l'échéance |
| Échéances de dépenses | échéances non payées des charges actives |

Un paiement enregistré passe donc d'« attendu » à « réel » : le solde d'aujourd'hui augmente, l'attendu
diminue d'autant, **le solde final ne bouge pas**. Ce qui est daté le jour du solde ou avant est déjà dans le
solde saisi et n'est jamais ajouté. Solde estimé aujourd'hui = solde saisi + réel depuis.

Non prévus : les **dépenses directes** saisies sur une réparation (`WorkOrderExpense`, déjà dépensées, sans date
de paiement — si elles ont été payées après le jour du solde, ressaisissez le solde ou saisissez-les comme
dépense « une fois ») ; les réparations **pas encore facturées**.

### Scénarios (hypothèses affichées sur la page)

| | Prudent | Normal | Optimiste |
| --- | --- | --- | --- |
| Factures clients | encaissées 30 j après max(échéance, aujourd'hui) | 15 j après | à l'échéance (aujourd'hui si en retard) |
| Factures en retard de plus de… | 60 j : **0 %** | 90 j : **50 %** | toutes à 100 % |
| Remboursements de garantie acceptés | **0 %** | 100 %, 30 j après la décision (ou aujourd'hui) | 100 % à la décision (ou aujourd'hui) |
| Fournisseurs et échéances de dépenses | 100 % à l'échéance (aujourd'hui si en retard) | idem | idem |

Arrondi au millime. Les montants non comptés par le scénario et ceux au-delà de l'horizon sont affichés à part.

### Données incomplètes

- **Pas de solde saisi** : les flux attendus sont affichés, mais aucun solde n'est inventé ; pas d'alerte.
- **Solde de plus de 14 jours** ou daté dans le futur : avertissement.
- **Facture client sans échéance** : date de facture + délai de paiement des Paramètres (compté et signalé).
- **Facture fournisseur sans échéance** : payable à réception (signalé).

### Alerte de trésorerie

Paramètres → « Alerte de trésorerie » : **seuil** (DT, `0` = désactivée, réglage initial) et **scénario**.
Si le solde prévu (jour par jour, sur 90 jours, selon ce scénario) passe sous le seuil, l'alerte apparaît sur la
page Trésorerie et dans **Suivi & retards** (type `cashLow`, compteur du tableau de bord), **uniquement pour
l'administrateur et le responsable** : elle n'est même pas calculée pour les autres rôles, et la réception ne
peut pas la traiter / reporter. La clé contient le scénario et le 1er jour sous le seuil : si ce jour change,
c'est une nouvelle alerte.

## Données préservées

Migration `prisma/migrations/14_warranties_cash` : **uniquement des ajouts** (6 tables, 4 colonnes de
Paramètres avec valeur par défaut « désactivé »), rejouable sans effet, triggers du hub ajoutés aux nouvelles
tables. Rien n'est effacé dans l'application : garanties, remboursements et paiements d'échéance s'annulent
avec un motif ; une charge s'arrête.

## Limites

- **Un seul garage** : GaragePro ne gère pas de succursales. La protection « par succursale » demandée n'a
  donc pas d'objet : les droits sont **par rôle** seulement, et tous les chiffres sont ceux du garage entier.
  Ajouter des succursales demanderait un identifiant de succursale sur les clients, ordres, factures, stock,
  utilisateurs… (hors périmètre).
- **Estimation, pas une comptabilité** : pas de TVA à reverser, pas d'impôts calculés, pas de rapprochement.
- **Aucune connexion bancaire** : le solde est saisi à la main ; l'argent reçu ou payé sans être enregistré
  dans GaragePro n'est connu qu'en ressaisissant le solde.
- Les **dates d'encaissement** sont des hypothèses (scénarios) : un client peut payer plus tôt ou plus tard.
- Le **kilométrage actuel** d'un véhicule n'est connu que par la réception, la fiche ou un relevé OBD : une
  garantie limitée en km peut rester « à vérifier ».
- Les montants sont en **TTC** pour les factures ; le montant des échéances de dépenses est celui saisi.
- Numérotation des réclamations (`GAR-0001`) par compteur de base de données, comme les réclamations clients.

## Tests

- Calculs purs : `tests/cash-forecast.test.ts`, `tests/warranty.test.ts`, `tests/expenses.test.ts` (`npm test`).
- Base réelle (`npm run test:db`) : `tests/warranty.db.test.ts` (garantie auto idempotente, droits, réclamation
  complète), `tests/expenses.db.test.ts`, `tests/cash.db.test.ts` (pas de double comptage, solde absent,
  facture sans échéance, droits, alerte), `tests/migration-14.db.test.ts` (migration rejouée sur des données).
