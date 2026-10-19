# GaragePro V7 — Prompt 1/5 « Gestion complète du garage » — rapport

Date : 20/10/2026. Base de départ : V6.0 (Next.js 15, Prisma 6, PostgreSQL / Supabase, hub hors ligne).

## 1. Ce qui est terminé et vérifié

| Fonction | Où | Vérifié par |
|---|---|---|
| Rôle « Responsable » (MANAGER) + nouvelles permissions côté serveur | `lib/permissions.ts` | tests DB (refus mécanicien, refus auto-validation) |
| Pointage arrivée / pause / départ avec code de borne (30 s, usage unique par personne) | `/garage/pointage`, `/garage/pointage/borne`, `server/timeclock.ts` | tests DB + parcours navigateur réel (code lu sur la borne, saisi sur téléphone) |
| Option « réseau du garage » (hub local ou IP publique autorisée) | Paramètres → Pointage | test DB (IP refusée / IP autorisée / serveur du garage) |
| Anti-fraude : rejeu du code refusé, séquence logique imposée, 8 codes faux = blocage 10 min | `server/timeclock.ts` | tests DB |
| Corrections de pointage avec motif, ligne d'origine conservée (annulée), jamais par l'intéressé | `/garage/equipe/[id]` | tests DB |
| Congés / absences / autorisations : demande, acceptation / refus, annulation, chevauchements refusés, historique | `/garage/pointage`, `/garage/equipe` | tests DB (dont l'historique d'audit exact) |
| Calendrier jour / semaine / mois / année, confidentialité du motif | `/garage/calendrier` | test DB (visibilité) + captures |
| Rapport employé : présence, pauses, temps par réparation, jours incomplets, congés ; CSV + impression | `/garage/equipe/[id]`, `/api/team/[id]/report` | tests DB + CSV téléchargé dans le navigateur (27,15 h sur 3 jours de 9 h 03) |
| Attestation de travail PDF numérotée et archivée, refus si information manquante | `server/certificates.ts`, `server/certificate-pdf.ts` | test DB (refus puis PDF valide `%PDF-`) |
| Temps par mécanicien (chrono), plusieurs mécaniciens, heures-personnes ≠ durée ≠ heures facturées | ordre + Atelier mobile | tests unitaires et DB (2 × 2 h = 4 h-personnes, 2 h proposées, 0 h facturée automatiquement) |
| Statut « Attente assurance », pièces manquantes, page des retards | ordre, `/garage/suivi` | tests DB + captures |
| Contrôle qualité obligatoire, « Prêt » bloqué côté serveur, validation annulée si un point change | ordre, `server/quality.ts` | tests DB + parcours navigateur (cocher, enregistrer, valider) ; le test échoue si on retire le blocage |
| Portail entreprise isolé (`/entreprise`) | `server/company-portal.ts` | tests DB (accès à l'ordre d'une autre entreprise → rien ; « Consultation » sans montants ; compte désactivé ; limite de connexions) + navigateur (404 sur l'ordre d'un autre client, 401 sur les données du personnel) ; le test échoue si on retire le filtre |
| Journal d'audit non modifiable, secrets masqués | `server/audit.ts`, trigger SQL | test DB (UPDATE et DELETE refusés par la base) |
| Synchronisation hub des nouvelles tables | migration 4 + `npm run db:cloud` | test hub sur 2 bases réelles |

## 2. Tests réellement exécutés (20/10/2026)

- `npm run check` (TypeScript + ESLint + Vitest) : **210 tests réussis**, 7 ignorés (ceux qui ont besoin d'une base).
- `npm run test:db` (nouveau, PostgreSQL 16 réel, vraies requêtes Prisma) : **16 / 16 réussis**.
- `npm run test:hub` (2 bases PostgreSQL réelles) : **8 / 8 réussis** (dont la synchronisation des tables V7).
- Vérification des migrations : base construite avec `prisma/migrations` (appliquées deux fois) comparée à une base construite directement depuis `schema.prisma` par le moteur de Prisma : **structure identique**.
- `npm run db:cloud` lancé deux fois sur une base de test : OK, sans erreur la 2e fois.
- `next build` : réussi.
- Parcours dans un vrai navigateur (Chromium) sur l'application lancée contre PostgreSQL : responsable, mécanicien sur téléphone, administrateur, compte entreprise ; captures PC, téléphone, arabe.
- Contrôle des tests : en supprimant volontairement le blocage « Prêt » et le filtre du portail entreprise, les tests correspondants échouent.

Non testé ici : Supabase réel, Windows réel, impression physique.

## 3. Limites connues (honnêtes)

- **Preuve de présence** : le code de borne prouve qu'on voit l'écran du garage à ce moment-là ; quelqu'un sur place pourrait le dicter à distance en moins de 30–60 s. Pour l'éviter, activer « Code de la borne ET réseau du garage ». Le Wi-Fi seul n'est jamais considéré comme suffisant.
- Le code est dérivé de `AUTH_SECRET` : le PC du garage et Vercel doivent avoir la **même** valeur (c'est le cas si le `.env` a été copié).
- Les rapports s'exportent en **CSV** (s'ouvre dans Excel) et en PDF par l'impression du navigateur ; pas de fichier `.xlsx` natif. L'attestation est un vrai PDF.
- Pas de calcul de **soldes de congés** : aucune règle légale n'a été inventée ; le rapport donne les jours pris.
- L'alerte assurance est fixée à 3 jours (seuils configurables prévus au Prompt 2).
- Le journal couvre les nouvelles fonctions et les changements de statut ; les factures, paiements et stock seront ajoutés au journal au Prompt 2.
- Portail entreprise : consultation seulement (l'accord de devis reste dans le suivi client existant) ; mot de passe oublié → le garage en donne un nouveau.

## 4. Fichiers principaux

Migration : `prisma/migrations/4_team_quality/migration.sql` (ajouts uniquement).
Serveur : `audit.ts`, `timeclock.ts`, `leaves.ts`, `labor.ts`, `quality.ts`, `follow-up.ts`, `certificates.ts`, `certificate-pdf.ts`, `team-reports.ts`, `calendar.ts`, `company-portal.ts`, `company-session.ts`.
Logique pure : `lib/timeclock.ts`, `lib/attendance.ts`, `lib/labor.ts`, `lib/leaves.ts`, `lib/certificate.ts`, `lib/periods.ts`.
Pages : `/garage/pointage`, `/garage/pointage/borne`, `/garage/equipe`, `/garage/equipe/[id]`, `/garage/calendrier`, `/garage/suivi`, `/garage/journal`, `/entreprise/*`.
Tests : `tests/team-pure.test.ts`, `tests/team.db.test.ts`, `tests/hub-sync.test.ts`.
