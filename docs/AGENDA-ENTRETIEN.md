# Agenda des prochaines réparations — guide

L'agenda prévoit, pour chaque voiture, les prochains entretiens (vidange, plaquettes, courroie…).
Chaque date est une **estimation**. L'écran indique toujours sur quoi elle repose. **Aucun message ne part chez le client sans votre validation.**

## 1. Régler le catalogue (administrateur ou responsable)

*Agenda* › **Réglages de l'agenda**.

1. **Créer le catalogue de départ** ajoute les éléments courants avec leurs mots-clés (vidange, filtres, plaquettes AV/AR, disques, courroie, batterie, pneus, liquide de frein, bougies, amortisseurs, climatisation). Les **intervalles restent vides**.
2. Ouvrez chaque élément et réglez-le :
   - **Mots-clés** : ce qui est cherché dans les lignes de vos ordres (ex. « plaquettes av »). Les majuscules et les accents ne comptent pas, mais le mot doit être entier : « pneu » ne reconnaît pas « pneus ».
   - **Pièces liées** et **forfaits liés** : une pièce ou un forfait de l'ordre suffit à reconnaître l'élément. Le forfait lié sert aussi au **prix indicatif** et à l'ajout au devis en un clic.
   - **Intervalle de référence (km / mois)** : à saisir **par vous**. Vide = pas de référence. L'exemple affiché en orange (« exemple courant — à vérifier par le garage ») n'est jamais utilisé tel quel.
3. **Seuils et messages** :
   - **N** = nombre minimum de cas pour se fier à l'historique (5 par défaut).
   - Nombre de cas pour une confiance « bonne » (10 par défaut).
   - Délai d'avance des messages (30 jours par défaut).
   - Modèles de message en français et en arabe.
   - **Envoi automatique** : désactivé par défaut, seul un administrateur peut l'activer.

## 2. Lire une prévision

Pour chaque voiture et chaque élément, l'agenda cherche dans cet ordre :

1. **Historique du garage** : intervalles réellement observés entre deux remplacements sur le **même modèle** (et la même motorisation / année si possible). On prend la **médiane** et la fourchette **Q1 – Q3**, à condition d'avoir au moins N cas.
2. **Intervalle de référence** que vous avez saisi.
3. Sinon : **estimation impossible**, avec ce qui manque (dernier remplacement, kilométrage, rythme, intervalle).

- **Échéance en km** = km du dernier remplacement + intervalle. Elle est convertie en date grâce au **rythme de conduite**, calculé sur les relevés réels (kilométrage à l'entrée des ordres, OBD lu sur la voiture). Il faut au moins 2 relevés espacés de 30 jours. Les relevés simulés et les kilométrages plus bas qu'un relevé précédent sont ignorés.
- **Échéance en mois** = date du dernier remplacement + intervalle. La plus proche des deux est retenue, et les deux sont affichées dans « Détail du calcul ».
- **Confiance** :
  - *bonne* : au moins 10 cas, peu dispersés ;
  - *moyenne* : historique avec au moins N cas, ou référence avec date et km du dernier remplacement connus ;
  - *faible* : sinon.
- **Prix indicatif** = votre forfait lié, sinon le dernier prix facturé pour cet élément. Jamais inventé.
- **Garantie** : « sous garantie jusqu'au … » si une garantie en cours couvre l'élément.
- **Signaux du garage** : un élément souvent remplacé autour d'un même kilométrage sur un modèle, avec le nombre de cas. C'est un point **à surveiller**, pas une panne certaine.

Exemple : la Peugeot 208 de Sami a eu ses plaquettes AV changées à 60 000 km. Huit autres 208 du garage montrent un intervalle médian de 30 400 km (Q1 29 700 – Q3 31 100). L'échéance est donc vers 90 400 km (89 700 – 91 100). À 1 522 km/mois depuis son dernier relevé (74 000 km), cela donne environ janvier 2027. Confiance moyenne : 8 cas, moins de 10.

## 3. Corriger les remplacements connus

Les remplacements sont détectés automatiquement à la **livraison** d'un ordre. Les ordres annulés ou en cours sont ignorés.

Sur la fiche véhicule (*Prochaines réparations*), vous pouvez :
- **Corriger** la date ou le kilométrage. La valeur détectée reste visible et la correction est inscrite au journal.
- **Annuler** une détection fausse, avec un motif.
- **Déclarer un remplacement** fait ailleurs ou avant GaragePro.

## 4. Valider et envoyer

Dans l'*Agenda* (filtres : période, élément, confiance, client, entreprise, statut) :

1. Cochez les lignes, puis **Valider** (réception, responsable, administrateur ; le mécanicien voit en lecture seule).
2. **Préparer le message** : relisez chaque texte, choisissez le français ou l'arabe.
3. **Envoyer les messages validés** : SMS et/ou e-mail selon ce qui est configuré. Il n'y a aucun envoi si le client refuse les rappels, et un seul message par élément jusqu'au prochain remplacement. L'historique est dans *Rappels clients*.
4. Les prévisions validées partent aussi toutes seules par la tâche quotidienne quand l'échéance arrive dans le délai d'avance.

Une prévision n'est **jamais réécrite**. Si les données changent, une nouvelle version la remplace et l'ancienne reste dans l'historique.

Le cycle d'une prévision :
- Le client prend RDV en ligne avec le motif pré-rempli : la prévision passe à « RDV pris ».
- L'ordre est livré : nouveau remplacement, la prévision passe à « faite ».
- La suivante est proposée.

**Ignorer** demande un motif ; une prévision ignorée peut être validée à nouveau plus tard.

## 5. À l'atelier, pour le client, pour les entreprises

- **Ordre de réparation** : « À faire aussi sur cette voiture » liste les prévisions proches. **Ajouter au devis** ajoute le forfait (ou la pièce) liés, et le client valide le devis comme d'habitude. La réservation et la demande d'achat de pièces restent manuelles.
- **À traiter** et **tableau de bord** : échéances des 30 jours, pièces à commander à l'avance. Ce ne sont que des suggestions : rien n'est commandé automatiquement.
- **Suivi client** (`/suivi`) et **QR du véhicule** : « Prochains entretiens » en langage simple, marqués « estimation », avec un bouton **Prendre RDV**. Pas de montant sur la carte QR publique, et un QR révoqué ne montre rien.
- **Portail entreprise** : planning de toute la flotte par mois, export Excel / CSV. Les montants sont visibles seulement des rôles qui voient déjà les factures.
