# L'application GaragePro (sur téléphone, sans store)

GaragePro s'installe sur l'écran d'accueil d'un iPhone ou d'un Android comme une vraie application :
une icône, l'ouverture en plein écran, sans barre du navigateur. Ce n'est pas une application de
l'App Store ou du Play Store : c'est le même site, avec les mêmes données, simplement « installé ».
Chaque mise à jour du site arrive toute seule dans l'application.

Il y a **deux applications** :

| | App client | App équipe |
|---|---|---|
| Pour qui | Les clients du garage | Le personnel (mécaniciens, accueil, responsable, magasinier…) |
| Nom sur l'écran d'accueil | Le nom du garage (Réglages, ex. « 911 Garages ») | « GaragePro Équipe » |
| Icône | Monogramme GP sur fond noir | Monogramme GP + pastille orange (clé) |
| Adresse d'ouverture | `/app` | `/equipe` (connexion, puis l'Espace équipe) |
| Ce qu'on y fait | Suivre ma réparation, Prendre rendez-vous, Showroom, Assistant, Appeler / WhatsApp | Ce qui compte pour son métier, en gros boutons (voir plus bas) |

## Installer l'app client

Le client ouvre le **site internet du garage** (adresse en `https://…`), page `/app`
(ex. `https://mon-garage.tn/app`). Un QR code vers cette adresse sur le comptoir suffit.

**iPhone (Safari)**
1. Ouvrir `https://…/app` dans **Safari** (pas dans Chrome ni dans l'aperçu d'Instagram / WhatsApp).
2. Toucher le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisir **« Sur l'écran d'accueil »**, puis **Ajouter**.

**Android (Chrome)**
1. Ouvrir `https://…/app` dans **Chrome**.
2. Toucher le bouton **« Installer »** de la carte « Installer l'application » (en bas de la page),
   ou le menu ⋮ → **« Installer l'application »** / « Ajouter à l'écran d'accueil ».

Toutes les pages de l'app restent **dans l'app** (`/app/suivi`, `/app/rdv`, `/app/showroom`, `/app/assistant`) :
même fond sombre, même en-tête (flèche retour, nom du garage, langue) et la **barre d'onglets toujours visible**,
aussi dans le navigateur avant l'installation. Le site internet garde ses pages habituelles (`/suivi`, `/rdv`…).

Une fois installée, l'application s'ouvre sur l'accueil avec trois grands boutons
(**Suivre ma réparation**, **Prendre rendez-vous**, **Showroom**) et une barre d'onglets en bas
(Accueil · Suivre · Rendez-vous · Showroom). Le suivi garde tout ce qui existait : code à 4 chiffres,
avancement en direct, photos, devis accepté ligne par ligne (et devis complémentaires), message au garage.

## Installer l'app équipe

**Depuis le site internet (https) — installation complète**
1. Ouvrir `https://…/equipe` (iPhone : dans Safari ; Android : dans Chrome).
2. Se connecter avec son e-mail et son mot de passe habituels.
3. iPhone : **Partager → « Sur l'écran d'accueil »**. Android : menu ⋮ → **« Installer l'application »**
   (ou le bouton « Installer » en bas de l'Espace équipe).

**Sur le Wi-Fi du garage (adresse du PC du garage, en `http://192.168.x.x:3000`)**
Les navigateurs n'installent une application que depuis une adresse **https** (ou depuis le PC lui-même).
Sur le Wi-Fi du garage, l'adresse du PC est en `http` : on ne peut donc pas « installer » au sens complet.
On ajoute simplement un **raccourci** :
1. Ouvrir `http://192.168.x.x:3000/equipe` (l'adresse affichée par le PC du garage).
2. iPhone : **Partager → « Sur l'écran d'accueil »** ; Android : menu ⋮ → **« Ajouter à l'écran d'accueil »**.
L'icône ouvre alors l'Espace équipe dans le navigateur : tout fonctionne (mêmes données, même sans
internet tant que le PC du garage est allumé), seule la barre du navigateur reste visible.

> Un téléphone peut avoir les deux : l'app équipe installée depuis le site https (au bureau ou en 4G),
> et le raccourci Wi-Fi pour travailler sur le PC du garage quand internet est coupé.

## L'Espace équipe : ce que chacun voit

L'Espace équipe (`/garage/app`, aussi dans « Plus » du menu) montre d'abord les actions les plus
importantes du métier de la personne, en grosses tuiles. **Chaque tuile n'apparaît que si la personne
a le droit d'ouvrir la page** (son rôle et ses accès personnalisés réglés par l'administrateur).

- **Mécanicien** : *Mes véhicules* (les voitures qui lui sont attribuées). Un toucher ouvre la voiture :
  **Changer le statut** (étape suivante en un bouton, autres étapes avec motif si besoin),
  **Temps passé** (démarrer / arrêter le chrono), **Travaux et pièces** (voir et ajouter des lignes),
  **Inspection** rouge / orange / vert, **Photos**. Tuiles : Atelier, Pointage, Rendez-vous, Stock,
  Mes compétences.
- **Accueil** : File d'accueil (nombre en attente), Rendez-vous du jour (liste), Nouvel ordre,
  Devis à envoyer, Prêts à livrer, Ordres de réparation, et la liste « À traiter ».
- **Responsable / Administrateur** : À traiter (avec ce qui attend une validation), Tableau atelier,
  Ordres, Rendez-vous, Devis, Retards / Factures, Bons de commande.
- **Magasinier** : Pièces manquantes, Réceptions, Stock bas, Bons de commande, Stock.
- **Comptable, RH, Vendeur, Responsable showroom** : leurs pages principales (factures, équipe,
  showroom, messages, pointage…).

Les règles ne changent pas : un mécanicien ne peut ni livrer ni annuler, chaque changement de statut
garde sa permission, l'accord du client sur le devis reste obligatoire, etc. L'app utilise les mêmes
boutons et les mêmes vérifications que les pages habituelles.

## Bon à savoir

- **Mises à jour** : rien à faire. Les pages sont toujours chargées depuis le serveur ; si une nouvelle
  version a été installée pendant que l'app était ouverte, elle se recharge d'elle-même au changement
  de page. L'ancienne app équipe déjà installée (icône « GaragePro ») devient l'app équipe.
- **Sans réseau** : la dernière version des pages déjà ouvertes reste lisible (bandeau « Hors ligne »);
  les enregistrements reprennent au retour du réseau. Aucune donnée privée n'est gardée après la déconnexion.
- **Nom et icône** : le nom de l'app client est celui du garage (Réglages). Les icônes sont dans
  `public/icons/app-*.png` et `public/icons/team-*.png` (refaites avec `node scripts/pwa-icons.mjs`).
- **Désinstaller** : appui long sur l'icône → Supprimer / Désinstaller (comme une autre application).
