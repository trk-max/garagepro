# GaragePro — prompts, part 3 (ready to sell: security, quality, operations)

Prompts that cover what the other files do not: what a paid service needs before real customers use it.
Send them after file **W14** (end of the car wash / workshop MVP) and **before the pilot** — the `send/` folder
already places them there. Use them with the common preamble (`00-PREAMBLE.md`).

---

### S1 — Setup wizard, help centre and training
```
New customers (multi-garage sign-up) must be able to start alone in 15 minutes. Build:
1. A first-login setup wizard per offer (Atelier Lite, Lavage, Lavage + Atelier, Complet — module presets of W0):
   garage identity and legal info (country pack), logo and colours, opening hours, services/packages with prices
   (pre-filled Tunisian templates), team members and roles/PINs, payment methods, WhatsApp/e-mail, receipt printer test,
   optional import of clients/vehicles/stock from Excel (with preview and error list). Progress saved; can be resumed;
   a checklist card "Finir la configuration" on the dashboard until done.
2. Contextual help: a "?" on each main screen linking to the existing help pages (help-fr/ar/en); empty states that
   explain what to do; a guided first tour (5 steps max, skippable, never shown again once closed).
3. A demo mode: a fresh organisation can load sample data and remove it in one click.
4. Write the scripts (fr + Darija in Latin and Arabic letters) for 10 short tutorial videos (60–90 s each) in
   docs/TUTORIELS.md, and link each video slot from the matching screen (URL configurable by the super-admin).
```

### S2 — Accessibility and field usability
```
Audit and fix accessibility (WCAG 2.1 AA) and garage-field usability on the main flows: check-in, work order, quote
approval on the client tracking page, booking, wash check-in and lanes board, cash desk, mobile mechanic screens.
Check with Playwright + axe-core (install as dev dependency; Chromium is preinstalled, do not run "playwright install"):
contrast in dark (team) and light (client) themes, readable text in bright sunlight, touch targets ≥ 44 px (gloves),
keyboard navigation and focus, labels and aria for icons, screen-reader names, RTL order in Arabic, zoom to 200 %,
reduced motion (gsap animations respect prefers-reduced-motion), slow 3G and an old Android phone (CPU throttling).
Fix what fails, add an automated accessibility test to `npm run test:e2e`, and list remaining issues in
docs/ACCESSIBILITE.md.
```

### S3 — Usage statistics (privacy-friendly)
```
Add product analytics owned by us (no third-party tracker): record anonymous events per organisation/branch
(module used, screen opened, main actions: order created, quote approved, wash ticket closed, payment recorded,
WhatsApp sent, wizard step done), stored in our database with a 13-month retention, no client personal data.
Super-admin dashboard: active organisations per day/week, modules used per plan, funnel sign-up → wizard done →
first order → first payment → paid subscription, features never used, slowest pages (server timing).
A setting lets each organisation opt out. Mention it in the privacy policy template.
```

### S4 — Backup and restore per garage
```
Today backups (scripts/backup, docs/SAUVEGARDES.md) cover the whole database. With multi-garage we need:
1. Export of ONE organisation (all its tables + media list) to an encrypted archive, on demand by the super-admin and
   by the organisation owner (their own data: also the "export all my data" right), and scheduled daily per plan.
2. Restore of ONE organisation into a staging database to inspect, then into production replacing only that
   organisation's rows, with a dry-run report first and a mandatory backup just before. Other organisations untouched.
3. Test with two organisations: delete data of A, restore A, B unchanged; restore keeps numbering and links working.
4. Retention policy per plan, backup status per organisation in the super-admin, alert when a backup fails (A3).
```

### S5 — Load and cost test
```
Before fixing prices we must know the cost per garage. Build a reproducible load test (k6 or a Node script) against a
staging deployment with synthetic data for 50, 100 and 300 branches (realistic volumes: orders, wash tickets, photos,
open tracking pages and TV screens, WhatsApp webhooks, hub syncs). Measure: response times (p50/p95) of the main
pages and actions, database CPU/connections, storage growth per month, Vercel function usage, Supabase egress.
Fix the top bottlenecks found (indexes, N+1 queries, caching, image sizes). Write docs/COUTS-ET-CHARGE.md with the
results, the estimated monthly cost per branch per plan, and the limits per plan to set (storage, users, media).
Never run the load test against production.
```

### S6 — Status page, incidents and service commitments
```
1. Public status page (status.<domain>): current state of the app, online database, hub sync, payments, WhatsApp,
   e-invoicing; automatic checks every minute from a health endpoint (no secrets exposed) plus manual incident posts
   by the super-admin (fr/ar/en); history of 90 days; optional e-mail/WhatsApp subscription for garage owners.
2. In-app banner for ongoing incidents and planned maintenance.
3. docs/INCIDENTS.md: severity levels, who is alerted (A3 alerts), first actions, how to communicate, how to restore
   (S4), post-incident review template.
4. A service commitment text for the subscription contract (availability target, support hours, response times,
   backups) — mark it "à valider par un juriste".
```

### S7 — Security audit before selling
```
Run a full security audit of GaragePro as a multi-tenant SaaS (use the security-audit skill if available), as a
defensive review of our own code. Cover: tenant isolation in every query, Server Action, API route and cron job;
authentication and sessions per subdomain; super-admin impersonation and its audit log; the public client portal
(tracking codes, QR tokens, booking, payment links) against enumeration and brute force; payment and WhatsApp webhooks
(signatures, replay, idempotency); file uploads and media access; the offline hub (LAN exposure, X-Forwarded-For, sync
credentials); secrets in the repository and in logs; dependencies (npm audit, without --force); security headers (A2);
rate limits. Reproduce each finding with a test before fixing; fix the critical and high ones; list the rest with a
plan in docs/AUDIT-SECURITE.md. Do not test against production or third-party systems.
```
