# Contrats (V9.0) — qui voit quoi, déroulement, références juridiques, limites

Tunisie uniquement. Le logiciel aide à préparer et suivre des contrats ; il **ne remplace pas un avocat
ou un spécialiste du droit du travail**. Aucun contrat n'est jamais présenté comme « conforme ».

## 1. Qui voit quoi (vérifié côté serveur)

La page *Contrats* (permission `viewContracts`) est ouverte à : administrateur, responsable, réception,
RH, comptable. Ce que chacun y voit dépend ensuite de la **catégorie** du contrat
(`CONTRACT_ACCESS` dans `src/lib/contracts.ts`), contrôlée à nouveau dans chaque fonction serveur,
action, page et route (`/api/contracts/[id]/pdf`, `/api/contracts/[id]/scan`).

| Catégorie | Voir (liste, fiche, PDF, scan) | Créer / modifier le brouillon / faire signer / renouveler | Approuver, résilier, archiver |
| --- | --- | --- | --- |
| Réparation, flotte | Admin, responsable, réception, comptable | Admin, responsable, réception | Admin, responsable |
| Contrat de travail | **Admin, RH** | Admin, RH | Admin, RH |
| Fournisseur / partenaire | Admin, responsable, comptable | Admin, responsable | Admin, responsable |
| Vierge | Admin, responsable, comptable | Admin, responsable | Admin |

- Mécanicien et magasinier : aucun accès aux contrats.
- **Décision : le responsable ne voit pas les contrats de travail** (salaire, n° CIN). Il reste
  responsable de l'équipe (pointage, congés, attestations). Si le garage veut lui donner une lecture
  seule, il suffit d'ajouter `MANAGER` à `CONTRACT_ACCESS.EMPLOYMENT.view`.
- Un contrat d'une catégorie interdite répond comme un contrat inexistant (page 404 ; API 403).
- Marquer un modèle comme **relu par un juriste** : administrateur seulement (`reviewContractTemplates`).
- Alerte avant échéance (*Suivi & retards*, compteur du menu *Contrats*, encadré de la page) :
  seulement pour les catégories que le rôle peut voir. Les RH, qui n'ont pas la page *Suivi & retards*,
  voient les échéances de CDD sur la page *Contrats* et dans le compteur du menu.

### Nouveaux rôles

- **RH** : pointage, équipe et congés, borne, attestations de travail, contrats de travail.
- **Comptable** : finances du tableau de bord, factures clients (lecture), fournisseurs et factures
  fournisseurs (saisie), trésorerie prévisionnelle **en lecture** (nouvelle permission
  `readCashForecast` ; la saisie du solde reste administrateur + responsable), contrats réparation /
  flotte / fournisseurs / vierges en lecture. Pas de paramètres, pas de contrats de travail, pas de
  paiement fournisseur (administrateur), pas de facturation (administrateur).

## 2. Déroulement

```
Brouillon → En validation → (Revue juridique / RH) → Approuvé → En attente de signature
→ Signé (scan déposé) → Actif → Expiré | Résilié → Archivé
```

- **Brouillon** : seul état modifiable (champs, dates, véhicules de flotte, clauses facultatives).
  Les champs obligatoires sont exigés pour passer *En validation*.
- **Revue juridique / RH obligatoire** tant qu'il reste un drapeau : modèle non relu par un juriste
  (toujours le cas au départ), CDD, risque de sous-traitance déguisée, renouvellement. L'approbation
  depuis la revue est enregistrée au nom de la personne (« revue confirmée »).
- **Signature** : PDF imprimé avec le logo, signé et cacheté **à la main** (cadres vides), puis scan
  déposé (PDF, JPEG ou PNG reconnus par leurs premiers octets, 10 Mo maximum). Le statut *Signé* n'est
  atteint **que** par ce dépôt. Un nouveau scan peut remplacer le précédent ; l'ancien reste référencé
  dans l'historique. Fichiers privés, servis après contrôle des droits, jamais d'URL publique.
- **Échéance** : alerte N jours avant la date de fin (réglage *contractAlertDays*, 30 par défaut,
  modifiable par l'administrateur sur la page *Contrats*). *Expiré* seulement après la date de fin.
- **Renouvellement** : jamais automatique. C'est un **nouveau contrat** en brouillon, lié au
  précédent, avec son **fondement écrit** obligatoire ; il repasse par validation et signature.
- **Historique** : chaque création, modification (avant / après des champs changés), changement de
  statut, dépôt de scan, renouvellement → `ContractEvent` (ajout seul, protégé par un déclencheur SQL)
  et une ligne du journal (`audit`) dans la même transaction. Le journal ne recopie pas les valeurs
  (salaire, CIN) : seulement les noms des champs modifiés.

### Contrat de réparation (depuis l'ordre de réparation)

Pré-rempli avec ce qui est réellement enregistré : client, véhicule (immatriculation, VIN, km),
réclamation, lignes pièces / main-d'œuvre en **TTC en dinars**, TVA, timbre, remises (lignes négatives),
total TTC (celui de la facture si elle existe), accord du devis, facture et paiements (acompte / reste),
date prévue (heure promise), garanties de l'ordre (ou réglage de garantie automatique). À compléter :
autorisation de commencer, procédure pour les travaux supplémentaires (texte proposé), remise du véhicule.
Rien n'est inventé : un champ inconnu reste vide (« …… » sur le PDF).

### Contrat de flotte

Uniquement pour un client professionnel (entreprise) et **ses** véhicules. Conditions, remise,
facturation (à chaque intervention / mensuelle), paiement, préavis.

### Contrats de travail

12 modèles : mécanicien, carrossier, électricien auto, technicien diagnostic, magasinier, responsable de
secteur, directeur de garage, employé RH, technicien polyvalent, vendeur, employé showroom, vierge.
Intitulé et missions modifiables ; **salaire, durée du travail, congés, lieu de travail : saisis par le
garage, obligatoires, jamais proposés** (aucun SMIG, horaire ou nombre de jours n'est inventé).
Règles appliquées (`employmentErrors`) : CDI par défaut et **sans date de fin** ; CDD refusé sans l'un des
3 motifs, sans date de fin ou avec période d'essai ; salarié remplacé obligatoire pour un remplacement ;
essai de 6 mois au plus, renouvelable une fois (CDI).

### Fournisseurs et partenaires

Pièces, batteries / recharge (fourniture) ; garage spécialisé, carrosserie / peinture, prestataire,
autre (prestation). Pour les prestations, 4 questions (subordination, activité principale, expertise
spécialisée, personne seule à plein temps) : une seule réponse dans le mauvais sens affiche
l'avertissement « sous-traitance de main-d'œuvre déguisée » et impose la revue.

## 3. Références juridiques (vérifiées le 21/10/2026)

| Référence | Utilisation | Fiabilité |
| --- | --- | --- |
| Loi 2025-9 du 21/05/2025 (JORT n° 61), C. trav. art. 6-2 | CDI par défaut | officiel |
| C. trav. art. 6-3 | Essai 6 mois max., renouvelable une fois ; fin écrite 15 j avant | officiel |
| C. trav. art. 6-4 | CDD : 3 motifs, écrit, pas d'essai | officiel |
| C. trav. art. 17 | Travail poursuivi après le terme ⇒ CDI (alerte, pas de renouvellement automatique) | officiel |
| C. trav. art. 28-30 | Sous-traitance de main-d'œuvre interdite | officiel |
| Loi 2015-36, art. 29 | Prix TTC en dinars, facture | officiel |
| Loi 92-117, art. 17-18 | Clause excluant la garantie nulle | officiel (texte partiellement illisible) |
| Loi 2000-83 | Signature électronique : prestataire agréé ANCE → signature manuscrite seulement | officiel |
| Loi organique 2004-63 | Données personnelles (déclaration INPDP par le garage) | source secondaire |

Chaque modèle enregistre : catégorie, version, juridiction « TN », ses références, la date de
vérification, les champs obligatoires / facultatifs, les clauses obligatoires / facultatives et l'état
de revue. Tant qu'il n'est pas relu, le PDF affiche en tête et en pied de page
« **Modèle à valider par un juriste — références : …** » et la liste des points non vérifiés.

## 4. À faire valider par un juriste tunisien

- Convention collective applicable aux garages (aucune trouvée) ; décrets d'application de la loi 2025-9 ;
  art. 234 ter (sanctions).
- Texte officiel de la loi organique 2004-63 ; déclaration INPDP du garage (fichier du personnel, clients).
- Loi 92-117, art. 16-18, en version propre.
- Devis obligatoire avant travaux (aucune règle générale trouvée).
- Application des art. 28-30 à chaque prestataire précis.
- Le texte de chaque modèle (clauses en français), avant de le marquer « relu ».

## 5. Limites connues

- Documents en **français** uniquement (le PDF utilise les polices standard : pas d'arabe dans le PDF).
  L'interface est en FR / EN / AR.
- Le PDF du brouillon reflète les données au moment de la dernière modification du brouillon ; après la
  sortie du brouillon, la photographie (client, véhicule, lignes, garage) n'est plus mise à jour.
- Pas de contrat de vente de véhicule ici (le showroom est un autre module) ; un tel contrat ne suffirait
  jamais pour la mutation ATTT.
- Les scans sont stockés comme les photos d'atelier (dossier `storage/` ou Supabase Storage). En mode
  garage (hub), le module de synchronisation des fichiers ne copie que les photos / vidéos des ordres :
  un scan déposé sur le PC du garage reste sur ce PC (la ligne du contrat, elle, est synchronisée).
- Pas d'envoi automatique d'e-mail à l'échéance : alerte dans l'application seulement.
- La catégorie *vierge* n'impose aucune partie : à utiliser avec prudence.
- Numérotation `CTR-AAAA-0001` : comme les factures, créée seulement sur le PC du garage quand le hub
  est actif.
