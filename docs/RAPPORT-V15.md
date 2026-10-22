# RAPPORT V15 — File d'attente de l'accueil (borne, écran de salle, appel des clients)

## 0. Plan (écrit avant de coder)

**Branche** : `feat/v15-accueil` (depuis `main` 95458c6). **Migration** : `24_accueil` (additive, gardée, rejouable ; ne dépend d'aucune table de la V14 `23_competences`).

**Réutilisé (rien n'est dupliqué)**
- Rendez-vous du jour (`Appointment`, check-in existant `checkInAppointment`), recherche par plaque (`normalizePlate`, `/garage/work-orders/new?plate=…` qui ouvre l'ordre en cours ou la fiche + le formulaire avec kilométrage et état des lieux V10.6), QR véhicule (`QR_TOKEN`, jeton révoqué = pas de véhicule).
- Temps réel : la « SSE » du projet est devenue une interrogation courte (`src/server/live.ts`, `versionResponse`) — même principe pour le poste (`/api/staff/live?topic=reception`) et l'écran (interrogation toutes les 3 s, reconnexion automatique).
- Messages : file `Notification` + `queueItems` / `deliverPending` (SMS Twilio, e-mail), réessais, « seul le hub envoie » ; nouveau type `QUEUE`.
- Pointage (`stateAfter`) pour l'employé présent au guichet ; « À traiter » ; tableau de bord personnalisé ; journal d'audit (`audit(tx, …)`) ; hub (`_sync_log_trg`, pair/impair des numéros) ; table `Sequence` (compteurs) ; logo et fuseau des Paramètres.

**Nouveaux fichiers** : `prisma/migrations/24_accueil`, `src/lib/accueil.ts` (règles pures), `src/server/accueil.ts`, `src/server/accueil-device.ts`, `src/actions/accueil.ts`, pages `/accueil/{activer,borne,ecran,t/[token]}`, `/garage/accueil{,/reglages,/rapports}`, API `/api/accueil/*`, composants `src/components/accueil/*`, i18n `src/lib/i18n/v15-{fr,en,ar}.ts`, son `public/sounds/accueil-appel.wav` (+ `scripts/make-accueil-sound.mjs`), tests `tests/accueil.test.ts`, `tests/accueil.db.test.ts`.

**Risques** : deux guichets sur le même ticket (→ mise à jour conditionnelle) ; numéros en double sous concurrence ou avec le hub (→ compteur atomique + index unique + pair/impair + nouvel essai) ; fuite de données sur l'écran public (→ liste de champs explicite, testée) ; son bloqué par le navigateur de la TV (→ bouton « Activer le son », documenté).

---

## 1. État — terminé / partiel / non fait

| Point du brief | État |
|---|---|
| Ticket : numéro du jour par préfixe de motif, motif (catalogue fr/ar/en), plaque, client/RDV/véhicule liés, horodatages, guichet, employé, statuts, nombre d'appels, priorité | **Terminé** |
| Priorité réglable (RDV à l'heure ± fenêtre, puis arrivée ; option rapides) et affichée sur l'écran et au poste | **Terminé** |
| Numérotation remise à zéro chaque jour, sans collision en concurrence ; hub pair/impair | **Terminé** (compteur `Sequence` atomique `INSERT … ON CONFLICT … RETURNING`, index unique `(day, prefix, number)`, PC du garage = impairs, en ligne = pairs, nouvel essai si un numéro est déjà pris) |
| 3 appels sans réponse (délai réglable) → ABSENT, jamais supprimé, rappel possible | **Terminé**. Les rappels 2 et 3 se font au bouton *Rappeler* (refusé avant le délai) ; après le délai suivant le 3e appel, l'absence est posée automatiquement par le prochain lecteur (écran, poste). |
| Guichets configurables + employé connecté | **Terminé** (+ état de pointage de l'employé) |
| Borne `/accueil/borne` (jeton d'appareil, gros boutons, plaque grand clavier, QR véhicule, RDV reconnu, ticket en grand, SMS + consentement, impression facultative) | **Terminé**. Scan QR par caméra seulement où `BarcodeDetector` existe (Chrome / Edge Android, Windows) ; une douchette QR (clavier) fonctionne partout. |
| Écran `/accueil/ecran` (appels en très grand, file, attente estimée par motif, son, fr+ar alternés / côte à côte, thème, temps réel, reconnexion, heure, logo) | **Terminé** (son : voir limites) |
| Poste `/garage/accueil` (file en direct, Suivant, Appeler, Rappeler, Absent, Transférer, Terminer, check-in / facture, stats du jour) | **Terminé** (+ « Client présent » = EN_COURS, « Passer devant », annulation avec motif, ticket manuel) |
| Client : SMS « c'est votre tour », « encore N personnes » (seuil réglable), lien de suivi sans donnée personnelle | **Terminé** côté logiciel ; **envoi réel non vérifié** (aucun compte Twilio / e-mail dans l'environnement de test : testé avec un faux expéditeur ; en démo, la ligne est « non envoyé : aucun canal configuré »). WhatsApp / push n'existent pas comme canaux d'envoi dans le projet : non ajoutés. |
| Rapports (motif / heure / jour, heures de pointe, taux d'absents, CSV), bloc tableau de bord, « À traiter » | **Terminé** |
| Ticket ↔ RDV ↔ véhicule ↔ ordre créé ; ticket paiement ↔ factures ouvertes | **Terminé** (« Accueillir le RDV » crée l'ordre et le lie ; sans RDV, le lien du check-in ouvre la création d'ordre et l'ordre créé est lié au ticket à *Terminer* ; factures ouvertes avec lien d'encaissement pour paiement / récupération) |
| Hors ligne (hub), SMS en file | **Terminé** (tables synchronisées, test hub) |
| Accès sur mesure + jetons gérés dans Paramètres (créer, nommer, révoquer) | **Terminé** |
| Aide intégrée `/garage/aide` | **Non fait** (guide `docs/ACCUEIL.md`) |

## 2. Migration `24_accueil`

Additive, gardée (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), rejouée sans erreur. 5 tables : `QueueSetting` (1 ligne), `QueueReason` (catalogue), `QueueCounter`, `QueueTicket`, `QueueDevice` (empreinte SHA-256 du jeton seulement). Départ : 5 motifs (A dépôt, B récupération, C devis / question, D paiement, E autre ; fr/ar/en), 1 guichet « Guichet 1 », réglages par défaut. Bloc « Garage hub » final (`_sync_log_trg`). Aucune relation Prisma vers les modèles existants (identifiants indexés) : aucun modèle existant n'est modifié. Statuts en TEXT.

## 3. Permissions ajoutées (groupe « Accueil (file d'attente) », libellés fr/en/ar)

| Permission | Rôles |
|---|---|
| `useReception` — poste d'accueil | ADMIN, MANAGER, RECEPTION |
| `viewReceptionReports` — rapports + CSV | ADMIN, MANAGER |
| `configureReception` — motifs, guichets, priorités, écran, imprimante | ADMIN, MANAGER |
| `manageReceptionDevices` — jetons de la borne / de l'écran | ADMIN |

« Accueillir le RDV » demande en plus `manageAppointments` (règle existante du check-in). Journal d'audit : `queue.ticketCreate`, `queue.consent`, `queue.next`, `queue.call`, `queue.recall`, `queue.recallAbsent`, `queue.absent` (manuel ou automatique), `queue.serve`, `queue.finish`, `queue.transfer`, `queue.cancel` (motif), `queue.priority`, `queue.checkIn`, `queue.counterConnect`, `queue.reasonCreate/Update`, `queue.counterCreate/Update`, `queue.settings`, `queue.deviceCreate/Rename/Revoke`.

## 4. Tests (résultats réels, worktree `feat/v15-accueil`)

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npm run check` (tsc + `eslint .` + vitest) | réussi : 52 fichiers, **491 réussis**, 9 ignorés (tests base / hub sans variables) ; dont `tests/accueil.test.ts` : 14 |
| `TEST_DATABASE_URL=… TEST_DB_NAME=gp_test_v15 npm run test:db` | 26 fichiers, **191 réussis** ; dont `tests/accueil.db.test.ts` : 17 |
| `TEST_PG_URL=… TEST_HUB_DB_PREFIX=gp_test_v15_hub npm run test:hub` | **10 réussis** (dont « V15 reception queue travels too ») |
| `node scripts/verify-migrations.mjs …` | 24 migrations, `24_accueil` rejouée sans erreur ; structure identique au schéma |
| `npx next build` | réussi |

- **Unitaires** : ordre de priorité (arrivée, RDV à l'heure / trop tôt / trop tard, motifs rapides avec et sans option, priorité manuelle), estimation (fenêtre, minimum, « — »), masquage de plaque, règle des 3 appels, pair/impair, statistiques, messages fr/ar, CSV sans donnée personnelle, octets ESC/POS, téléphone.
- **Base réelle** : 20 tickets simultanés → 20 numéros différents 1…20 ; hub → impairs ; nouveau jour → 1 ; « Suivant » concurrent depuis 2 guichets (8 tours, 16 tickets) → jamais le même ticket deux fois ; priorité RDV + refus tant qu'un client appelé n'est pas traité ; mécanicien refusé ; 3 appels → absent après le délai, rappel possible (journal complet) ; transfert / annulation / absent au journal ; ticket avec la plaque du RDV du jour → l'ordre créé est sur CE véhicule ; QR scanné / révoqué ; borne et écran sans jeton, mauvais type, jeton révoqué → 401 ; seul le hash du jeton est stocké ; l'écran public et la page de suivi ne renvoient ni nom, ni téléphone, ni e-mail, ni plaque entière (et la plaque masquée seulement avec l'option) ; aucun SMS sans consentement, consentement refusé par l'API ; copie en ligne d'un hub : en file, pas d'envoi ; estimation réelle (20 puis 25 min) ; imprimante réseau (faux serveur TCP local) ; « À traiter » et bloc du tableau de bord.

**Contrôle des tests** : retrait du verrou « Suivant » (`where: { id, status: "WAITING" }` → `where: { id }`) et du masquage de l'écran public (`maskPlate(t.plate)` → `t.plate`) dans `src/server/accueil.ts` → **2 tests échouent** (« two counters pressing « Suivant » at the same time never get the same ticket », « screen JSON: number + reason + counter only… »), 15 réussis. Code remis à l'identique (`git status` propre).

## 5. Navigateur (Edge sans interface via CDP, `next start -p 3200` sur la base jetable `gp_test_v15_demo`)

27 captures dans `docs/media/v15/` : borne tablette 820 px fr/ar (accueil, plaque, ticket avec RDV reconnu, SMS consenti, sans jeton), TV 1920×1080 (avant appel, appel fr, appel ar, sans jeton, jeton révoqué), poste d'accueil PC 1366 px fr/ar et tablette fr/ar (avant / après « Suivant »), check-in ouvert, rapports et réglages fr/ar, Paramètres (jeton créé + QR), bloc du tableau de bord, suivi du ticket téléphone fr/ar.

Vérifié en direct : ticket pris à la borne (A-5, « Bonjour, votre RDV de … est enregistré », attente estimée 15 min) ; « Suivant » au poste appelle le ticket du RDV à l'heure ; l'écran l'affiche au prochain rafraîchissement et **appelle la lecture du son** (compteur de `play()` passé de 1 à 2 — le son lui-même n'est pas audible dans un navigateur sans interface) ; alternance fr → ar ; « Accueillir le RDV » ouvre l'ordre du bon véhicule ; export CSV 200 `text/csv` ; révocation → la TV affiche « Appareil non autorisé ».

## 6. Limites

- **Son sur la TV** : bloqué par les navigateurs tant qu'on n'a pas touché la page → bouton « Activer le son » à chaque démarrage (ou option de lancement `--autoplay-policy=no-user-gesture-required`). Certaines TV connectées ne jouent pas le WAV : non testé sur une vraie TV.
- **Imprimante** : ESC/POS brut sur le réseau (port 9100), testé avec un faux serveur TCP seulement, pas sur une vraie imprimante ; texte ASCII uniquement (accents retirés, pas d'arabe sur le ticket papier).
- **SMS** : dépend de Twilio / e-mail configurés ; jamais testé avec un vrai envoi ; pas de WhatsApp ni de push.
- Avec le hub, les numéros du PC du garage sont impairs (A-1, A-3…) et ceux de la copie en ligne pairs — c'est le mécanisme existant des ordres de réparation.
- Les identifiants client / véhicule / RDV / ordre du ticket ne sont pas des clés étrangères (choix pour ne modifier aucun modèle existant et faciliter la fusion avec la V14).
- Scan du QR par caméra : navigateurs avec `BarcodeDetector` seulement.
- L'heure du RDV affichée par la borne est en heure du garage, format 24 h (« 08:30 »).

## 7. Fichiers partagés modifiés (blocs séparés, additifs)

`prisma/schema.prisma` (bloc V15 après `Notification`), `src/lib/permissions.ts` (bloc + groupe `reception`), `src/lib/i18n/{fr,en,ar}.ts` (import + clé `v15`, codes d'erreur `queue*` en fin de `errors`), `src/lib/i18n/v103-*.ts` (libellés permissions / groupe / bloc), `src/lib/i18n/todo-*.ts`, `src/lib/todo.ts`, `src/server/todo.ts`, `src/components/shell/todo-icons.ts`, `src/components/shell/nav.ts` (clé `reception`, panneau « Plus »), `src/lib/dashboard-layout.ts` (bloc `reception`), `src/app/(garage)/garage/page.tsx`, `src/app/(garage)/garage/settings/page.tsx` (carte des jetons), `src/app/api/staff/live/route.ts` (sujet `reception`), `src/server/reminders.ts` (type `QUEUE`), `tests/dashboard-layout.test.ts` (attendu + bloc), `tests/hub-sync.test.ts` (test V15 + préfixe de bases `TEST_HUB_DB_PREFIX` facultatif, défaut inchangé `gp_hub`), `README.md`.
