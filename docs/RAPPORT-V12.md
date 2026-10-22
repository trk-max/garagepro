# RAPPORT V12 — Agenda des prochaines réparations (maintenance préventive)

## 0. Plan (écrit avant de coder)

**Branche** : `feat/v12-agenda` (depuis `main` 71f487d). **Migration** : `22_agenda` (additive, gardée, re-jouable).

**Ce qui est RÉUTILISÉ (rien n'est dupliqué)**
- Véhicules, ordres livrés et leurs lignes (`WorkOrderLine` : pièce liée, description), forfaits (`ServicePackage`, événement `PACKAGE_APPLIED`) → détection des remplacements.
- Kilométrages : `WorkOrder.mileageIn` (daté par l'ordre) + relevés OBD `VehicleReading` **source ADAPTER** uniquement (SIMULATED exclu, kilométrages inférieurs au précédent exclus).
- Rappels V7.6 : table `Notification` (une ligne par canal, `dedupeKey` unique, statuts SENT/FAILED/SKIPPED, réessais), envoi `deliverPending` (SMS Twilio / e-mail), refus client `Customer.reminderOptOut`, tâche planifiée `/api/cron/reminders` (Vercel + hub). Les plans manuels `VehicleMaintenance` restent tels quels (rappel « tous les N km / N jours » saisi à la main pour UN véhicule) ; l'agenda V12 est la couche « estimation » au-dessus : catalogue commun + historique réel.
- QR véhicule (`resolveVehicleQr` : jeton révoqué = refusé), suivi client `/suivi/vehicule` (session PIN), portail entreprise (`CompanyViewer`, `canSeeMoney`), prise de RDV `/rdv?notes=…`, devis = lignes de l'ordre (`addLine` / `applyPackage`), réservations de pièces / demandes d'achat (liens, rien d'automatique), garanties (`Warranty`), « À traiter », tableau de bord personnalisé, journal d'audit, hub (triggers `_sync_log_trg`), XLSX (`src/lib/xlsx.ts`).

**Nouveaux fichiers**
- `prisma/migrations/22_agenda/migration.sql` : tables `MaintenanceItem` (catalogue), `MaintenanceEvent` (remplacements détectés / déclarés, corrections tracées), `MaintenanceForecast` (prévisions versionnées) ; colonne `Notification.forecastId` ; réglages `Setting.agenda*` + modèles `tplAgendaFr/Ar`.
- `src/lib/agenda.ts` (calcul pur : médiane/quartiles, rythme, échéances, confiance, signaux, modèles de message).
- `src/server/agenda.ts` (détection, recalcul idempotent, statuts, messages), `src/actions/agenda.ts`.
- Écrans : `/garage/agenda`, `/garage/agenda/reglages`, bloc véhicule `/garage/vehicules/[id]/entretien`, carte « À faire aussi » sur l'ordre, QR `/v/[token]`, `/suivi/vehicule`, portail entreprise + export.
- i18n `src/lib/i18n/v12-{fr,en,ar}.ts`. Tests `tests/agenda.test.ts`, `tests/agenda.db.test.ts`, hub.

**Risques** : recalcul lent sur un gros parc (borné, par véhicule) ; détection par mot-clé trop large (corrigible/annulable) ; aucune donnée → beaucoup d'« estimation impossible » au départ (voulu : rien n'est inventé).

---

## 1. État — terminé / partiel / non fait

| Point du brief | État |
|---|---|
| Catalogue d'éléments (fr/ar/en, mots-clés, pièces, forfaits, intervalles SAISIS par le garage) | **Terminé**. Catalogue de départ sans aucun intervalle ; les exemples sont affichés « à vérifier par le garage » et ne sont jamais enregistrés. |
| Détection des remplacements (ordres livrés : pièce liée, forfait, mot-clé ; ordres annulés / en cours ignorés) ; correction / annulation tracée, données d'origine gardées | **Terminé** |
| Rythme de conduite (≥ 2 relevés réels à ≥ 30 jours ; OBD simulé et km décroissants exclus) | **Terminé** |
| Prévisions historisées (versions, jamais réécrites), fourchette, méthode, nb de cas, confiance, statuts PROPOSED → VALIDATED → SENT → BOOKED → DONE / IGNORED (+ motif) | **Terminé** |
| Calcul a) historique même modèle (médiane + quartiles, N réglable = 5) → b) référence → c) impossible + manquants ; km→date ; km vs mois (la plus proche, les deux affichées) | **Terminé** |
| Signaux du garage (« à surveiller », nb de cas) | **Terminé** (agenda + fiche véhicule) |
| Recalcul : ordre livré, relevé OBD réel, changement de catalogue / réglages, tâche quotidienne (route cron existante), idempotent | **Terminé**. Le kilométrage saisi à l'entrée d'un ordre est pris au recalcul suivant (livraison, quotidien, bouton *Recalculer*), pas instantanément. |
| Fiche véhicule « Prochaines réparations » | **Terminé** (`/garage/vehicules/[id]/entretien#agenda`, accès viewAgenda ou manageMaintenance) |
| Page Agenda (filtres période / élément / confiance / client / entreprise / statut, tri par échéance, valider / préparer / ignorer en masse) | **Terminé** (menu *Plus* › *Agenda*, groupe Suivi) |
| « À faire aussi » sur l'ordre + ajout au devis en un clic | **Terminé** (forfait lié, sinon pièce liée ; sinon « aucun forfait ni pièce lié ») |
| À traiter + tableau de bord (échéances 30 j, pièces à commander à l'avance) | **Terminé** (suggestion seulement, rien n'est commandé) |
| Paramètres (catalogue, seuils, délai d'avance, envoi auto désactivé, modèles fr/ar) | **Terminé** (`/garage/agenda/reglages`) |
| Client : suivi + QR « Prochains entretiens » + Prendre RDV (motif pré-rempli) | **Terminé** (pas de montant sur la carte QR publique) |
| Portail entreprise : planning par mois, coût indicatif, export Excel / CSV, montants selon le rôle | **Terminé** |
| Messages fr/ar, canaux existants, consentement, anti-répétition, historique et erreurs | **Partiel** : SMS (Twilio) et e-mail existants seulement. WhatsApp / push n'existent pas comme canaux d'envoi dans le projet, ils ne sont pas ajoutés. |
| RDV en ligne → prévision « RDV pris » | **Partiel** : liaison quand le motif du RDV contient le nom de l'élément (motif pré-rempli depuis le suivi / QR). Un RDV pris sans ce motif n'est pas relié. |
| Prévision → devis → pièces réservées / achats proposés | **Partiel** : devis en un clic ; réservation et achat restent les écrans existants, sans pré-remplissage. |
| Hub : tables synchronisées, calcul hors ligne, envois en file | **Terminé** (triggers, ids déterministes ; avec un hub, la copie en ligne ne calcule ni n'envoie) |
| Accès sur mesure | **Terminé** : 3 permissions visibles dans l'écran Accès |
| Aide intégrée (`/garage/aide`) | **Non fait** : guide dans `docs/AGENDA-ENTRETIEN.md` seulement |

## 2. Fichiers

- Migration `prisma/migrations/22_agenda/migration.sql` ; `prisma/schema.prisma`
- Calcul pur `src/lib/agenda.ts` ; serveur `src/server/agenda.ts` ; actions `src/actions/agenda.ts`
- Pages `src/app/(garage)/garage/agenda/{page,messages/page,reglages/page}.tsx` ; export `src/app/api/entreprise/agenda/route.ts`
- Composants `src/components/agenda/*` (agenda-ui, agenda-toolbar, forecast-explain, vehicle-agenda, order-suggestions, client-forecasts, company-plan)
- Branchements :
  - `src/server/work-orders.ts` (hook livraison, `packageId` dans l'événement forfait)
  - `src/server/obd.ts` (hook relevé), `src/server/booking.ts` (liaison RDV)
  - `src/server/reminders.ts` (file partagée, kind AGENDA, filtre d'envoi)
  - `src/app/api/cron/reminders/route.ts` (tâche quotidienne)
  - `src/lib/todo.ts`, `src/server/todo.ts`, `src/lib/dashboard-layout.ts`, `src/app/(garage)/garage/page.tsx`
  - `src/components/shell/nav.ts`, fiche et cartes véhicule, page de l'ordre, `/suivi/vehicule`, `/v/[token]`, `/entreprise`
  - `src/components/action-form.tsx` : `ActionButton` affiche maintenant `data.message`
- i18n `src/lib/i18n/v12-{fr,en,ar}.ts` (+ libellés dans v103, todo, v7, erreurs)
- Tests `tests/agenda.test.ts`, `tests/agenda.db.test.ts`, `tests/hub-sync.test.ts` (+1 test, délai de 20 s pour la base « sans hub »), `tests/dashboard-layout.test.ts` (nouveau bloc)
- Documentation : `docs/AGENDA-ENTRETIEN.md`, README « Nouveautés V12 », captures `docs/media/v12/`

## 3. Migration `22_agenda`

Additive, gardée (`IF NOT EXISTS`, `duplicate_object`), rejouée deux fois sans erreur. Elle crée :
- 3 tables : `MaintenanceItem`, `MaintenanceEvent`, `MaintenanceForecast`, avec leurs index et clés étrangères `ON DELETE RESTRICT` ;
- `Notification.forecastId` (nullable) ;
- sur `Setting` : `agendaMinCases`=5, `agendaGoodCases`=10, `agendaLeadDays`=30, `agendaAutoSend`=false, `agendaAutoMinConfidence`='MEDIUM', `tplAgendaFr`, `tplAgendaAr` ;
- le bloc « Garage hub » final, qui pose `_sync_log_trg` sur les nouvelles tables.

Aucune ligne de catalogue n'est insérée. Les ids sont déterministes (`mi_<code>`, `me_<hash>`, `fc_<hash>`), pour que le hub et la copie en ligne écrivent la même ligne.

Pas de relation avec `VehicleMaintenance` (plans manuels V7.6, inchangés) : ils restent le rappel « tous les N km / N jours » saisi pour UNE voiture. L'agenda est la couche d'estimation au-dessus et réutilise la même file `Notification`, le même refus client et la même tâche planifiée.

## 4. Permissions ajoutées (groupe « Clients & véhicules » de l'écran Accès, libellés FR/EN/AR)

| Permission | Rôles | Rôle de la permission |
|---|---|---|
| `viewAgenda` | ADMIN, MANAGER, RECEPTION, MECHANIC | voir (lecture seule pour le mécanicien) |
| `manageAgenda` | ADMIN, MANAGER, RECEPTION | valider, ignorer, préparer / envoyer, ajouter au devis, corriger une détection |
| `configureAgenda` | ADMIN, MANAGER | catalogue et seuils ; **activer** l'envoi automatique exige en plus `manageSettings` (administrateur) |

Actions sensibles au journal d'audit :
- `agenda.validate`, `.ignore`, `.send`, `.autoSend`, `.done`, `.booked`, `.addToQuote` ;
- `agenda.eventAdd`, `.eventCorrect`, `.eventCancel` ;
- `agenda.itemCreate`, `.itemUpdate`, `.catalogueStarter`, `.settings`, `.settingsAutoSendOn`.

## 5. Formules (simplement) et exemple chiffré

- **Rythme** = (dernier km − premier km) ÷ (jours entre les deux relevés ÷ 30,44). Il faut au moins 2 relevés réels espacés de 30 jours, sinon « inconnu ». Les relevés simulés et les km plus bas qu'un relevé précédent sont exclus.
- **a) Historique** : pour le même modèle (marque + modèle, puis carburant, puis année ± 3 ans quand ces groupes ont assez de cas), on prend les intervalles entre deux remplacements successifs sur une même voiture. On garde **médiane, Q1, Q3** (interpolation linéaire, comme QUARTILE.INC d'Excel) si le nombre de cas est ≥ N (5).
- **b) Référence** : l'intervalle saisi par le garage (fourchette = valeur unique).
- **c) Sinon** : « estimation impossible » + manquants.
- **Échéance km** = km au dernier remplacement + médiane (fourchette + Q1 / + Q3). **Date via le rythme** = date du dernier relevé + (échéance − km du relevé) ÷ rythme. **Échéance temps** = date du dernier remplacement + médiane en mois. On retient la plus proche des deux.
- **Confiance** :
  - *bonne* : ≥ 10 cas et (Q3 − Q1) ÷ médiane ≤ 0,5 ;
  - *moyenne* : historique ≥ N cas, ou référence avec date et km du dernier remplacement connus (et rythme connu si l'échéance vient du km) ;
  - *faible* : sinon.
- **Signal** : sur un modèle, km des remplacements d'un élément avec n ≥ N et (Q3 − Q1) ÷ médiane ≤ 0,3 → « souvent remplacé vers X km (n cas) ».
- **Exemple réel (données de démo des captures)** :
  - Peugeot 208 123 TU 4567, plaquettes AV changées à 60 000 km.
  - 8 autres 208 : intervalles observés, médiane 30 400 km, Q1 29 700, Q3 31 100.
  - Échéance vers 90 400 km (fourchette 89 700 – 91 100).
  - Rythme : 1 522 km/mois sur 3 relevés réels ; dernier relevé 74 000 km aujourd'hui. (90 400 − 74 000) ÷ 1 522 ≈ 10,8 mois, soit ≈ 10 janvier 2027.
  - Confiance moyenne (8 cas < 10). Prix indicatif 148,750 DT = forfait lié « Freins AV » (85 + 40 DT HT + 19 %).

## 6. Tests (résultats réels, worktree `feat/v12-agenda`)

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `npx eslint src tests` | 0 problème |
| `npx vitest run` | 51 fichiers, **477 réussis**, 8 ignorés (tests base / hub sans variables) ; dont `tests/agenda.test.ts` : 18 |
| `TEST_DATABASE_URL=… TEST_DB_NAME=gp_test_v12 npm run test:db` | 25 fichiers, **174 réussis** ; dont `tests/agenda.db.test.ts` : 16 |
| `TEST_PG_URL=… npm run test:hub` | **9 réussis** (dont « V12 agenda tables travel too ») |
| `node scripts/verify-migrations.mjs …` | 23 migrations, 22_agenda rejouée sans erreur ; structure identique au schéma |
| `npx next build` | réussi |
| `npm run check` dans ce worktree | `eslint .` signale des erreurs **uniquement dans `.scratch/`** (profil Edge et scripts locaux, ignorés par git) ; `npx eslint . --ignore-pattern ".scratch/**"` = 0 problème |

Contenu des tests :

- **Unitaires** :
  - médiane et quartiles ;
  - N insuffisant → b) puis c) ;
  - km → date ; rythme inconnu (1 relevé, relevés trop proches) ;
  - km décroissant et OBD simulé exclus ;
  - km vs mois (la plus proche) ;
  - signaux avec nombre de cas ;
  - détection (pièce / forfait / mot-clé, mot entier) ;
  - prix du forfait (prix inconnu → aucun prix) ; modèles fr/ar ; clé anti-répétition.
- **Base réelle** :
  - détection depuis des ordres livrés (pièce, forfait, mot-clé), ordre annulé et ordre en cours ignorés ;
  - vraie livraison (`changeStatus` → DELIVERED) ;
  - correction tracée (journal avant / après, donnée d'origine gardée) et annulation non recréée ;
  - recalcul idempotent ;
  - relevés simulés / incohérents sans effet, relevé réel → nouvelle version ;
  - prévision envoyée jamais réécrite (v2 créée, v1 intacte) ; nouveau remplacement → « faite » ;
  - pas d'envoi sans validation ; anti-répétition ; consentement refusé ; envoi automatique désactivé par défaut puis activé ;
  - mécanicien ne valide ni n'envoie, réception peut ;
  - client du suivi ne voit que son véhicule ; entreprise : sa flotte seulement, montants masqués pour VIEWER ;
  - QR public sans montant, QR révoqué refusé ;
  - RDV → « RDV pris » ; ajout au devis via forfait ; garantie signalée.

**Contrôle des tests** : retrait volontaire dans `src/server/agenda.ts` :
- du filtre client (`vehicleId` dans les vues client et `customerId` dans le portail entreprise) ;
- de la règle « pas d'envoi sans validation » (`allowed = true`).

Résultat : **4 tests échouent** (« nothing is sent without the garage's validation… », « customer (tracking session) sees only the vehicle of their order », « company portal: its own fleet only… », « QR: public card without amounts… »). Code remis à l'identique : 16 / 16 réussis, `git status` propre. Le test de l'envoi automatique ne dépend pas de cette ligne : la tâche quotidienne ne sélectionne déjà que les prévisions validées.

## 7. Navigateur (Edge sans interface via CDP, `next start -p 3180` sur `gp_test_v12`, données de démo)

Captures dans `docs/media/v12/`, 30 fichiers, PC 1366 px et téléphone 390 px, français et arabe (RTL) :
- `agenda-*`, `vehicule-*`, `vehicule-detail-calcul-pc-fr` ;
- `ordre-a-faire-aussi-*`, `ordre-apres-ajout-devis-pc-fr` ;
- `messages-pc-{fr,ar}`, `reglages-pc-fr`, `tableau-de-bord-pc-fr` ;
- `suivi-client-*`, `qr-public-*`, `entreprise-*`.

Vérifié en direct :
- « Ajouter au devis » ajoute bien la ligne du forfait ;
- l'export Excel répond 200 (`…spreadsheetml.sheet`), le CSV 200 ;
- la carte QR affiche les estimations sans montant.

## 8. Limites

- Au départ, beaucoup d'« estimation impossible » : il faut un dernier remplacement connu (détecté ou déclaré) et un intervalle (historique ≥ N cas ou référence saisie). C'est voulu : rien n'est inventé.
- La détection par mot-clé dépend du libellé des lignes : une ligne mal nommée n'est pas reconnue, un mot-clé trop large peut se tromper (correction / annulation possibles). Un remplacement par ordre et par élément.
- Le recalcul complet (quotidien, changement de catalogue) charge tout le parc en mémoire : adapté à un garage (milliers de véhicules), pas à un réseau.
- Langue des messages choisie par le garage à l'envoi (pas de langue enregistrée par client) ; les envois automatiques partent en français.
- Le kilométrage d'entrée d'un ordre ne déclenche pas de recalcul immédiat (au prochain recalcul).
- Dates des prévisions en UTC (affichage au fuseau du garage) ; le mois du planning entreprise est calculé en UTC.
