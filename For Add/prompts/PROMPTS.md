# GaragePro — ready-to-use prompts for every proposed addition

How to use: start a new Claude Code session in this repository, paste the **common preamble** and then **one** prompt.
Do one prompt per session/branch, merge it, then move to the next. Follow the order of the sections (A first).

---

## Common preamble (paste before every prompt)

```
Project rules for this task (GaragePro, Next.js 15 + Prisma 6 + PostgreSQL, French codebase):
- Follow CLAUDE.md (graphify: use `graphify explain` / `graphify path` before broad searches).
- First explore and give me a short plan (files to change, migration, permissions, risks). Wait for my OK, then implement.
- Database changes: a new ADDITIVE migration `prisma/migrations/<next number>_<name>/migration.sql`
  (IF NOT EXISTS, nothing renamed or dropped, same habits as migration 32) + prisma/schema.prisma.
  New tables must be synchronised by the offline hub (scripts/hub); check it. Remind me to run `npm run db:cloud` after merge.
- Permissions only through the MATRIX in src/lib/permissions.ts, checked in the Server Action AND in the page.
- Money in millimes (integers), quantities ×100, as everywhere else. Money/stock changes go to the audit log (src/server/audit.ts).
- Every visible text in French, Arabic (full RTL) and English, in src/lib/i18n/*-fr.ts / *-ar.ts / *-en.ts.
- Must keep working on the garage hub without internet. An external service with no key configured = feature hidden or
  disabled with a clear message; never pretend something was sent or paid.
- Mobile first (390 px) and desktop; no horizontal overflow.
- Tests: unit tests in tests/, database tests as *.db.test.ts (npm run test:db). Run `npm run check` and show the result.
- Add a "Nouveautés" section at the top of README.md and a short guide in docs/ in simple French.
- Commit in small steps with clear French messages. Do not open a pull request unless I ask.
```

---

## A. Reliability (do first)

### A1 — Offline sync: never lose stock or payment totals
```
Problem: scripts/hub/sync-engine.mjs resolves conflicts per row, "most recent wins". For counter columns this loses data:
Part.stockX100, Part.reservedX100 and Invoice.paidAmount (and any other stored total, e.g. supplier invoice paid amount)
are overwritten when both the hub and the cloud changed the same row before a sync, while the StockMovement /
Payment / StockReservation rows on both sides survive.
Do:
1. List every stored total/counter column in prisma/schema.prisma that is derived from child rows.
2. After each sync round, recompute those totals on BOTH databases from the child rows (only for the rows touched in
   that round), inside a transaction, and set the invoice status accordingly. Log any correction in the sync report.
3. Detect and report (do not silently accept) an overpayment that only exists after merging both sides; show it in
   "À traiter" for an admin.
4. Write a test in tests/hub-sync.test.ts (two test databases): stock removed on both sides before a sync, and a payment
   recorded on both sides → after sync both databases agree and totals equal the sum of the child rows.
```

### A2 — Browser security headers
```
There is no middleware and next.config.ts only sets headers for /sw.js. Add security headers for all routes:
Content-Security-Policy (start with a strict policy that the app actually passes: self, inline styles if needed,
images from self/data/blob and the Supabase storage host, connect-src for the AI providers only if called from the browser),
frame-ancestors 'none' (except routes that must be embedded, if any), X-Content-Type-Options nosniff, Referrer-Policy
strict-origin-when-cross-origin, Permissions-Policy (camera allowed only where the app uses it), and HSTS only on https.
Keep the special CSP of src/app/api/signatures/[id]/[which]/route.ts. Check with Playwright (Chromium is installed) that
the public site, the team space, the signature pad, the camera uploader, the kiosk and the service worker still work,
with no CSP errors in the console. Add a test that checks the headers.
```

### A3 — Error monitoring and alerts
```
Errors today only go to console.error. Add monitoring without a paid service required:
- A small server logger (src/server/) that stores errors in a new table (time, place, message, user, request id), with
  de-duplication and a 30-day cleanup, synchronised by the hub.
- Catch errors from Server Actions, API routes, error.tsx/global-error.tsx (report from the browser to an API route,
  rate-limited) and from the hub sync and backups.
- An admin page "Santé du système": last sync time, sync failures, last backup, recent errors, and a red badge in the menu.
- Optional: if SENTRY_DSN is set, also send to Sentry. Optional e-mail to the admin when the sync has failed for 1 hour
  or the backup failed (use the existing e-mail sending).
Never show technical details to clients.
```

### A4 — End-to-end tests of the main flows
```
Add Playwright end-to-end tests (Playwright and Chromium are already installed; do not run "playwright install").
Run against `next start` with a disposable test database seeded with demo data (reuse the TEST_DATABASE_URL habits of
test:db; refuse Supabase URLs). Cover:
1. Reception: new order for a new client → check-in signature → quote → client approves on /suivi with plate + code.
2. Mechanic on a 390 px phone: sees the assigned vehicle, changes the step, adds a photo.
3. Quality control → invoice → partial payment → full payment → handover signature → delivered.
4. Booking on /rdv in Arabic (RTL) and confirmation.
5. Business portal: a company only sees its own vehicles.
Add the script `npm run test:e2e`, take screenshots on failure, and document it in the README "Tests" table.
```

### A5 — Audit #10: mechanics must not see prices and margins
```
Audit item #10 (docs/AUDIT-V16.md, docs/RAPPORT-V16.md): the MECHANIC role can see sale amounts and purchase prices.
Add permissions `viewPrices` and `viewPurchaseCost` in src/lib/permissions.ts. Hide amounts, totals, purchase prices and
margins for roles without them everywhere: work-order page, lines, quote panel, parts list, stock, mobile workshop,
inspection, notifications, search results, printed documents opened by them, and API responses (do not just hide in the
UI: remove the fields server-side). The mechanic still sees part names, quantities and labour hours.
Turn the matching reproduction in tests/audit-v16 into a regression test.
```

### A6 — Audit #5/#6: no duplicate open order, no double check-in
```
Audit items #5 (two open orders for the same vehicle) and #6 (the same appointment checked in twice).
- Creating an order for a vehicle that already has an open order: show the existing order and require a manager
  override with a reason (logged) to open a second one.
- Checking in an appointment: make it atomic (row lock or unique constraint) so two clicks/devices create only one order;
  the second gets a link to the first.
- Must also hold when one is done on the hub and the other online (detect after sync and show in "À traiter").
Turn the reproductions in tests/audit-v16 into regression tests.
```

### A7 — Audit #29: custom access after a role change
```
Audit item #29: per-person access overrides stay active after the person's role changes. When an admin changes a role,
show the current overrides and ask to keep or remove each one (default: remove), log the decision, and invalidate the
person's sessions (use the session version from migration 31). Regression test from tests/audit-v16.
While there, also fix #32 (employee national ID visible to the workshop manager): only ADMIN and HR roles see it.
```

---

## B. Staff (daily use)

### B1 — Global search bar (Ctrl+K)
```
Add a global search for the team space: Ctrl+K / Cmd+K on desktop, a search button in the top bar and in the mobile
"Plus" panel. One field searches plates (tolerant to spaces/dashes and Arabic digits), client names and phones, VIN,
order numbers, invoice/quote/purchase numbers and parts (reference, name). Results grouped by type, keyboard navigation,
max ~12 results, 250 ms debounce, cancelled stale requests (reuse the existing customer-picker server search).
Results respect permissions (no invoices for a mechanic, no prices without the right). Quick actions too:
"Nouvel ordre", "Ticket manuel", "Nouveau RDV". Recent searches stored in the browser only.
```

### B2 — Shorter desktop menus by role
```
src/components/shell/nav.ts has about 39 entries. Make the desktop menu role-based like the phone app
(src/lib/team-app.ts): each role sees its 6–8 main entries; everything else allowed goes in a "Plus" group.
Each user can pin/unpin entries (saved per user, synchronised by the hub). Counters/badges stay on the visible entries.
Do not change which pages are allowed, only how they are shown. Screenshots for each role in fr and ar.
```

### B3 — Work-order page in tabs
```
src/app/(garage)/garage/work-orders/[id]/page.tsx is ~924 lines and audit #37 says it is overloaded. Reorganise it into
tabs: Vue d'ensemble · Travaux & pièces · Devis · Photos & inspection · Argent · Historique.
A sticky header shows plate, client (tap to call/WhatsApp), status, promised date and THE next action button.
The tab is kept in the URL (?tab=). Show a dot on tabs needing attention (quote waiting, missing part, unpaid).
On mobile, tabs scroll horizontally. Split the page into smaller server components; keep every existing feature and
permission. Before/after screenshots at 390 px and 1280 px, fr and ar.
```

### B4 — Labour-time catalogue
```
Add a catalogue of standard labour times: job (e.g. "Remplacement plaquettes avant"), category, default hours, optional
time per make/model/engine, default parts list. Admin/manager edit it in Paramètres (import/export Excel using
src/lib/xlsx.ts). In the line adder of an order/quote, picking a job fills hours × hourly rate and proposes the parts
(with stock availability). Reports: real time spent vs catalogue time per job and per mechanic (uses the existing timers).
Seed ~40 common jobs in French with Arabic and English names.
```

### B5 — Plate and VIN reading from a photo, VIN decoding
```
At check-in (new order, reception, mobile), add "Scanner la plaque" and "Scanner le VIN" with the phone camera.
- Read text in the browser first (e.g. tesseract.js, lazy-loaded, works offline on the hub); support Tunisian plates
  ("123 تونس 4567", "RS …") and 17-character VINs (validate the check digit, reject I/O/Q).
- Optionally use an AI vision provider if a key is configured (reuse src/server/ai-providers.json logic).
- Decode the VIN (WMI → make, year; free NHTSA vPIC API when online, local WMI table offline) to pre-fill make/model/year.
- Always show the result for confirmation before saving; never overwrite existing data silently.
```

### B6 — Tyre storage ("hôtel de pneus")
```
Add seasonal tyre/wheel storage: per vehicle, set of tyres (brand, size, DOT, tread depth per wheel, with/without rims,
photos), storage location (rack/shelf code), check-in and check-out dates, price per season (added to the invoice),
printable label with QR code. Reminders to the client before the season change (reuse the reminders system and the
client's consent). List with search by plate/location, "à rendre" and "stockés depuis plus de 12 mois".
Permission: new `manageTyreStorage` (admin, manager, reception; mechanic read).
```

### B7 — Loaner cars
```
Add courtesy/loaner vehicle management: fleet of garage cars, booking calendar, lending linked to a work order, check-out
and return (mileage, fuel level, photos, damage, signed loan agreement using the existing signature pad and legal kit),
deposit, km or day fee added to the invoice if set, fines/tolls note. Alerts: return overdue, document expiry
(insurance, technical inspection). Booking on /rdv can ask "J'ai besoin d'un véhicule de prêt" if one is free.
```

### B8 — Accounting export
```
Add an export for the external accountant (role ACCOUNTANT and ADMIN): sales journal (invoices, credit notes), purchase
journal (supplier invoices), payments/cash journal and expenses for a period, in Excel and CSV (Tunisian format: date,
piece number, account, label, debit, credit, VAT rate, stamp duty). Account numbers configurable in Paramètres
(default Tunisian chart of accounts). Totals must equal the Rapports page; add a test that checks it.
Also a monthly ZIP with the PDFs/HTML copies of invoices and credit notes.
```

---

## C. Clients

### C1 — Online payment
```
Let clients pay a deposit, an accepted quote or an invoice from the tracking page (/suivi/vehicule) and from a payment
link sent by WhatsApp/SMS/e-mail. Providers for Tunisia: Konnect and Flouci (one interface, provider chosen in
Paramètres, keys in .env). Rules: amount always computed server-side; a payment is recorded only after the provider's
signed webhook/verification (idempotent, uses the existing payment lock and anti-double-click key); refunds noted
manually; fees optional. Online only (hide on the hub when offline). The cashier sees "Payé en ligne" with the reference.
Tests with a fake provider: success, failure, duplicate webhook, amount mismatch, overpayment refused.
```

### C2 — Client language and WhatsApp templates
```
Store a preferred language per client (fr / ar / en; asked at check-in, default from the language used on the portal).
All automatic messages (tracking code, quote ready, car ready, invoice reminder, satisfaction survey, maintenance
reminder, ticket) use that language. Add editable message templates per language in Paramètres with variables
({nom}, {plaque}, {montant}, {lien}…) and preview. Add WhatsApp sending: wa.me prepared message (always) and, if
WhatsApp Business Cloud API keys are configured, real automatic sending with delivery status in "Historique des envois".
Also translate printed documents (quote, invoice, handover) into the client's language (audit #35).
```

### C3 — Client account
```
Add a client space without password: log in with phone number + one-time code (SMS/WhatsApp/e-mail when configured;
otherwise via the existing plate + 4-digit code). The client sees all their vehicles, current repairs, past orders,
invoices (downloadable), warranties, upcoming maintenance from the agenda, and can book directly for a vehicle.
Strict rate-limiting and lockout (same rules as /suivi), short sessions, logout everywhere. Works in the installed /app PWA.
Tests: a client never sees another client's data.
```

### C4 — Google review requests
```
After the satisfaction survey (Lot 5): if the score is 4 or 5, show a "Laisser un avis Google" button (Google review link
configured in Paramètres) on the thank-you page and in the follow-up message; if 3 or less, do not ask for a public
review and create the internal follow-up as today. Respect client consent; never send twice for the same order.
Report: number of requests sent and clicks.
```

### C5 — Loyalty and prepaid maintenance plans
```
Add (1) loyalty points: X points per dinar paid, configurable rewards (discount, free wash), shown on the client account
and the invoice, used as a discount line on the invoice (logged); and (2) prepaid maintenance plans: e.g. "2 vidanges +
1 contrôle par an", sold once, remaining uses tracked per vehicle, automatically applied as 0 DT lines, expiry reminders.
Accounting: plan sales and point discounts appear correctly in Rapports and in the accounting export.
```

### C6 — Video and photo explanation on the quote
```
Let the mechanic attach a short video or photos to a quote line from the phone ("voici vos plaquettes"), with a
voice-over or a text note. On the client's tracking page, each quote line shows its media next to Accept/Refuse.
Compress video in the browser when possible, size limit, private storage served after access check (reuse the existing
media rules). Report: acceptance rate of lines with media vs without.
```

---

## D. Management and growth

### D1 — Tunisian e-invoicing (TTN / El Fatoora) and signed PDFs
```
Prepare legal electronic invoicing: generate real PDF invoices and credit notes (pdf-lib is already a dependency) from
the frozen invoice copy, with a SHA-256 fingerprint stored and printed, and the vehicle QR. Then add an El Fatoora
(TTN, TEIF XML) module behind a setting: build the TEIF XML for each invoice, validate it, keep it with the invoice,
and send it when credentials are configured (store the TTN reference and status). Research the current TEIF format and
explain to me what needs an agreement with TTN. Do not change already issued invoices.
```

### D2 — Insurance claim file
```
Build on the "Attente assurance" status: an insurance file per order with insurer, policy and claim numbers, expert/
adjuster contact, required photo set (checklist), estimate sent, expert visit date, approved amount, deductible paid by
the client, amount billed to the insurer (split invoice: client part / insurer part). Give the adjuster a secure
time-limited link to see photos and the estimate and to approve/reject. Delays visible in Suivi & retards.
```

### D3 — Parts catalogue and supplier prices
```
Improve purchasing: per part, several suppliers with their reference, last price, delay and minimum quantity; price
history from receipts; import supplier price lists (Excel). When a part is needed, suggest the cheapest/fastest supplier.
Reorder suggestions from consumption over the last 90 days (not only the minimum threshold), excluding parts already
ordered (fixes audit #18). Optional: compatibility by make/model.
```

### D4 — Satisfaction dashboard
```
Add a "Satisfaction" page for admin/manager using the existing reviews, surveys, claims and comebacks: average score and
NPS-like trend per week/month, per mechanic, per service type, comeback rate, most frequent complaint reasons, and the
verbatim comments (filterable). Charts in the existing redesign components; fr/ar/en; export Excel.
```

### D5 — Several garages / branches

> Full version with your decisions (SaaS + branches, subdomains, subscriptions, optional hub): **For Add/prompts/PROMPT-MULTI-GARAGE.md**. Use that one.

```
I want to sell GaragePro to other garages and support chains with several branches. First write an architecture
proposal only (docs/MULTI-GARAGE.md), no code: tenant model (garageId on every business table vs one database per garage),
data isolation and tests, how the offline hub works per branch, numbering per branch, settings per branch, combined
reports for the owner, migration of the current single-garage data, Vercel/Supabase costs, and risks.
Give a recommendation and a step-by-step plan. Wait for my decision before coding.
```

### D6 — Instant updates instead of 4-second polling
```
src/components/live-refresh.tsx polls every 4 s on every open page. Replace it with Server-Sent Events: one stream per
browser, server pushes "changed" events per topic (order, appointments, messages, queue screen) after the related
Server Actions and after a hub sync; the page refreshes only the affected part. Fallback to polling (every 15–30 s) when
SSE is not available (Vercel function limits, proxies). Must work on the hub (LAN) and online. Measure requests per
hour before/after for one open tracking page and one waiting-room screen.
```

### D7 — Install on macOS/Linux and a single login
```
1. Installation and launch currently use .cmd scripts (Windows). Add equivalent .sh scripts (setup, start, start-hub,
   shortcut) for macOS and Linux, tested in this Linux container, and document them.
2. Staff must log in twice (garage address and online address). Propose and implement a safe way to log in once:
   e.g. the GaragePro.cmd/.sh shortcut opens a signed one-time link, or the hub accepts a session token issued online
   (and the reverse), with short expiry and the same session-version logout. Explain the security trade-offs first.
```
