<p align="center">
  <img src="docs/media/demo-hero.gif" alt="GaragePro — page d'accueil du site client (vidéo)" width="720">
</p>

<h1 align="center">GaragePro</h1>
<p align="center"><b>Gestion d'atelier mécanique + site client + espace équipe + portail entreprises</b> · Français / العربية / English</p>
<p align="center">Version <b>7.7</b> — application PC / téléphone, fonctionne aussi <b>sans internet</b> (hub du garage)</p>
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

## Utiliser GaragePro sur un autre PC (mêmes données)

Il n'y a **qu'une seule base de données** (Supabase en ligne + sa copie sur le PC du garage, synchronisées toutes les 30 s). Un autre PC **n'installe rien** : il ouvre GaragePro dans une fenêtre, soit sur le PC du garage, soit sur le site en ligne. Ne lancez **pas** `setup.cmd` sur un autre PC : il créerait une base vide séparée.

1. Sur le **PC du garage**, une fois :
   ```
   npm run shortcut
   ```
   → crée `GaragePro.cmd` dans le dossier du projet.
2. Copiez `GaragePro.cmd` sur l'autre PC (clé USB, e-mail…), par exemple sur son Bureau, et double-cliquez dessus.
   - **Au garage, sur le même Wi-Fi** : il ouvre le PC du garage (rapide, fonctionne même sans internet). Le hub (`start-hub.cmd`) doit tourner.
   - **Ailleurs (maison, 4G…)** : il ouvre le site en ligne.
   - Il vérifie que c'est bien GaragePro qui répond (un autre appareil à la même adresse n'est jamais ouvert).
3. Connectez-vous avec votre compte habituel (une fois au garage, une fois en ligne : ce sont deux adresses).

À savoir :
- Réservez l'adresse du PC du garage dans la box (bail DHCP fixe) ; si elle change, refaites `npm run shortcut`.
- Pour que le site en ligne s'ouvre sans compte Vercel : Vercel → projet → *Settings* → *Deployment Protection* → *Vercel Authentication* → ne protéger que les *Preview Deployments* (sinon chaque PC doit se connecter à Vercel).

## Nouveautés — l'application sur téléphone (sans store)

- **Deux applications installables** sur l'écran d'accueil (iPhone : Partager → « Sur l'écran d'accueil » ;
  Android : « Installer ») : l'**app client** `/app` (nom du garage) et l'**app équipe** « GaragePro Équipe »
  (`/equipe`). Mode d'emploi simple : [docs/APP.md](docs/APP.md).
- **App client** : accueil en gros boutons (Suivre ma réparation, Prendre rendez-vous, Showroom, Assistant,
  Appeler / WhatsApp, Prestations « à partir de »), barre d'onglets en bas une fois installée ; écrans de suivi
  au style des maquettes (code à 4 chiffres, avancement %, étapes, photos, devis ligne par ligne inchangé).
- **Espace équipe** `/garage/app` : actions principales selon le métier (mécanicien : mes véhicules, statut,
  temps passé, travaux et pièces, inspection, photos ; accueil : file, rendez-vous du jour, nouvel ordre, devis,
  prêts à livrer ; responsable : À traiter, tableau atelier ; magasinier : pièces manquantes, réceptions, stock bas),
  toujours filtrées par les droits de chacun.
- L'installation complète demande le site **https** ; sur le Wi-Fi du garage (`http://192.168.x.x:3000/equipe`)
  on ajoute un raccourci. Icônes : `node scripts/pwa-icons.mjs`. Captures : `docs/media/app/`.

## Nouveautés — déconnexion partout, prise en charge d'abord, QR du véhicule, ticket manuel

- **Déconnexion qui marche toujours** : le bouton envoie un vrai formulaire vers une adresse fixe
  (`POST /api/staff/logout`), même sur une page ouverte avant une mise à jour du hub (avant : rien ne se passait).
  La déconnexion ferme **toutes** les sessions du compte : les autres onglets partent sur la page de connexion tout de
  suite, le téléphone à la page suivante ou dans la minute. Les autres comptes ne sont pas touchés. Bouton aussi
  dans le panneau « Plus » sur téléphone. Migration `31_session_version` (additive) ; après la fusion :
  `npm run db:cloud`.
- **Ordre de réparation** : sur un nouvel ordre, la prise en charge et sa signature s'affichent en premier ; une fois
  signée, elles se rangent derrière le bouton « Prise en charge signée — voir ».
- **Inspection rouge / orange / vert** : maintenant dans la carte « Contrôle qualité ».
- **QR du véhicule** (« Carnet du véhicule ») : dans la carte « Véhicule » de l'ordre, sur la fiche du véhicule
  (fiche client) et imprimé sur le devis et la facture (fait à l'affichage, la copie figée de la facture ne change
  pas). Il faut l'adresse du site (APP_URL ou *Paramètres*).
- **Ticket manuel** : page à part *Accueil › Ticket manuel* (`/garage/accueil/ticket`). Avec l'accord du client,
  le numéro et le lien de suivi partent sur son téléphone / e-mail, puis « encore N personnes » et « c'est votre
  tour ». Grand numéro + QR du lien de suivi à scanner. Sans canal d'envoi configuré, rien n'est prétendu envoyé.

## Nouveautés — « À traiter » montre la voiture, paiements partiels et date du prochain paiement

- **Chaque ligne d'« À traiter » mène aux fiches exactes** (cloche et page) : `/garage/a-traiter/<élément>` liste
  exactement ce qui est compté, avec la plaque, la marque / le modèle, le client, le n° d'ordre ou de facture, le
  chiffre clé (reste dû, jours de retard, pièce manquante…) et un lien direct. « Ouvrir le module » garde les
  anciennes listes.
- **Factures partiellement payées** et **promesses de paiement dépassées** (en rouge, « Relancer le client ») :
  nouveaux éléments ; une facture n'apparaît que dans une seule liste.
- **Date du prochain paiement** sur la facture et l'ordre (date, montant facultatif ≤ reste dû, note), historique
  gardé (ajout seul), colonne « Prochain paiement » dans la liste des factures.
- Migration **30_payment_promises** (une table ajoutée, rien de modifié) : appliquée au redémarrage du hub ; en
  ligne avec `npm run db:cloud` comme les autres. Détails : [docs/PAIEMENTS-PARTIELS.md](docs/PAIEMENTS-PARTIELS.md).

## Nouveautés V16 — Lot 5 : qualité, suivi et pilotage

- **Contrôle qualité** : kilomètres parcourus pendant l’**essai routier** (obligatoire quand l’essai est fait) ; *Paramètres › Contrôle qualité* : **points en plus** des 6 points actuels (un par ligne), à cocher pour valider le contrôle ; un point ajouté plus tard n’annule pas un contrôle déjà validé.
- **Reprise** : renvoyer un ordre du contrôle qualité (ou *Prêt*) en réparation demande, en plus du motif, une **cause** dans une liste (travail incomplet, malfaçon, pièce défectueuse, essai routier, propreté, autre). Le **compteur de reprises** s’affiche sur le contrôle qualité et dans l’historique.
- **Retour atelier** : quand un véhicule revient **moins de 30 jours** après une livraison, la fiche propose « Retour atelier ? » (catégorie : même panne, malfaçon, pièce défaillante, autre) → *Lier* ou *Ce n’est pas un retour*. Sur un ordre lié, la **main-d’œuvre de reprise est ajoutée à 0 DT** (badge « Reprise »), sauf case *Facturer cette main-d’œuvre* (droit `manageComebacks` : accueil, chef d’atelier, administrateur). Lien retiré seulement avec un motif.
- **Inspection rouge / orange / vert** : bloc *Inspection* de la fiche (droit `performInspection`, mécanicien compris) : modèle « Inspection standard » (15 points) ou vos modèles (*Paramètres › Modèles d’inspection*, droit `manageInspections`) ; pour chaque point une couleur, une note et une **photo** (réduite sur le téléphone, rangée avec les photos de l’ordre). Un point rouge / orange devient une **ligne du devis en attente** (priorité *Sécurité* / *Conseillé*) avec *Ajouter au devis* (droit `manageQuotes` : c’est l’accueil qui chiffre). Le client voit l’inspection sur son **suivi en ligne** (photo seulement si elle est visible au client).
- **Suivi client** (par la file des messages, jamais à un client qui refuse les messages, jamais de faux envoi sans SMS / e-mail) : **enquête de satisfaction** 3 jours après la livraison (lien du suivi où se trouve la note), **relance des travaux refusés** 30 puis 90 jours après la livraison (pas si le véhicule est revenu depuis). Réglages dans *Paramètres*. Une **note ≤ 3** apparaît dans *À traiter* (« Avis clients à traiter ») jusqu’à *Marquer comme traité* (*Réclamations*).
- **Pilotage** (*Rapports*) : taux d’acceptation des lignes de devis, montant moyen par ordre facturé (ARO), livrés à la date promise initiale, **taux de retour atelier** (ordres liés ; l’ancien chiffre reste affiché sous le nom « revisites »), efficacité des techniciens (heures vendues / heures pointées, par technicien), taux de no-show, balance âgée. « — » quand il n’y a pas assez de données.
- **Pointage** : nature du temps (diagnostic, travaux, reprise, garantie) et ligne travaillée, facultatives, au démarrage du chrono et dans la saisie après coup.
- Les ordres ouverts **avant** la migration 29 gardent l’ancien contrôle qualité (pas de km ni de points en plus, pas de cause de reprise) et ne reçoivent pas d’enquête.
- Plan : [docs/PLAN-V16-LOT5.md](docs/PLAN-V16-LOT5.md). Rapport (avec le résumé des 5 lots) : [docs/RAPPORT-V16.md](docs/RAPPORT-V16.md).

### Mise à jour vers la V16 (Lot 5) — à faire une commande à la fois, dans cet ordre

Le Lot 5 contient les Lots 1 à 4 : `db:cloud` applique les migrations 25 à 29 qui manquent.

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `29_quality_followup` (et 25 à 28 si besoin) à la base en ligne (n’efface rien, rejouable).
3. **Tout de suite après**, au garage : fermez puis relancez `start-hub.cmd` (le hub applique la migration à la base du PC). Le PC du garage doit connaître les tables `InspectionTemplate`, `Inspection`, `InspectionResult` et les nouvelles colonnes **avant** que l’en-ligne les écrive.
4. `npm run check`
5. `git add -A` puis `git commit -m "V16 Lot 5 : qualité, suivi et pilotage"` puis `git push` (dans la foulée).
6. **Sans hub** (base locale seule) : `npx prisma db execute --file prisma/migrations/29_quality_followup/migration.sql --schema prisma/schema.prisma` (après `25_workflow_v16`, `26_quotes`, `27_delays_refusal`, `28_signed_handover_billing`).
7. Dans l’application : *Paramètres* › *Contrôle qualité* (points en plus, enquête, relances) et *Modèles d’inspection* ; *Équipe › Accès* pour les 3 nouveaux droits.

## Nouveautés V16 — Lot 4 : réception signée, restitution, facture et paiements

- **Réception signée** : la fiche *Prise en charge* gagne les voyants allumés, les objets laissés, le nombre de clés et le **plafond d’autorisation** (DT TTC) ; la réponse aux frais de diagnostic est gardée. Bloc *Signature de la prise en charge* : le client signe **sur la tablette** (cadre de signature fait maison, image PNG légère). La prise en charge est alors **figée** (document HTML + empreinte SHA-256, « copie intacte » vérifiée à l’affichage), la fiche de réception et le km d’entrée sont **verrouillés**, et les photos de *Réception* ne se suppriment plus (seulement masquées). Nouveau droit `signIntake` (accueil, chef d’atelier, administrateur).
- **Kilométrage** : un km d’entrée **inférieur au dernier relevé** du véhicule est refusé, sauf case « je confirme » (journalisée) ; le km du véhicule n’est jamais baissé en silence.
- **Plafond signé** : un nouvel ordre peut passer *Réceptionné / Diagnostic → En réparation* sans devis si la réception est signée et que le total reste sous le plafond (lignes acceptées « pré-autorisées », journal).
- **Photos par étape** : *Réception*, *Travaux*, *Restitution* (choix à l’envoi, proposé selon le statut).
- **Restitution** (ordre *Prêt*) : km et carburant à la sortie, travaux expliqués, pièces remplacées (rendues / laissées / garantie), clés, propreté, **signature du client** → bon de restitution figé + imprimable. **Obligatoire avant *Livré*** pour les nouveaux ordres (réglage *Exiger le bon de restitution signé*, activé par défaut ; pas de dérogation). Nouveau droit `recordHandover`.
- **Facture figée** : une facture émise ne peut plus être modifiée ni supprimée, **même en SQL direct** (trigger ; seuls « payé » et le statut bougent) ; empreinte SHA-256 et nature de la pièce par ligne dans la copie figée.
- **Avoir** (droit `issueCreditNote` : administrateur, comptable) : *Factures › la facture › Émettre un avoir* + motif → avoir **AV-2026-0001** (numéros sans trou), la facture est gardée telle quelle et passe « Annulée par avoir » ; reste dû 0 ; ce qui avait été payé s’affiche « trop-perçu à rembourser ». Un ordre dont la facture est annulée ne peut pas être refacturé. Rapports, tableau de bord, fiche client et rentabilité déduisent les avoirs (jamais deux fois).
- **Paiements** : **date du paiement** (un encaissement d’hier se saisit à sa vraie date), **anti double clic** côté serveur, **annulation d’un paiement** (droit `reversePayment` : chef d’atelier, administrateur ; ligne négative + motif, le paiement reste visible ; un ordre clôturé repasse *Livré*). L’**acompte** d’un nouvel ordre devient un **vrai paiement** à la création de la facture (daté du jour de l’acompte) et n’est plus déduit une deuxième fois.
- **Gardiennage** : sur un ordre *Prêt*, la fiche montre le gardiennage dû (depuis le message « véhicule prêt » envoyé ou la case *Client prévenu*, après la franchise ; **jamais pendant une attente pièces imputable au garage**). Il est ajouté à la facture (ligne *Frais de gardiennage*) ; *Ne pas facturer le gardiennage* = droit `waiveStorageFee` + motif. Réglage *Ajouter le gardiennage à la facture*.
- **Relances graduées** des factures échues (nouveaux ordres) : J+7, J+15, J+30 par SMS / e-mail (tâche des rappels), notées dans l’historique de la facture ; réglage *Relances automatiques*. **Balance âgée** (0–30, 31–60, 61–90, > 90 jours) et avoirs dans *Rapports*.
- Les ordres ouverts **avant** la migration 28 gardent l’ancien comportement (pas de restitution exigée, acompte comme avant, pas de gardiennage automatique ni de relance graduée).
- Plan : [docs/PLAN-V16-LOT4.md](docs/PLAN-V16-LOT4.md). Rapport : [docs/RAPPORT-V16.md](docs/RAPPORT-V16.md).

### Mise à jour vers la V16 (Lot 4) — à faire une commande à la fois, dans cet ordre

Le Lot 4 contient les Lots 1 à 3 : `db:cloud` applique les migrations 25 à 28 qui manquent.

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `28_signed_handover_billing` (et 25 à 27 si besoin) à la base en ligne (n’efface rien, rejouable).
3. **Tout de suite après**, au garage : fermez puis relancez `start-hub.cmd` (le hub applique la migration à la base du PC). Le PC du garage doit connaître les tables `Signature`, `VehicleHandover`, `CreditNote` et le statut de facture « Annulée par avoir » **avant** que l’en-ligne les écrive.
4. `npm run check`
5. `git add -A` puis `git commit -m "V16 Lot 4 : réception signée, restitution, facture et paiements"` puis `git push` (dans la foulée).
6. **Sans hub** (base locale seule) : `npx prisma db execute --file prisma/migrations/28_signed_handover_billing/migration.sql --schema prisma/schema.prisma` (après `25_workflow_v16`, `26_quotes`, `27_delays_refusal`).
7. **Anciens acomptes non convertis** (ordres d’avant le Lot 4, laissés tels quels) — liste en lecture seule avec *Prisma Studio* (`npm run db:studio`, table `WorkOrder`, filtre `workflowLot4 = false` et `depositAmount > 0`) ou en SQL : `SELECT number, "depositAmount", "depositMethod", status FROM "WorkOrder" WHERE NOT "workflowLot4" AND "depositAmount" > 0 ORDER BY number;`. Pour ces ordres, l’acompte reste déduit du solde comme avant (pas de paiement créé).
8. Dans l’application : *Paramètres › Parcours atelier* (restitution signée, gardiennage, relances), *Conditions de l’ordre de réparation* (frais de gardiennage par jour, franchise), puis *Équipe › Accès* pour les 5 nouveaux droits.

## Nouveautés V16 — Lot 3 : devis refusé, attente client, retards, attente pièces

- **Frais annoncés** : *Paramètres › Parcours atelier › Frais de diagnostic* (DT HT, vide = aucun). À la réception, la case « Frais de diagnostic annoncés au client » (cochée par défaut) ajoute la ligne *Frais de diagnostic*, **acceptée dès la création** et facturable même si le devis est refusé. Un autre frais annoncé (démontage…) s’ajoute en main-d’œuvre avec la case « Frais annoncé au client », **seulement avant l’envoi du devis** (accueil / responsables). Le devis imprimé et le portail l’affichent à part (« dus même en cas de refus »).
- **Devis refusé** (par le client sur le portail, par l’accueil avec *Enregistrer l’accord*, ou par le garage avec *Changer le statut… › Devis refusé* + motif) : les lignes en attente passent *Refusé* et **restent sur la fiche** (relance au Lot 5), le devis est fermé, les pièces réservées pour l’ordre sont libérées ; **seuls les frais annoncés sont facturables** (bandeau sur la fiche). Sans frais annoncés : rien à facturer, la livraison n’exige pas de facture et l’ordre se clôture à la livraison.
- **Remontage et décharge** : au passage *Devis refusé → Prêt*, case « Véhicule remonté » (gardée dans l’historique). Si une ligne **Sécurité** a été refusée : bouton *Imprimer la décharge* (texte à signer sur papier) et, avant *Prêt*, case obligatoire « Décharge de sécurité signée par le client » (nouveau droit `recordSafetyWaiver` : accueil, chef d’atelier, administrateur ; réglage *Exiger la décharge signée*, activé par défaut). La signature sur tablette viendra au Lot 4.
- **Retards** : changer (ou effacer) une date promise exige un **motif** (pièces, travaux supplémentaires, décision du client, assurance, charge de l’atelier, autre) + une note interne facultative. Chaque changement est une ligne `PromiseRevision` **en ajout seul** (bloc *Changements de date* sur la fiche, historique) et un **message au client** par la file existante (*Historique des envois*, type « Date promise modifiée ») — sauf si le client a refusé les messages ; sans téléphone / e-mail / canal configuré, la ligne est « non envoyé » avec la raison (jamais un faux envoi). Le portail montre la nouvelle date avec un libellé client (jamais la note interne).
- **KPI** dans *Rapports* : « Livrés à la date promise initiale » (et « à la date promise actuelle »).
- **Attente pièces** : une pièce manquante peut être **rattachée à une ligne** de l’ordre ; chaque date prévue (première ou changée) est une révision motivée + un message au client (« Date prévue d’une pièce ») et s’affiche sur le portail (« Pièce attendue le … »). Quand une ligne **acceptée** attend une pièce, l’ordre passe **tout seul en *Attente pièces*** (à l’accord du client, ou au signalement de la pièce pendant la réparation ; réglage *Passer en « Attente pièces »*, activé par défaut). Bloc *Pendant l’attente des pièces* : « Le véhicule reste au garage » / « Véhicule restitué, le client reviendra », avec « attente imputable au garage » (utilisé par le gardiennage du Lot 4).
- **Bon de réception** : une pièce reçue passe les pièces manquantes de cette pièce à *Reçue* (celles du bon d’abord), la réserve pour l’ordre et l’indique dans l’historique (correction de l’audit n° 13). Le **magasinier** peut mettre à jour une pièce manquante (nouveau droit `managePartNeeds`).
- Plan : [docs/PLAN-V16-LOT3.md](docs/PLAN-V16-LOT3.md). Rapport : [docs/RAPPORT-V16.md](docs/RAPPORT-V16.md).

### Mise à jour vers la V16 (Lot 3) — à faire une commande à la fois, dans cet ordre

Le Lot 3 contient les Lots 1 et 2 : `db:cloud` applique les migrations 25, 26 et 27 qui manquent.

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `27_delays_refusal` (et `25`, `26` si besoin) à la base en ligne (n’efface rien, rejouable).
3. **Tout de suite après**, au garage : fermez puis relancez `start-hub.cmd` (le hub applique les migrations à la base du PC du garage). Le PC du garage doit connaître la table `PromiseRevision` et les nouvelles colonnes **avant** que l’en-ligne les écrive ; sinon une ligne de synchronisation reste en échec.
4. `npm run check`
5. `git add -A` puis `git commit -m "V16 Lot 3 : refus, retards, attente pièces"` puis `git push` (dans la foulée).
6. **Sans hub** (base locale seule) : `npx prisma db execute --file prisma/migrations/27_delays_refusal/migration.sql --schema prisma/schema.prisma` (après celles des Lots 1 et 2 : `25_workflow_v16`, puis `26_quotes`).
7. Dans l’application : *Paramètres › Parcours atelier* (frais de diagnostic, décharge, attente pièces automatique), puis *Équipe › Accès* si un employé particulier doit (ou ne doit pas) confirmer une décharge ou gérer les pièces manquantes.

## Nouveautés V16 — Lot 2 : devis versionné et accord tracé ligne par ligne

- **Devis versionné** : « Devis envoyé » crée une version numérotée (`D2026-0001`, version 1, 2…) avec une **copie figée** des lignes (priorité, nature de la pièce, montants HT / TVA / timbre / TTC) et son **empreinte SHA-256**. Le devis imprimé montre le numéro, la version, la date de validité (15 jours), la priorité et la nature de chaque pièce. Avec un hub, un devis **se numérote au PC du garage** : l’envoyer depuis l’en-ligne est refusé avec un message clair (comme les factures) ; le client peut ensuite l’accepter en ligne.
- **Portail client** (`/suivi/vehicule`) : chaque ligne avec sa priorité (*Sécurité*, *Conseillé*, *À surveiller*), boutons *Accepter* / *Refuser*, total recalculé en direct, nom à saisir ; la décision garde l’adresse IP et le navigateur. Un devis expiré ou remplacé ne peut plus être accepté.
- **Accord par téléphone / au comptoir / SMS / e-mail / WhatsApp** : bouton *Enregistrer l’accord* sur la fiche (nouveau droit `recordQuoteApproval` : accueil, chef d’atelier, administrateur — **jamais le mécanicien** par défaut) : nom, contact, canal, ligne par ligne, note.
- **Preuve** : chaque décision est une ligne `QuoteApproval` **en ajout seul** (impossible à modifier ou effacer, sauf par la synchronisation du hub). La fiche affiche *Devis et accords* : versions, qui, quand, canal, montant, lignes acceptées / refusées, empreinte « copie intacte ».
- **Passage en réparation** (nouveaux ordres) : seulement sur un **accord enregistré** (plus de simple clic ni de motif) ; tout accepté ou en partie → *En réparation* ; tout refusé → *Devis refusé*.
- **Lignes verrouillées** : une ligne acceptée ne se supprime plus (annulation avec motif seulement) ; une ligne refusée est gardée ; une ligne ajoutée après l’accord est un **supplément en attente** (bandeau sur la fiche) ; *En réparation → Devis envoyé* crée un **devis complémentaire** (ancien total, supplément, nouveau total).
- **Facture** : seulement les lignes **acceptées** et non annulées ; s’il reste des lignes en attente, la facture est refusée avec un message (on ne les laisse pas tomber sans le dire).
- **Stock** (nouveaux ordres) : une pièce ajoutée au devis est **réservée** (stock libre seulement) ; elle sort du stock **à l’accord** de la ligne ; refusée ou supprimée → réservation libérée. Les ordres d’avant la V16 ne changent pas.
- **Messages au client** (file des rappels, *Historique des envois*) : « devis à valider » / « supplément à valider » avec le lien du suivi, et une relance après 3 jours sans réponse.
- Plan : [docs/PLAN-V16-LOT2.md](docs/PLAN-V16-LOT2.md). Rapport : [docs/RAPPORT-V16.md](docs/RAPPORT-V16.md).

### Mise à jour vers la V16 (Lot 2) — à faire une commande à la fois, dans cet ordre

Le Lot 2 contient le Lot 1 : si le Lot 1 n’est pas encore en ligne, faites seulement les étapes ci-dessous (`db:cloud` applique les migrations 25 et 26).

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `26_quotes` (et `25_workflow_v16` si besoin) à la base en ligne (n’efface rien, rejouable).
3. **Tout de suite après**, au garage : fermez puis relancez `start-hub.cmd` (le hub applique les migrations à la base du PC du garage). Le PC du garage doit connaître les nouvelles tables et valeurs **avant** que l’en-ligne les écrive ; sinon une ligne de synchronisation reste en échec.
4. `npm run check`
5. `git add -A` puis `git commit -m "V16 Lot 2 : devis versionné et accord tracé"` puis `git push` (dans la foulée).
6. **Sans hub** (base locale seule) : `npx prisma db execute --file prisma/migrations/26_quotes/migration.sql --schema prisma/schema.prisma` (après celle du Lot 1 : `npx prisma db execute --file prisma/migrations/25_workflow_v16/migration.sql --schema prisma/schema.prisma`).
7. Dans l’application : *Équipe › Accès* si un employé particulier doit (ou ne doit pas) enregistrer les accords.

## Nouveautés V16 — parcours atelier traçable (Lot 1 : statuts, motifs, journal)

- **3 nouveaux statuts** : *Attente client* (pas de réponse au devis), *Devis refusé* (motif obligatoire ; remontage, contrôle qualité complet, puis *Prêt*), *Clôturé* (livré **et** facture soldée — automatique, au paiement ou à la livraison). Tous les anciens passages sont conservés ; *Annuler* est possible à toute étape avant la livraison (motif obligatoire, refusé si une facture existe, comme avant).
- **Un droit par décision**, réglable par employé (*Équipe › Accès*) : devis, annuler, livrer, livrer malgré un solde, clôturer. Par défaut : le mécanicien garde les étapes techniques mais ne peut plus **ni annuler ni livrer** ; la réception et le chef d’atelier peuvent **facturer** ; seuls l’administrateur et le chef d’atelier peuvent livrer par dérogation.
- **Fenêtre « Changer le statut… »** sur la fiche de l’ordre (et motif sur l’atelier mobile) : seulement les passages permis ; motif demandé quand il faut (annulation, devis refusé, retour en atelier après le contrôle qualité ou après *Prêt*, travaux lancés sur un devis sans accord enregistré). Le motif est gardé dans l’historique et le journal ; il **n’est jamais montré au client**.
- **Livraison** (nouveaux ordres) : refusée sans facture ou avec un reste à payer (l’acompte de la réception est déduit) ; dérogation d’un responsable avec motif, tracée. Les ordres ouverts **avant** la V16 ne sont pas bloqués (non-rétroactivité).
- **Travaux sans devis** (nouveaux ordres) : *Réceptionné / Diagnostic → En réparation* désactivé par défaut (*Paramètres › Parcours atelier*).
- **Lignes** : une ligne qui faisait partie de l’accord du client est **annulée** (barrée, avec son motif), plus jamais supprimée ; elle sort des totaux, de la facture, du devis imprimé et du suivi client. Ajouter ou retirer une ligne annule la validation du contrôle qualité.
- **Journal** : modification du diagnostic / de la date promise (avant → après), lignes, forfaits, photos (suppression, visibilité), accord du devis en ligne (adresse IP et navigateur, un seul accord en cas de double clic), message du client, message « véhicule prêt » (désormais dans *Historique des envois*, avec statut, erreur et nouvel essai).
- Date promise initiale conservée ; « À traiter » : *Devis en attente de la décision du client*, *Véhicules livrés sans facture soldée*. Rapport : [docs/RAPPORT-V16.md](docs/RAPPORT-V16.md).

### Mise à jour vers la V16 (Lot 1) — à faire une commande à la fois, dans cet ordre

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `25_workflow_v16` à la base en ligne (n’efface rien, rejouable).
3. **Tout de suite après**, au garage : fermez puis relancez `start-hub.cmd` (le hub applique la migration à la base du PC du garage). Le PC du garage doit connaître les nouveaux statuts **avant** que l’en-ligne puisse les écrire ; sinon une ligne de synchronisation reste en échec.
4. `npm run check`
5. `git add -A` puis `git commit -m "V16 Lot 1 : parcours atelier"` puis `git push` (dans la foulée).
6. **Sans hub** (base locale seule, ou PC qui ne lance pas le hub) : `npx prisma db execute --file prisma/migrations/25_workflow_v16/migration.sql --schema prisma/schema.prisma`
7. Dans l’application : *Paramètres* › *Parcours atelier* (les deux interrupteurs), puis *Équipe* › *Accès* si un employé doit garder un droit particulier (ex. un mécanicien qui livre).

## Nouveautés V15 — file d'attente de l'accueil (borne, écran de salle, appel des clients)

- **Borne d'entrée** (`/accueil/borne`, tablette plein écran, sans compte) : gros boutons par motif (dépôt, récupération, devis / question, paiement, autre — catalogue modifiable fr / ar / en), plaque facultative (grand clavier) ou QR du véhicule, rendez-vous du jour reconnu (« Bonjour, votre RDV de 8 h 30 est enregistré »), ticket en grand (A-12), SMS « c'est votre tour » **seulement avec le consentement** du client, impression facultative (imprimante réseau ESC/POS).
- **Écran de salle** (`/accueil/ecran`, TV plein écran, sans compte) : numéros appelés et guichet en très grand, file en attente, attente estimée par motif (moyenne **réelle** des derniers tickets, « — » s'il n'y en a pas assez), son d'appel inclus, français et arabe alternés ou côte à côte, thème sombre / clair, heure et logo. **Jamais** de nom, de téléphone ni de plaque entière (plaque masquée « 215 TU 12** » en option).
- **Poste d'accueil** (menu *Plus* › *Accueil (file d'attente)*) : *Suivant* (priorité : RDV à l'heure, puis ordre d'arrivée, option paiement / récupération rapides), *Appeler*, *Rappeler*, *Absent* (automatique après 3 appels sans réponse, jamais supprimé), *Transférer*, *Terminer* ; ouverture directe du check-in ou de la facture à encaisser ; statistiques du jour ; guichets avec l'employé connecté et son pointage. Rapports (attente par motif / heure / jour, heures de pointe, absents, export CSV), bloc *Accueil* du tableau de bord, « À traiter » (attente trop longue).
- La borne et la TV ont un **jeton d'appareil** créé par l'administrateur (Paramètres › Accueil), révocable. Elles fonctionnent sur le réseau du garage sans internet (hub). Guide : [docs/ACCUEIL.md](docs/ACCUEIL.md). Rapport : [docs/RAPPORT-V15.md](docs/RAPPORT-V15.md).

### Mise à jour vers la V15 — à faire une commande à la fois

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `24_accueil` à la base en ligne (n'efface rien).
3. `npm run check`
4. `git add -A` puis `git commit -m "V15 : file d'attente de l'accueil"` puis `git push`
5. Dans l'application : *Accueil* › *Réglages* (motifs, guichets, priorités, écran de salle, imprimante), puis *Paramètres* › *Accueil : borne et écran de salle* (créez un jeton « Tablette entrée » et un jeton « TV salle », ouvrez chaque lien sur l'appareil).

## Nouveautés V14 — carte des compétences de l’équipe

- **Compétences** (menu *Plus* › *Compétences*, ou depuis *Équipe*) :
  - matrice employés × compétences (🟢 autonome, 🟡 supervisé, 🔴 en formation), filtres, export CSV ;
  - manques de l’équipe (« aucun AUTONOME en … ») et certificats à renouveler ;
  - fiche par employé : niveaux, historique, certificats PDF / photo, objectifs, indices en lecture seule.
- Un niveau est **toujours décidé par un responsable**, avec un motif, et l’historique n’est jamais réécrit. Les statistiques ne changent jamais un niveau ; un objectif atteint demande seulement une réévaluation.
- **Affectation assistée** sur l’ordre et dans l’atelier mobile :
  - compétences requises déduites des forfaits et des mots-clés ;
  - mécaniciens triés par niveau, présence, charge et congé ;
  - superviseur, avec le badge « supervisé par … ».
- **Seul blocage** : une compétence « habilitation exigée » (ex. haute tension) sans certificat valide. Un responsable peut déroger avec un motif, et la dérogation est journalisée. Le reste = avertissements.
- *Mes compétences* pour chaque employé (lecture seule + demande de réévaluation).
- « À traiter » et bloc du tableau de bord.
- Suivi client : libellé public seulement (réglage, désactivé par défaut), jamais de nom d’apprenti ni de niveau.
- Guide : [docs/COMPETENCES.md](docs/COMPETENCES.md). Rapport : [docs/RAPPORT-V14.md](docs/RAPPORT-V14.md).

### Mise à jour vers la V14 — à faire une commande à la fois

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `23_competences` à la base en ligne (n’efface rien).
3. `npm run check`
4. `git add -A` puis `git commit -m "V14 : carte des compétences"` puis `git push`
5. Dans l’application : *Compétences* › *Réglages des compétences* :
   - **Créer le catalogue de départ**, puis adaptez les compétences (mots-clés, forfaits liés) ;
   - réglez les **règles** : supervision obligatoire, habilitation exigée (haute tension), délai de rappel des certificats, superviseur au contrôle qualité ;
   - saisissez les **libellés publics** si vous voulez les montrer aux clients ;
   - enfin, donnez à chaque employé ses niveaux et ses certificats.

## Nouveautés V12 — agenda des prochaines réparations (maintenance préventive)

- **Agenda** (menu *Plus* › *Agenda*) : pour chaque véhicule et chaque élément d'entretien (vidange, filtres, plaquettes, courroie, batterie, pneus…), une **échéance estimée** (km et/ou date, fourchette, confiance, méthode, nombre de cas). Calcul à partir des **ordres livrés** du garage (médiane des intervalles observés sur le même modèle, au moins 5 cas) ou, à défaut, de l'**intervalle saisi par le garage** ; sinon « estimation impossible » avec ce qui manque. Rien n'est inventé ; les relevés OBD simulés et les kilométrages incohérents sont exclus.
- **Rien n'est envoyé sans validation** : valider, préparer le message (français / arabe), envoyer par SMS / e-mail (canaux existants), refus du client respecté, un seul rappel par élément et par cycle. Envoi automatique **désactivé par défaut** (administrateur seulement).
- Fiche véhicule (*Prochaines réparations*), « À faire aussi sur cette voiture » sur l'ordre (ajout au devis en un clic), « À traiter », bloc du tableau de bord, suivi client et QR (« Prochains entretiens » + *Prendre RDV*), portail entreprise (planning par mois, export Excel / CSV).
- Guide : [docs/AGENDA-ENTRETIEN.md](docs/AGENDA-ENTRETIEN.md). Rapport : [docs/RAPPORT-V12.md](docs/RAPPORT-V12.md).

### Mise à jour vers la V12 — à faire une commande à la fois

1. `npm install`
2. `npm run db:cloud` — **avant le push** : ajoute la migration `22_agenda` à la base en ligne (n'efface rien).
3. `npm run check`
4. `git add -A` puis `git commit -m "V12 : agenda des prochaines réparations"` puis `git push`
5. Dans l'application : *Agenda* › *Réglages de l'agenda* › **Créer le catalogue de départ**, puis saisissez **vos** intervalles (km / mois) pour les éléments qui en ont besoin, liez vos forfaits et pièces, et cliquez **Recalculer** dans l'agenda.

## Nouveautés V9 — showroom et messagerie acheteurs

- **Showroom** : annonces de véhicules (photos, documents PDF, fiche technique, équipements, prix, historique prix / km / statut), pages publiques `/showroom` avec recherche, filtres, tri et favoris (sans compte). Chaque information indique sa source : « vérifié par le garage » ou « déclaré par le vendeur ». Rôles **Vendeur** (ses annonces seulement) et **Responsable showroom** ; **messagerie** acheteur ↔ vendeur par lien privé, non-lus et mises à jour en direct. Voir [docs/SHOWROOM-MESSAGERIE.md](docs/SHOWROOM-MESSAGERIE.md).

## Nouveautés V9 — contrats (Tunisie) et rôles RH / comptable

- **Contrats** (menu *Contrats*) : réparation pré-remplie depuis l'ordre de réparation (prix TTC en dinars, accord du devis, acompte, garantie, remise du véhicule), flotte pour les entreprises, contrats de travail (CDI par défaut, CDD seulement avec un motif légal, période d'essai limitée), fournisseurs et partenaires (alerte « sous-traitance de main-d'œuvre déguisée »), modèle vierge. PDF avec logo, signés et cachetés **à la main** puis scan archivé (pas de signature électronique), alerte avant échéance, jamais de renouvellement automatique. Chaque modèle reste « à valider par un juriste » tant qu'un administrateur n'a pas enregistré la relecture. Contrats de travail visibles par l'administrateur et les RH seulement. Détails, références et limites : [docs/CONTRATS.md](docs/CONTRATS.md).
- **Nouveaux rôles** : *Ressources humaines* (équipe, congés, attestations, contrats de travail) et *Comptable* (factures, factures fournisseurs, trésorerie en lecture, contrats en lecture).

## Nouveautés V8.4 — garanties, dépenses et trésorerie prévisionnelle

- **Garanties** sur réparations et pièces (date et/ou km, la première limite atteinte), réclamations, décisions, coûts et remboursements reçus. Garantie automatique à la livraison (Paramètres, désactivée par défaut). Les montants ne sont visibles que de l'administrateur et du responsable.
- **Dépenses et échéances** : loyer, salaires, électricité, crédit… une fois ou chaque mois / trimestre / an, marquées payées.
- **Trésorerie prévisionnelle** (administrateur, responsable) : solde caisse + banque saisi, encaissements réels, factures impayées et remboursements attendus séparés, sans double comptage, scénarios prudent / normal / optimiste avec hypothèses affichées, alerte de solde bas configurable. Un seul garage, pas de connexion bancaire : voir [docs/GARANTIES-TRESORERIE.md](docs/GARANTIES-TRESORERIE.md).

## Nouveautés V8.0 — diagnostic OBD-II et installateur Windows

- **Diagnostic OBD-II** (adaptateur ELM327, Chrome/Edge) : codes défauts (jamais effacés), données moteur, VIN, kilométrage si la voiture le fournit. Voir [docs/OBD.md](docs/OBD.md).
- **Installateur Windows** : `npm run installer` fabrique `dist\GaragePro-Setup-….exe`. Voir [docs/INSTALLATEUR.md](docs/INSTALLATEUR.md).

## Nouveautés V7.7 — sauvegardes chiffrées, restauration testée

Le PC du garage sauvegarde la base **chaque jour** : copie cohérente, **chiffrée** (AES-256, clé hors du projet), copiée sur un **2e emplacement** (clé USB, OneDrive…), et **restaurée pour de vrai dans une base jetable** pour prouver qu'elle est utilisable. Menu **Sauvegardes** (administrateur) avec alerte en cas de problème. Mise en place en 3 commandes : `npm run backup:key` (puis copiez la clé ailleurs), réglez `BACKUP_COPY_DIR`, `npm run backup`. Procédure de restauration : [`docs/SAUVEGARDES.md`](docs/SAUVEGARDES.md).

## Nouveautés V7.6 — rappels clients et alertes

| | |
|---|---|
| **Plans d'entretien** | Fiche client → véhicule → *Entretien* : vidange, filtres… tous les N jours et/ou N km. Le kilométrage n'est jamais deviné. |
| **Rappels automatiques** | Entretien, rendez-vous et livraison du lendemain, par SMS (Twilio) et/ou e-mail **s'ils sont configurés**. Modèles modifiables, refus du client respecté, pas de doublon, réessais. Menu *Rappels clients* : historique, erreurs, réessayer. |
| **Alertes** | *Suivi & retards* : + réparations bloquées, livraisons à risque, stock minimal ; assigner, marquer traitée, reporter. |

Configuration : `CRON_SECRET` (16 caractères min.) dans le `.env` du PC du garage **et** sur Vercel. Base : `npm run db:cloud` (migration `10_reminders_alerts`). Détails et tests : [`docs/RAPPORT-PROMPT2.md`](docs/RAPPORT-PROMPT2.md).

## Nouveautés V7.5 — QR Code sécurisé par véhicule

Fiche client → véhicule → **QR Code** : créer, imprimer l'étiquette, renouveler, révoquer. Le scan ouvre la fiche pour l'équipe connectée, l'espace entreprise pour le compte propriétaire du véhicule, et **pour toute autre personne seulement l'immatriculation et le modèle** (suivi de réparation toujours protégé par le code à 4 chiffres). Jeton aléatoire impossible à deviner, jamais écrit dans le journal. Nécessite `APP_URL`. Mise à jour de la base : `npm run db:cloud` (migration `9_vehicle_qr`). Détails et tests : [`docs/RAPPORT-PROMPT2.md`](docs/RAPPORT-PROMPT2.md).

## Nouveautés V7.4 — stock : réservations, retours fournisseur, corrections

| | |
|---|---|
| **Pièces réservées** | Fiche de l'ordre → réserver une pièce pour cette réparation. Elle reste sur l'étagère mais n'est plus disponible pour une autre sortie (page Stock : colonnes *Réservé* et *Disponible*). Utilisée automatiquement quand la pièce est ajoutée à l'ordre, libérée à la livraison ou à l'annulation. |
| **Retour fournisseur** | Nouveau type de mouvement sur la page Stock (fournisseur obligatoire). |
| **Corriger un mouvement** | Mouvement inverse lié à l'original, avec motif ; l'original reste dans l'historique ; une seule correction possible. |
| **Pas de sorties concurrentes incohérentes** | Contrôles atomiques en base : deux personnes ne peuvent pas prendre ou réserver la même dernière unité. |

Mise à jour de la base : `npm run db:cloud` (migration `8_stock_reservations`, ajouts uniquement). Détails et tests : [`docs/RAPPORT-PROMPT2.md`](docs/RAPPORT-PROMPT2.md).

## Nouveautés V7.3 — bénéfice réel par réparation

| | |
|---|---|
| **Rentabilité d'une réparation** | Sur la fiche de l'ordre (administrateur) : CA HT, coût réel des pièces, dépenses directes, marge brute, coût de la main-d'œuvre (heures **réellement travaillées** × coût horaire, jamais les heures facturées), frais indirects, bénéfice estimé. L'encaissé (client / assurance) est affiché à part. Tout montant estimé ou incomplet est signalé. |
| **Coût des pièces figé** | Le prix d'achat est enregistré au moment où la pièce est utilisée : une hausse de prix plus tard ne change pas le coût d'une réparation passée. |
| **Dépenses directes** | Sous-traitance, remorquage… sur la fiche de l'ordre (admin, responsable). Jamais effacées : annulées avec motif. |
| **Menu Rentabilité** | Par réparation, véhicule, client, type d'intervention ou mois, sur une période ; export Excel. |
| **Paramètres → Rentabilité** | Coût horaire moyen de la main-d'œuvre, frais indirects (aucun / % du CA / par heure). Coût horaire par employé sur sa fiche (administrateur). |

Mise à jour de la base : `npm run db:cloud` (migration `7_profitability`, ajouts uniquement) avant le `git push`, puis redémarrer `start-hub.cmd`. Détails et tests : [`docs/RAPPORT-PROMPT2.md`](docs/RAPPORT-PROMPT2.md).

## Nouveautés V7.2 — Excel, mot de passe oublié, soldes de congés, journal complet

| | |
|---|---|
| **Vrai fichier Excel** | Fiche employé → **Excel (.xlsx)** : 4 feuilles (Résumé, Présence, Réparations, Congés), heures en vrais nombres (Excel peut les additionner), arabe et accents intacts. Le lien **CSV** reste disponible à côté. |
| **Mot de passe oublié (entreprises)** | `/entreprise/connexion` → *Mot de passe oublié ?* : l'utilisateur reçoit un e-mail avec un lien **valable 1 heure, utilisable une seule fois**. Même réponse que le compte existe ou non ; 3 demandes par heure et par e-mail au maximum. Nécessite l'envoi d'e-mails configuré (Resend ou Gmail) et `APP_URL`. |
| **Soldes de congés** | Fiche employé → **Congés payés par an (jours)**. Solde = jours par an − congés payés acceptés de l'année civile (jours d'ouverture du garage), sans report. Les demandes en attente sont affichées à part. Visible sur la fiche employé et sur *Pointage & congés* de chacun. |
| **Journal complet** | En plus de l'argent et du stock : **clients** (création, modification avant → après), **véhicules** (ajout, VIN/année/carburant complétés), **équipe** (création, rôle, activation, mot de passe changé — jamais le mot de passe lui-même —, suppression), **paramètres** généraux et de réservation, **forfaits**, **prestations en ligne**, demandes et changements de mot de passe des comptes entreprise. |

### Mise à jour vers la V7.2 (base de données)

Une migration qui **ajoute** une colonne (jours de congé par an). Avec le hub, internet branché, **avant** le `git push` :

```
npm run db:cloud
```

Le PC du garage se met à jour au prochain `start-hub.cmd` (**redémarrez-le** après la mise à jour). **Sans hub** : `npx prisma db execute --file prisma/migrations/6_leave_balance/migration.sql --schema prisma/schema.prisma`

## Nouveautés V7.1 — journal de l'argent et du stock, alertes réglables

| | |
|---|---|
| **Journal : argent** | *Journal* enregistre maintenant chaque **facture** créée (numéro, montants), chaque **paiement** (montant, mode, payé avant → après, statut), chaque **relance**, ainsi que les **factures et paiements fournisseurs**. |
| **Journal : stock** | Création et modification d'une pièce (prix avant → après), **entrée / sortie manuelle** (stock avant → après, motif), pièce **utilisée ou rendue** sur un ordre, **bons de commande** (création, validation, refus, annulation) et **bons de réception** (stock de chaque pièce après l'entrée). |
| **Filtres du journal** | Boutons *Factures*, *Paiements*, *Mouvements de stock*, *Pièces*, *Bons de commande*… en haut de la page. Chaque ligne est écrite **dans la même transaction** que l'opération : l'une ne peut pas exister sans l'autre. |
| **Alertes réglables** | **Paramètres → Alertes de retard** : tolérance avant qu'une livraison promise (heures), une pièce attendue (jours) ou une assurance sans réponse (jours) soit signalée en retard sur *Suivi & retards* et dans le compteur du menu. Par défaut : 0 h, 0 j, 3 j (comme avant). |

### Mise à jour vers la V7.1 (base de données)

Une seule migration, qui **ajoute** 3 colonnes aux paramètres (rien n'est supprimé). Avec le hub, internet branché, **avant** le `git push` :

```
npm run db:cloud
```

Le PC du garage se met à jour tout seul au prochain `start-hub.cmd`. **Sans hub** : `npx prisma db execute --file prisma/migrations/5_alert_settings/migration.sql --schema prisma/schema.prisma`

Tests sur une base PostgreSQL **de test** : `npm run test:db` (fichier `tests/journal.db.test.ts`).

## Nouveautés V7 — gestion complète du garage (équipe, atelier, entreprises)

| | |
|---|---|
| **Rôle « Responsable »** | Nouveau rôle entre Administrateur et Réception : valide les congés, les corrections de pointage, le contrôle qualité ; voit les rapports des employés. |
| **Pointage sécurisé** | Menu *Pointage & congés*. L'écran du garage (*Ouvrir la borne*) affiche un **code à 6 chiffres qui change toutes les 30 s** + un QR code. Chaque employé pointe depuis **son** compte avec ce code : il doit voir l'écran du garage. Un code ne sert qu'une fois par personne, 8 essais faux = blocage 10 min. Option (Paramètres) : exiger aussi le **réseau du garage** (automatique sur le PC du garage ; en ligne, IP fixe du garage). Arrivée, départ, pauses. |
| **Corrections** | Le responsable ajoute ou corrige un pointage avec un **motif obligatoire** ; la ligne d'origine n'est jamais effacée (marquée « annulée »). Personne ne corrige ses propres pointages (sauf l'administrateur). |
| **Congés et absences** | Demande depuis son compte (congé payé, maladie, sans solde, autorisation de quelques heures, absence) → le responsable accepte ou refuse (jamais sa propre demande). Chevauchements refusés. Historique complet. |
| **Calendrier** | Vues jour, semaine, mois, année : congés acceptés, demandes en attente (pour l'intéressé et les responsables), RDV, livraisons promises. Les collègues voient « Absent », pas le motif. |
| **Rapports par employé** | Heures de présence, heures sur chaque réparation, pauses, jours incomplets (sortie non pointée = 0 h, jamais deviné), congés de la période. Export **Excel (CSV)** et **impression / PDF**. |
| **Attestation de travail (PDF)** | Générée avec les informations réellement enregistrées (Paramètres → Entreprise + fiche employé), numérotée ATT-AAAA-NNNN et archivée. Sans signature ni cachet (à signer à la main). Refusée si une information manque. |
| **Temps des mécaniciens** | Chrono par mécanicien sur l'ordre et dans *Atelier (mobile)* ; plusieurs mécaniciens sur le même ordre. L'ordre affiche **heures-personnes** (2 mécaniciens × 2 h = 4 h, pour les rapports), **durée de l'intervention** (2 h) et **main-d'œuvre facturée** (les lignes). La facture n'est jamais changée automatiquement : un bouton propose la ligne selon la règle choisie dans Paramètres. |
| **Assurance, pièces manquantes, retards** | Statut **« Attente assurance »** (compagnie, n° de sinistre, décision). Pièces manquantes avec fournisseur et date de livraison prévue. Page **Suivi & retards** : livraisons promises dépassées, pièces en retard, assurance en attente depuis plus de 3 jours, avec qui appeler et quoi faire. |
| **Contrôle qualité obligatoire** | Checklist : essai routier (fait / non nécessaire), liquides, voyants, outils retirés, travaux vérifiés, facturation vérifiée, puis **validation par un responsable**. Le passage à « Prêt » est **bloqué par le serveur** tant que ce n'est pas fait ; modifier un point ou renvoyer la voiture en réparation annule la validation. |
| **Portail entreprise** | `/entreprise` : les comptes d'un client professionnel (créés depuis sa fiche client) voient **uniquement** leurs véhicules, réparations, photos et — selon le rôle — devis et factures. Tout est filtré côté serveur. |
| **Journal** | *Journal* (administrateur) : qui a fait quoi, quand, avant → après. Lignes impossibles à modifier ou effacer (protection dans la base). Jamais de mot de passe ni de code dedans. |

### Mise à jour vers la V7 (base de données)

**Avec le hub du garage (votre cas)**, une commande à la fois, internet branché :

```
npm install
```
```
npm run db:cloud
```
(ajoute les nouvelles tables à Supabase — rien n'est supprimé ; à faire **avant** le `git push`). La base du PC du garage se met à jour toute seule au prochain `start-hub.cmd`.

**Sans hub** : `npx prisma db execute --file prisma/migrations/4_team_quality/migration.sql --schema prisma/schema.prisma`

Ensuite : **Paramètres** → *Entreprise (attestations)* et *Pointage* ; **Équipe** → fiche de chaque employé (poste, date d'embauche).

Tests de la V7 sur une vraie base PostgreSQL **de test** : `set TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres` puis `npm run test:db`. Rapport détaillé : [`docs/RAPPORT-V7.md`](docs/RAPPORT-V7.md).

## Nouveautés V6 — application PC / téléphone et mode hors ligne

| | |
|---|---|
| **Application** | GaragePro s'installe comme une vraie application (icône, plein écran, sans barre du navigateur). Bouton **« Installer l'application »** en bas du menu de l'espace équipe. PC (Chrome / Edge) : bouton, ou icône ⊕ dans la barre d'adresse. Android (Chrome) : bouton, ou ⋮ → *Installer l'application*. iPhone (Safari) : Partager → *Sur l'écran d'accueil*. |
| **Coupure courte** | Bandeau « Pas de connexion » ; les pages déjà ouvertes restent consultables ; message quand la connexion revient. Rien n'est enregistré dans le navigateur pour les données sensibles (aucune API mise en cache) et la déconnexion efface les pages gardées. |
| **Mode hors ligne complet (hub du garage)** | Le PC du garage fait tourner GaragePro avec **sa propre base**. Toute l'équipe (PC, téléphones, tablettes sur le **Wi-Fi du garage**) travaille normalement **sans internet** : ordres, atelier, photos, factures, stock, achats. Quand internet revient, tout est envoyé automatiquement à Supabase, et ce qui a été fait en ligne (RDV du site, réclamations…) revient au garage. |
| **Pied de page** | Plus petit (une bande, plus de plein écran). |
| **Corrections** | Lien de suivi sans APP_URL, montants cachés aux non-autorisés sur *Nouvel ordre*, fichier agenda (.ics), bons de réception avec pièce en double, liaison des réclamations publiques. |

### Mode hors ligne : installer le hub sur le PC du garage (une seule fois)

1. **Installer PostgreSQL** sur le PC (invite de commandes **administrateur**) :
   ```cmd
   winget install PostgreSQL.PostgreSQL.16
   ```
   Notez le mot de passe choisi pour l'utilisateur `postgres`. Puis créez la base :
   ```cmd
   "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres garagepro
   ```
2. **Modifier le `.env` du PC du garage** (jamais celui de Vercel) — modèle complet dans `.env.example` :
   - `DATABASE_URL` et `DIRECT_URL` = `postgresql://postgres:MOTDEPASSE@localhost:5432/garagepro`
   - `CLOUD_DATABASE_URL` = l'ancienne adresse Supabase **port 5432** (Connect → *Session pooler*)
   - `GARAGE_HUB_LOCAL="1"`
   - `SUPABASE_STORAGE_BUCKET=""` (vide) et le nom du bucket dans `CLOUD_STORAGE_BUCKET`
3. **Installer** (copie toutes les données en ligne vers le PC, ne supprime rien en ligne) :
   ```cmd
   npm run hub:init
   ```
4. **Sur Vercel** : Settings → Environment Variables → `GARAGE_HUB` = `1`, puis *Redeploy*.
   Les factures, bons de commande et bons de réception sont alors numérotés **uniquement au garage** (deux numéros identiques sont impossibles).

**Chaque jour** : double-cliquez sur `start-hub.cmd` (ou `npm run hub`). La fenêtre affiche l'adresse à ouvrir sur les téléphones, par ex. `http://192.168.1.20:3000`, et l'état de la synchronisation (toutes les 30 s). Le menu de l'équipe affiche **« Serveur du garage »** : synchronisé / modifications en attente / internet coupé.

**À savoir**
- Le PC du garage doit rester allumé pendant le travail (c'est le serveur). Donnez-lui une adresse IP fixe dans la box.
- Même ligne modifiée au garage **et** en ligne pendant une coupure : **la modification la plus récente gagne**. Un conflit impossible à fusionner (ex. même plaque créée des deux côtés) est affiché dans la fenêtre du hub et réessayé jusqu'à correction.
- Les numéros d'ordres et de réclamations ne se croisent jamais : **impairs au garage, pairs en ligne**.
- Sur les téléphones, l'adresse `http://IP:3000` fonctionne sans internet, mais le bouton « Installer » n'y apparaît pas (les navigateurs exigent `https` pour installer une application) : ajoutez simplement un favori / raccourci sur l'écran d'accueil.
- Synchronisation manuelle : `npm run hub:sync`. Test réel de la synchronisation (base PostgreSQL de test, jamais la vraie) : `set TEST_PG_URL=postgresql://postgres:MDP@localhost:5432/postgres` puis `npm run test:hub`.

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
| **Pointage & congés** | borne du garage (code 30 s + QR), arrivée / pause / départ, corrections tracées, demandes de congé, autorisations, absences |
| **Équipe** (responsable) | présence en direct, demandes à valider, fiche employé, rapport par période (CSV / PDF), attestation de travail PDF |
| **Calendrier** | jour, semaine, mois, année : congés, RDV, livraisons promises |
| **Suivi & retards** | livraisons promises dépassées, pièces en retard, attente assurance, qui appeler, quoi faire |
| **Temps & qualité sur l'ordre** | chrono par mécanicien, heures-personnes / durée / heures facturées, pièces manquantes, dossier assurance, contrôle qualité obligatoire |
| **Portail entreprise** | `/entreprise` : chaque entreprise cliente voit seulement ses véhicules, réparations, photos (et factures selon le rôle) |
| **Journal** (admin) | qui a fait quoi, quand, avant → après ; non modifiable |
| **Hors ligne** | hub sur le PC du garage, synchronisation automatique avec Supabase |

Statuts : Réceptionné → Diagnostic → Devis envoyé / **Attente assurance** → Attente pièces → En réparation → **Contrôle qualité (checklist validée)** → Lavage → Prêt → Livré (ou Annulé).

### Espaces et rôles

| | Admin | Responsable | Réception | Mécanicien | Magasinier |
|---|:-:|:-:|:-:|:-:|:-:|
| **Espace client** : ordres de réparation, clients & véhicules, devis | ✓ | ✓ | ✓ | ✓ | |
| Factures clients (consulter, encaisser, relancer) | ✓ | ✓ | ✓ | | |
| **Établir une facture** | ✓ | | | | |
| CA du mois / reste à encaisser | ✓ | ✓ | ✓ | | |
| **Espace fournisseur** : stock (mouvements) | ✓ | lecture | lecture | lecture | ✓ |
| Fournisseurs, bons de commande (demande) | ✓ | ✓ | | | ✓ |
| **Valider / refuser un bon de commande** | ✓ | | | | |
| Bons de réception (entrée en stock) | ✓ | | | | ✓ |
| Factures fournisseurs (saisie / suivi) | ✓ | | | | ✓ |
| Pointer, demander un congé, chrono sur ses réparations | ✓ | ✓ | ✓ | ✓ | ✓ (sans chrono) |
| Valider congés et corrections, rapports employés, attestations | ✓ | ✓ (pas pour soi) | | | |
| **Valider le contrôle qualité** (débloque « Prêt ») | ✓ | ✓ | | | |
| Comptes du portail entreprise | ✓ | ✓ | | | |
| Payer un fournisseur, paramètres, rapports du garage, journal | ✓ | | | | |

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
| `npm test` | 210 tests (argent, TVA, créneaux, permissions, stock, connexion, équipe, pointage, heures, congés, e-mails, guide et assistant IA, hub) |
| `npm run test:db` | tests sur une vraie base PostgreSQL **de test** (`TEST_DATABASE_URL`) : pointage, congés, contrôle qualité, portail entreprise, attestations, journal |
| `npm run test:hub` | synchronisation garage ↔ en ligne sur deux bases de test (`TEST_PG_URL`) |
| `npm run test:watch` | relance les tests à chaque sauvegarde |
| `npm run lint` | ESLint (règles Next.js) |
| `npm run check` | TypeScript + ESLint + tests (à lancer avant chaque commit) |
| `npm run build` | build de production |

Les tests sont dans `tests/`. `npm test` n'utilise **pas** la base de données ; `test:db` et `test:hub` créent leurs propres bases jetables (`gp_test_db`, `gp_hub_*`) sur le serveur de test indiqué — **jamais** l'adresse Supabase ni la base du garage (refusé automatiquement pour Supabase).

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
prisma/migrations/          migrations (0 à 4) — uniquement des ajouts
src/app/(garage)/garage/    espace équipe (ordres, clients, stock, factures, pointage, equipe, calendrier, suivi, journal…)
src/app/entreprise/         portail entreprise
src/app/(public)/           site client
src/actions/                Server Actions (validation + rôles)
src/server/                 logique métier (statuts, stock, facturation, pointage, congés, qualité, audit…)
src/lib/i18n/               traductions fr · ar · en (+ v7-*.ts)
scripts/hub/                hub hors ligne (installation, synchronisation, db:cloud)
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
