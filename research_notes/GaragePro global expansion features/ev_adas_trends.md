# EV/Hybrid, ADAS, Connected-Vehicle Requirements and Shop-Software Technology Trends (2025-2026)

Research date: 2026-11-01. 15 tool calls (search-heavy). Note: iea.org could not be fetched (host blocked in this session's network settings), so IEA figures come from search snippets and press coverage of the Global EV Outlook 2026, not the report itself.

## 1. EV/hybrid high-voltage safety: qualifications, isolation, quarantine, battery SoH, battery passport

### Takeaway
Germany's DGUV Information 209-093 (2023 edition) and the UK IMI levels both define tiered HV qualifications: awareness, then de-energised work, then live work. A GMS therefore needs a per-technician qualification register and job-level gating ("only Level 2S/IMI L3+ may de-energise"). Damaged EVs need a quarantine workflow with logged isolation and release decisions. The EU battery passport (18 Feb 2027) adds a dynamic state-of-health and repair-history record, but who may read and write it is still unsettled.

### Cited Findings
**Germany: DGUV 209-093 levels**
- The current edition (June 2023) of DGUV Information 209-093, "Qualification for work on vehicles with high-voltage systems", brought in a new level model that covers both battery electric vehicles and the service sector. An English edition is available (webcode p209093e). — [DGUV publication (EN)](https://publikationen.dguv.de/regelwerk/dguv-informationen/4727/training-for-work-on-vehicles-with-high-voltage-systems); [DGUV (DE)](https://publikationen.dguv.de/regelwerk/dguv-informationen/3982/qualifizierung-fuer-arbeiten-an-fahrzeugen-mit-hochvoltsystemen)
- Level labels in training-provider material: S (instructed/awareness), 1S (non-electrical work on HV vehicles), 2S (electrotechnical work after disconnecting voltage: the "Fachkundige Person Hochvolt", FHV), 3S (work on live HV components or non-intrinsically-safe vehicles). DGUV German pages also refer to "Stufe 2S, 2E oder höher" (2E appears to be a parallel development/production track). — [Search summary of DGUV and provider pages](https://publikationen.dguv.de/DguvWebcode/index/query/p209093); [TÜV SÜD Level 2 course](https://www.tuvsud.com/en-gb/store/academy-gb/training-sectors/high-voltage/13-153-23-0001)
- Level 2S training prepares staff to de-energise the vehicle, secure it against reconnection and verify zero voltage. These are the classic isolation steps a GMS could checklist. — [EDAG Akademie](https://akademie.edag.com/?p=5719)
- TÜV SÜD's Level 2 (FHV) course runs 4 days. — [TÜV SÜD](https://www.tuvsud.com/en-gb/store/academy-gb/training-sectors/high-voltage/13-153-23-0001)
- Older sources such as a 2021 ZF blog describe a 3-level model from the 2021 edition, which is now outdated. — [ZF Aftermarket](https://aftermarket.zf.com/en/aftermarket-portal/whats-new/expert-blog/become-hv-expert/)

**UK: IMI levels and TechSafe**
- The IMI has four EV levels. Level 1 is awareness (about 1 day). Level 2 covers making the HV system safe and working on the LV side. Level 3 covers diagnosis and work on HV systems with the power off. Level 4 covers live HV work. Levels 2-4 take about 2 days each for an experienced technician. — [PMM Online](https://pmmonline.co.uk/article/what-training-do-you-need-to-work-on-evs/); [batterydesign.net](https://www.batterydesign.net/ev-and-hybrid-qualifications/)
- Technicians with Level 2 or higher can join the IMI Professional Register and get IMI TechSafe recognition, which carries mandatory CPD. The register is publicly searchable, which opens a possible integration or verification point. — [PMM Online](https://pmmonline.co.uk/?p=32512); [IMI register example](https://tide.theimi.org.uk/member-register/person/20221000183)
- No UK law mandates EV qualification, but industry guidance says technicians must hold at least Level 2. — [PMM Online](https://pmmonline.co.uk/article/what-training-do-you-need-to-work-on-evs/)

**Damaged EV quarantine and records**
- The German fire-service association vfdb's leaflet on "technical quarantine" describes a paved outdoor parking space, no ignition sources, marking of the vehicle and area, and collection trays for leaking coolant. Its stated aim is to stop a delayed fire spreading, not to prevent it. — [vfdb MB 06-10](https://www.vfdb.de/media/doc/merkblaetter/MB_06-10_Technical_quarantine.pdf)
- A vendor page says manufacturer-directed monitoring of a quarantined EV typically lasts 24-72 hours (vendor claim). — [Tecpro Q-Container](https://tecpro.com.au/product/electric-vehicle-quarantine-container)
- WorkSafeBC warns that damaged batteries can reignite long after a fire is put out, and names auto repair and body shop workers as at-risk. — [WorkSafeBC](https://www.worksafebc.com/en/resources/health-safety/risk-advisory/fire-explosion-and-contact-with-electricity-in-damaged-electric-vehicles?lang=en)
- A commercial "EV collision intake and quarantine log" template records intake, isolation, battery condition, thermal checks, PPE, release decisions, and who was notified (management, fire department, OEM). This shows the record structure the market expects. It is not an official standard. — [MangoApps template](https://www.mangoapps.com/templates/inspections/ev-collision-intake-and-quarantine-log)

**EU battery passport (Regulation 2023/1542)**
- The passport becomes mandatory on 18 February 2027 for EV batteries, LMT batteries and industrial batteries above 2 kWh. Each battery needs a QR code linked to an electronic record. — [Messe Frankfurt/Automechanika](https://automotive.messefrankfurt.com/global/en/news-insights/industry-insights/european-battery-passport.html); [Automotive IQ](https://www.automotive-iq.com/electrics-electronics/articles/eu-battery-passport-explained-requirements-timeline-and-compliance-steps-to-2027)
- State of health and cycle count are dynamic fields, so the passport is not a one-time manufacturing record. Repair, replacement and dismantling information and maintenance/repair history updates are in scope. — [battery-tech.net](https://battery-tech.net/the-eu-battery-passport-belongs-to-whoever-finishes-the-battery-four-months-before-it-becomes-mandatory/); [elevenes](https://elevenes.com/news/the-eu-battery-passport-what-it-requires-who-benefits-who-pays/)
- Conflict: one source claims Regulation (EU) 2025/1561 postponed an obligation to 18 August 2027, yet still states that the passport date stays 18 Feb 2027. Another says no simplification package moves the Feb 2027 date. Unresolved; check the Official Journal. — [elevenes](https://elevenes.com/?p=3288); [battery-tech.net](https://battery-tech.net/the-eu-battery-passport-belongs-to-whoever-finishes-the-battery-four-months-before-it-becomes-mandatory/)
- EV Clinic (an independent EV battery repairer) has publicly discussed the passport's opportunities, limits and problems for independent workshops and body shops. — [SicurAUTO](https://www.sicurauto.it/b2b-auto-flotte/battery-passport-opportunita-limiti-e-criticita-per-officine-e-carrozzerie-secondo-ev-clinic/)
- Test-equipment makers such as Midtronics are positioning battery diagnostics around the digital passport. — [Midtronics blog](https://www.midtronics.com/blog/digital-battery-passport/)

### Inferences
- GMS requirements: (a) technician qualification register (scheme, level, issuer, certificate number, expiry/CPD date, document upload); (b) job/labour-operation tags such as "HV-de-energise" or "HV-live", with assignment blocked unless the technician's level qualifies; (c) a digital HV isolation checklist (de-energise, secure against reconnection, verify absence of voltage, signage) with timestamp, signature and second-person check; (d) a quarantine-bay resource with an intake/monitoring/release log; (e) a battery SoH report attached to the vehicle record and shareable with the customer (used-EV sales and insurance value).
- Battery passport: plan a field for the passport identifier/QR on the vehicle record and a repair-event record ready for export. Do not promise passport write access before the access-rights acts are final.
- Tunisia/MENA have no equivalent to DGUV/IMI that I could find. A configurable "qualification scheme" table is safer than hard-coding UK/German levels.

### Gaps
- Exact DGUV 2023 level definitions (1S/2S/2E/3S/3E and their prerequisites) were not read from the primary PDF, only via search snippets.
- ISO/IEC standards applicable to workshops (e.g. ISO 6469-3, EN 50110) and any EU-wide technician qualification standard: not researched for lack of calls.
- Battery repair vs replacement economics, SoH test standards (e.g. SAE J2288/J1798 or OEM tools), and charger (EVSE) installation rules for workshops: not found.
- Who gets read/write access to battery-passport fields (independent repairers vs economic operators): unresolved.

## 2. ADAS calibration: triggers, static vs dynamic, documentation, liability, OEM position statements

### Takeaway
OEM position statements are tightening. Ford/Lincoln and GM now require pre- and post-repair scans and calibration of every affected ADAS component. Insurers (e.g. State Farm) demand calibration reports. Liability exposure from skipped calibrations runs into six figures or more. A GMS must therefore link OEM triggers to the job, record pre-scan, calibration (type, target, result) and post-scan, and attach the reports.

### Cited Findings
- Ford's refreshed position statement reportedly requires pre- and post-repair diagnostic scans, calibration of every affected ADAS component, and genuine OE parts for ADAS-related collision work. Ford disclaims responsibility for outcomes from non-approved parts or procedures. GM tightened its statements in the same way. — [Autobody News](https://www.autobodynews.com/news/ford-lincoln-and-gm-tighten-adas-repair-standards-in-refreshed-position-statements)
- GM's windshield statement calls for GM Genuine glass and proper calibration after windshield replacement. GM's scanning statement says any work that disrupts battery voltage or electrical circuits warrants a follow-up scan. — [Autobody News](https://www.autobodynews.com/news/ford-lincoln-and-gm-tighten-adas-repair-standards-in-refreshed-position-statements); [I-CAR RTS calibration after windshield replacement](https://rts.i-car.com/collision-repair-news/crn-801.html)
- I-CAR RTS keeps an ADAS/calibration/scanning hub and OEM-by-OEM ADAS pages (e.g. Infiniti), which a GMS could deep-link per make. — [I-CAR RTS hotspot](https://rts.i-car.com/crn-1022.html); [Infiniti ADAS](https://rts.i-car.com/oem-information/infiniti/infiniti-adas.html)
- I-CAR notes that even a one-degree misalignment can cause ADAS failure, which makes alignment and suspension work a calibration trigger. — [I-CAR CRN-730](https://rts.i-car.com/collision-repair-news/crn-730.html)
- Recommended workflow: pre-scan (captures pre-existing faults and sensor data), functional test, post-scan (confirms no new DTCs and that module programming is intact). Reports should show which calibrations were performed with before/after results. — [Caradas guide to OEM position statements](https://caradas.com/how-important-are-oem-position-statements-a-guide-to-adas-calibration-position-statements/)
- Liability: one analyst puts the average lawsuit or settlement for a skipped calibration at $200,000 to $1M+. Insurers consult OEM guidelines when deciding coverage. — [Autobody News](https://www.autobodynews.com/news/preventing-common-adas-failures-can-save-shops-millions-in-liability-costs-analyst-says)
- In February 2025, State Farm asked glass-program shops to provide failed-recalibration reports before approving OEM glass. — [Repairer Driven News](https://www.repairerdrivennews.com/2025/02/25/state-farm-asks-glass-program-shops-to-provide-failed-recalibration-reports-before-oem-glass-approval/)
- New US state laws on windshield replacement require claim numbers and calibration to manufacturer specs (consumer and anti-fraud protection). — [Search result summary of AGRR/industry coverage](https://www.bodyshopbusiness.com/no-matter-if-you-provide-in-house-adas-calibrations-or-sublet-the-bar-for-entry-into-this-field-keeps-changing/)
- Vehicles with sensors away from the windscreen (e.g. grille radar) may not need camera calibration after glass-only work, but a scan is still advised. Triggers are vehicle-specific. — [tpautorepair (shop blog, lower authority)](https://tpautorepair.net/do-you-need-to-calibrate-sensors-after-replacing-a-windshield/)
- Subaru has long advised technicians to send owners back to their insurer, with a copy of the position statement, when aftermarket glass is covered. — [AGRR 2017](https://agrr.mydigitalpublication.com/articles/calibration-clash)
- Calibration is often sublet. Equipment vendors (Hunter ADASLink) bundle gateway access with calibration tools. — [BodyShop Business](https://www.bodyshopbusiness.com/no-matter-if-you-provide-in-house-adas-calibrations-or-sublet-the-bar-for-entry-into-this-field-keeps-changing/); [Hunter ADASLink](https://www.hunter.com/adaslink-gateway)

### Inferences
- GMS features: an "ADAS-equipped" flag and sensor inventory per vehicle (VIN decode); a rules engine that adds a calibration line when an estimate contains a trigger operation (windscreen R&R, bumper/grille/mirror R&R, alignment, ride-height or suspension change, airbag or collision repair, battery disconnect); fields for calibration type (static/dynamic/both), target and equipment ID, technician, result, and road-test notes; mandatory upload of pre/post scan and calibration PDFs before invoice close; a customer-declined-calibration waiver with signature (liability shield); sublet tracking for calibration specialists.
- Version-stamp the OEM position statement in force on the repair date (link plus retrieval date) for liability defence.

### Gaps
- European OEM position statements (VW, Stellantis, Renault) and EU-specific ADAS documentation rules (e.g. any GSR2-related workshop obligations) were not found.
- No authoritative static vs dynamic matrix by OEM was retrieved. I-CAR RTS and OEM portals are the sources to integrate.

## 3. OEM secure gateway access, SERMI (EU) and NASTF (US)

### Takeaway
Security-related functions (key/immobiliser programming, some gateway-locked writes) now require personal and company credentials: SERMI in the EU (mandatory in Italy since 1 Feb 2025, UK go-live announced for 1 April 2026), NASTF VSP/SDRM in the US, plus per-OEM gateway subscriptions (Stellantis via AutoAuth, VW/Audi SFD, Mercedes). Workshops need to record who performed each security-related action, under which credential, on which VIN. OEM and SERMI audits expect that traceability.

### Cited Findings
- SERMI's legal basis is Regulation (EC) 692/2008, later Regulation (EU) 2017/1151/1152. It is a European accreditation scheme for independent operators' access to security-related RMI, with accredited conformity assessment bodies. — [ILAC](https://ilac.org/latest_ilac_news/sermi-scheme-a-european-accreditation-scheme-for-access-to-safety-information-for-vehicle-repair-and-maintenance); [Bureau Veritas](https://certification.bureauveritas.com/magazine/how-sermi-certification-impacts-vehicle-and-passenger-safety)
- Italy made SERMI mandatory from 1 February 2025. RINA, DEKRA, KIWA and Bureau Veritas Italia are accredited CABs there. — [SicurAUTO](https://www.sicurauto.it/b2b-auto-flotte/sermi-bureau-veritas-dekra-e-kiwa-i-nuovi-cab-italiani/)
- UK: the IGA said SERMI would go live in the UK on 1 April 2026, backed by 22 manufacturers. Actual go-live was not independently confirmed here. — [CAT Magazine](https://catmag.co.uk/article/sermi-goes-live-in-uk-with-backing-of-22-manufacturers); [AM Online](https://www.am-online.com/news/iga-guides-garages-ahead-of-imminent-sermi-launch); [Bodyshop Mag](https://www.bodyshopmag.com/?p=55895)
- SERMI is needed to access security-related information and to program keys and immobilisers. Approval can take from six days to a month. Critics cite cost and burden for small garages. Approved (franchise) repairers keep OEM access. — [WhoCanFixMyCar](https://www.whocanfixmycar.com/advice/everything-garages-need-to-know-about-sermi); [Insurance Edge Q&A (Repairify), Feb 2026](https://insurance-edge.net/2026/02/06/sermi-qa-by-repairify-sheds-light-on-new-regs/); [Hella Gutmann](https://www.hella-gutmann.com/en/sermi)
- SERMI uses digital identity verification of the individual technician (Digidentity is one provider). — [Digidentity SERMI](https://digidentity.eu/sermi-information)
- US: NASTF has credentialed security professionals through the Secure Data Release Model since 2007. It gives technicians and locksmiths access to security-related info, and SDRM2 launched in 2018. Massachusetts right-to-repair law recognises the SDRM for key/immobiliser work. — [NASTF](https://NASTF.org); [AftermarketNews](https://www.aftermarketnews.com/nastf-recognized-in-massachusetts-right-to-repair-law/); [MOTOR, July 2026](https://www.motor.com/2026/07/nastf-reinforces-secure-vehicle-access/)
- Stellantis/FCA has fitted a Secure Gateway Module since 2018. Aftermarket tools need FCA-certified access through AutoAuth (subscription), covering Alfa Romeo, Chrysler, Dodge, Fiat, Jeep, Maserati and RAM. Hunter says most OEMs use secure gateways, with BMW, GM and Toyota as exceptions, and that Stellantis and Nissan need a third-party AutoAuth subscription. — [Hunter ADASLink gateway](https://www.hunter.com/adaslink-gateway); [YouCanic FCA SGM](https://www.youcanic.com/fca-sgm/); [Topdon tutorial 2025](https://www.topdon.us/blogs/news/topdon-phoenix-series-secure-gateway-tutorial-2025)
- Autel (vendor claim) supports Stellantis, Nissan and Mercedes-Benz gateway access through AutoAuth, and VW/Audi SFD on compatible tablets from December 2024. — [BodyShop Business (sponsored)](https://www.bodyshopbusiness.com/autel-leads-where-it-counts-access/); [Tire Review](https://www.tirereview.com/?p=216569)
- In Europe, Stellantis requires registration and a paid subscription for gateway unlock. Renault-group brands have no plug-and-play bypass. — [Journal de l'Automobile](https://journalauto.com/constructeurs/fca-stellantis-contraint-de-deverrouiller-lacces-aux-donnees-de-ses-vehicules/); [Klavkarr](https://www.klavkarr.com/blog/56-understanding-secure-gateway); [Autobiz.ie](https://www.autobiz.ie/aftermarket/secure-gateways-are-reshaping-independent-garages)

### Inferences
- GMS needs: company-level credentials (SERMI company approval, NASTF VSP, AutoAuth/OEM portal subscriptions with expiry and renewal cost); technician-level credentials (SERMI personal ID/VSP ID, expiry); an immutable audit log for security-related operations (key programming, immobiliser, module coding, gateway unlock) with VIN, technician, credential used, timestamp and proof of customer ownership/ID checked (registration document plus ID scan). That last item is a common SERMI/NASTF expectation (inference; not verified in primary docs).
- Subscription costs for OEM portals and AutoAuth should be passable to the job as a cost line.
- Tunisia/MENA: SERMI does not apply outside the EU/UK. But EU-spec imported vehicles (common in Tunisia) carry the same gateways, so local garages depend on aftermarket tool access (inference).

### Gaps
- Exact SERMI record-keeping obligations for the workshop (e.g. retention period of ownership-check logs): not found in primary text.
- Mercedes-specific and current VW SFD terms for independents: only vendor sources.
- Software updates/OTA, flashing via J2534/Euro5 RMI portals and immobiliser specifics beyond SERMI/NASTF: not separately researched.

## 4. EV and hybrid adoption by region (EU, US, China, MENA/Tunisia)

### Takeaway
Electrification is mainstream in China (~55% of 2025 sales) and the EU (BEV 17.4%, hybrids incl. PHEV 34.5% in 2025), so EU garages already see a mostly electrified new-car mix. MENA is tiny but growing: Egypt ~7,900 and Morocco ~5,500 EVs in 2025. Tunisia had only a few hundred EV sales in 2025, but new January 2026 tax incentives roughly doubled sales in H1 2026, and charging remains the bottleneck. For Tunisia, HV features are a forward-looking differentiator, not a day-one necessity. Hybrids (HEV) are the near-term HV workload.

### Cited Findings
**Global/China (IEA GEVO 2026, via press)**
- Global EV sales rose ~20% to more than 20 million in 2025, about one quarter of new cars. The IEA projects ~23 million (~28%, "close to 30%") in 2026. — [IEA press release](https://www.iea.org/news/close-to-30-of-cars-sold-this-year-are-set-to-be-electric-as-countries-and-consumers-respond-to-energy-crisis); [Electrek](https://electrek.co/2026/05/19/iea-global-ev-sales-headed-for-another-record-year-despite-the-slowdown/)
- China: EVs were nearly 55% of car sales in 2025 and are set to approach 60% in 2026. — [Energy Digital](https://energydigital.com/news/iea-will-the-ev-market-continue-to-grow-in-2026); [IEA executive summary](https://iea.org/reports/global-ev-outlook-2026/executive-summary)
- Global EV sales fell 8% in Q1 2026 after policy changes in China and the US. Outside China, Europe and the US, 55% of EVs sold were imported from China. — [All About Industries](https://www.all-about-industries.com/e-car-sales-year-2026-worldwide-30-percent-global-ev-outlook-iea-a-b6ea7c5123829ee8e75aa6c6784e66c2/)

**EU (ACEA full-year 2025)**
- 1,880,370 BEVs registered, 17.4% share (13.6% in 2024). Hybrid-electric 34.5%. PHEV 1,015,887 units (~9.4%). Petrol plus diesel fell to 35.5% from 45.2%. Total market up 1.8%. — [ACEA](https://www.acea.auto/pc-registrations/new-car-registrations-1-8-in-2025-battery-electric-17-4-market-share/); [electrive](https://www.electrive.com/2026/01/27/eu-wide-new-electric-car-registrations-rise-by-30)
- EU+EFTA+UK: BEV 19.5%, hybrids 34.4%. — [EV Infrastructure News](https://www.evinfrastructurenews.com/ev-technology/hybrid-electric-vehicles-account-for-34-4-of-new-car-registrations-in-europe-in-2025)

**MENA**
- Egypt topped African EV sales in 2025 with nearly 7,900 units, and Morocco was second with ~5,500. — [Morocco World News, May 2026](https://www.moroccoworldnews.com/2026/05/310162/morocco-among-africas-electric-vehicle-leaders-in-sales/)
- A forecast cited by Attaqa projected Morocco EV sales growth of 80.4% in 2025 and 36.3% in 2026, with potential above 57,000 units per year eventually. — [Attaqa](https://attaqa.net/2025/11/17/%d9%85%d8%a8%d9%8a%d8%b9%d8%a7%d8%aa-%d8%a7%d9%84%d8%b3%d9%8a%d8%a7%d8%b1%d8%a7%d8%aa-%d8%a7%d9%84%d9%83%d9%87%d8%b1%d8%a8%d8%a7%d8%a6%d9%8a%d8%a9-%d9%81%d9%8a-%d8%a7%d9%84%d9%85%d8%ba%d8%b1%d8%a8/)
- Egypt's EV share is about 0.1% of new-car sales, held back by financing and FX exposure (market-research marketing page, low confidence; note the tension with the ~7,900 units above). — [Research and Markets](https://www.researchandmarkets.com/reports/5318418/middle-east-and-africa-electric-vehicle-market)
- Gulf: no reliable 2025 EV share figures found for the UAE or Saudi Arabia. Regional EV sales reportedly rose 9.5% (Focus2Move). Al Khaleej (Sept 2026) reports the UAE leads Gulf EV readiness. — [Focus2Move](https://www.focus2move.com/mena-car-market/); [Al Khaleej](https://www.alkhaleej.ae/2026-09-24/اقتصاد/الإمارات-تتصدر-أسواق-الخليج-في-الجاهزية-للتنقل-الكهربائي); [EVLife](https://evlife.world/?p=29643)

**Tunisia**
- About 570 electric cars were in circulation at the end of April 2025. — [Tunisie Numérique](https://www.tunisienumerique.com/mobilite-electrique-en-tunisie-570-voitures-electriques-en-circulation-a-fin-avril-2025/)
- Only 398 EVs were sold by authorised dealers by the end of October 2025. — [La Presse](https://www.lapresse.tn/2025/12/01/tunisie-seulement-398-voitures-electriques-vendues-jusqua-fin-octobre-2025/)
- A little over 600 EVs were sold in 2025 and about 1,100 in 2026 as of July 2026. — [La Presse, Jul 2026](https://www.lapresse.tn/2026/07/31/coupures-delectricite-bornes-hors-service-longues-files-dattente-le-calvaire-des-proprietaires-de-voitures-electriques/)
- Incentives from January 2026: full exemption from customs duties and consumption tax on EV imports, plus state coverage of part of the interest on EV purchase loans (per ANME). A target of 10,000 charging points by 2030 has been reported. — [La Presse, Apr 2026](https://www.lapresse.tn/2026/04/25/voitures-electriques-incitations-renforcees-ventes-en-hausse-et-objectif-de-10-000-bornes-dici-2030/)
- Charging is the bottleneck. A draft specification for private charger installation was blocked, and a revised version was being finalised in April 2026 to let companies and individuals invest. By July 2026, owners reported power cuts, out-of-service chargers and queues. — [La Presse, Apr 2026](https://www.lapresse.tn/2026/04/25/voitures-electriques-incitations-renforcees-ventes-en-hausse-et-objectif-de-10-000-bornes-dici-2030/); [La Presse, Jul 2026](https://www.lapresse.tn/2026/07/31/coupures-delectricite-bornes-hors-service-longues-files-dattente-le-calvaire-des-proprietaires-de-voitures-electriques/)
- Government targets: 125,000 EVs and 12,000 public chargers by 2035. An earlier target of 50,000 EVs and 5,000 chargers by 2030 is also cited. An older "50,000 EVs by 2025" plan was clearly missed. — [La Presse](https://www.lapresse.tn/?p=2618281); [African Manager](https://africanmanager.com/50-mille-vehicules-electriques-dici-2025-et-baisse-des-importations-en-carburants-de-660-mdt/)

### Inferences
- Tunisia's EV parc is around 1,500-2,500 vehicles by late 2026, estimated by summing the sources above. This is low confidence. HEVs (e.g. Toyota/Hyundai/Kia hybrids) are likely the larger HV workload, but no Tunisian hybrid figures were found.
- Because ~55% of EVs sold outside the big three markets are Chinese imports, MENA garages will need data and tooling for Chinese brands (BYD, Chery, MG, Geely), which affects VIN decoding and parts catalogues in a GMS.
- Tunisian garages could offer home-charger installation as an upsell once the private-charging specification is adopted (speculative).

### Gaps
- US 2025 EV/hybrid share: not retrieved (IEA page blocked, no US-specific result). Check Cox Automotive/Kelley Blue Book or Argonne.
- Saudi Arabia and UAE EV shares: no reliable figures.
- Tunisia hybrid sales and total vehicle parc: not found.
- Asia beyond China (India, Japan, SE Asia): not researched.

## 5. AI in shop software and other trends (subscriptions, mobile service, self-service, vehicle health records, sustainability)

### Takeaway
In 2025-2026, AI in shop software clusters around (1) AI receptionists and call answering, mostly third-party add-ons except AutoLeap's native AIR (April 2026), (2) AI estimate builders, (3) AI diagnostic assistants inside tool software (Bosch ESI[tronic] 2026/4, Bosch "Super Technician" demo at AAPEX 2025), and (4) AI review replies and marketing. Native AI in Tekmetric and Shopmonkey appears thinner than marketing suggests. That leaves room for a GMS with built-in multilingual (Arabic/French) AI.

### Cited Findings
- AutoLeap launched AIR, billed as "the first AI receptionist for auto shops", on 28 April 2026. It answers calls and books appointments into the AutoLeap calendar. — [Business Wire via Rutland Herald](https://www.rutlandherald.com/news/business/autoleap-introduces-the-first-ai-receptionist-for-auto-shops-autoleap-air/article_84045080-6662-5f1a-ab22-871c31cc5268.html)
- Aggregator claims about AutoLeap AIR: integrates with AutoLeap, Shopmonkey and RepairShopr, from $199/month (unverified). — [AIGearBase](https://aigearbase.com/tool/autoleap-air)
- Third-party AI call layers sit on top of Tekmetric, Shopmonkey and AutoLeap: ServiceAgent (launched April 2025), AgentZap (~$109/month for Tekmetric), Stormy (Shopmonkey front desk). One comparison lists 15 shop SaaS products for AI voice agents in 2026. — [ServiceAgent](https://serviceagent.ai/blogs/invoice-software-for-auto-repair-shops/); [AgentZap](https://agentzap.ai/blog/tekmetric-automation-how-agentzap-fills-the-phone-gap-for-auto-repair-shops); [Stormy](https://stormy.ai/consult/auto-repair/front-desk/shopmonkey); [Ainora comparison](https://ainora.lt/blog/ai-voice-agent-auto-service-centers-2026)
- A third-party vendor blog claims that, as of July 2026, Tekmetric ships no native AI assistant, AI estimate writer, AI inspection summariser or AI chat over repair orders, but does offer AI-written review replies. These are competitor/vendor claims and may be out of date. — [usecarly blog](https://www.usecarly.com/blog/tekmetric-ai/)
- Shopmonkey is described (secondary roundup) as offering an AI-powered estimate generator that pulls parts costs and labour rates from inventory. — [Worldmetrics](https://worldmetrics.org/best/auto-repair-management-software/)
- Bosch is adding a conversational AI assistant to ESI[tronic] in the 2026/4 update for Advanced and Master packages at no extra cost. It cross-analyses diagnostic data against OEM repair guidelines, schematics and Bosch's Experience-Based Repair database. Bosch demonstrated an AI diagnostic assistant ("Super Technician") at AAPEX in November 2025. — [S&P Global Aftermarket Insight](https://aftermarketinsight.spglobal.com/news/5506/bosch-adds-ai-assistant-to-its-diagnostic-software); [Autosphere, Jul 2026](https://autosphere.ca/mechanical/2026/07/23/bosch-augments-esitronic-diagnostic-platform-with-conversational-ai-assistant/)
- S&P Global (June 2026) has published analysis of how AI is reshaping vehicle repair. — [S&P Global Mobility blog](https://www.spglobal.com/automotive-insights/en/blogs/2026/06/how-artificial-intelligence-is-reshaping-vehicle-repair)
- Niche startups are targeting ADAS calibration compliance and documentation SaaS for independent glass shops, which signals demand for compliance records. — [liveinthefuture.org](https://liveinthefuture.org/startups/auto-glass-adas-calibration-compliance-saas.html)

### Inferences
- Priority AI features for GaragePro: (1) multilingual AI receptionist (Arabic dialect/French/English) with booking, since US vendors mostly target English; (2) AI estimate drafting from complaint text plus VIN; (3) AI summaries of DVI photos and notes into customer-friendly language; (4) DTC-to-repair assistant using the shop's own repair history; (5) compliance co-pilot (flag missing ADAS calibration or HV isolation records).
- AI-detected issues should remain technician-confirmed for liability reasons (inference).

### Gaps
- No confirmed native AI DVI photo analysis (e.g. tyre tread or brake wear from images) in Tekmetric or Shopmonkey. Vendors like Tekion, Mitchell1 and Uveye were not researched.
- Predictive maintenance from telematics/connected-car data (OEM data marketplaces, EU Data Act from Sept 2025): not researched for lack of calls.
- Subscription maintenance plans, mobile service, customer self-service portals and vehicle health record/digital-twin trends: no sources gathered.
- Sustainability reporting (waste oil, used batteries, hazardous waste tracking; EU Battery Regulation take-back obligations; Tunisian ANGed rules): no sources gathered. Requires a follow-up search.
