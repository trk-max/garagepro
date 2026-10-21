# Sauvegardes et restauration — GaragePro

Les sauvegardes sont faites **par le PC du garage (hub)**, qui a PostgreSQL et sa propre base. La base en ligne (Supabase) est recopiée sur le PC par la synchronisation ; voir aussi les sauvegardes incluses dans votre offre Supabase.

## Ce que fait une sauvegarde

1. **Copie cohérente** de la base (`pg_dump`, schéma `public`) prise dans un instantané figé : même si le garage travaille pendant ce temps, la copie est cohérente, et le nombre de lignes de chaque table est relevé dans **le même instantané**.
2. **Empreinte SHA-256** de la copie.
3. **Chiffrement AES-256-GCM** avec une clé stockée **hors du projet** (par défaut `C:\Users\<vous>\GaragePro\backup.key`). Le fichier `.gpbk` est illisible sans la clé, et toute modification d'un seul octet est détectée.
4. **Vérification réelle** : le fichier chiffré est déchiffré, l'empreinte est comparée, puis la sauvegarde est **restaurée dans une base jetable** (`gp_restore_check_…`) sur le PostgreSQL local, et **le nombre de lignes de chaque table est comparé** à l'original. La base jetable est ensuite supprimée. Une sauvegarde n'est marquée « restauration testée » que si tout correspond.
5. **Copie sur un 2e emplacement** (`BACKUP_COPY_DIR` : clé USB, dossier OneDrive, NAS), vérifiée par son empreinte.
6. **Conservation** des `BACKUP_KEEP` dernières versions (14 par défaut) dans chaque dossier ; seuls les fichiers `garagepro-AAAAMMJJ-HHMMSS.gpbk` sont concernés.
7. **État** écrit dans `status.json`, affiché dans l'application (menu **Sauvegardes**, administrateur). Le menu affiche une alerte si la dernière sauvegarde a échoué, a plus de 36 h, ou n'a pas pu être restaurée.

## Mise en place (une seule fois, sur le PC du garage)

1. Créer la clé :
   ```
   npm run backup:key
   ```
   **Faites immédiatement une copie de `backup.key`** sur une clé USB rangée à part (ou un coffre). Sans cette clé, aucune sauvegarde ne peut être relue. Ne la mettez **jamais** dans le dossier du projet ni sur GitHub.
2. Dans le `.env` du PC du garage (voir `.env.example`) :
   - `BACKUP_COPY_DIR="E:\GaragePro-sauvegardes"` (clé USB) ou un dossier OneDrive — fortement conseillé : une sauvegarde sur le même disque ne protège pas d'une panne de ce disque ;
   - facultatif : `BACKUP_HOUR` (23 par défaut), `BACKUP_KEEP` (14), `BACKUP_DIR`.
3. Tester tout de suite :
   ```
   npm run backup
   ```
   Le message doit indiquer **« RESTAURATION TESTÉE »**.
4. Ensuite, `start-hub.cmd` fait une sauvegarde chaque jour à `BACKUP_HOUR`, et une au démarrage si la dernière a plus de 26 h. (Sans hub : planifiez `npm run backup` avec le Planificateur de tâches Windows.)

## Vérifier une sauvegarde à tout moment

```
npm run backup:verify -- "C:\Users\<vous>\GaragePro\backups\garagepro-20261021-230000.gpbk"
```

## Restaurer (après une panne)

La restauration se fait **toujours dans une base NEUVE et vide**, jamais par-dessus la base en service.

1. Arrêter le hub (fermer la fenêtre `start-hub.cmd`).
2. Créer une base vide, par exemple :
   ```
   "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres garagepro_restauree
   ```
3. Restaurer (la clé doit être à son emplacement, ou indiquée par `BACKUP_KEY_FILE`) :
   ```
   npm run backup:restore -- "<chemin>\garagepro-AAAAMMJJ-HHMMSS.gpbk" "postgresql://postgres:MOTDEPASSE@localhost:5432/garagepro_restauree"
   ```
4. Vérifier les données (par exemple en lançant l'application sur cette base), puis, dans le `.env`, faire pointer `DATABASE_URL` et `DIRECT_URL` vers `garagepro_restauree`.
5. Relancer `start-hub.cmd`. L'ancienne base n'est jamais supprimée automatiquement.

## Limites connues

- Les photos et vidéos des réparations (stockage de fichiers) ne sont pas dans la sauvegarde de la base ; le hub les recopie depuis le stockage en ligne (synchronisation des médias).
- L'alerte d'échec est affichée dans l'application et dans la fenêtre du hub ; il n'y a pas d'e-mail d'alerte.
- Si la clé est perdue, les sauvegardes sont définitivement illisibles (c'est le principe du chiffrement).
