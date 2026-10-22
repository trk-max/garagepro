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
