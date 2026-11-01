# Ideas saved "maybe later"

Ideas discussed in November 2026 and kept for later. Nothing here has a prompt yet, except GaragePro Connect (P1).
When you want one: ask for its prompt, it will be added to `prompts/` and `send/`.

---

## 1. Pro Drivers plan — taxis, louages, delivery, ride-hailing, driving schools
**Why:** very high mileage, every day stopped = lost income, loyal recurring clients.
- Priority lane with target time (e.g. oil change in 45 min or discount)
- Maintenance by km: the driver sends the mileage on WhatsApp each week, GaragePro plans oil, brakes, tyres
- Early (6–8 am) and late (after 8 pm) slots
- Maintenance plan paid weekly, WhatsApp reminder
- Cost per km and per month for the driver
- Downtime counter, maximum promised, replacement car if late (B7)
- Station / company contracts with a monthly invoice (W9)
- Quick wash included at each visit (Lavage + Atelier)
**Revenue:** add-on ~+20 TND/month/branch; partners: taxi unions, louage stations, Bolt/Yassir/InDrive, lubricant brands.
**Builds on:** W9, V2, V3, B7, T6, T2.

## 2. MRE Service — Tunisians living abroad
**Why:** many come back each summer (often by ferry with their car), short holidays, pay in EUR, book in advance.
- Booking from abroad (fr/ar/it/de), deposit in EUR (Konnect accepts EUR), arrival date at the port
- "Ready on arrival": oil change, AC, tyres, pre-trip check, slot the day after the ferry
- Year-round car keeping for cars left in Tunisia: covered parking, engine started monthly, battery, tyres, monthly
  photo on WhatsApp, yearly subscription
- "Ready for your return" pack: wash, AC, technical inspection and vignette handled, delivery to port/airport
- Check before driving back to Europe, invoice in French/English
- Updates and quote approval from abroad on WhatsApp (foreign number)
**Revenue:** July–August peak, EUR payments, yearly keeping subscriptions; partners: CTN, MRE associations, insurers.
**Builds on:** booking, quote approval, tracking, storage fees; C1, T6, T4, C2, G4.

## 3. Centrale d'achat — group buying for GaragePro garages
**Why:** small garages pay the highest prices, counterfeit parts, supply problems (2024 shortage).
- Weekly grouped orders (oil, filters, pads, wash products) built from each garage's stock needs
- Negotiated volume prices: "your price alone" vs "group price"
- Approved suppliers only, genuine parts guaranteed (T5), rated by garages
- One-click "add to this week's group order", delivery or depot pick-up
- Pay on delivery or instalments; monthly savings report
**Revenue:** supplier commission (e.g. 2–5 %), strong reason to stay subscribed, network effect.
**Check first:** legal role as intermediary, contracts, invoicing, liability, delivery logistics. Start after the
pilot in one region (Greater Tunis) with a few products.
**Builds on:** stock, purchasing, low-stock alerts, multi-garage; D3, T5, V8.

## 4. GaragePro Connect — OBD dongle with SIM (researched)
**Status:** decision report `research/reports/OBD dongle with SIM for GaragePro.md`; pilot prompt **P1**
(`prompts/PROMPTS-3.md`, `send/82-P1-…txt`).
- Teltonika FMC003 (EU/MEA), flespi → signed webhook → GaragePro; alert + propose a slot
- Fleets and garages pay, devices rented (Fleet Pro 30–40 TND, Garage Retention 15–20 TND, anti-theft +10–15 TND)
- Before: CERT homologation, INPDP declaration and transfer authorisation, local M2M SIM, ask INT about SIM resale
- 10-car pilot (5 garage clients + 5 fleet cars) with go/no-go thresholds

## 5. Sinistre Zéro Souci — everything after an accident in one place
**Why:** after an accident the driver deals alone with the report, tow truck, insurer, expert and garage; body/paint
jobs go to the garage called first.
- "J'ai eu un accident" button (app/WhatsApp) with position; safety instructions and emergency numbers first
- Link to the FTUSA e-Constat app, PDF sent back in one tap; guided damage photos
- Tow truck sent with ETA and price; replacement car if available (B7)
- Insurance file opened automatically (T3); live tracking of every step; client pays only excess / non-covered parts
**Revenue:** body/paint jobs, towing and rental; partners: insurers, tow companies, rental agencies.
**Check first:** never block emergency services; client chooses garage/tow (insurer rules); each insurer's process;
location only during the request, with consent.
**Builds on:** client app, photos, signatures, messaging; T3, V1, V4, B7, T6, C1.

## 6. GaragePro Talents — recruit, train and keep mechanics
**Why:** hard to find and keep good mechanics (some leave abroad), young graduates lack workshop practice, new
skills needed (diagnostics, EV, AC).
- Verified work profile (with consent): jobs by type, QC pass rate, comebacks, skills validated by the garage
- Job offers between garages; apprentices/interns with training centres (ATFP…), skills signed off one by one
- Short video trainings + quizzes in Darija/French, certificates with QR check
- Retention: quality bonus, career steps, certificate expiry reminders
- Optional freelance help at peak times (summer, before Eid)
**Revenue:** job posts / "Talents" add-on, paid trainings; partners: training centres, brands, EV makers.
**Check first:** mechanic controls their data (INPDP), no harmful scores, labour law for freelance and internships.
**Builds on:** skills matrix (V14), time tracking, QC, comebacks, HR, certificates; V6, S1, multi-garage.

## 7. Réseau GaragePro — garages send each other jobs
**Why:** small garages turn clients away for specialist jobs (ECU, AC, gearbox, glass, ADAS, body, EV battery);
transfers already happen informally by phone.
- "Send to a partner" from the work order; partners nearby by job type with delay, price range, rating
- File shared (car, problem, diagnosis, photos); client details only with consent
- Two modes: outsourced (first garage keeps the client and invoices) or referral (client goes to the partner)
- Shared tracking, automatic monthly commission (e.g. 5–10 % of labour), car returns to the first garage
**Revenue:** fee per transfer or "Réseau" add-on, network effect, feeds the directory and the "Certifié" label.
**Check first:** client consent, liability and warranty in a partner agreement, anti-poaching rules; start in one city.
**Builds on:** work orders, photos, quotes, supplier invoices, tracking; G2, multi-garage, T6.

## 8. Prix Clair — a firm price online before the car arrives
**Why:** the client's first question is "how much?", fear that the price rises in the garage, most jobs are standard.
- Plate or make/model/engine → job (oil change, pads, battery, timing belt, AC, tyres, wash) → parts level
  (original / quality aftermarket / economy, with warranty, T5) → firm price valid 7 days, or "from… to…" when a check
  is needed → book a slot, optional deposit (C1)
- Promise: anything extra is asked first (quote approval), the advertised price does not move
- Garage price grid per job and car category, labour from the catalogue (B4), parts from stock/suppliers with margin
  rule, automatic update and alert when a price is no longer profitable, price expiry dates
- Stats: quotes requested, converted to bookings, top jobs and models
**Revenue:** more bookings (nights, weekends), trust (links with "Certifié"), price data for the "find a garage" app.
**Check first:** honest "diagnosis needed" for non-standard jobs; start with the 30–50 most common models in Tunisia.
**Builds on:** booking, "from" prices, quote approval, stock, client app; B4, T5, C1, T6, V8.

## 9. Saisons — automatic campaigns at the right moment
**Why:** garage work follows clear seasons (summer AC/cooling/tyres, MRE return, Eid trips, back to school, first
rains, winter battery, Ramadan hours); most garages never contact clients between visits.
- Ready-made Tunisian campaign calendar: "Clim avant l'été" (May), "Check avant voyage" (before each Eid and July),
  "Rentrée", "Premières pluies" (October), "Batterie hiver" (December), "Horaires de Ramadan"
- Smart targeting from car data: AC not serviced for 2+ years, battery 4+ years, worn tyres at last inspection,
  quote lines refused 3 months ago
- WhatsApp/SMS in the client's language with price (Prix Clair) and a Book button with free slots
- Garage approves once: "143 clients, estimated cost 12 TND, expected ~15 bookings"
- Limits: max 1 marketing message per client per month, quiet hours, consent only, one-tap unsubscribe
- Results per campaign: sent, bookings, revenue vs message cost; optional "fill the empty agenda" offers
**Revenue:** measurable in dinars for the garage (strong retention), "Saisons" add-on, sponsored brand campaigns.
**Check first:** consent and anti-spam; WhatsApp marketing messages are paid (show cost first); Eid/Ramadan dates move
each year (updated holiday calendar).
**Builds on:** reminders, maintenance agenda, inspections, refused-lines follow-up (Lot 5), consent, booking; T6, C2,
Prix Clair.
