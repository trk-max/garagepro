# Accueil : file d'attente (V15) — installer la borne et l'écran de salle

## 1. Ce qu'il faut

- Le **PC du garage** avec le hub qui tourne (`start-hub.cmd`) : la borne et la TV parlent au PC du garage par le Wi-Fi / réseau local. **Internet n'est pas nécessaire.**
- Une **tablette** (borne d'entrée) et une **TV** avec un navigateur (TV connectée, clé HDMI type Android TV, ou mini-PC). Chrome ou Edge conseillé.
- Facultatif : une **imprimante de tickets réseau** compatible ESC/POS (port 9100).

## 2. Créer les jetons d'appareil (administrateur)

1. *Paramètres* › **Accueil : borne et écran de salle**.
2. Nom « Tablette entrée », type *Borne d'entrée* → **Créer le jeton**.
3. Le lien d'activation et son QR code s'affichent **une seule fois** (seule une empreinte du jeton est gardée en base). Ouvrez ce lien sur la tablette (scannez le QR avec la tablette, ou recopiez le lien).
4. Recommencez avec « TV salle », type *Écran de salle*, et ouvrez le lien sur la TV.

Sur le PC du garage ouvert en `localhost`, le lien utilise automatiquement l'adresse réseau du PC (ex. `http://192.168.1.20:3000/accueil/activer?t=…`), comme la borne de pointage.

Le lien enregistre le jeton dans le navigateur de l'appareil (cookie sécurisé, 5 ans) puis ouvre `/accueil/borne` ou `/accueil/ecran`. Le jeton ne reste pas dans la barre d'adresse.

- **Révoquer** : le bouton *Révoquer* coupe l'accès immédiatement (la page affiche « Appareil non autorisé » à sa requête suivante, quelques secondes pour la TV).
- Un jeton de borne n'ouvre pas l'écran, et inversement.
- Un appareil sans jeton (ou révoqué) ne voit rien de la file.

## 3. Plein écran

- Bouton **Plein écran** en haut à droite de la borne et de l'écran.
- Pour un mode kiosque permanent : Chrome / Edge avec `--kiosk http://ADRESSE-DU-PC:3000/accueil/borne` (ou `…/accueil/ecran`), ou « Ajouter à l'écran d'accueil » sur la tablette.

## 4. Le son de l'écran de salle

Les navigateurs **bloquent le son tant que personne n'a touché la page**. Après chaque démarrage de la TV, cliquez une fois sur **Activer le son** (bouton orange en haut). Le son (« ding-dong », fichier `public/sounds/accueil-appel.wav`, fabriqué par `scripts/make-accueil-sound.mjs`, libre de droits) est joué à chaque **nouvel** appel. Pour éviter ce clic, lancez Chrome / Edge avec `--autoplay-policy=no-user-gesture-required`.

## 5. Motifs, guichets, priorités (*Accueil* › *Réglages*, responsable / administrateur)

- **Motifs** : lettre du numéro (A, B…), noms fr / ar / en, type (dépôt, récupération, devis, paiement, autre), « rapide », ordre, actif. Les numéros repartent à 1 chaque jour, par lettre.
- **Guichets** : « Guichet 1 », « Caisse »… Chaque employé s'installe à son guichet depuis le poste d'accueil ; le poste affiche qui est à quel guichet et s'il a pointé.
- **Priorité** de « Suivant » :
  1. ticket passé devant à la main par l'accueil ;
  2. **RDV à l'heure** : ticket pris au plus tard à *heure du RDV + fenêtre*, appelé en premier à partir de *heure du RDV − fenêtre* (fenêtre réglable, 15 min par défaut) ;
  3. option : motifs **rapides** (paiement, récupération) ;
  4. ordre d'arrivée.
- **Appels** : 3 appels sans réponse (réglable), délai entre deux appels (60 s par défaut) → **absent** (jamais supprimé ; l'accueil peut le rappeler).
- **Attente estimée** : moyenne réelle (prise du ticket → appel) des N derniers tickets du motif (20 par défaut). Moins de 3 tickets (réglable) → « — ».
- **Écran de salle** : langues alternées ou côte à côte, thème sombre / clair, plaque masquée (désactivée par défaut).
- **À traiter** : client en attente depuis plus de N minutes (20 par défaut).
- **Imprimante** : adresse IP + port. Vide = pas d'impression.

## 6. SMS au client

- Seulement si le client a tapé son numéro **et coché le consentement** à la borne (ou si l'accueil coche le consentement sur un ticket manuel).
- « C'est votre tour : A-12, Guichet 1 » à l'appel ; « Encore N personnes avant vous » quand il reste N personnes ou moins (réglable, 2 par défaut), avec le lien de suivi du ticket `/accueil/t/…` (sans donnée personnelle).
- Canaux existants : SMS Twilio et/ou e-mail **s'ils sont configurés** dans le `.env`. Sans canal, le message est noté « non envoyé » avec la raison dans *Rappels clients*. Hors ligne : le message reste en file et est réessayé par la tâche des rappels. Avec un hub, seul le PC du garage envoie.

## 7. Vie privée de l'écran public

L'écran de salle et la page de suivi n'affichent que : numéro du ticket, motif court, guichet, temps d'attente estimé, et (option) la plaque masquée. Jamais le nom, le téléphone, l'e-mail ni la plaque entière.
