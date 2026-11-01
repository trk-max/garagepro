# GaragePro Lavage & Atelier — ready-to-use prompts

Product plan: `For Add/plans/PLAN-LAVAGE-ATELIER.md`. How to use: new Claude Code session → paste the **common preamble** from the
top of `For Add/prompts/PROMPTS.md` → paste **one** prompt below. One prompt per session/branch; merge before the next.
Order: W0 → W1 → W2 → W3 → W4 → W14 (MVP), then W5–W10 (extras), W11–W13 (other wash types), W15–W16.

Add this line after the preamble for every W prompt:
```
Read For Add/plans/PLAN-LAVAGE-ATELIER.md first: it is the product plan this task belongs to. Every new feature must respect the
module switches of W0 (hidden and inactive when its module is off, data kept).
```

---

## Phase 1 — MVP

### W0 — Module switches and simple mode
```
Add per-client module switches in Paramètres › Modules (admin only), stored in the settings table and synchronised by
the hub: ATELIER (repair workshop), LAVAGE (car wash), and options: loyalty, subscriptions, washerCommission, tips,
companyContracts, damagePhotos, productConsumption, tunnel, detailing, mobileWash, onlineBooking, whatsapp, eInvoicing,
plateCamera. Also "Mode simple" for small workshops.
- Offers as presets: Atelier Lite, Lavage, Lavage + Atelier, Complet (today's behaviour = Complet, the default for the
  existing garage: nothing changes for it).
- One helper isModuleOn(name) used by: menu (src/components/shell/nav.ts), pages (404/redirect when off), Server Actions
  (refuse when off), dashboard cards, reports, documents, public site/portal.
- Simple mode: menu reduced to Aujourd'hui, Véhicules, Ordres/Devis/Factures, Clients, Stock, Caisse, Paramètres; hides
  contracts, skills, showroom, purchasing circuit (PO approval), HR beyond time clock; optional workshop steps
  (quality control, signatures, inspection) become switches; one user may hold several roles.
- Tests: each preset shows/hides the right menu entries and blocks the right actions; "Complet" is identical to today.
```

### W1 — Wash catalogue (packages, add-ons, vehicle sizes)
```
Wash catalogue in Paramètres › Lavage: vehicle size categories (citadine, berline, SUV/4x4, utilitaire, moto — editable),
packages (e.g. Extérieur, Intérieur, Complet, Lustrage, Céramique) with price per size, duration per size, wash type
(hand, tunnel, detailing, mobile), description fr/ar/en, photo, active/inactive; add-ons (parfum, moteur, sièges,
jantes, cire…) with price per size. Optional: products used per package (for W9) and commission rule (for W6).
Shown on the public site "Prestations" (when LAVAGE is on) with "à partir de" prices. Excel import/export
(src/lib/xlsx.ts). Seed a default Tunisian catalogue.
```

### W2 — Quick wash check-in and ticket
```
"Accueil lavage" screen for a tablet at the entrance (also phone): type the plate (or later camera, W16) → recognise
client/vehicle (member? company contract? last visit, last package) → vehicle size (remembered per vehicle) → package +
add-ons with live total → optional phone number (WhatsApp consent) → create a WashTicket.
Target: a known car checked in in 3 taps, under 30 seconds. Unknown plate: create the vehicle with only plate + size.
Ticket printed (80 mm) or sent by WhatsApp with a number and a tracking link (reuse /accueil/t/[token] ticket style),
pay now or at exit. New model WashTicket (number per day, status, times per step, total in millimes, lane, washers,
source: walk-in/booking/contract/subscription) synchronised by the hub. Works offline on the hub.
```

### W3 — Lanes board and "car ready"
```
Lanes/bays in Paramètres (name, type, capacity). "Tableau des pistes" screen: columns En attente · Lavage · Finition ·
Prêt · Récupéré; cards show plate, size, package/add-ons, washer(s), elapsed time vs package duration (orange/red when
late); tap or drag to move; assign one or several washers (PIN on a shared tablet or own login — make both possible).
Live updates (reuse live-refresh; SSE if D6 is done). TV mode (big text, no buttons) and the existing waiting-room screen
shows "AB-123 → prêt" and the estimated wait. When "Prêt": WhatsApp/SMS/push to the client if consent ("Votre voiture est
prête"), never claim sent without a channel. Times per step stored for reports.
```

### W4 — Quick receipt and cash drawer
```
Fast checkout for wash tickets (and small-workshop orders in simple mode): one screen, total, add-ons added at the end,
discount with permission and reason, tip (W7 setting), payment methods (cash, card, D17/Flouci/wallet, subscription,
company contract → "à facturer"), change calculation. Receipt on an 80 mm thermal printer (browser print with a receipt
CSS first; ESC/POS through a small local helper on the hub later — tell me the options) with QR to the receipt and
loyalty balance. Cash drawer with opening float, cash in/out, end-of-day close (counted vs expected, reason for
difference, Z report) — if T2 of For Add/prompts/PROMPTS-2.md is already done, reuse its cash drawer; otherwise build it so T2 can
reuse it. Receipts become proper invoices on request (client tax ID), with TTN e-invoicing when that module is on.
```

### W14 — Small workshop quick order (simple mode)
```
In simple mode, a "Ordre rapide" flow on one phone screen: plate → client (create in 2 fields) → problem → lines
(labour, parts with simple stock, packages like "Vidange complète") → total → send quote by WhatsApp → client approves
on the tracking link → mark done → invoice + payment → "prête" message. No mandatory quality control, signatures or
inspection unless switched on. "Aujourd'hui" page: cars in, to finish, ready, unpaid. Simple stock: "J'ai reçu ces
pièces" (quantity + purchase price) without purchase orders. Reminders: next oil change by km/date.
Everything stays compatible with the full mode (switching to Complet later keeps all data).
```

---

## Phase 2 — Extras (each one a switchable option)

### W5 — Damage photos on arrival
```
Option damagePhotos: at wash check-in, guided photos (front, back, both sides, wheels, interior optional) with the
phone/tablet camera, tap on a car diagram to mark existing scratches/dents with a note, client signature on the tablet
(reuse the signature pad) or "client absent" with staff name. Stored on the ticket, shown on the receipt link; a
complaint later can be compared with these photos. Photos compressed, private storage, deleted after N days (setting),
except when a complaint is open.
```

### W6 — Washer commission
```
Option washerCommission: rule per package/add-on (fixed amount or % of price, per vehicle size), split between the
washers assigned to the ticket (equal or by share), bonus by number of cars per day (optional). Washer view: my cars
today, my commission. Manager: statement per period per washer (Excel/PDF), mark as paid (cash out from the drawer,
logged), corrections with reason. Uses the existing time clock for presence.
```

### W7 — Tips
```
Option tips: at checkout, tip amount (cash or card) assigned to one or several washers; tips are not revenue (separate
from VAT and reports of sales), listed in the washer statement and the daily close; paid out with a logged cash-out.
```

### W8 — Loyalty and subscriptions
```
Option loyalty: stamp card (e.g. 10th wash free) or points per dinar, rewards (free package, discount, add-on), balance
shown at check-in, on the receipt and on the client tracking link; redemption as a discount line (logged).
Option subscriptions: plans (N washes per month or unlimited, allowed packages and vehicle sizes, 1 or several plates),
price per month/year, start, renewal, pause, cancel; payment in cash at the counter or by online payment link (C1 of
For Add/prompts/PROMPTS.md if done); member recognised by plate at check-in (and by camera with W16); usage limits enforced (one
wash per day by default), expired plan → normal price. Reports: members, churn, revenue per member, usage.
```

### W9 — Company contracts
```
Option companyContracts: companies (taxis, rental agencies, fleets, car dealers) with a contract: agreed prices per
package/size, list of plates (or any car with a driver code), monthly cap, who may order. At check-in the plate is
recognised as "contrat X": no payment, driver signs on the tablet. Monthly invoice per company with the list of washes
(date, plate, package, signature), sent by e-mail/WhatsApp, payments and aged balance as for other invoices. Company
users can see their washes in the existing business portal (/entreprise) when the module is on.
```

### W10 — Product consumption and cost per wash
```
Option productConsumption: wash products in stock (shampoo, wax, tyre shine, microfibre, perfume…) with unit and
purchase price; standard quantity per package/size; each finished ticket creates stock movements automatically
(adjustable), monthly real inventory vs theoretical; cost per wash and margin per package; low-stock alerts.
Optional: water and electricity cost per wash as a fixed setting for the margin.
```

---

## Phase 3 — Other wash types

### W11 — Automatic tunnel / rollover
```
Option tunnel: wash programs (mapped to packages), machine(s) with their queue, pay-before-wash flow (ticket with a
code/QR the driver enters or shows), machine counter entered daily (cars per program) and compared with tickets sold
(gap = alert), maintenance log for the machine. Design an adapter interface for machine controllers (start program,
read counters) and leave it as a stub — ask me which machine brands are used before implementing one.
```

### W12 — Detailing and ceramic
```
Option detailing: bookable packages with long durations (hours or days) on detailing bays (reuse booking capacity and
the agenda), steps per package (decontamination, polish, coating, curing…), before/after photos sent to the client,
coating warranty (duration, conditions) with check-up reminders (e.g. every 6 months), deposit at booking (payment link
if available). Client tracking link shows steps and photos. Report: detailing revenue and bay occupancy.
```

### W13 — Mobile washing
```
Option mobileWash: booking with address/GPS (public booking page and staff), service zones with travel fee, day planning
per team/van with map and route order, job screen on the phone (works offline: photos, signature, payment link, cash),
"on the way" WhatsApp with ETA, van supplies stock (transfer from main stock, consumption per job), time per job and
travel time in reports.
```

---

## Phase 4 — Together and smart

### W15 — Dashboard and reports for car wash
```
Wash dashboard (when LAVAGE is on): cars today and per hour (heatmap by weekday/hour), average ticket, revenue by package
and add-on, waiting and wash times vs targets, members and subscription revenue, company contracts, washer ranking,
product cost per wash, comparison with previous period. Reports page with periods (day, 7 days, 30 days, 3 months) like
the existing Rapports, export Excel. Combined view when ATELIER is also on.
```

### W16 — Wash + workshop together, and plate camera
```
1. Cross-selling when both LAVAGE and ATELIER are on: one client/vehicle history with washes and repairs; at wash
   check-in show "vidange due", "visite technique bientôt" (T4), open quote lines refused before; one tap creates a
   workshop order or appointment; in the workshop, "Ajouter un lavage" before delivery adds a wash ticket to the same
   payment. Report: workshop revenue coming from wash clients.
2. Option plateCamera: design an interface for plate-recognition cameras (receive plate + photo from the camera's HTTP
   push or from a phone photo with OCR as in B5), pre-fill the check-in, recognise members/contracts automatically,
   never auto-charge without staff confirmation. Ask me which camera models before implementing one adapter.
```
