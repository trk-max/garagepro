# GaragePro — prompts, part 2 (Tunisia must-haves, general core, garage types, growth)

These complete `For Add/prompts/PROMPTS.md` (A1–D7) and `For Add/prompts/PROMPT-MULTI-GARAGE.md`.
They come from the research report `For Add/research/GaragePro global expansion features.md`.

How to use: start a new Claude Code session, paste the **common preamble** from the top of `For Add/prompts/PROMPTS.md`, then **one**
prompt from this file. One prompt per session/branch; merge before the next.

Suggested order:
1. `For Add/prompts/PROMPTS.md` A1–A7 (reliability)
2. This file **T1–T6** (Tunisia now), with `PROMPTS.md` D1 replaced by **T1** below
3. `PROMPTS.md` B1–B5, C1–C4, C6 (daily use)
4. This file **G1–G4** (general core) — required before V1–V8
5. This file **V1–V8** (garage types), then `PROMPTS.md` B6, B7
6. `PROMPT-MULTI-GARAGE.md`, then this file **X1–X3** (growth)

---

## T. Tunisia must-haves

### T1 — TTN El Fatoora e-invoicing (replaces PROMPTS.md D1)
```
Context: the Tunisian Finance Law 2026 (Loi 2025-17, art. 53) extends mandatory electronic invoicing through TTN
"El Fatoora" to service providers subject to VAT from 1 January 2026 (garages included). Format: TEIF XML, electronic
signature, about 190 millimes per invoice. Enforcement and penalties are still unclear (a postponement amendment was
discussed in April 2026). Before coding, check the current official rules (finances.gov.tn, tradenet.com.tn / TTN,
efatourti.tn) and list for me what needs a contract/certificate with TTN (signature certificate, accreditation, test
environment). If a site is blocked by the network, tell me which one.
Do:
1. Real PDF invoices and credit notes from the frozen invoice copy (pdf-lib), SHA-256 fingerprint stored and printed,
   vehicle QR kept. Already issued invoices are never changed.
2. TEIF XML generation for each invoice and credit note (all mandatory fields: seller/buyer tax IDs "matricule fiscal",
   VAT per rate 19/13/7 %, stamp duty, withholding tax if any, totals in millimes), validated against the official
   XSD, stored with the invoice.
3. A sending module behind a setting: queue, retry, TTN reference and status (sent, accepted, rejected + reason),
   visible on the invoice and in "À traiter". Without credentials: generate and store only, never claim it was sent.
4. Works with the hub: XML generated offline, sent when online, numbering unchanged.
5. Settings: activation date, certificate upload (stored encrypted), B2B only or B2B + B2C.
6. Tests: XML valid against the XSD for normal invoice, multi-rate VAT, stamp duty, credit note, foreign client.
```

### T2 — Cash, instalments and bills of exchange (after the cheque reform)
```
Context: Tunisian cheque law 41-2024 (in force 2 Feb 2025) cut cheque use by about 2/3; garages now get cash,
transfers, bills of exchange ("lettres de change / traites") and informal instalments.
Do:
1. Payment methods become a configurable table (keep CASH, CARD, CHECK, TRANSFER; add BILL_OF_EXCHANGE, MOBILE_WALLET
   (D17, Flouci, e-Dinar), ONLINE, INSURER, ACCOUNT_CREDIT). Migrate the enum safely; old payments unchanged.
2. Bills of exchange: drawer, bank, number, due date, amount; status (to collect, presented, paid, unpaid/returned with
   fees); printable "lettre de change" in the legal Tunisian layout; due-date alerts in "À traiter".
3. Instalment plans on an invoice: N instalments with dates and amounts (reuse payment promises of migration 30),
   reminders via WhatsApp/SMS with the client's consent, late list, plan signed on the tablet.
4. Cash drawer: opening float, cash in/out (payments, refunds, expenses), end-of-day close with counted vs expected,
   difference with reason, Z report printable, manager validation; nothing editable after close (audit log).
5. Reports and the accounting export include the new methods. Tests for every money path (locks, no double payment).
```

### T3 — Insurance claims with FTUSA e-Constat
```
Context: since 1 Nov 2025 the FTUSA "e-Constat" app lets drivers declare an accident with photos and location and get a
PDF report with a QR code; the insurer then sends an expert. GaragePro already has the "Attente assurance" status.
Do (extend PROMPTS.md D2 with this):
1. Insurance file on the order: insurer (configurable list of Tunisian insurers), policy and claim numbers, e-Constat PDF
   upload (read the QR/reference if possible), accident date, our client at fault or not, expert name/phone, expert visit
   date, required photo checklist (before/during/after), estimate sent to the insurer, approved amount, excess
   ("franchise") paid by the client, depreciation ("vétusté") if any.
2. Split invoice: client part (excess, non-covered lines) and insurer part, each with its own payments and aged balance.
3. Secure, time-limited link for the expert/insurer to see photos and the estimate and record approve/reject/supplement.
4. Delays in "Suivi & retards" (waiting for expert, waiting for approval, waiting for insurer payment) and in Rapports
   (average days to approval and to payment per insurer).
5. I do not know the exact expert process of each Tunisian insurer: make the steps configurable and ask me at the end
   which ones to keep.
```

### T4 — Technical inspection ("visite technique" ATTT)
```
Context: periodic inspection is done only at ATTT centres; booking is online at attt.com.tn; there is no ATTT API.
Do:
1. Per vehicle: last inspection date, result, next due date (computed from vehicle age and type with Tunisian rules —
   check them and show me the rule table; editable in Paramètres), certificate photo.
2. Reminders to the client 30 and 7 days before (existing reminders system, client consent, client language).
3. "Pré-visite technique" package: a checklist template (lights, brakes, tyres, emissions, horn, wipers…) using the
   existing inspection red/orange/green, with failed points added to the quote.
4. Optional service "Conduite à la visite technique": the garage takes the car to the centre; appointment date, driver,
   result recorded, fee line on the invoice.
5. Dashboard card "Visites techniques à venir" and a filtered list to call clients.
```

### T5 — Part origin and condition on every line
```
Counterfeit and used parts are a major issue in Tunisia, and laws like California BAR require marking parts as new,
used or rebuilt. On every part line (quote, order, invoice, stock item, receipt) add the origin: OEM original,
OE-quality aftermarket, aftermarket, used, rebuilt/reconditioned, supplied by the client. Show it on the quote the client
approves and on the invoice (in the client's language). Client-supplied parts: no stock movement, no warranty on the part
(printed clause), labour warranty only. Supplier per origin, and warranty duration per origin. Reports: margin and
comebacks by origin. Reuse the existing PartCondition enum if it fits; migrate safely.
```

### T6 — WhatsApp-first communication (Tunisia)
```
Context: Tunisian bulk SMS needs an operator contract and INT approval of the sender name and costs about 0.31 € per
message; WhatsApp Business has charged per message since 1 July 2025 (utility templates free inside the 24-hour customer
window, marketing always paid). Make WhatsApp the main channel (build on PROMPTS.md C2):
1. One "send" service with channel order per message type (WhatsApp Cloud API → SMS → e-mail → prepared wa.me link),
   respecting consent and quiet hours.
2. Template catalogue mapped to WhatsApp categories (utility vs marketing), with cost estimate per month in Paramètres.
3. Incoming WhatsApp messages land in the existing messaging, linked to the client/vehicle by phone number; staff reply
   from GaragePro; photos received are attached to the order.
4. Delivery/read status in "Historique des envois". Without API keys: wa.me links only, never "sent".
```

---

## G. General core (makes GaragePro fit every type of garage) — do before V1–V8

### G1 — Vehicle becomes a general "asset"
```
Today Vehicle assumes a car: plate globally unique, km only, fixed FuelType enum. Generalise without breaking anything:
1. Asset class: car, light utility, motorcycle/scooter, truck, bus, trailer, agricultural machine, construction machine,
   boat/other — configurable list with icon and default fields.
2. Identifiers: plate (+ country, + plate type: normal, temporary, foreign, none), VIN, serial number, fleet/unit number.
   Plate unique per country (and later per organisation), not globally. Find vehicles by any identifier.
3. Meters: several per asset (km, miles, engine hours, PTO hours), each reading dated and kept in history; work orders,
   maintenance plans, reminders and reports accept any meter. Display in km or miles per garage setting.
4. Energy: replace FuelType enum by a table (petrol, diesel, LPG, CNG, mild hybrid, full hybrid, plug-in hybrid, battery
   electric, hydrogen) + battery capacity for EV/PHEV.
5. Parent/child links (tractor + trailer, truck + body/crane).
6. Safe migration: existing data mapped (car, km reading from current fields), all pages, documents, portal, OBD, agenda
   and tests still work. List every place that reads km or plate and show me before changing.
```

### G2 — More line types
```
LineType is only LABOR / PART. Add: FEE (diagnostic, environmental, shop supplies — % or fixed), SUBLET (outsourced work
with supplier, cost and margin, e.g. machining, glass, upholstery), PAINT_MATERIAL (quantity/units × rate), STORAGE,
TRAVEL (mobile service: distance or zone), PACKAGE (a priced bundle of labour + parts, editable lines, fixed or computed
price), DEPOSIT/ADVANCE, DISCOUNT (line or %, with permission and reason). Each type: VAT rate, stock effect (only PART),
profitability rules (Rentabilité), printing, quote approval, credit notes, accounting export, e-invoice XML mapping.
Migrate safely; old lines unchanged. Tests for totals, VAT, stock, profit per type.
```

### G3 — Workshop profiles (statuses per type of business)
```
The 14 WorkOrderStatus values are fixed. Add "workshop profiles": a garage (later a branch) picks one or more profiles
(general repair, body & paint, quick service, tyre centre, truck workshop, mobile mechanic, towing, detailing, EV).
A profile defines: the visible steps and their labels (fr/ar/en), allowed transitions, required checks per step (e.g.
quality control, signature, calibration report), default line types, dashboard cards and KPIs. Keep the existing status
enum as the internal "phase" so reports, portal, permissions and sync keep working; profiles map their steps to phases.
The current behaviour becomes the "general repair" profile, identical to today. Settings page to choose and lightly edit
profiles. Tests: the general profile reproduces today's rules exactly.
```

### G4 — Country packs
```
Remove Tunisia hard-coding (Africa/Tunis in ~10 files, dinar with 3 decimals and "DT", stamp duty, CIN/matricule fiscal,
+216, Tunisian contracts) into a "country pack" selected in Paramètres (later per branch):
currency (code, decimals, symbol, number format), time zone, date format, week start, public holidays, phone format and
validation, tax engine (rates, tax-included or not, extra duties such as stamp duty, withholding), identity and tax-ID
fields with validation, invoice mandatory mentions and numbering rules, e-invoicing adapter (T1 for Tunisia), legal
documents/contract templates, units (km/miles, litres/gallons), default payment methods.
Ship packs: Tunisia (exactly today's behaviour), Morocco, Algeria, France, Saudi Arabia, UAE — the non-Tunisian ones
marked "à vérifier" for tax/legal content. Money stays in integer minor units; a 2-decimal currency must never lose
precision. Tests: the Tunisia pack gives byte-identical invoices to today.
```

---

## V. Modules per type of business (after G1–G4)

### V1 — Body and paint
```
Body-shop profile: estimate with damage zones on a car diagram, panel operations (repair, replace, refinish, blend),
paint material by rate or by mix, sublet; photo sets required by step; production board (disassembly, body, prep, paint
booth, assembly, polishing, QC) with booth scheduling; supplements (additional damage found) sent for approval to client
or insurer (T3); ADAS: when a job touches windscreen, bumpers, radar/camera mounts or alignment, propose a calibration
line and require pre/post scan and calibration report upload, or a signed customer waiver if refused. Optional import of
estimates from Audatex/Qapter, DAT, GT Motive (file import first; APIs only with partner access — tell me what is needed).
```

### V2 — Quick service lane
```
Quick-service profile for oil change/fast fitting: lane screen (cars waiting, in bay, done) built on the accueil queue and
kiosk; check-in in under 60 seconds (plate scan, mileage, service menu with fixed prices); recommended services from the
maintenance agenda shown as upsell with one-tap client approval on the tracking page; bay timer and target time;
throughput KPIs (cars per day, average time, upsell rate, ARO). Works on a tablet in the bay.
```

### V3 — Fleet and in-house workshop mode
```
For company fleets, rental companies and in-house workshops: assets grouped by fleet/site/cost centre; preventive
maintenance plans by km, hours or date per asset class; driver defect reports (mobile form with photos, like DVIR);
downtime tracking; cost per km/hour per asset and fleet; fuel entries and import (CSV first, telematics later);
monthly fleet invoice per client; extend the existing business portal (fleet manager sees assets, PM due, approvals,
costs). Include rental needs: vehicle availability calendar and turnaround inspection.
```

### V4 — Mobile mechanics and towing
```
Field profile: jobs with address/GPS, map view and day route for each technician/truck, travel line (G2), stock per van
with transfers from the main stock, offline-capable mobile job screen (photos, signature, payment link), on-the-way
message with ETA to the client.
Towing: call intake (location, vehicle, reason), dispatch to truck, pickup/drop timestamps and photos, distance-based
pricing, impound/storage yard (location, daily storage fee — reuse storage-fee logic, release with ID check and payment),
billing to insurer/assistance company accounts.
```

### V5 — Tyre centre data
```
Tyre profile: per wheel position (FL, FR, RL, RR, spare, dual axles for trucks) record size, brand, model, DOT week/year,
tread depth, pressure, TPMS sensor; tyre catalogue with load/speed index and EU label fields (no EPREL API assumed);
fitting jobs with balancing/alignment packages; tread-depth alerts and replacement quote; link with the tyre storage of
PROMPTS.md B6 (do B6 after this).
```

### V6 — EV and high-voltage safety
```
EV profile, built on the skills matrix (competences): high-voltage qualification levels per technician (configurable,
e.g. IMI 1–4 or DGUV S/1S/2S/2E/3S) with certificate and expiry; only qualified technicians can be assigned or start a
timer on an HV job; HV isolation checklist (de-energise, lock-out, verify zero voltage, signed by the qualified person)
required before work; quarantine log for damaged EVs/batteries (location, checks, fire-risk notes); battery state-of-
health report attached to the vehicle and shown on the client portal; EV-specific maintenance items in the agenda.
```

### V7 — Detailing and car wash
```
Detailing profile: service packages (interior, exterior, ceramic, polish) with durations and bay/slot booking;
memberships/subscriptions (monthly plan, number of washes, auto-renew via online payment, member recognised by plate);
before/after photos sent to the client; coating warranty with periodic check reminders; KPIs (members, churn, revenue
per bay).
```

### V8 — Repair data and parts sourcing integrations
```
1. Labour times and repair data: design one adapter interface, implement HaynesPro (web services for software partners)
   first and leave Autodata/ALLDATA as stubs; fill the labour-time catalogue (PROMPTS.md B4) and maintenance schedules
   from it when a licence is configured. Tell me what partner agreement is needed.
2. Parts: TecDoc through TecAlliance or an authorised partner (no public price); vehicle → part lookup when licensed.
3. Tunisia has no online B2B parts ordering: add "Demande de prix" — select the needed parts, send a structured request to
   several suppliers by WhatsApp/e-mail/PDF, record their answers (price, delay, origin T5) side by side, pick one and
   create the purchase order. Extend PROMPTS.md D3.
```

---

## X. Growth

### X1 — AI receptionist (WhatsApp and phone)
```
An AI assistant that answers clients on WhatsApp (and later phone calls through a voice provider) in Tunisian Arabic
(Darija), Arabic, French and English: car status from the tracking data, opening hours, prices "à partir de", booking a
slot (existing booking rules), quote approval link, hand-over to a human with a summary. Reuse the existing assistant
providers and safety rules (AI cannot write to the database except through validated booking/message actions; strict
rate limits; no personal data sent to providers that train on it unless the garage accepts). Staff see every
conversation. Measure: questions answered without staff, bookings made.
```

### X2 — International e-invoicing adapter
```
Using the country packs (G4) and the Tunisian adapter (T1) as the model, build one generic e-invoicing interface and
document the next adapters, preferably through certified partners rather than direct certification: Saudi Arabia ZATCA
phase 2 (wave 25 integration from 1 Feb 2027), UAE Peppol PINT AE via an accredited provider (mandatory from 2027),
Egypt ETA e-invoice/e-receipt, Morocco DGI (calendar decree pending), France (e-invoicing for SMEs from 1 Sep 2027,
through an approved platform, Factur-X). First write docs/E-FACTURATION-INTERNATIONALE.md with current dates, partners
and costs (check them), then implement only the interface and one adapter I choose.
```

### X3 — Regional payment providers
```
Turn online payment (PROMPTS.md C1) into a provider interface (create payment, signed webhook, refund status) with
adapters chosen per country pack: Tunisia Konnect and Flouci (done in C1), Egypt/Gulf Paymob, Saudi/UAE HyperPay or Tap,
Morocco CMI, Europe Stripe (cards, SEPA), Africa mobile money (M-Pesa, Orange Money, Wave via an aggregator such as
Flutterwave or Paystack), optional buy-now-pay-later. Same safety rules as C1 (server-side amounts, idempotent webhooks,
no overpayment). Implement the interface and one new adapter; document the others.
```

---

## Before selling outside Tunisia
Another product named "GaragePro" is sold to garages in France, Morocco and francophone Africa. Check trademark
availability (INNORPI in Tunisia, OMPIC Morocco, INPI France, WIPO) before marketing abroad — this is not a coding task.
