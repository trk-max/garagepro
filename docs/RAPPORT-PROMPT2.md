# GaragePro — Prompt 2/5 (Finance, stock et automatisation) : rapport

Avancement par étape. Chaque étape est commitée séparément ; rien n'est poussé ni déployé sans accord.

| Étape | Contenu | État |
|---|---|---|
| A | Bénéfice réel par réparation | **Terminée et testée** (V7.3) |
| B | Stock : réservations, retours fournisseur, corrections liées | À faire |
| C | QR Code sécurisé par véhicule | À faire |
| D | Rappels clients et alertes (assignation, traitement, anti-répétition) | À faire |
| E | Sauvegardes chiffrées avec restauration testée | À faire |

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
