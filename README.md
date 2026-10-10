# GaragePro — gestion d'atelier mécanique (FR / عربي)

Next.js 15 · TypeScript · Tailwind v4 · PostgreSQL (Supabase) + Prisma 6 · Auth.js v5

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Tableau de bord** | véhicules à l'atelier, prêts à livrer, promis aujourd'hui, CA du mois, reste à encaisser, stock bas |
| **Ordres de réparation** | réception du véhicule (client + véhicule existants ou nouveaux), statuts atelier, affectation mécanicien, diagnostic, lignes main d'œuvre / pièces, forfaits, historique, notes, devis imprimable |
| **Clients & véhicules** | fiche client, plusieurs véhicules par client, historique des visites, total facturé |
| **Stock pièces** | références, prix achat/vente, seuil d'alerte, entrées/sorties, sortie automatique quand une pièce est ajoutée à un OR (et retour si supprimée ou OR annulé) |
| **Factures** | numérotation F2026-0001, TVA par taux, droit de timbre, copie figée, paiements partiels (espèces, carte, chèque, virement), impression A4 / PDF |
| **Paramètres** (admin) | infos garage, taux horaire, TVA, timbre, pied de facture, forfaits, équipe : créer, **changer le rôle**, **changer le mot de passe**, désactiver (le garage garde toujours au moins un admin actif ; un admin ne peut pas changer son propre rôle) |
| **Langue** | bouton Français / العربية (interface RTL complète en arabe) |

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

**Temps réel** : chaque page ouverte reçoit les changements par Server-Sent Events (aucun service externe). Quand le mécanicien change l'étape depuis `Atelier (mobile)`, la page du client se met à jour en ~2 s, sans rechargement. Même chose pour l'équipe : nouveaux RDV, devis validé ou message du client.

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
`setup.cmd` crée les tables. Pour ajouter les données de départ (paramètres, prestations, comptes de démo `admin@garage.tn` … mot de passe `password123`) : `npm run db:seed`. Créez ensuite votre propre compte admin et **désactivez les comptes de démo**.

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
| Données de démo (`password123`) refusées si `NODE_ENV=production` | `prisma/seed.ts` |

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
