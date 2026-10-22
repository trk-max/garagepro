# RAPPORT V14 — Carte des compétences de l'équipe

## 0. Plan (écrit avant de coder)

**Branche** : `feat/v14-competences` (depuis `main` 95458c6). **Migration** : `23_competences` (additive, gardée, re-jouable).

**Ce qui est RÉUTILISÉ (rien n'est dupliqué)**
- Équipe : `User` (poste, embauche, rôle), fiche employé `/garage/equipe/[id]`, permissions + accès sur mesure V10.3 (`UserPermission`, `can()`).
- Présence : pointage `ClockEvent` (dernier pointage = présent / pause / parti, comme `teamPresence`), congés `LeaveRequest` APPROVED couvrant l'instant.
- Ordres : `WorkOrder.mechanicId` (affectation existante, `assignMechanic`), lignes, forfaits appliqués (événement `PACKAGE_APPLIED` avec `packageId`), chronos V7 `LaborEntry` (heures-personnes inchangées), contrôle qualité `QualityCheck.workVerified`, garanties `Warranty` / `WarrantyClaim` (retours).
- Médias privés : `putObject` / `readObject` (`src/server/storage.ts`), détection du type par les premiers octets (même règle que le scan des contrats V9), synchro des fichiers par le hub (`scripts/hub/media-sync.mjs`).
- « À traiter » (`src/lib/todo.ts`, `src/server/todo.ts`), tableau de bord personnalisé (`src/lib/dashboard-layout.ts`), journal d'audit `audit(tx, …)`, hub (triggers `_sync_log_trg`), menu (`src/components/shell/nav.ts`).
- Attestations de travail (`WorkCertificate`) et contrats de travail V9 : ce sont des documents RH différents (attestation d'emploi, contrat) ; aucun champ « habilitation / certificat technique » n'y existe → nouvelle table `SkillCertificate`, sans toucher aux attestations.

**Nouveaux fichiers**
- `prisma/migrations/23_competences/migration.sql` : `Skill`, `EmployeeSkill`, `SkillLevelHistory` (append-only, trigger), `SkillCertificate`, `SkillGoal`, `SkillReviewRequest` ; colonnes `WorkOrder.supervisorId`, `skillIds`, `skillWarnings*`, `skillOverride*` ; réglages `Setting.skillCertReminderDays`, `skillSupervisorVerifies`, `skillPublicLabels`.
- `src/lib/skills.ts` (pur : déduction des compétences, tri des suggestions, avertissements / blocage, état des certificats, objectifs, indices, manques, CSV).
- `src/server/skills.ts`, `src/actions/skills.ts`, routes `src/app/api/skills/…` (fichier de certificat, export CSV).
- Écrans : `/garage/competences` (matrice), `/garage/competences/[id]` (fiche), `/garage/competences/moi`, `/garage/competences/reglages` ; carte « Affectation assistée » sur l'ordre et l'atelier mobile ; badge « supervisé par ».
- i18n `src/lib/i18n/v14-{fr,en,ar}.ts`. Tests `tests/skills.test.ts`, `tests/skills.db.test.ts`, hub.

**Planning / postes** : le module n'existe pas (prévu en V13) → non fait ici, l'affectation assistée est sur l'ordre et l'atelier mobile.

**Risques** : affectation existante (sélecteur de l'ordre) maintenant soumise à la règle « habilitation » (seul blocage) ; déduction par mot-clé trop large (modifiable sur l'ordre) ; données RH sensibles (contrôle d'accès côté serveur sur chaque lecture).

---

## 1. État — terminé / partiel / non fait

| Point du brief | État |
|---|---|
| Catalogue configurable fr/ar/en (description, forfaits, mots-clés, supervision obligatoire, habilitation exigée, libellés publics) | **Terminé** (`/garage/competences/reglages`, catalogue de départ de 10 compétences, rien d'automatique) |
| Niveaux AUTONOME / SUPERVISÉ / EN FORMATION / NON CONCERNÉ + historique (qui, quand, ancien → nouveau, motif) jamais réécrit | **Terminé** (motif obligatoire ; historique protégé par un trigger SQL « append-only » ; journal `skills.level`) |
| Certificats / habilitations : type, organisme, dates, fichier PDF / photo privé, rappel réglable, expiré → « à vérifier » | **Terminé** (stockage privé + synchro hub des fichiers ; rappel = « À traiter » + matrice + tableau de bord ; aucun SMS / e-mail à l'employé) |
| Indices en lecture seule (travaux, heures, retours garantie liés, supervisés, période) | **Terminé** (fiche employé, période 90 j / 12 mois / tout) |
| Affectation assistée : compétences déduites (modifiables), tri niveau / présence / charge / congé, suggestion, superviseur proposé, EN FORMATION = assistant | **Terminé** sur la page de l'ordre et l'atelier mobile |
| Affectation depuis le planning | **Non fait** : module planning / postes absent (prévu V13) |
| Blocage serveur seulement pour l'habilitation, dérogation d'un responsable avec motif journalisée ; le reste = avertissements | **Terminé** (le sélecteur simple existant de l'ordre passe aussi par la règle) |
| Superviseur sur l'ordre, heures inchangées, indicateur ordre + contrôle qualité, « travaux vérifiés » par le superviseur si réglé | **Terminé** |
| Objectifs de progression (suivi) → « à réévaluer » au responsable, jamais de passage automatique | **Terminé** (évalués à l'ouverture des pages Compétences et au comptage « À traiter » ; idempotent) |
| Écrans : matrice (pastilles, expirations, manques, filtres, export CSV), fiche employé, « Mes compétences » + demande de réévaluation | **Terminé** |
| Paramètres (catalogue, règles, libellés publics, délai de rappel) | **Terminé** |
| « À traiter » (certificats, réévaluations, avertissements non traités) + bloc tableau de bord « manques de compétences » | **Terminé** |
| Suivi client : libellé public seulement (réglage), sans nom ni niveau | **Terminé** (désactivé par défaut ; le nom d'un apprenti est remplacé par « L'équipe de l'atelier ») |
| Accès sur mesure : nouvelles permissions dans l'écran Accès | **Terminé** (groupe « Équipe ») |
| Hub : nouvelles tables + fichiers de certificats | **Terminé** (triggers `_sync_log_trg`, ids déterministes `sk_<code>` / `es_<hash>`, `media-sync.mjs` inclut `SkillCertificate.fileKey`) |
| Aide intégrée `/garage/aide` | **Non fait** : guide dans `docs/COMPETENCES.md` |

## 2. Fichiers

- **Migration et schéma** :
  - `prisma/migrations/23_competences/migration.sql` ;
  - `prisma/schema.prisma`.
- **Code des compétences** :
  - calcul pur : `src/lib/skills.ts` ;
  - serveur : `src/server/skills.ts` ;
  - actions : `src/actions/skills.ts` ;
  - routes : `src/app/api/skills/certificates/route.ts`, `…/certificates/[id]/route.ts`, `…/matrix/route.ts`.
- **Pages** : `src/app/(garage)/garage/competences/{page, [id]/page, moi/page, reglages/page}.tsx`.
- **Composants** : `src/components/skills/{skills-ui, assign-card, assign-section, certificate-form}.tsx`.
- **i18n** : `src/lib/i18n/v14-{fr,en,ar}.ts`, plus des ajouts dans `fr/en/ar.ts` (erreurs), `v103-*.ts` (permissions, bloc) et `todo-*.ts`.
- **Composants partagés modifiés** (ajouts séparés et commentés « V14 ») :
  - `src/lib/permissions.ts` : 3 permissions, groupe *team* ;
  - `src/components/shell/nav.ts` : clés `skills`, `mySkills` dans le panneau *Plus* ;
  - `src/lib/todo.ts`, `src/server/todo.ts`, `src/components/shell/todo-icons.ts` ;
  - `src/lib/dashboard-layout.ts` : bloc `skillGaps` ; `src/app/(garage)/garage/page.tsx`.
- **Code existant dont le comportement change** :
  - `src/server/work-orders.ts` :
    - `assignMechanic` passe maintenant par `assignWithSkills`, donc le blocage « habilitation » s'applique aussi au sélecteur existant ;
    - superviseur ajouté dans `getWorkOrder` et `workshopOrders`.
  - `src/server/quality.ts` : « travaux vérifiés » coché par le superviseur seulement, si le réglage est activé.
  - `src/server/portal.ts` (`getTrackingView`) :
    - paramètre `lang` ;
    - `skillLabels` et `mechanicAssigned` ajoutés ;
    - nom masqué pour un apprenti ;
    - l'objet `mechanic` (nom complet) n'est plus renvoyé.
  - `src/app/(public)/suivi/vehicule/page.tsx`.
  - `src/components/garage/repair-panels.tsx` : indicateur superviseur sur le contrôle qualité.
  - `src/app/(garage)/garage/{work-orders/[id], atelier, equipe, equipe/[id]}/page.tsx`.
  - `scripts/hub/media-sync.mjs`.
- **Tests** :
  - `tests/skills.test.ts` et `tests/skills.db.test.ts` ;
  - `tests/hub-sync.test.ts` (+1) ;
  - attentes mises à jour pour les nouveaux éléments : `tests/todo.test.ts` (réévaluations dans les validations du responsable / admin) et `tests/dashboard-layout.test.ts` (nouveau bloc).
- **Documentation** : `docs/COMPETENCES.md`, README « Nouveautés V14 », captures `docs/media/v14/`.

## 3. Migration `23_competences`

Additive, gardée (`IF NOT EXISTS`, `duplicate_object`), rejouée deux fois sans erreur. Elle crée :
- **6 tables** : `Skill`, `EmployeeSkill`, `SkillLevelHistory`, `SkillCertificate`, `SkillGoal`, `SkillReviewRequest`. Clés étrangères `RESTRICT` vers `User` / `Skill` (`SET NULL` pour la compétence liée d'un certificat ou d'une demande).
- **Un trigger « append-only »** sur `SkillLevelHistory`, contourné seulement par le hub (`garagepro.sync`), comme `AuditLog`.
- **Sur `WorkOrder`** : `supervisorId` (FK `SET NULL`, index), `skillIds` (null = déduction), `skillWarnings` (JSON `[]`), `skillWarningsAt`, `skillWarningsAckAt`, `skillWarningsAckById`, `skillOverrideReason`, `skillOverrideById`, `skillOverrideAt`.
- **Sur `Setting`** : `skillCertReminderDays` = 30, `skillSupervisorVerifies` = false, `skillPublicLabels` = false.
- **Le bloc « Garage hub » final** (`_sync_log_trg` sur les nouvelles tables).

Aucune ligne n'est insérée.

## 4. Permissions ajoutées (groupe « Équipe » de l'écran Accès, FR/EN/AR)

| Permission | Rôles | Rôle |
|---|---|---|
| `viewSkills` | ADMIN, MANAGER, HR | matrice et fiches de toute l'équipe (chacun voit toujours les siennes) |
| `manageSkills` | ADMIN, MANAGER | niveaux (motif), certificats, objectifs, catalogue, réglages, avertissements vus, réévaluations |
| `overrideSkillBlock` | ADMIN, MANAGER | dérogation à l'habilitation (motif) |

L'affectation reste ouverte à `viewWorkOrders`, comme avant ; seule la dérogation exige `overrideSkillBlock`.

Journal d'audit :
- `skills.level`, `.certificateAdd`, `.certificateVoid` ;
- `.assign`, `.override`, `.orderSkills`, `.warningsAck` ;
- `.goalAdd`, `.goalClose`, `.goalReached` (Système) ;
- `.reviewRequest`, `.reviewDone` ;
- `.catalogueCreate`, `.catalogueUpdate`, `.catalogueStarter`, `.settings`.

## 5. Tests (résultats réels, worktree `feat/v14-competences`)

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests scripts` | 0 problème |
| `npm run check` (tsc + `eslint .` + vitest) | réussi |
| `npx vitest run` | 52 fichiers, **492 réussis**, 9 ignorés (tests hub / base sans variables) ; dont `tests/skills.test.ts` : **15** |
| `TEST_DATABASE_URL=… TEST_DB_NAME=gp_test_v14 npm run test:db` | 26 fichiers, **184 réussis** (3 passages de suite) ; dont `tests/skills.db.test.ts` : **10** |
| `TEST_PG_URL=… npm run test:hub` | **10 réussis** (dont « V14 skills tables travel too ») |
| `node scripts/verify-migrations.mjs …` | 24 migrations, `23_competences` rejouée sans erreur ; structure identique au schéma |
| `npx next build` | réussi |

**Unitaires** :
- déduction (forfait, mot entier sans accents, compétence inactive, choix manuel) ;
- tri (niveau, congé, présence, charge, chrono) et suggestion (AUTONOME libre, sinon SUPERVISÉ + superviseur, jamais EN FORMATION) ;
- blocage habilitation et avertissements ;
- certificats (valide / bientôt / expiré / annulé, « à vérifier ») ;
- objectifs atteints (retours et autres compétences exclus) ;
- indices (retours liés, période) ;
- manques ; CSV.

**Base réelle** :
- changement de niveau journalisé + historique, mise à jour / suppression refusées par la base ;
- mécanicien ne change pas son niveau (et responsable pas le sien) ;
- certificat expiré → « à vérifier », niveau inchangé ;
- haute tension :
  - refusée sans certificat (sélecteur existant et carte assistée) ;
  - acceptée avec dérogation motivée et journalisée ;
  - acceptée avec certificat ;
- avertissements sans blocage ;
- déduction par forfait + choix manuel ;
- A ne voit pas B (fiche, fichier, matrice) ;
- client sans nom ni niveau (apprenti masqué, libellé public seulement) ;
- superviseur + heures-personnes (120 + 30 = 150 min, temps écoulé 120) et règle du contrôle qualité ;
- objectif atteint → demande de réévaluation idempotente, aucun passage automatique.

**Contrôle des tests** : dans `src/server/skills.ts`, retrait volontaire :
- du filtre employé (`canSeeSkillsOf` → toujours vrai) ;
- du blocage « habilitation » (`if (check.blocked.length > 0)` neutralisé).

Résultat : **2 tests échouent** (« high voltage: refused without a valid certificate… » et « employee A does not see B's skills… »), 8 réussissent. Code remis par `git checkout` : 10 / 10 réussis, `git status` propre. Contrôle fait deux fois (avant et après la dernière modification), même résultat.

Correction faite pendant les tests : `tests/dashboard-v10.db.test.ts` (« mechanics … presence ») échouait 1 fois sur 2, parce que `mechanicsNow(…, 50)` ne garde que 50 mécaniciens actifs dans la base de test partagée. Les employés créés par `tests/skills.db.test.ts` sont maintenant désactivés à la fin du fichier ; 3 passages complets à 184 / 184.

## 6. Navigateur

Configuration : Edge sans interface via CDP, `next start -p 3100` sur la base jetable `gp_test_v14_ui`, données de démo.

29 captures dans `docs/media/v14/` (PC 1366 px et téléphone 390 px, FR et AR) :
- `matrice-*`, `fiche-employe-*`, `ordre-affectation-*`, `atelier-mobile-phone-*` ;
- `ordre-hv-refus-pc-fr`, `ordre-hv-affecte-pc-fr` ;
- `certificat-ajoute-*`, `rappel-certificats-pc-fr` ;
- `reglages-pc-fr`, `tableau-de-bord-pc-fr`, `a-traiter-pc-fr` ;
- `employe-moi-phone-*`, `suivi-client-*`, `suivi-apprenti-phone-fr`.

Vérifié en direct :
- affectation haute tension refusée (message), mécanicien non enregistré, puis acceptée pour le technicien certifié ;
- certificat PDF ajouté (fichier servi en 200 `application/pdf`), « expire bientôt », listé dans le rappel ;
- export CSV 200 ;
- le mécanicien est renvoyé de la matrice vers sa fiche, la fiche d'un collègue répond 404 et l'export 403 ; il n'a aucun formulaire de niveau ;
- suivi client : libellé public affiché, aucun niveau ni nom de famille ; apprenti remplacé par « L'équipe de l'atelier ».

## 7. Limites

- Pas de module planning : l'affectation assistée est sur l'ordre et l'atelier mobile seulement.
- Le rappel des certificats est interne (« À traiter », matrice, tableau de bord). Aucun SMS / e-mail n'est envoyé à l'employé.
- **Présence** :
  - « présent » = dernier pointage IN / pause (même règle que l'équipe), au moment de l'affichage ;
  - congé = demande APPROUVÉE couvrant l'instant ;
  - charge = ordres actifs affectés + chrono en cours.
- **Déduction par mots-clés** : une ligne mal nommée n'est pas reconnue, un mot-clé trop large peut se tromper. Elle est corrigeable sur chaque ordre.
- Objectifs évalués à l'ouverture des pages Compétences et lors du comptage « À traiter », pas en tâche planifiée.
- **Libellé public** :
  - affiché seulement si le mécanicien est AUTONOME (pas « à vérifier ») ou certifié, et l'ordre non supervisé ;
  - un libellé arabe / anglais vide reprend le libellé français.
- `media-sync.mjs` lit maintenant `SkillCertificate` : la base locale du hub doit être migrée (le redémarrage du hub le fait).
- Les noms des tests hub (`gp_hub_*`) sont fixes : `npm run test:hub` ne doit pas tourner en même temps dans deux copies.
