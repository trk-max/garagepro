# Carte des compétences de l'équipe (V14) — guide

## 1. Catalogue (Équipe › Compétences › Réglages des compétences)

- **Créer le catalogue de départ** ajoute 10 compétences courantes : vidange / entretien, freins, distribution, embrayage / boîte, diagnostic électronique, climatisation, hybride / électrique (haute tension), carrosserie, pneus / géométrie, injection. Ensuite, adaptez-les.
- Pour chaque compétence, vous réglez :
  - le nom (français, arabe, anglais) et une description ;
  - les **mots-clés** des opérations : mot entier, accents ignorés, cherchés dans les lignes de l'ordre et dans la demande du client ;
  - les **forfaits** qui la demandent ;
  - **Supervision obligatoire si non autonome** : un SUPERVISÉ affecté sans superviseur AUTONOME donne un avertissement ;
  - **Habilitation exigée** (ex. haute tension) : l'affectation est **refusée** sans certificat valide lié à cette compétence ;
  - le **libellé public** (fr / ar / en), ex. « technicien certifié climatisation ».
- Règles du garage :
  - délai de rappel avant l'expiration d'un certificat (30 jours par défaut) ;
  - « le superviseur valide le point *travaux vérifiés* du contrôle qualité » ;
  - « afficher les libellés publics sur le suivi client » (désactivé par défaut).

## 2. Niveaux

| Niveau | Pastille | Sens |
|---|---|---|
| AUTONOME | 🟢 A | travaille seul, peut superviser |
| SUPERVISÉ | 🟡 S | travaille avec un superviseur AUTONOME |
| EN FORMATION | 🔴 F | assistant seulement |
| NON CONCERNÉ | — | la compétence ne le concerne pas |

- Un niveau est **toujours décidé par un responsable ou un administrateur**, avec un **motif** obligatoire.
- Chaque changement est gardé dans l'historique (qui, quand, ancien → nouveau, motif) et dans le journal. L'historique ne peut être ni modifié ni effacé : la base le refuse.
- Personne ne change ses propres niveaux, sauf l'administrateur. Le mécanicien n'a pas la permission.
- Les statistiques ne changent **jamais** un niveau.

## 3. Certificats et habilitations

- Fiche de l'employé › *Ajouter un certificat* :
  - type, organisme, dates d'obtention et d'expiration, compétence liée ;
  - fichier PDF, JPEG ou PNG (10 Mo max.), gardé dans le stockage privé et synchronisé par le hub comme les photos.
- Un certificat proche de l'expiration (selon le délai réglé) ou expiré apparaît :
  - dans « À traiter » ;
  - dans la matrice (*Certificats à renouveler*) ;
  - sur le bloc *Manques de compétences* du tableau de bord.
- Un certificat expiré, sans certificat valide qui le remplace, met la compétence **« à vérifier »**. C'est seulement un indicateur : le niveau ne change pas.
- Un certificat erroné est annulé avec un motif. Il n'est jamais effacé.

## 4. Affectation assistée (page de l'ordre, atelier mobile)

- **Compétences requises** : elles sont déduites des forfaits appliqués et des mots-clés. Vous pouvez les modifier sur l'ordre (*Modifier les compétences requises* / *Revenir à la déduction*).
- **Liste des mécaniciens**, triée par :
  1. niveau ;
  2. congé ;
  3. présence aujourd'hui (pointage) ;
  4. charge (ordres en cours, chrono qui tourne).
- **Suggestion** : un AUTONOME libre ; sinon un SUPERVISÉ avec un superviseur AUTONOME. EN FORMATION = assistant seulement, jamais suggéré.
- **Seul blocage (contrôlé par le serveur)** : une compétence « habilitation exigée » et un mécanicien sans certificat valide.
  - Un responsable peut **déroger** en écrivant un motif. La dérogation est journalisée (`skills.override`) et reste visible sur l'ordre.
  - Le sélecteur simple de mécanicien en haut de l'ordre applique la même règle.
- Tous les autres cas (en formation, supervisé sans superviseur, niveau non évalué, en congé) donnent un **avertissement**, jamais un blocage. Il reste dans « À traiter » jusqu'à ce qu'un responsable clique *Vu par le responsable*.
- **Superviseur** : second employé sur l'ordre, avec un badge « Supervisé par … ».
  - Ses heures restent les siennes (chronos V7 : heures-personnes = somme de chacun).
  - Si la règle est activée, seul le superviseur coche « travaux vérifiés » au contrôle qualité.
- **Planning / postes** : ce module n'existe pas encore. L'affectation assistée est sur l'ordre et dans l'atelier mobile.

## 5. Objectifs, indices, réévaluations

- **Objectifs** : par exemple « 5 embrayages supervisés sans retour ».
  - C'est un SUIVI : quand l'objectif est atteint, une demande « à réévaluer » arrive au responsable (« À traiter »).
  - Le niveau ne change jamais tout seul.
- **Indices** (lecture seule, période 90 jours / 12 mois / tout), calculés sur les ordres livrés où l'employé est affecté ou a un chrono :
  - nombre de travaux par compétence ;
  - heures ;
  - retours sous garantie liés (réclamations sur les garanties de l'ordre) ;
  - travaux supervisés.
- **Réévaluation** : l'employé envoie une demande depuis *Mes compétences*. Le responsable la marque traitée et change le niveau s'il le décide, toujours avec un motif.

## 6. Qui voit quoi

| Permission (écran Accès) | Rôles par défaut |
|---|---|
| `viewSkills` — voir toute l'équipe | Administrateur, Responsable, RH |
| `manageSkills` — niveaux, certificats, objectifs, catalogue | Administrateur, Responsable |
| `overrideSkillBlock` — déroger à l'habilitation | Administrateur, Responsable |

- Chaque employé voit **ses** compétences en lecture seule (*Mes compétences*), jamais celles d'un collègue. Le serveur répond 404 / 403, fichiers de certificats compris.
- **Le client** voit seulement le libellé public choisi par le garage, et seulement si le réglage est activé, que le mécanicien de l'ordre est AUTONOME (pas « à vérifier ») ou certifié, et que l'ordre n'est pas supervisé.
  - Le client ne voit jamais un niveau.
  - Le nom d'un apprenti (ordre supervisé, mécanicien SUPERVISÉ ou EN FORMATION) est remplacé par « L'équipe de l'atelier ».
