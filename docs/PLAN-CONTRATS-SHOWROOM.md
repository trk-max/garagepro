# Prompt 5/5 — Contrats, showroom, messagerie : audit et plan (2026-10-21)

Rien n'est encore construit. Ce document dit ce qui existe, ce qui manque, les règles tunisiennes
vérifiées, et le plan proposé. Il sera mis à jour à chaque étape.

## 1. Audit du dépôt (réel)

- **Pile** : Next.js 15 (App Router, actions serveur), Prisma 6, PostgreSQL (Supabase en ligne + base
  locale du hub synchronisée toutes les 30 s), Auth.js v5 (équipe), comptes entreprise séparés
  (`CompanyUser`), Tailwind v4, vitest (unitaires + base réelle), FR / EN / AR.
- **Schéma** : 1 434 lignes, 16 migrations (dont 14 garanties/trésorerie, 15 logo des documents).
- **Rôles de l'équipe** (`enum Role`) : ADMIN, MANAGER, RECEPTION, MECHANIC, STOREKEEPER.
  Comptes entreprise (`CompanyRole`) : FLEET_ADMIN, MANAGER, VIEWER. Droits fins : `src/lib/permissions.ts`.
- **À réutiliser** (aucun doublon à créer) : `Customer`, `Vehicle`, `User` (déjà `jobTitle`, `hireDate`,
  `nationalId`, `contractType` texte), `Supplier`, `WorkOrder` + lignes + devis validé en ligne,
  `Invoice`, garanties, attestations (`WorkCertificate`), journal (`audit`), logo et pied de page des
  documents (V8.5), PDF serveur (`pdf-lib`), rappels/alertes, rafraîchissement en direct (`LiveRefresh`).
- **Absent** : contrats, showroom / annonces, messagerie, comptes « client particulier », rôles RH,
  comptable, vendeur, responsable showroom, accès fournisseur.

## 2. Règles tunisiennes vérifiées (recherche du 21/10/2026)

| Sujet | Référence | Ce que l'application en fera | Fiabilité |
| --- | --- | --- | --- |
| CDI par défaut | Loi 2025-9 du 21/05/2025 (JORT n° 61 du 23/05/2025), C. trav. art. 6-2 | Le modèle d'emploi est **CDI** par défaut | officiel |
| Période d'essai | art. 6-3 : 6 mois max., renouvelable une fois ; fin par écrit 15 j avant | Champ limité à 6 mois, 1 renouvellement | officiel |
| CDD | art. 6-4 : seulement surcroît anormal de travail, remplacement temporaire d'un permanent, travail saisonnier / usage ; écrit obligatoire, sinon CDI ; pas d'essai en CDD | CDD **bloqué** sans motif choisi parmi ces 3 cas ; pas de période d'essai ; mention « à valider RH/juriste » | officiel |
| Fin de CDD | art. 17 : poursuite du travail après le terme ⇒ CDI | Alerte avant échéance ; jamais de renouvellement automatique | officiel |
| Sous-traitance de main-d'œuvre | art. 28-30 (interdite ; contrat de prestation seulement si expertise spécialisée, hors activité principale, sans subordination) | Avertissement sur les contrats « prestataire / garage spécialisé » qui ressembleraient à de l'emploi | officiel |
| Prix des services | Loi 2015-36, art. 29 (affichage TTC en dinars, facture sur demande) | Contrat de réparation : prix TTC détaillés | officiel |
| Garantie | Loi 92-117 art. 17-18 (clause d'exclusion nulle ; règles du COC) | Pas de clause excluant la garantie | officiel (texte partiellement illisible) |
| Signature électronique | Loi 2000-83 (certificat d'un prestataire agréé ANCE) | **Aucune** « signature électronique » : impression + signature manuscrite, scan archivé | officiel |
| Données personnelles | Loi organique 2004-63 (déclaration INPDP) | Accès restreints (RH) ; à déclarer par le garage | source secondaire |
| Certificat de travail | C. trav. art. 27 (dates d'entrée/sortie, emplois occupés) | Déjà couvert par les attestations | officiel (édition 2010) |
| Vente de véhicule | ATTT : demande, carte grise, justificatif de cession, visite technique < 1 mois, impôts, vignette | Contrat de vente = pièce justificative seulement ; jamais présenté comme suffisant pour la mutation | officiel (ATTT) |

**Non vérifié — à faire valider par un juriste tunisien** : convention collective applicable aux garages
(aucune trouvée), texte officiel de la loi 2004-63, articles 16-18 de la loi 92-117 en version propre,
art. 234 ter (sanctions), délai de 15 jours et légalisation pour la vente, décrets d'application de la loi
2025-9, devis obligatoire (aucune règle générale trouvée). Chaque modèle affichera ses références, sa date
de vérification et l'état « à valider par un juriste » tant qu'un professionnel ne l'a pas validé.

## 3. Plan proposé (une étape = un commit, base préservée, migrations additives)

1. **Contrats — socle** : modèles versionnés (catégorie, juridiction Tunisie, références, date de vérification,
   champs obligatoires/facultatifs, état de revue), contrats (numéro, dates, durée, calcul d'échéance,
   statuts brouillon → validation → revue RH/juridique → approbation → signature → actif/expiré/résilié/archivé),
   historique et versions, PDF avec logo, alertes avant échéance, aucun renouvellement automatique.
2. **Contrat de réparation** depuis l'ordre de réparation (client, véhicule, VIN, km, défauts, devis détaillé,
   accord avant travaux, travaux supplémentaires, acompte, solde, date prévue, garantie, remise du véhicule).
   Contrat flotte / entreprise (plusieurs véhicules, conditions, facturation).
3. **Contrats d'emploi** (CDI par défaut, règles ci-dessus) pour les métiers demandés, réservés RH/Admin ;
   **contrats fournisseurs / partenaires** ; modèle vierge.
4. **Showroom** : annonces (photos, fiche technique, équipements, prix, état, couleurs, documents), statuts,
   historique (prix, km, statut), distinction « vérifié par le garage » / « déclaré par le vendeur »,
   recherche/filtres, pages publiques.
5. **Messagerie** liée à un véhicule (et aux ordres de réparation), non-lus, notifications, mises à jour en
   direct par le mécanisme existant (sondage court), cloisonnement strict.
6. **Rôles** : ajout de RH, COMPTABLE, VENDEUR, RESPONSABLE_SHOWROOM ; carrossier, électricien, diagnosticien
   restent des **métiers** (rôle Mécanicien + intitulé), pas de nouveaux droits inutiles.
7. Tests (dates d'échéance, CDD bloqué, droits RH, cloisonnement des conversations, migrations), build,
   rapport final.

## 4. Remarques

- Les « quatre captures d'écran » de référence du showroom ne sont pas jointes à la demande : il faudra
  les envoyer avant l'étape 4.
- Le logiciel aide à respecter la loi mais ne remplace pas un avocat ou un spécialiste du droit du travail.
