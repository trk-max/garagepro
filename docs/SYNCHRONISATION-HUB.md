# Totaux et synchronisation hors ligne

Le hub du garage et la base en ligne peuvent recevoir des changements en même temps. Le hub synchronise les lignes détaillées, puis recalcule les totaux concernés dans une transaction sur chaque base.

## Totaux recalculés

| Champ | Source |
|---|---|
| `Part.stockX100` | Somme des mouvements de stock |
| `Part.reservedX100` | Somme des réservations au statut `ACTIVE` |
| `Invoice.paidAmount` | Somme des paiements, y compris les lignes négatives d’annulation |
| `SupplierInvoice.paidAmount` | Somme des paiements fournisseur |
| `PurchaseOrderLine.receivedX100` | Somme des lignes de réception explicitement liées |

Le statut d’une facture client ou fournisseur est recalculé avec le montant payé. Une facture client déjà annulée par un avoir conserve le statut `CREDITED`.

Les corrections sont inscrites dans le rapport de synchronisation et dans le journal d’audit. Un paiement cumulé supérieur au total de facture n’est pas masqué : le hub le signale et l’administrateur le retrouve dans « À traiter ». Les factures annulées par avoir ne sont pas classées comme surpaiements.

Les autres compteurs ne sont pas des sommes de lignes comptables : `ServicePackage.usageCount` et `QueueTicket.callCount` comptent des actions sans registre enfant complet, et `Sequence.value` réserve les prochains numéros. Les valeurs `totalHt`, `totalTax` et `totalTtc` sont des montants figés sur les documents émis. Le hub ne les reconstitue pas à partir d’informations incomplètes.

## Lignes de réception anciennes

La migration 34 ajoute un lien facultatif entre une ligne de réception et une ligne de commande. Les lignes historiques sont liées automatiquement uniquement quand un bon contient une seule ligne pour la pièce reçue. Si plusieurs lignes correspondent, le compteur existant est préservé; le hub signale le cas au lieu de choisir une ligne arbitrairement.

## Après fusion

Après la fusion du code, appliquer la migration à la base en ligne :

```powershell
npm run db:cloud
```

Le hub reçoit la même migration lors de sa mise à jour. Pour lancer le test réel à deux bases, `TEST_PG_URL` doit pointer vers un serveur PostgreSQL réservé aux tests : la suite crée et supprime des bases `gp_hub_*`. Ne lancez pas ce test contre une base réelle. Sans cette variable, le test est ignoré; les tests unitaires restent exécutables avec `npm run check`.
