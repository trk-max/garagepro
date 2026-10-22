# « À traiter » montre la voiture — paiements partiels et date du prochain paiement

Deux demandes du propriétaire :

1. « Quand tu me donnes À traiter, montre-moi la voiture. »
2. « Quand la voiture n'est pas payée en entier, préviens-moi, montre-la-moi, préviens-moi encore, et laisse-moi
   noter la date du prochain paiement. »

## 1. Chaque ligne d'« À traiter » mène aux fiches exactes

- Un clic sur une ligne de la cloche ouvre `/garage/a-traiter/<élément>` : **exactement** les fiches comptées
  (mêmes conditions que le chiffre de la cloche), pas une liste générale.
- Pour une voiture : plaque, marque / modèle, client, n° d'ordre (et de facture), le chiffre clé et un lien direct
  vers l'ordre ou la facture.
- La page « À traiter » montre les premières lignes de chaque élément ; « Voir les N » ouvre la page de l'élément,
  « Ouvrir le module » ouvre l'ancienne liste (les anciennes adresses marchent toujours).
- Chiffre clé selon l'élément : reste dû (livrés non soldés, factures), jours de retard (livraisons promises
  dépassées), pièce manquante et date prévue, jours d'attente (devis, assurance, véhicules prêts), minutes
  d'attente (accueil), nombre de messages non lus, stock / minimum.
- Seul « Sauvegarde à vérifier » n'a pas de fiches (c'est un état) : sa page renvoie au module.
- « Véhicules livrés sans facture soldée » = ordre V16 **livré** dont la facture n'est **pas soldée** ou pas encore
  faite. Vérifié : un ordre soldé passe tout seul à « Clôturé » (après la livraison, chaque paiement, un avoir ;
  une annulation de paiement le rouvre en « Livré »). Une garde a été ajoutée : une facture soldée restée « Livré »
  (paiement arrivé par la synchro, par exemple) n'apparaît plus.

## 2. Factures partiellement payées, promesse de paiement

Chaque facture qui a un reste dû est dans **une seule** liste :

| Liste | Quand |
|---|---|
| **Promesses de paiement dépassées** (rouge) | la dernière date promise est passée et le client n'a pas payé depuis |
| **Factures en retard** (sans date promise) | échéance passée et aucune date promise à attendre |
| **Factures partiellement payées ou paiement promis** | déjà payée en partie, ou une date promise à venir |

Chaque ligne montre la voiture, le client, le n° de facture, le total, le payé, le reste, l'échéance et le
prochain paiement (« À fixer » s'il n'y en a pas).

### Noter la date du prochain paiement

- Sur la **facture** (carte « Prochain paiement ») et sur l'**ordre** tant qu'il reste un montant dû.
- Date obligatoire (aujourd'hui ou plus tard, un an au plus), montant facultatif (vide = tout le reste dû ; jamais
  plus que le reste), note facultative.
- Réservé à ceux qui encaissent (permission « Enregistrer un paiement » : administrateur, responsable, accueil).
  Un mécanicien ne peut pas.
- Chaque date est **ajoutée** (jamais modifiée ni effacée) : la dernière compte, les précédentes restent dans
  l'historique de la facture, avec qui l'a notée et quand. Chaque enregistrement est écrit dans le journal et dans
  l'historique de l'ordre.

### Nouvelle alerte

- Date passée sans paiement → la facture revient **en rouge** dans « À traiter » et la cloche, avec
  « Relancer le client » (ouvre la relance existante de la facture : WhatsApp / SMS / e-mail, rien n'est envoyé
  tout seul).
- Le client paie au moins le montant promis (ou n'importe quel montant si aucun n'était promis) → l'alerte
  disparaît ; s'il reste un montant dû, la facture attend la prochaine date (« À fixer »).
- Facture soldée → elle sort de toutes les listes.
- La liste des factures a une colonne « Prochain paiement » (rouge si dépassée).

## Technique

- Migration `30_payment_promises` : une table `PaymentPromise` (facture, ordre, jour promis à midi heure du
  garage, montant en millimes ou vide, note, auteur, date). Ajout seul (trigger, sauf la synchro du hub), suivie
  par le hub (`_sync_log_trg`). Aucune colonne ajoutée à `Invoice` (la facture émise reste figée). Rejouable.
- Règles : `src/lib/payment-promise.ts` ; serveur : `src/server/payment-promises.ts` ; fiches d'« À traiter » :
  `src/server/todo-details.ts` ; page d'un élément : `src/app/(garage)/garage/a-traiter/[key]/page.tsx`.
- Tests : `tests/payment-promise.test.ts`, `tests/todo-payments.db.test.ts`, `tests/todo.test.ts`,
  `tests/hub-sync.test.ts` (migration 30). Captures : `docs/media/todo-payments/`.

## Mise en production

1. Fusionner la branche, redémarrer le hub (la migration 30 s'applique à la base du garage).
2. `npm run db:cloud` pour la base en ligne, comme pour les lots précédents.
