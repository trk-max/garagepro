# GaragePro as a subscription service (SaaS) — business plan

How to sell GaragePro by subscription to many garages and car washes, each with one or several branches.
Technical build: `For Add/prompts/PROMPT-MULTI-GARAGE.md` (multi-garage + subscriptions) and `For Add/prompts/PROMPTS-WASH.md` W0 (modules).
Offers and screens: `For Add/plans/PLAN-LAVAGE-ATELIER.md`.

All prices and costs below are **suggestions to validate** with 5–10 pilot customers. The only local price found in the
research is a competitor at 15,000 TND setup + 550 TND/month.

---

## 1. Plans (price per branch)

| Plan | For | Included | Monthly | Yearly (2 months free) |
|---|---|---|---|---|
| **Atelier Lite** | Small workshop | 3 users, simple mode, quick orders, quotes/invoices, simple stock, cash, client tracking, WhatsApp links | 59 TND | 590 TND |
| **Lavage** | Car wash / detailing | 5 users + washers by PIN, wash check-in, lanes, cash, damage photos, washer commission & tips, TV screen | 89 TND | 890 TND |
| **Lavage + Atelier** | Site doing both | Lite + Lavage, cross-selling, one client file | 139 TND | 1,390 TND |
| **Complet** | Larger garage | Everything (today's GaragePro): HR, purchasing, quality, warranties, agenda, reports, business portal | 249 TND | 2,490 TND |
| **Réseau** | Owner with several branches | Any plan per branch −15 % from the 3rd branch, combined reports, stock transfers | per branch | per branch |

**Add-ons** (per branch / month): loyalty & subscriptions 20 TND · company contracts 15 TND · mobile washing 20 TND ·
plate camera 30 TND · TTN e-invoicing 25 TND (+ TTN fee per invoice, about 190 millimes, re-billed) · offline hub
(garage PC) 30 TND · extra user 10 TND · WhatsApp/SMS packs (prepaid credits, cost + margin) · AI receptionist (later).

**Trial**: 14 days free, full plan, no card needed. **Setup**: free self-service; optional on-site setup + training
(e.g. 150–300 TND) and data import from Excel.

---

## 2. What the customer gets

- Their own address: `nom-du-garage.garagepro.tn` (custom domain later), their logo and colours on the client site,
  tracking, booking and documents.
- Mobile apps without store (PWA): client app and team app.
- Updates included, daily encrypted backups, data export at any time.
- Support by WhatsApp and phone (fr / ar), video tutorials, help pages already in the app.

---

## 3. Billing and payment

| Step | Rule |
|---|---|
| Payment | Konnect (cards, Flouci, wallets, e-Dinar), Flouci, bank transfer; cash/cheque only through a reseller |
| Invoices | GaragePro issues a Tunisian invoice each period (VAT 19 % on SaaS — check with an accountant), by TTN El Fatoora when required |
| Renewal | Reminder 7 and 1 days before; automatic renewal when the payment method allows it |
| Unpaid | 7-day grace period (everything works, banner) → read-only (can view and export, cannot create) → after 90 days, account archived, data kept 12 months then deleted after notice |
| Upgrade / downgrade | Immediate, pro-rata credit; downgrade hides modules but keeps data |
| Cancellation | Any time at the end of the period; export of all data (Excel + PDFs) |

---

## 4. Costs (rough, to measure in the pilot)

| Item | Estimate |
|---|---|
| Hosting (one shared database, Vercel + Supabase, fra1 region) | about 50–150 USD/month for the first ~50 branches, then grows with storage and traffic |
| Photos/videos storage | main variable cost: set a storage limit per plan, compress media |
| WhatsApp / SMS | re-billed through credit packs (never included unlimited) |
| AI | free providers first; paid AI only in a paid add-on |
| Payment fees | Konnect/Flouci fee per payment (check current rates) |
| Support | biggest real cost at the start: tutorials and the setup wizard reduce it |

Target: hosting + fees under 15 % of revenue; break-even after ~30–50 paying branches (to verify with real costs).

---

## 5. Legal checklist (Tunisia)

- Company able to invoice SaaS (SARL/SUARL or startup label "Startup Act"), tax ID, VAT registration.
- **Contrat d'abonnement / CGV + CGU**: service description, prices, duration, payment, suspension, liability limits,
  availability target (e.g. 99 %), support hours, termination, data export.
- **Data protection**: GaragePro processes the garages' client data → data processing agreement (DPA) with each
  customer; declaration/authorisation to INPDP (law 2004-63); **hosting abroad (EU) may need INPDP authorisation for
  transfer of personal data — ask a lawyer** (alternative: a Tunisian host for the database).
- Privacy policy for end clients on each garage site (template in the legal kit, filled per garage).
- **Trademark**: another "GaragePro" sells in France, Morocco and francophone Africa → check INNORPI (Tunisia) and
  choose/protect the name before launch.
- E-invoicing (TTN) of GaragePro's own invoices.

---

## 6. Selling it (go-to-market)

1. **Pilot**: 5–10 garages and car washes free for 2–3 months in exchange for feedback and testimonials (videos).
2. **Channels**: Facebook/Instagram/TikTok videos in Darija (before/after a wash, "car ready" message on WhatsApp),
   garage and car-wash Facebook groups, Google Business profile.
3. **Partners who already visit garages**: parts distributors, lubricant brands, car-wash product suppliers,
   accountants (they push e-invoicing), insurers (claims workflow) — reseller commission 20–30 % of the first year.
4. **Referral**: one free month for the referrer and the new customer.
5. **Hardware bundle** with a local supplier: tablet + receipt printer + cash drawer, sold or rented with the plan.
6. **Later**: Morocco and Algeria (French/Arabic, similar habits), then Gulf (needs ZATCA/UAE e-invoicing first).

---

## 7. Numbers to follow

MRR (monthly recurring revenue), number of paying branches per plan, trial → paid conversion, churn per month, average
revenue per branch, support tickets per branch, hosting cost per branch, active users per day.
These go in the super-admin dashboard (part of the multi-garage prompt).

---

## 8. Order of work

1. `For Add/prompts/PROMPTS.md` A1–A7 — reliability (a paid service must not lose payment or stock totals).
2. `For Add/prompts/PROMPT-MULTI-GARAGE.md` — **Phase 0 proposal**, then phases 1–7 (tenants, isolation, branches, shared data,
   transfers, combined reports, subdomains).
3. `For Add/prompts/PROMPTS-WASH.md` W0 — module switches (they become the plans).
4. `For Add/prompts/PROMPT-MULTI-GARAGE.md` phase 8 — sign-up, plans, subscriptions, super-admin.
5. `For Add/prompts/PROMPTS-WASH.md` W1–W4, W14 — the Lavage and Lite MVP → **start the pilot here**.
6. `For Add/prompts/PROMPTS-2.md` T1, T2, T6 — e-invoicing, cash/instalments, WhatsApp.
7. Everything else according to pilot feedback.

---

## 9. To decide

- Final prices after the pilot (the table above is a starting point).
- Company name and brand (trademark check).
- Hosting location (EU vs Tunisia) after the legal advice on data transfer.
- Support hours and who answers.
- Whether to sell hardware yourself or through a partner.
