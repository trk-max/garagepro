<p align="center">
  <img src="docs/media/demo-hero.gif" alt="GaragePro — page d'accueil du site client (vidéo)" width="720">
</p>

<h1 align="center">GaragePro</h1>
<p align="center"><b>Gestion d'atelier mécanique + site client</b> · Français / العربية / English</p>
<p align="center">Next.js 15 · TypeScript · Tailwind v4 · PostgreSQL (Supabase) + Prisma 6 · Auth.js v5 · Vercel</p>

<p align="center">
  <img src="docs/media/01-accueil.jpg" alt="Site client : accueil" width="49%">
  <img src="docs/media/04-tableau-de-bord.jpg" alt="Espace équipe : tableau de bord" width="49%">
</p>

## Aperçu

| Site client | Espace équipe |
|---|---|
| ![Avis et réclamations](docs/media/02-avis-reclamations.jpg) **Avis & réclamations** : note de 1 à 5 ★ et réclamations suivies par l'équipe | ![Entrée d'un véhicule par la plaque](docs/media/05-entree-vehicule-plaque.jpg) **Entrée par la plaque** : ordre en cours ouvert directement, sinon historique + fiche complète (VIN, km…) |
| ![Assistant IA](docs/media/07-assistant-ia.jpg) **Assistant IA** : guide de pannes + IA (Claude / OpenRouter / Groq) | ![Rapports](docs/media/06-rapports.jpg) **Rapports** : jour, 7 jours, 30 jours, 3 mois — argent, voitures, pannes, pièces, mécaniciens, avis |
| ![Version mobile en arabe](docs/media/08-mobile-arabe.jpg) **Mobile + arabe (RTL)** | ![Connexion de l'équipe](docs/media/03-connexion-equipe.jpg) **Connexion de l'équipe** |

> Photos et vidéos du site : dossier `public/site/` (voir « Photos et vidéos du site » plus bas). Pour mettre une **vidéo** dans ce README sur GitHub : modifiez le fichier sur github.com et glissez-déposez un `.mp4` (moins de 10 Mo) dans l'éditeur, GitHub crée le lien tout seul.

## Nouveautés V5

| | |
|---|---|
| **Entrée par la plaque** | Nouvel ordre → on tape la plaque. Voiture déjà à l'atelier → son ordre s'ouvre. Voiture connue → historique (dates, km, pannes, diagnostics, montants) puis la fiche. Première visite → fiche client + véhicule complète. Recherche de plaque aussi sur le tableau de bord et la liste des ordres. |
| **Fiche véhicule obligatoire** | Pour ouvrir un ordre : immatriculation, marque, modèle, année, carburant, couleur, **VIN (17 caractères)** et **kilométrage**. Une voiture connue sans VIN : les champs manquants sont demandés. Un ordre créé depuis un RDV en ligne affiche un encadré « Complétez la fiche du véhicule ». |
| **Rapports** (admin) | Aujourd'hui / 7 jours / 30 jours / 3 mois, comparés à la période précédente : facturé, encaissé (par mode), main-d'œuvre, pièces, marge, achats fournisseurs, trésorerie, reste à encaisser ; voitures reçues / livrées, durée à l'atelier, nouveaux clients, retours < 30 jours ; **pannes les plus fréquentes** ; pièces les plus utilisées ; mécaniciens ; réclamations et avis ; **« À retenir »** (conseils calculés). Imprimable en PDF. |
| **Avis & réclamations** | Site client : page `/reclamation` (note 1-5 ★ + réclamation). Suivi de réparation : avis quand la voiture est prête, réclamation liée à l'ordre. Équipe : page *Réclamations & avis* (réponse, statut Ouverte / En cours / Résolue, compteur dans le menu). |
| **Photos** | Tout membre de l'équipe qui peut ajouter des photos peut aussi les supprimer, depuis l'ordre et depuis *Atelier (mobile)* (vignettes avec 🗑). |

### Mise à jour vers la V5 (base de données)

Deux tables sont ajoutées (réclamations, avis). **Rien n'est effacé ni modifié.** À lancer **une fois, avant** le `git push` :

```
npx prisma db execute --file prisma/migrations/2_claims_feedback/migration.sql --schema prisma/schema.prisma
```

Le script peut être relancé sans risque (il ignore ce qui existe déjà).

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Tableau de bord** | véhicules à l'atelier, prêts à livrer, promis aujourd'hui, CA du mois, reste à encaisser, stock bas |
| **Ordres de réparation** | réception du véhicule (client + véhicule existants ou nouveaux), statuts atelier, affectation mécanicien, diagnostic, lignes main d'œuvre / pièces, forfaits, historique, notes, devis imprimable |
| **Clients & véhicules** | fiche client, plusieurs véhicules par client, historique des visites, total facturé |
| **Stock pièces** | références, prix achat/vente, seuil d'alerte, entrées/sorties, sortie automatique quand une pièce est ajoutée à un OR (et retour si supprimée ou OR annulé) |
| **Factures** | numérotation F2026-0001, TVA par taux, droit de timbre, copie figée, paiements partiels (espèces, carte, chèque, virement), impression A4 / PDF |
| **Paramètres** (admin) | infos garage, taux horaire, TVA, timbre, pied de facture, forfaits, équipe : créer, **changer le rôle**, **changer le mot de passe**, désactiver (le garage garde toujours au moins un admin actif ; un admin ne peut pas changer son propre rôle) |
| **Langue** | Français / العربية / English (interface RTL complète en arabe) |
| **Rapports** (admin) | jour, 7 jours, 30 jours, 3 mois : argent, voitures, pannes fréquentes, pièces, mécaniciens, réclamations, avis, conseils |
| **Réclamations & avis** | côté client (page publique + suivi de réparation) et côté équipe (réponse, statut) |

Statuts : Réceptionné → Diagnostic → Devis envoyé → Attente pièces → En réparation → Prêt → Livré (ou Annulé).

### Espaces et rôles

| | Admin | Réception | Mécanicien | Magasinier |
|---|:-:|:-:|:-:|:-:|
| **Espace client** : ordres de réparation, clients & véhicules, devis | ✓ | ✓ | ✓ | |
| Factures clients (consulter, encaisser, relancer) | ✓ | ✓ | | |
| **Établir une facture** | ✓ | | | |
| CA du mois / reste à encaisser | ✓ | ✓ | | |
| **Espace fournisseur** : stock (mouvements) | ✓ | lecture | lecture | ✓ |
| Fournisseurs, bons de commande (demande) | ✓ | | | ✓ |
| **Valider / refuser un bon de commande** | ✓ | | | |
| Bons de réception (entrée en stock) | ✓ | | | ✓ |
| Factures fournisseurs (saisie / suivi) | ✓ | | | ✓ |
| Payer un fournisseur, paramètres | ✓ | | | |

Circuit d'achat : le magasinier crée une **demande** (pré-remplie avec les pièces en stock bas) → l'admin **valide** ou **refuse** (avec motif) → bon de commande imprimable → **bon de réception** (entrée en stock, prix d'achat mis à jour) → **facture fournisseur** et paiements.

Factures clients : filtres par N°, **date exacte ou intervalle**, client, véhicule, montant TTC, reste dû et statut ; échéance (délai réglable dans Paramètres) ; factures **en retard** signalées ; **relance** par WhatsApp, SMS ou e-mail avec message prêt et historique.

Montants stockés en millimes (entiers) : aucune erreur d'arrondi.

## Portail client (public, sans compte)

| Page | Rôle |
|---|---|
| `/` | Accueil client : « Suivre ma réparation » / « Prendre rendez-vous », prestations, appel / WhatsApp |
| `/suivi` | Connexion **immatriculation + code à 4 chiffres** (remis au dépôt, visible sur l'OR) |
| `/suivi/vehicule` | **Suivi en direct** : barre de progression, 6 étapes (Réception/Diagnostic → Attente pièces* → Réparation → Contrôle qualité & essai → Lavage → Prêt), technicien, heure de fin estimée, photos/vidéos, devis à valider, facture, historique, appeler / WhatsApp / message |
| `/rdv` | **Prise de RDV en 4 étapes** : prestation (durée + tarif indicatif) → calendrier avec uniquement les jours et heures libres → coordonnées → récapitulatif |
| `/rdv/confirmation/REF` | Confirmation, ajout à l'agenda (.ics), annulation jusqu'à 2 h avant |

\* l'étape « Attente pièces » n'apparaît que si le véhicule passe par là.

**Temps réel** : chaque page ouverte vérifie les changements toutes les 4 s tant qu'elle est visible (aucun service externe). Quand le mécanicien change l'étape depuis `Atelier (mobile)`, la page du client se met à jour en quelques secondes, sans rechargement. Même chose pour l'équipe : nouveaux RDV, devis validé ou message du client.

**Sécurité** : 5 codes faux par immatriculation (et 20 par adresse IP) = blocage 15 min ; session signée liée au code (« Nouveau code » déconnecte l'ancien) ; accès coupé 7 jours après la livraison ; photos privées, servies après contrôle ; type réel des fichiers vérifié.

**Anti double réservation** : capacité de l'atelier (véhicules en parallèle) + verrou PostgreSQL au moment de confirmer — deux clients qui cliquent sur le dernier créneau en même temps ne peuvent pas l'obtenir tous les deux.

**Notifications** (facultatif, clés dans `.env`) : SMS via Twilio, e-mail via Resend — confirmation de RDV (avec .ics), code de suivi, « véhicule prêt ». Sans clés : rien n'est envoyé automatiquement, le bouton WhatsApp reste disponible.

Côté équipe : `Rendez-vous` (liste du jour en direct, affectation, **Réceptionner** = crée l'OR + code de suivi), `Atelier (mobile)` (grandes touches pour changer d'étape + appareil photo), carte « Suivi client » sur chaque OR, réglages horaires / capacité / prestations dans `Paramètres`.

## Assistant auto (guide + IA gratuites)

Page publique `/assistant` (lien dans l'en-tête et sur l'accueil), en français et en arabe.

1. **Guide à choix (sans IA, toujours disponible)** : le client clique sur son problème (voyant, bruit, freins, moteur, surchauffe, clim, pneus, fuite, entretien) → 1 à 3 questions → causes probables, ce qu'il peut vérifier sans danger, urgence, et bouton **Choisir un créneau** vers la bonne prestation du garage (RDV pré-rempli). Les cas dangereux affichent aussi Appeler / WhatsApp. Contenu : `src/lib/guided-diagnosis.ts`.
2. **IA** : « Autre problème », « Ce n'est pas ça ? Demander à l'IA » ou une question écrite → l'IA reçoit les choix déjà faits et répond. Si une visite est utile, elle propose la prestation adaptée.

**Plusieurs IA gratuites, avec relais automatique** : Gemini → Groq → Cerebras → Mistral → OpenRouter → serveur perso (Ollama). Chaque fournisseur peut avoir plusieurs clés (`GROQ_API_KEY="cle1,cle2"`). Une clé absente est ignorée ; une clé épuisée (429), refusée (401/403), en panne ou trop lente → clé suivante, puis fournisseur suivant. Une clé en échec est mise en pause (1 à 10 min) pour répondre plus vite ensuite. Le fournisseur utilisé apparaît dans le terminal : `[assistant] answered by groq`.

Activation : renseignez au moins une clé dans `.env` (voir `.env.example`), puis redémarrez `npm run dev`. Sans aucune clé, seul le guide est proposé (avec Appeler / WhatsApp pour « Autre problème »).

Garde-fous : l'IA ne peut **rien écrire** dans la base ; ses propositions sont vérifiées (prestation existante, urgence valide, texte nettoyé) ; 30 messages/heure par visiteur et 800/jour pour le site ; consignes de sécurité (arrêt du véhicule en cas de danger) ; réponses affichées en texte brut. Les offres gratuites peuvent utiliser les conversations pour améliorer leurs modèles : le portail demande de ne pas partager d'informations personnelles.

## E-mails (Gmail gratuit, ou Resend)

L'application essaie **Resend**, puis **votre Gmail** (SMTP) si Resend n'est pas configuré ou refuse. Avec Gmail, **pas besoin de domaine**.

**Gmail (le plus simple, gratuit, ~500 e-mails/jour)**
1. Compte Google du garage → **Sécurité** → activez la **Validation en 2 étapes**.
2. Même page → **Mots de passe des applications** → nom `GaragePro` → **Créer** → copiez les 16 lettres.
3. Dans `.env` : `SMTP_USER="votregarage@gmail.com"` et `SMTP_PASS="abcd efgh ijkl mnop"` (facultatif : `SMTP_FROM_NAME="911 Garages"`).
4. Redémarrez (`start.cmd`), puis **Paramètres → E-mails → Envoyer le test**. `npm run doctor` vérifie aussi la connexion.

Le mot de passe normal de Gmail ne marche **pas** : il faut le « mot de passe d'application ».

**Resend** (si vous avez un domaine) : `RESEND_API_KEY` + `SUPPORT_FROM_EMAIL="Garage <rdv@votredomaine.tn>"` après vérification du domaine (Resend → Domains).

E-mails envoyés : confirmation de RDV (+ fichier agenda .ics), code de suivi, « véhicule prêt », relance de facture impayée.

## Installation et lancement (Windows) — en un clic

| Fichier | Quand | Ce qu'il fait |
|---|---|---|
| **`setup.cmd`** | une fois, sur un nouveau PC | installe Node.js et Git si besoin (winget), les dépendances, crée `.env` (ouvre le Bloc-notes), met la base à jour **sans rien effacer**, vérifie tout, lance les tests |
| **`start.cmd`** | chaque jour | vérifie tout (`npm run doctor`), s'arrête si un point bloque, sinon lance l'app et ouvre le navigateur |
| `npm run doctor` | quand quelque chose ne marche pas | vérification complète : Node, dépendances, `.env` (doublons, mots de passe oubliés), **les deux adresses de la base**, comptes admin, photos, Resend, **chaque clé et chaque modèle IA**, adresses pour téléphone |

Double-cliquez sur le fichier dans l'Explorateur, ou tapez son nom dans cmd.

### Sur un nouveau PC
```cmd
winget install -e --id Git.Git
```
Fermez et rouvrez cmd, puis :
```cmd
git clone https://github.com/ouit77-blip/garagepro.git C:\garagepro
cd C:\garagepro
setup.cmd
```
Le fichier `.env` (secrets) n'est **jamais** sur GitHub : recopiez-le depuis votre PC principal par clé USB, ou remplissez-le dans le Bloc-notes qui s'ouvre.

### Depuis un téléphone ou un autre PC
- **Même Wi-Fi** (atelier) : lancez `start.cmd` sur le PC du garage, puis ouvrez sur le téléphone l'adresse `http://192.168.x.x:3000` affichée au point 7 de la vérification. Au premier lancement, Windows demande l'accès réseau pour Node.js : cochez **Réseaux privés** → Autoriser. Le PC doit rester allumé.
- **Partout (4G, maison, clients)** : mettez l'app en ligne sur Vercel (gratuit) → une adresse `https://…vercel.app` accessible de n'importe où, sans PC allumé.

### Nouvelle base vide (première installation)
`setup.cmd` crée les tables. Pour ajouter les données de départ (paramètres, prestations, comptes de démo `admin@garage.tn` … mot de passe `password123`) : `npm run db:seed`. Créez ensuite votre propre compte admin et **désactivez les comptes de démo**. Le seed est **refusé sur une base Supabase** (et en production) : pour une base de test jetable seulement, lancez-le avec `ALLOW_DEMO_SEED=true`.

## Performance

| Mesure | Avant | Après |
|---|---|---|
| Lancement quotidien | `npm run dev` : compile chaque page au 1er clic (~10 s) | `start.cmd` → **mode production** (`npm run serve`) : ~20–70 ms par page, recompile seulement si le code a changé |
| Requêtes du menu à chaque clic | 7 (dont 2 qui chargeaient toutes les factures impayées) | 3 petits `COUNT` |
| Paramètres du garage | écriture (`upsert`) 2–3 fois par page | 1 lecture par page (cache de requête) |
| Retour visuel au clic | aucun (attente du serveur) | squelette immédiat (`loading.tsx`) |
| Nouvel OR | jusqu'à 1 000 clients + véhicules envoyés au navigateur | recherche serveur (12 résultats, 250 ms d'attente, requêtes obsolètes annulées) |
| Photos | re-téléchargées toutes les heures | gardées 1 jour par le navigateur (`private, immutable`), chargement différé |
| Index base | clés étrangères non indexées | 7 index ajoutés (`prisma/migrations/1_perf_indexes`) |

Appliquer les index (sans rien effacer) : `npx prisma migrate deploy` — `setup.cmd` le fait aussi.

## Design

Application équipe : cockpit sombre « carbone » (`#0B0C10` / `#12141C`), un seul accent **Guard Red** `#E10600` pour les actions principales et les alertes, police Inter auto-hébergée, angles nets (2–6 px), titres de section techniques en majuscules espacées, indicateurs façon télémétrie. Portail client : surfaces claires (lisibles au soleil sur téléphone), en-tête carbone, accent rouge. Documents imprimés (factures, devis, bons) : toujours sur papier blanc. Jetons de couleur dans `src/app/globals.css`.

## Tests et vérifications

| Commande | Rôle |
|---|---|
| `npm test` | 97 tests (argent, TVA, créneaux, permissions, stock, connexion, équipe, e-mails, guide et assistant IA) |
| `npm run test:watch` | relance les tests à chaque sauvegarde |
| `npm run lint` | ESLint (règles Next.js) |
| `npm run check` | TypeScript + ESLint + tests (à lancer avant chaque commit) |
| `npm run build` | build de production |

Les tests sont dans `tests/` et n'utilisent **pas** la base de données (aucun risque pour vos données).

## Sécurité — règles en place

| Règle | Où |
|---|---|
| Connexion équipe : 5 échecs par e-mail (ou 30 par IP) = blocage 15 min | `src/lib/auth.ts` |
| Mot de passe d'un nouvel utilisateur : 8 caractères minimum | `src/lib/validators.ts` |
| Paiement client / fournisseur : ligne verrouillée (`FOR UPDATE`) → pas de double encaissement | `src/server/invoices.ts`, `purchasing.ts` |
| Sortie de stock manuelle : impossible sous 0 (vérifié par l'UPDATE lui-même) | `src/server/parts.ts` |
| Pièce ajoutée à un OR avec stock insuffisant : **autorisée avec avertissement** (règle métier : la pièce peut être en rayon sans être saisie) | `src/server/work-orders.ts` |
| Montant ou quantité vide : refusé (n'est plus enregistré comme 0) | `src/lib/validators.ts` |
| Erreur technique : page « Réessayer », jamais de détail technique affiché | `error.tsx`, `global-error.tsx` |
| Données de démo (`password123`) refusées si `NODE_ENV=production` ou si `DATABASE_URL` pointe vers Supabase (sauf `ALLOW_DEMO_SEED=true`) | `prisma/seed-guard.ts` |

**Risques acceptés (documentés)** — `npm audit` signale des alertes « high » (0 critique) dans `deepmerge-ts` (outil en ligne de commande Prisma) et `braces` (outil ESLint) : ces paquets servent uniquement au développement, jamais à l'application en marche. Elles disparaîtront avec une future version de Prisma. **Ne lancez pas `npm audit fix --force`** : il installe des versions incompatibles.

## Git (historique et retour arrière)

```cmd
git init
git add .
git status
git commit -m "chore: initial import of GaragePro"
```

Avant le commit, vérifiez dans `git status` qu'**aucun fichier `.env`** n'apparaît (seul `.env.example` est autorisé). Messages de commit : `feat:`, `fix:`, `test:`, `security:`, `refactor:`, `docs:`, `chore:`.

## Migrations Prisma (avant la mise en production)

`db push` convient au développement. Pour la production, créez une fois l'état de départ (« baseline ») **sans toucher aux données** :

```cmd
mkdir prisma\migrations\0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma\migrations\0_init\migration.sql
npx prisma migrate resolve --applied 0_init
```

Ensuite, à chaque changement du schéma : `npm run db:migrate` (développement) puis `npm run db:deploy` (production).
⚠ Ne lancez jamais `npm run db:reset`, `prisma migrate reset` ou `db push --force-reset` sur la vraie base : ils **effacent toutes les données**.

## Photos et vidéos du site

Tout est dans `public/site/` ; changez un fichier en gardant **le même nom**, puis `git push` (la liste est lue au moment du build).

| Fichier | Où il apparaît |
|---|---|
| `hero.mp4` + `hero.jpg` | grand fond de l'accueil (la photo s'affiche avant la vidéo, et pour les connexions lentes) |
| `band.mp4` + `band.jpg` | bande « Le protocole de l'atelier » de l'accueil, et bandeau du tableau de bord |
| `about.mp4` + `about.jpg` | haut de la page « L'atelier » et de la page « Avis & réclamations » |
| `assistant.jpg`, `suivi.jpg`, `login.jpg` | bandeaux de l'assistant IA, du suivi de réparation, de la connexion équipe (sinon : `hero`) |
| `galerie/*.jpg` | galerie de l'accueil (6 photos remplissent la mosaïque) |
| `brand/*.svg` | logos GaragePro (monogramme et texte), en vectoriel |

Vidéos : MP4 (H.264), muettes, 5 à 10 s, 1600 px de large, moins de 2 Mo de préférence.

## Structure

```
prisma/schema.prisma        modèle de données
prisma/seed.ts              données de démo
src/app/(garage)/garage/    pages (dashboard, work-orders, customers, parts, invoices, settings)
src/actions/                Server Actions (validation + rôles)
src/server/                 logique métier (statuts, stock, facturation)
src/lib/i18n/fr.ts · ar.ts  traductions
src/lib/format.ts           monnaie TND, quantités, totaux TVA
tests/                      tests automatiques (Vitest)
```

## V3 — Thème, page « L'atelier », équipe

- **Clair / sombre** : bouton soleil/lune (barre latérale, menu mobile, en-tête du portail). Choix mémorisé par appareil (cookie `theme`, sombre par défaut). Les factures imprimées restent toujours claires.
- **Page `/a-propos` (« L'atelier »)** : vitrine premium (protocole en 5 étapes, tableau comparatif, prestations, configurateur de RDV). Textes FR/AR dans `src/lib/about-content.ts`. Photo de fond optionnelle : déposez `public/hero.jpg`.
- **Équipe** : Paramètres → Équipe → Gérer → **Supprimer** (pas soi-même, jamais le dernier admin actif ; l'historique est conservé).
- **Déconnexion** → retour sur `/login`.
- **E-mail** : l'erreur réelle s'affiche (mot de passe Gmail refusé, client sans e-mail…). Pour Gmail : `SMTP_USER` + `SMTP_PASS` (mot de passe d'application) et **pas** de `SMTP_HOST`.
- **Anciennes photos** (envoyées avant Supabase) : relues depuis le dossier local `storage/` si absentes du bucket.
- **Lenteur (boutons bloqués plusieurs minutes)** : corrigé. Le « En direct » gardait une connexion ouverte par onglet ; sur `http://` le navigateur n'en autorise que 6 par site, donc avec plusieurs onglets tous les boutons attendaient. Maintenant : une petite requête toutes les 4 s, seulement quand l'onglet est visible. Requêtes Prisma groupées (`relationJoins`) et chargement en parallèle de la page OR.
- **Page « L'atelier »** : style technique (Porsche / BMW M) — 4 modules de service, checklist d'ingénierie, catalogue technique par système.
- **3 langues : Français / العربية / English** (boutons FR · ع · EN). Le choix est enregistré dans le navigateur (cookie `lang`), sans Server Action : le bouton marche même si l'onglet a été ouvert avant une mise à jour de l'application. Les noms des prestations en anglais reprennent le nom français.
- **Connexion bloquée** : `npm run reset-access` liste les comptes (actif / bloqué) ; `npm run reset-access -- EMAIL` débloque et réactive ; `npm run reset-access -- EMAIL MOTDEPASSE` fixe aussi un nouveau mot de passe.
- **Vercel et gros fichiers** : Vercel refuse les envois de plus de 4,5 Mo. Les photos sont réduites dans le navigateur (1920 px, JPEG) ; les fichiers plus gros (vidéos) partent directement du téléphone vers Supabase Storage via une URL signée à usage unique, puis le serveur vérifie le vrai type et la taille avant de l'enregistrer (sinon le fichier est supprimé).
