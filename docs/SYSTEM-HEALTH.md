# Santé du système

La page **Santé du système** est réservée à l'administrateur. Elle regroupe le dernier signal du hub, l'état local des sauvegardes et les erreurs récentes de l'application.

## Données conservées

- Les erreurs serveur, erreurs d'API et erreurs des limites d'interface sont dédupliquées par origine, emplacement et résumé.
- Les rapports navigateur ne contiennent que le type d'erreur et, si disponible, la référence Next.js. Les piles d'appel, requêtes, corps de formulaire, secrets et messages bruts ne sont pas transmis.
- Les erreurs du hub et des sauvegardes sont stockées sans détails techniques. Le rapport du hub est copié dans l'état de synchronisation en ligne après une connexion réussie.
- Le PC du garage publie aussi l'état de la dernière sauvegarde sur le site en ligne lorsque `CLOUD_DATABASE_URL` est configurée. L'état local reste disponible dans le fichier de statut existant.
- Les données de monitoring sont supprimées après 30 jours, à chaque enregistrement, au plus toutes les six heures pendant l'activité de l'administrateur, ou à l'ouverture de la page.
- Les rapports envoyés par le navigateur sont limités à 8 par adresse réseau sur 10 minutes.

## Déploiement

La migration additive `prisma/migrations/35_system_errors/migration.sql` crée la table d'erreurs et ses index. Elle ne modifie ni ne supprime les données existantes. Appliquer les migrations en ligne avec `npm run db:cloud` après vérification de la cible, et sur la base locale du garage avec `npx prisma migrate deploy`. Le hub doit également recevoir la migration afin que ses erreurs locales puissent se synchroniser.

Pour afficher l'état du hub en ligne, configurer `GARAGE_HUB=1` sur le site et continuer à exécuter le synchroniseur du PC du garage. Sur le PC du garage, `GARAGE_HUB_LOCAL=1` affiche l'état local. Un signal de synchronisation de plus de cinq minutes est considéré comme ancien.

## Vérification

```powershell
npm run check
npm run db:cloud
```

La vérification de migration destructive doit être exécutée uniquement avec une URL d'un serveur PostgreSQL de test isolé, jamais avec l'URL de production.
