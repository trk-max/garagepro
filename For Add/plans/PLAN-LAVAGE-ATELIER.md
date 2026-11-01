# GaragePro Lavage & Atelier — product plan

Version of GaragePro for **car wash centres** and **small workshops**, sold separately or together, **as each client
chooses**. One product, one codebase: modules are switched on per client (later per branch with the multi-garage SaaS).

Prompts to build it: `For Add/prompts/PROMPTS-WASH.md`.

---

## 1. Offers (modules chosen by the client)

| Offer | For | Modules on |
|---|---|---|
| **Atelier Lite** | Small workshop, owner + 1–3 mechanics | Simple mode: vehicles, quick order, quotes/invoices, clients, simple stock, cash |
| **Lavage** | Car wash / detailing only | Wash tickets, lanes, packages, cash, plus the extras chosen |
| **Lavage + Atelier** | Site doing both (very common: "lavage + vidange") | Both, one client file, cross-selling |
| **Full GaragePro** | Larger garages | Everything (today's product) |

Every extra is an **option the client switches on or off** in *Paramètres › Modules*:
loyalty, subscriptions, washer commission, tips, company contracts, damage photos, product consumption, tunnel machine,
detailing, mobile washing, online booking, WhatsApp, e-invoicing (TTN), plate camera.
A switched-off module disappears from menus, screens, reports and documents; its data is kept.

Suggested prices for Tunisia (to validate with real customers; the only local anchor found is a competitor at
15,000 TND setup + 550 TND/month):

| Offer | Suggested monthly price |
|---|---|
| Atelier Lite | 49–79 TND |
| Lavage | 79–129 TND |
| Lavage + Atelier | 129–179 TND |
| Options (subscriptions/loyalty, mobile washing, plate camera) | +10–30 TND each |

---

## 2. Car wash types supported

| Type | Flow | Specific needs |
|---|---|---|
| **Hand wash / jet wash** | Arrival → ticket → bay → washer(s) → finishing → ready → pay → exit | Washer assignment, bays, commission/tips, damage photos |
| **Automatic tunnel / rollover** | Arrival → choose program → pay or token → machine queue → exit | Programs, machine counter, tokens/codes, optional machine controller link |
| **Detailing / ceramic** | Booking → reception with photos → multi-hour/multi-day job → before/after → delivery | Slots per bay, job steps, coating warranty and check-ups |
| **Mobile washing** | Booking with address → route → wash on site → photos → pay by link | Map/route, van supplies, payment link, time per job |

---

## 3. Main screens

**Car wash**
1. **Accueil lavage (tablet at entrance)**: plate (typed or camera) → client recognised (member? company? last
   visit?) → vehicle size (car, SUV, van, motorcycle) → package + add-ons → optional damage photos + signature → ticket
   printed / sent by WhatsApp. Target: **under 30 seconds**.
2. **Tableau des pistes (lanes board)**: columns *En attente · Lavage · Finition · Prêt · Récupéré*, cards with plate,
   package, washer(s), timer and target time; drag or tap to move; on a phone and on a TV.
3. **Écran de salle (TV)**: existing waiting-room screen: "AB-123 → prêt", estimated wait.
4. **Caisse**: quick receipt (80 mm thermal printer), cash/card/D17/Flouci/subscription, tips, daily close (Z).
5. **Laveurs (washers)**: cars per washer today, commission, tips, ranking.
6. **Abonnés & fidélité**: members, plans, renewals, points.
7. **Contrats entreprises**: companies, vehicles, washes done, monthly invoice.
8. **Produits**: chemicals stock, consumption per wash, cost per car, low-stock alert.
9. **Tableau de bord lavage**: cars today/hour, average ticket, best packages, members, washer performance, revenue.

**Small workshop (simple mode)**
1. **Aujourd'hui**: cars in, to finish, ready, to collect payment.
2. **Ordre rapide**: plate → problem → lines (labour, parts, packages) → total → quote by WhatsApp → invoice.
3. **Véhicules / Clients**, **Stock simple** ("j'ai reçu ces pièces"), **Caisse**, **Rappels** (next oil change).

**Both together**
- One client file: washes and repairs in the same history.
- At wash check-in: "Vidange due in 800 km" / "visite technique next month" → one-tap offer.
- In the workshop: "Add a wash?" before delivery.

---

## 4. Data to add (summary)

| Data | Content |
|---|---|
| Module settings | Which modules/options are on, per client (later per branch) |
| Wash catalogue | Packages, add-ons, price per vehicle size, duration, products used, commission rule |
| Wash ticket | Plate/vehicle, client/member/company, package + add-ons, lane/bay, washer(s), times per step, photos, signature, payment, tip |
| Lanes/bays | Name, type (hand, tunnel, detailing), capacity, opening hours |
| Washer commission | Rule per package (fixed, %), split between washers, tips, period statement |
| Loyalty | Points or stamp card rules, rewards, balance per client |
| Subscription | Plan (washes per month or unlimited, vehicle sizes, plates covered), price, start/renewal, payment, usage |
| Company contract | Company, vehicles, agreed prices, monthly invoice, washes signed by driver |
| Product consumption | Product, quantity per package, actual stock movements, cost per wash |
| Tunnel | Programs, machine counter, tokens/codes, optional controller link |
| Detailing | Booking slot, steps, before/after photos, coating warranty and check-up dates |
| Mobile job | Address/GPS, route order, van supplies, payment link |

---

## 5. Hardware (all optional)

- Tablet at the entrance (any Android tablet), phones for washers.
- 80 mm thermal receipt printer (Wi-Fi/Bluetooth/USB) and cash drawer.
- TV with a browser for the lanes/waiting screen.
- Later: plate-recognition camera (ANPR/LPR) at the entrance.
- Offline: works on the garage hub PC when internet is down (existing).

---

## 6. Build phases

| Phase | Content | Prompts |
|---|---|---|
| **1. MVP** | Module switches + simple mode, wash catalogue, quick check-in, lanes board, quick receipt and cash drawer, WhatsApp "ready", small-workshop quick order | W0–W4, W14 |
| **2. Extras** | Damage photos, washer commission and tips, loyalty and subscriptions, company contracts, product consumption | W5–W10 |
| **3. Other wash types** | Tunnel/rollover, detailing/ceramic, mobile washing | W11–W13 |
| **4. Together and smart** | Dashboard, wash + workshop cross-selling, plate camera | W15, W16 |

Before phase 1, do the reliability prompts A1–A7 of `For Add/prompts/PROMPTS.md` (especially A1: sync of payment totals, used by
the cash drawer). G2/G3 of `For Add/prompts/PROMPTS-2.md` (line types, workshop profiles) help but are not required: W0 adds the
module switches itself.

---

## 7. Points to decide later

- Exact prices and plans after testing with 3–5 real car washes and workshops.
- Which thermal printer models to support first.
- Tunnel machine brands used in Tunisia (for controller integration).
- Whether washers get their own login or just a PIN on a shared tablet.
- Trademark check of the name "GaragePro" before selling abroad.
