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
| [ ] | 23 | **S1** Setup wizard, help centre and training | `23-S1-Setup-wizard-help-centre-and-training.txt` |
| [ ] | 24 | **S2** Accessibility and field usability | `24-S2-Accessibility-and-field-usability.txt` |
| [ ] | 25 | **S3** Usage statistics (privacy-friendly) | `25-S3-Usage-statistics-privacy-friendly.txt` |
| [ ] | 26 | **S4** Backup and restore per garage | `26-S4-Backup-and-restore-per-garage.txt` |
| [ ] | 27 | **S5** Load and cost test | `27-S5-Load-and-cost-test.txt` |
| [ ] | 28 | **S6** Status page, incidents and service commitments | `28-S6-Status-page-incidents-and-service-commitments.txt` |
| [ ] | 29 | **S7** Security audit before selling | `29-S7-Security-audit-before-selling.txt` |
| | | ➡ **Start the pilot with 5–10 real garages / car washes** | |
| [ ] | 30 | **T1** TTN El Fatoora e-invoicing (replaces PROMPTS.md D1) | `30-T1-TTN-El-Fatoora-e-invoicing-replaces-PROMPTS-m.txt` |
| [ ] | 31 | **T2** Cash, instalments and bills of exchange (after the cheque reform) | `31-T2-Cash-instalments-and-bills-of-exchange-after-.txt` |
| [ ] | 32 | **T6** WhatsApp-first communication (Tunisia) | `32-T6-WhatsApp-first-communication-Tunisia.txt` |
| [ ] | 33 | **T3** Insurance claims with FTUSA e-Constat | `33-T3-Insurance-claims-with-FTUSA-e-Constat.txt` |
| [ ] | 34 | **T4** Technical inspection ("visite technique" ATTT) | `34-T4-Technical-inspection-visite-technique-ATTT.txt` |
| [ ] | 35 | **T5** Part origin and condition on every line | `35-T5-Part-origin-and-condition-on-every-line.txt` |
| [ ] | 36 | **B1** Global search bar (Ctrl+K) | `36-B1-Global-search-bar-Ctrl-K.txt` |
| [ ] | 37 | **B2** Shorter desktop menus by role | `37-B2-Shorter-desktop-menus-by-role.txt` |
| [ ] | 38 | **B3** Work-order page in tabs | `38-B3-Work-order-page-in-tabs.txt` |
| [ ] | 39 | **B4** Labour-time catalogue | `39-B4-Labour-time-catalogue.txt` |
| [ ] | 40 | **B5** Plate and VIN reading from a photo, VIN decoding | `40-B5-Plate-and-VIN-reading-from-a-photo-VIN-decodi.txt` |
| [ ] | 41 | **C1** Online payment | `41-C1-Online-payment.txt` |
| [ ] | 42 | **C2** Client language and WhatsApp templates | `42-C2-Client-language-and-WhatsApp-templates.txt` |
| [ ] | 43 | **C3** Client account | `43-C3-Client-account.txt` |
| [ ] | 44 | **C4** Google review requests | `44-C4-Google-review-requests.txt` |
| [ ] | 45 | **C6** Video and photo explanation on the quote | `45-C6-Video-and-photo-explanation-on-the-quote.txt` |
| [ ] | 46 | **W5** Damage photos on arrival | `46-W5-Damage-photos-on-arrival.txt` |
| [ ] | 47 | **W6** Washer commission | `47-W6-Washer-commission.txt` |
| [ ] | 48 | **W7** Tips | `48-W7-Tips.txt` |
| [ ] | 49 | **W8** Loyalty and subscriptions | `49-W8-Loyalty-and-subscriptions.txt` |
| [ ] | 50 | **W9** Company contracts | `50-W9-Company-contracts.txt` |
| [ ] | 51 | **W10** Product consumption and cost per wash | `51-W10-Product-consumption-and-cost-per-wash.txt` |
| [ ] | 52 | **G1** Vehicle becomes a general "asset" | `52-G1-Vehicle-becomes-a-general-asset.txt` |
| [ ] | 53 | **G2** More line types | `53-G2-More-line-types.txt` |
| [ ] | 54 | **G3** Workshop profiles (statuses per type of business) | `54-G3-Workshop-profiles-statuses-per-type-of-busine.txt` |
| [ ] | 55 | **G4** Country packs | `55-G4-Country-packs.txt` |
| [ ] | 56 | **V1** Body and paint | `56-V1-Body-and-paint.txt` |
| [ ] | 57 | **V2** Quick service lane | `57-V2-Quick-service-lane.txt` |
| [ ] | 58 | **V3** Fleet and in-house workshop mode | `58-V3-Fleet-and-in-house-workshop-mode.txt` |
| [ ] | 59 | **V4** Mobile mechanics and towing | `59-V4-Mobile-mechanics-and-towing.txt` |
| [ ] | 60 | **V5** Tyre centre data | `60-V5-Tyre-centre-data.txt` |
| [ ] | 61 | **V6** EV and high-voltage safety | `61-V6-EV-and-high-voltage-safety.txt` |
| [ ] | 62 | **V7** Detailing and car wash | `62-V7-Detailing-and-car-wash.txt` |
| [ ] | 63 | **V8** Repair data and parts sourcing integrations | `63-V8-Repair-data-and-parts-sourcing-integrations.txt` |
| [ ] | 64 | **B6** Tyre storage ("hôtel de pneus") | `64-B6-Tyre-storage-h-tel-de-pneus.txt` |
| [ ] | 65 | **B7** Loaner cars | `65-B7-Loaner-cars.txt` |
| [ ] | 66 | **W11** Automatic tunnel / rollover | `66-W11-Automatic-tunnel-rollover.txt` |
| [ ] | 67 | **W12** Detailing and ceramic | `67-W12-Detailing-and-ceramic.txt` |
| [ ] | 68 | **W13** Mobile washing | `68-W13-Mobile-washing.txt` |
| [ ] | 69 | **W15** Dashboard and reports for car wash | `69-W15-Dashboard-and-reports-for-car-wash.txt` |
| [ ] | 70 | **W16** Wash + workshop together, and plate camera | `70-W16-Wash-workshop-together-and-plate-camera.txt` |
| [ ] | 71 | **B8** Accounting export | `71-B8-Accounting-export.txt` |
| [ ] | 72 | **C5** Loyalty and prepaid maintenance plans | `72-C5-Loyalty-and-prepaid-maintenance-plans.txt` |
| [ ] | 73 | **D2** Insurance claim file | `73-D2-Insurance-claim-file.txt` |
| [ ] | 74 | **D3** Parts catalogue and supplier prices | `74-D3-Parts-catalogue-and-supplier-prices.txt` |
| [ ] | 75 | **D4** Satisfaction dashboard | `75-D4-Satisfaction-dashboard.txt` |
| [ ] | 76 | **D6** Instant updates instead of 4-second polling | `76-D6-Instant-updates-instead-of-4-second-polling.txt` |
| [ ] | 77 | **D7** Install on macOS/Linux and a single login | `77-D7-Install-on-macOS-Linux-and-a-single-login.txt` |
| [ ] | 78 | **MG9** Multi-garage hub per branch | `78-MG9-Multi-garage-hub-per-branch.txt` |
| [ ] | 79 | **X1** AI receptionist (WhatsApp and phone) | `79-X1-AI-receptionist-WhatsApp-and-phone.txt` |
| [ ] | 80 | **X2** International e-invoicing adapter | `80-X2-International-e-invoicing-adapter.txt` |
| [ ] | 81 | **X3** Regional payment providers | `81-X3-Regional-payment-providers.txt` |
| [ ] | 82 | **P1** Connected-car pilot: OBD dongle with SIM (10 cars) | `82-P1-Connected-car-pilot-OBD-dongle-with-SIM-10-ca.txt` |

File 82 (P1) is optional: only if you decide to test connected cars (see research/reports).

After the pilot (file 29) you may change the order according to customer feedback.
