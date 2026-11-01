# Prompts to send, in order

Each `.txt` file is **one complete message**: preamble + prompt (+ the car-wash line when needed).
For each file: open it → **Ctrl+A, Ctrl+C** → new Claude Code conversation → **paste, Enter** → read the plan → "OK" → test → merge → `npm run db:cloud` if the database changed → tick the file below → next file.

One file = one new conversation. Never two files in the same conversation. Never start a file before the previous one is merged.

| ✅ | # | Prompt | File |
|---|---|---|---|
| [ ] | 1 | **A1** Offline sync: never lose stock or payment totals | `01-A1-Offline-sync-never-lose-stock-or-payment-tota.txt` |
| [ ] | 2 | **A2** Browser security headers | `02-A2-Browser-security-headers.txt` |
| [ ] | 3 | **A3** Error monitoring and alerts | `03-A3-Error-monitoring-and-alerts.txt` |
| [ ] | 4 | **A4** End-to-end tests of the main flows | `04-A4-End-to-end-tests-of-the-main-flows.txt` |
| [ ] | 5 | **A5** Audit #10: mechanics must not see prices and margins | `05-A5-Audit-10-mechanics-must-not-see-prices-and-ma.txt` |
| [ ] | 6 | **A6** Audit #5/#6: no duplicate open order, no double check-in | `06-A6-Audit-5-6-no-duplicate-open-order-no-double-c.txt` |
| [ ] | 7 | **A7** Audit #29: custom access after a role change | `07-A7-Audit-29-custom-access-after-a-role-change.txt` |
| [ ] | 8 | **MG0** Multi-garage Phase 0 proposal | `08-MG0-Multi-garage-Phase-0-proposal.txt` |
| [ ] | 9 | **W0** Module switches and simple mode | `09-W0-Module-switches-and-simple-mode.txt` |
| [ ] | 10 | **MG1** Multi-garage tenant tables and garage 1 | `10-MG1-Multi-garage-tenant-tables-and-garage-1.txt` |
| [ ] | 11 | **MG2** Multi-garage scoping and isolation tests | `11-MG2-Multi-garage-scoping-and-isolation-tests.txt` |
| [ ] | 12 | **MG3** Multi-garage branches and numbering | `12-MG3-Multi-garage-branches-and-numbering.txt` |
| [ ] | 13 | **MG4** Multi-garage shared clients vehicles settings | `13-MG4-Multi-garage-shared-clients-vehicles-settings.txt` |
| [ ] | 14 | **MG5** Multi-garage stock transfers | `14-MG5-Multi-garage-stock-transfers.txt` |
| [ ] | 15 | **MG6** Multi-garage combined reports | `15-MG6-Multi-garage-combined-reports.txt` |
| [ ] | 16 | **MG7** Multi-garage subdomains and branding | `16-MG7-Multi-garage-subdomains-and-branding.txt` |
| [ ] | 17 | **MG8** Multi-garage signup plans subscriptions | `17-MG8-Multi-garage-signup-plans-subscriptions.txt` |
| [ ] | 18 | **W1** Wash catalogue (packages, add-ons, vehicle sizes) | `18-W1-Wash-catalogue-packages-add-ons-vehicle-sizes.txt` |
| [ ] | 19 | **W2** Quick wash check-in and ticket | `19-W2-Quick-wash-check-in-and-ticket.txt` |
| [ ] | 20 | **W3** Lanes board and "car ready" | `20-W3-Lanes-board-and-car-ready.txt` |
| [ ] | 21 | **W4** Quick receipt and cash drawer | `21-W4-Quick-receipt-and-cash-drawer.txt` |
| [ ] | 22 | **W14** Small workshop quick order (simple mode) | `22-W14-Small-workshop-quick-order-simple-mode.txt` |
| | | ➡ **Start the pilot with 5–10 real garages / car washes** | |
| [ ] | 23 | **T1** TTN El Fatoora e-invoicing (replaces PROMPTS.md D1) | `23-T1-TTN-El-Fatoora-e-invoicing-replaces-PROMPTS-m.txt` |
| [ ] | 24 | **T2** Cash, instalments and bills of exchange (after the cheque reform) | `24-T2-Cash-instalments-and-bills-of-exchange-after-.txt` |
| [ ] | 25 | **T6** WhatsApp-first communication (Tunisia) | `25-T6-WhatsApp-first-communication-Tunisia.txt` |
| [ ] | 26 | **T3** Insurance claims with FTUSA e-Constat | `26-T3-Insurance-claims-with-FTUSA-e-Constat.txt` |
| [ ] | 27 | **T4** Technical inspection ("visite technique" ATTT) | `27-T4-Technical-inspection-visite-technique-ATTT.txt` |
| [ ] | 28 | **T5** Part origin and condition on every line | `28-T5-Part-origin-and-condition-on-every-line.txt` |
| [ ] | 29 | **B1** Global search bar (Ctrl+K) | `29-B1-Global-search-bar-Ctrl-K.txt` |
| [ ] | 30 | **B2** Shorter desktop menus by role | `30-B2-Shorter-desktop-menus-by-role.txt` |
| [ ] | 31 | **B3** Work-order page in tabs | `31-B3-Work-order-page-in-tabs.txt` |
| [ ] | 32 | **B4** Labour-time catalogue | `32-B4-Labour-time-catalogue.txt` |
| [ ] | 33 | **B5** Plate and VIN reading from a photo, VIN decoding | `33-B5-Plate-and-VIN-reading-from-a-photo-VIN-decodi.txt` |
| [ ] | 34 | **C1** Online payment | `34-C1-Online-payment.txt` |
| [ ] | 35 | **C2** Client language and WhatsApp templates | `35-C2-Client-language-and-WhatsApp-templates.txt` |
| [ ] | 36 | **C3** Client account | `36-C3-Client-account.txt` |
| [ ] | 37 | **C4** Google review requests | `37-C4-Google-review-requests.txt` |
| [ ] | 38 | **C6** Video and photo explanation on the quote | `38-C6-Video-and-photo-explanation-on-the-quote.txt` |
| [ ] | 39 | **W5** Damage photos on arrival | `39-W5-Damage-photos-on-arrival.txt` |
| [ ] | 40 | **W6** Washer commission | `40-W6-Washer-commission.txt` |
| [ ] | 41 | **W7** Tips | `41-W7-Tips.txt` |
| [ ] | 42 | **W8** Loyalty and subscriptions | `42-W8-Loyalty-and-subscriptions.txt` |
| [ ] | 43 | **W9** Company contracts | `43-W9-Company-contracts.txt` |
| [ ] | 44 | **W10** Product consumption and cost per wash | `44-W10-Product-consumption-and-cost-per-wash.txt` |
| [ ] | 45 | **G1** Vehicle becomes a general "asset" | `45-G1-Vehicle-becomes-a-general-asset.txt` |
| [ ] | 46 | **G2** More line types | `46-G2-More-line-types.txt` |
| [ ] | 47 | **G3** Workshop profiles (statuses per type of business) | `47-G3-Workshop-profiles-statuses-per-type-of-busine.txt` |
| [ ] | 48 | **G4** Country packs | `48-G4-Country-packs.txt` |
| [ ] | 49 | **V1** Body and paint | `49-V1-Body-and-paint.txt` |
| [ ] | 50 | **V2** Quick service lane | `50-V2-Quick-service-lane.txt` |
| [ ] | 51 | **V3** Fleet and in-house workshop mode | `51-V3-Fleet-and-in-house-workshop-mode.txt` |
| [ ] | 52 | **V4** Mobile mechanics and towing | `52-V4-Mobile-mechanics-and-towing.txt` |
| [ ] | 53 | **V5** Tyre centre data | `53-V5-Tyre-centre-data.txt` |
| [ ] | 54 | **V6** EV and high-voltage safety | `54-V6-EV-and-high-voltage-safety.txt` |
| [ ] | 55 | **V7** Detailing and car wash | `55-V7-Detailing-and-car-wash.txt` |
| [ ] | 56 | **V8** Repair data and parts sourcing integrations | `56-V8-Repair-data-and-parts-sourcing-integrations.txt` |
| [ ] | 57 | **B6** Tyre storage ("hôtel de pneus") | `57-B6-Tyre-storage-h-tel-de-pneus.txt` |
| [ ] | 58 | **B7** Loaner cars | `58-B7-Loaner-cars.txt` |
| [ ] | 59 | **W11** Automatic tunnel / rollover | `59-W11-Automatic-tunnel-rollover.txt` |
| [ ] | 60 | **W12** Detailing and ceramic | `60-W12-Detailing-and-ceramic.txt` |
| [ ] | 61 | **W13** Mobile washing | `61-W13-Mobile-washing.txt` |
| [ ] | 62 | **W15** Dashboard and reports for car wash | `62-W15-Dashboard-and-reports-for-car-wash.txt` |
| [ ] | 63 | **W16** Wash + workshop together, and plate camera | `63-W16-Wash-workshop-together-and-plate-camera.txt` |
| [ ] | 64 | **B8** Accounting export | `64-B8-Accounting-export.txt` |
| [ ] | 65 | **C5** Loyalty and prepaid maintenance plans | `65-C5-Loyalty-and-prepaid-maintenance-plans.txt` |
| [ ] | 66 | **D2** Insurance claim file | `66-D2-Insurance-claim-file.txt` |
| [ ] | 67 | **D3** Parts catalogue and supplier prices | `67-D3-Parts-catalogue-and-supplier-prices.txt` |
| [ ] | 68 | **D4** Satisfaction dashboard | `68-D4-Satisfaction-dashboard.txt` |
| [ ] | 69 | **D6** Instant updates instead of 4-second polling | `69-D6-Instant-updates-instead-of-4-second-polling.txt` |
| [ ] | 70 | **D7** Install on macOS/Linux and a single login | `70-D7-Install-on-macOS-Linux-and-a-single-login.txt` |
| [ ] | 71 | **MG9** Multi-garage hub per branch | `71-MG9-Multi-garage-hub-per-branch.txt` |
| [ ] | 72 | **X1** AI receptionist (WhatsApp and phone) | `72-X1-AI-receptionist-WhatsApp-and-phone.txt` |
| [ ] | 73 | **X2** International e-invoicing adapter | `73-X2-International-e-invoicing-adapter.txt` |
| [ ] | 74 | **X3** Regional payment providers | `74-X3-Regional-payment-providers.txt` |

After the pilot (file 22) you may change the order according to customer feedback.
