# Showroom et messagerie acheteurs (V9, Prompt 5/5)

Ce document décrit ce qui est construit, les règles appliquées par le serveur et les limites connues.
Migrations : `17_showroom` (rôles, annonces, médias, historique) et `18_messaging` (conversations, messages),
toutes deux additives et rejouables.

## 1. Rôles et droits

| Rôle | Showroom | Messagerie acheteurs |
| --- | --- | --- |
| Administrateur | toutes les annonces (créer, modifier, réattribuer, publier, archiver) | toutes les conversations |
| Responsable showroom (`SHOWROOM_MANAGER`) | toutes les annonces | toutes les conversations |
| Vendeur (`SELLER`) | crée des annonces ; ne modifie **que les siennes** | **seulement** les conversations de ses annonces |
| Responsable d'atelier, Réception | inventaire en lecture seule | — |
| Mécanicien, Magasinier | — | — |

- Les droits sont dans `src/lib/permissions.ts` : `viewShowroom`, `createListing`, `manageAllListings`,
  `useShowroomMessages`, `readAllShowroomMessages`.
- La propriété (vendeur = ses annonces) est vérifiée **côté serveur** à chaque action (`src/server/showroom.ts`,
  `canEditListing`) ; un vendeur ne peut pas se réattribuer une annonce ni la donner à quelqu'un d'autre.
- Les conversations sont filtrées **dans la requête** (`conversationScope` dans `src/server/messaging.ts`) :
  une conversation hors périmètre répond « introuvable », y compris pour le direct.
- Les nouveaux rôles n'ont aucun droit atelier, argent ou administration. Ils n'ont pas non plus le pointage
  (`useTimeClock`) : à ajouter si les vendeurs doivent pointer.
- Les comptes entreprise (portail flotte) ne sont pas concernés.

## 2. Statuts d'une annonce

`DRAFT` (brouillon) → `PUBLISHED` (en ligne) ⇄ `RESERVED` (réservé) → `SOLD` (vendu) ; `UNAVAILABLE`
(indisponible) ; `ARCHIVED` (archivé). Passages autorisés : `src/lib/showroom.ts` (`LISTING_TRANSITIONS`).

- **Publier** exige une marque, un modèle, un prix et au moins une photo visible.
- **Site public** : seules les annonces `PUBLISHED` et `RESERVED` (badge « Réservé ») sont visibles.
  **Choix** : une annonce `SOLD` reste affichée **14 jours** avec le badge « Vendu », prix barré et sans
  formulaire de contact, puis disparaît (`SOLD_VISIBLE_DAYS`). Brouillon, indisponible, archivé : jamais publics
  (ni la page, ni les photos : `/api/showroom/media/<id>` répond 404).
- Vendu → En ligne = vente annulée (la date de vente est effacée). Archivé → Brouillon pour la reprendre.
- Rien n'est effacé : une annonce s'archive. Deux annonces actives pour le même véhicule de l'atelier (ou la même
  immatriculation) sont refusées.
- **Documents de vente** : non construits ici (module Contrats). Une annonce vendue affiche le rappel
  « Documents de vente : module Contrats (à venir) ». **Aucune page de GaragePro ne vaut transfert de propriété** :
  la mutation se fait auprès de l'ATTT avec les pièces exigées.

## 3. Historique

Chaque annonce garde un historique non modifiable (`ListingEvent`) : création, modification (liste des champs),
**prix avant → après**, **kilométrage avant → après**, statut, changement de vendeur, photo / document ajouté,
fichier supprimé — avec l'auteur et l'heure. Les créations, changements de prix / vendeur et de statut vont aussi
dans le journal général (`AuditLog`).

## 4. Ce qui est public, et d'où vient chaque information

| Information | Publique ? | Source affichée |
| --- | --- | --- |
| Marque, modèle, version, année, carburant, boîte, puissance, couleurs, état, équipements, caractéristiques, description, prix | oui | « vérifié par le garage » si conforme à la fiche du véhicule de l'atelier (marque/modèle, année, carburant), sinon « déclaré par le vendeur » |
| Kilométrage | oui | « vérifié par le garage (OR-0042, date) » **seulement** s'il est égal au dernier kilométrage relevé par l'atelier : à la réception d'un ordre de réparation, ou lecture OBD réelle confirmée (jamais une lecture simulée). Sinon « déclaré par le vendeur » |
| Immatriculation, VIN, lien avec la fiche du client | **jamais** | interne |
| Historique d'atelier | **seulement** le résumé que l'équipe a écrit/relu et choisi de publier (case à cocher) | « résumé rédigé par l'équipe » |
| Nom du vendeur | oui (interlocuteur) ; téléphone affiché = celui du garage, jamais le numéro personnel de l'employé | — |
| Photos | oui si « visible » (par défaut) | — |
| Documents PDF | **non par défaut** (une carte grise contient des données personnelles) ; l'équipe rend visible document par document | — |

- La source est **calculée par le serveur** à chaque enregistrement (`computeFacts`) à partir des données de
  l'atelier : le formulaire ne peut pas « déclarer » une information vérifiée.
- Le bouton « Proposer un brouillon depuis les réparations livrées » écrit dans le champ un résumé (mois, km,
  travaux réalisés) **sans nom de client, sans prix, sans texte de plainte**. Rien n'est publié sans la case.
- On n'invente jamais de propriétaires précédents ni d'historique.

## 5. Acheteurs : liens privés, sans compte

- « Contacter le vendeur » (annonce en ligne ou réservée) : nom, téléphone et/ou e-mail (au moins un), message.
  Une conversation est créée et l'acheteur est envoyé sur **son lien privé** `/messages/<jeton>`.
- Le jeton = 24 octets aléatoires (32 caractères). Seul son **SHA-256** est enregistré (`buyerTokenHash`) : même
  avec la base, on ne peut pas reconstituer le lien. Qui possède le lien voit **cette** conversation seulement.
- La page privée n'est pas indexée (`noindex`) et n'envoie pas son adresse comme « referrer ».
- Limites (table `PortalAttempt`, comme le suivi de réparation) : 5 nouvelles conversations par adresse IP et par
  heure ; 30 réponses par conversation et 60 par adresse IP par heure ; 30 mauvais liens par adresse IP et par heure,
  puis cette adresse est bloquée une heure (même pour un bon lien).
- Messages : texte brut, 2 000 caractères maximum, caractères de contrôle retirés, affichés échappés (aucun HTML,
  aucun lien généré).
- Favoris : gardés **dans le navigateur** (localStorage, sans compte) ; si le navigateur refuse le stockage, le
  bouton fonctionne simplement sans mémoire.

## 6. Équipe : boîte de réception, non-lus, direct

- `/garage/messages` : toutes / non lues, filtre par annonce (lien « Conversations » sur la fiche d'annonce).
- Pastille du menu « Messages acheteurs » = messages d'acheteurs non lus **dans le périmètre de la personne**.
- Ouvrir une conversation marque les messages de l'acheteur comme lus ; l'acheteur qui ouvre son lien marque
  ceux de l'équipe comme lus (coche double « lu par l'acheteur »).
- Fermer une conversation bloque les nouveaux messages des deux côtés ; « Rouvrir » la débloque.
- **Direct** : même mécanisme que le reste de l'application (sondage court toutes les 4 s, empreintes de version,
  `LiveRefresh`). Sujets `inbox` (par personne) et `conv:<id>` (accès vérifié avant tout calcul) sur
  `/api/staff/live` ; `/api/messages/<jeton>/live` pour l'acheteur. Aucune connexion permanente.

## 7. Notifications

Uniquement par les canaux **existants** (`src/server/notify.ts`, `src/server/email.ts`) et **seulement s'ils sont
configurés** ; sinon rien n'est envoyé (rien n'est simulé) et il reste le lien à l'écran et la pastille du menu.

- Acheteur, à la création : le lien privé par SMS (Twilio) et/ou e-mail s'il a donné ces coordonnées.
- Acheteur, réponse de l'équipe : « le vendeur a répondu » (sans lien, le jeton en clair n'étant pas conservé),
  seulement si les réponses précédentes ont été lues (pas de rafale).
- Vendeur : e-mail « nouveau message » à l'adresse de son compte, seulement au premier message non lu.
- Les envois partent après la réponse (`after`) et ne bloquent ni ne font échouer l'envoi du message.

## 8. Fichiers

Photos (JPEG, PNG, WEBP, 10 Mo) et documents PDF (10 Mo) passent par le stockage existant (`src/server/storage.ts` :
dossier `./storage` ou bucket Supabase privé) sous `listings/<annonce>/…`, type détecté sur les octets.
Maximum 30 photos et 10 documents par annonce. Le hub du garage synchronise aussi ces fichiers
(`scripts/hub/media-sync.mjs`).

## 9. Limites connues

- Pas d'envoi direct navigateur → Supabase pour les fichiers du showroom (contrairement aux vidéos d'atelier) :
  sur Vercel, un fichier doit faire moins de ~4,5 Mo (les photos sont réduites à 1920 px avant l'envoi ; un gros PDF
  peut être refusé).
- Les captures d'écran de référence du cahier des charges n'ont pas été fournies : la mise en page suit le style du
  site client existant.
- `Conversation.workOrderId` est prévu pour lier une conversation à une réparation mais n'est pas utilisé en V9
  (les clients d'atelier ont déjà le message depuis le suivi de réparation).
- Le lien privé ne peut pas être renvoyé par l'équipe (il n'est pas conservé en clair) ; un acheteur qui l'a perdu
  peut recontacter le vendeur depuis l'annonce.
- `vehicleId`, `sellerId`, `assignedToId` sont des identifiants sans clé étrangère (pour ne modifier aucun modèle
  existant) : leur cohérence est assurée par le code.
- Contrats de vente, attestation de cession : module Contrats.
