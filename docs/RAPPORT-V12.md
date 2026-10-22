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
