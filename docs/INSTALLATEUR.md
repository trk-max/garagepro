# Installateur Windows

## Fabriquer l'installateur (sur le PC de développement)

```
winget install -e --id JRSoftware.InnoSetup   (une seule fois)
npm run installer
```

Résultat : `dist\GaragePro-Setup-<date>-<commit>.exe` (environ 9 Mo).
Il contient **uniquement le code commité** (`git archive HEAD`) : jamais `.env`, `node_modules`, `.next`,
les sauvegardes ou des données. Commitez d'abord ce que vous voulez livrer.

## Installer sur un PC

1. Lancer `GaragePro-Setup-….exe` (pas besoin de droits administrateur).
   Dossier par défaut : `%LOCALAPPDATA%\GaragePro`.
2. Options : raccourcis sur le Bureau ; démarrer le hub à l'ouverture de session (PC du garage).
3. À la fin, laisser cochée « Lancer la configuration » : `setup.cmd` installe Node.js et Git si besoin,
   les dépendances, crée `.env` (à remplir), applique les migrations (aucune donnée effacée) et lance les tests.

Prérequis non inclus : **PostgreSQL** pour le hub du garage (voir la section hub du README).

Raccourcis du menu Démarrer : *GaragePro - hub du garage*, *Ouvrir GaragePro (navigateur)*,
*Configuration (setup)*, *Dossier GaragePro*, *Désinstaller GaragePro*.

## Mettre à jour

Relancer un installateur plus récent dans le même dossier. Le code est remplacé (les anciennes pages sont
supprimées) ; `.env`, `node_modules`, la base PostgreSQL et les sauvegardes ne sont pas touchés.
Cocher ensuite « Mettre à jour les dépendances et la base », puis redémarrer le hub.

## Désinstaller

Panneau Windows « Applications » ou raccourci *Désinstaller GaragePro*. Le code est retiré ;
`.env` et `node_modules` restent dans le dossier (à supprimer à la main pour tout enlever).
La base PostgreSQL et les sauvegardes (`%USERPROFILE%\GaragePro\backups`) ne sont jamais touchées.

## Vérifié

Installation silencieuse dans un dossier de test, réinstallation par-dessus (`.env` conservé, page supprimée
retirée), désinstallation (`.env` conservé, entrée Windows retirée).
Non vérifié : l'assistant affiché à l'écran et `setup.cmd` sur un PC neuf. L'exécutable n'est pas signé :
Windows SmartScreen peut afficher « Éditeur inconnu » → *Informations complémentaires* → *Exécuter quand même*.
