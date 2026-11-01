# Vertical-specific software requirements for automotive service establishments (beyond general mechanical repair)

Scope note: Research was capped at about 15 tool calls across 16 verticals, so web coverage is uneven. Each vertical below separates findings with a cited source (Cited Findings) from domain knowledge that this session did NOT verify (Inferences, marked "[unverified background]"). The report writer should treat the unverified items as hypotheses to confirm before turning them into product claims. Most cited sources are vendor pages, software directories (GetApp, Capterra, SoftwareConnect) or trade press, so feature claims are vendor claims, not independent tests. Some search results came from low-quality sources (pulserevops.com, video.pw.org, beancount.io SEO blogs). Where one of these is used, the bullet says so.

## Body & paint / collision repair

### Takeaway
Collision software is built around the insurer estimate (CCC ONE, Mitchell, Audatex/Solera, DAT, GT Motive) rather than the repair order. A collision module needs estimate import, supplement handling, DRP/insurer workflows, a production board with stage tracking, and scan/ADAS calibration tracking. Integrating with estimating systems matters more than building GaragePro's own estimator.

### Cited Findings
- CCC "Repair Workflow" is a shop management tool built into CCC's estimating software. It offers digital production boards, production schedules, checklists and reports that show where each vehicle is at every stage — [CCC Vehicle Workflow](https://cccis.com/collision-repairers/shop-management/vehicle-workflow); [CCC Repair Workflow](https://cccis.com/repair-workflow)
- CCC's production dashboard combines all of a shop's repair plans into one view of jobs on track and jobs falling behind — [CCC utilities blog](https://utilities.cccis.com/?p=3882)
- CCC Diagnostics Workflow (reported 2024) has a dashboard for managing pre/post scans and calibrations from estimate through vehicle delivery — [Repairer Driven News 2024](https://www.repairerdrivennews.com/2024/09/10/aaa-notifies-ace-mpr-members-to-use-23-line-diagnostic-entries/)
- CCC sells "DRP solutions to help you manage your insurance carrier relationships." CCC says manual supplement processing lengthens cycle time, and CCC ONE Estimate Share sends data and documents electronically for automated supplement review — [CCC DRP tag page](https://utilities.cccis.com/tag/drp/)
- CCC lets estimators identify substrate materials in part graphics, which CCC says makes estimates more accurate and reduces supplements — [CCC utilities](https://utilities.cccis.com/?p=1857)
- CCC has a tool that connects insurers to non-DRP shops — [FenderBender](https://www.fenderbender.com/running-a-shop/operations/article/33026579/new-ccc-tool-connects-insurers-to-non-drp-shops)
- CCC integrates with CSi Complete for customer satisfaction (CSI) surveys — [BodyShop Business](https://www.bodyshopbusiness.com/ccc-announces-integration-with-csi-complete/)
- CCC/Würth/AudaExplore tools were built to flag labour and materials that "fall through the cracks" on estimates — [Repairer Driven News 2016](https://www.repairerdrivennews.com/2016/06/24/it-adds-up-new-ccc-wurth-audaexplore-tools-help-flag-labor-materials-falling-through-cracks/)
- An SEO blog (low-authority) lists collision KPIs as cycle time, touch time, severity and comebacks, and lists DRP, OEM vs aftermarket/LKQ parts margins, and supplements as the core financial topics — [beancount.io collision guide (low authority)](https://beancount.io/fr/blog/2026/06/01/auto-body-collision-repair-shop-bookkeeping-drp-direct-repair-program-oem-aftermarket-lkq-parts-margins-ccc-mitchell-audatex-supplements-section-179-spray-booth-comeback-warranty-cycle-time-touch-time-severity-kpi-guide)

### Inferences
- [unverified background] Regional estimating systems: CCC ONE and Mitchell lead in the US. Audatex (Solera) leads in much of the EU, the Middle East and LatAm. DAT (SilverDAT) leads in Germany/DACH. GT Motive leads in Spain/Portugal. In MENA (including Tunisia/Maghreb), Audatex is commonly used by insurers. GaragePro should import estimates (e.g. CIECA BMS XML in the US, or each vendor's own export) rather than replace the estimator.
- [unverified background] Required data fields: insurer, claim number, policy/excess (deductible), adjuster, DRP flag, loss date, point of impact, damage photos, estimate lines (part/labour/paint/refinish hours, panel ops: R&I, R&R, repair, blend), supplement number and reason, total-loss flag, rental/courtesy-car days.
- [unverified background] Paint: integration with paint mixing systems (PPG, Axalta, BASF, Sherwin-Williams mixing-scale software). Paint material costing per job by actual mix weight vs "paint & materials" allowance per refinish hour, paint code by VIN, and booth/oven bake cycles.
- [unverified background] Production board stages: estimate → approval → parts ordered/received → disassembly/blueprint → body → prep → paint → reassembly → ADAS calibration → QC → detail → delivery. Include KPIs per stage (keys-to-keys cycle time, touch time, labour hours per day).
- [unverified background] OEM repair procedures (OEM1Stop, I-CAR RTS) and OEM certification programmes need document links on each RO, plus storage of pre/post scan reports as evidence for insurers.
- [unverified background] KPIs: cycle time, touch time, severity (average RO value), supplement ratio, CSI, DRP scorecards (estimate accuracy, cycle time vs insurer target), parts/paint margins, comeback rate.

### Gaps
- Feature-level detail for Mitchell Cloud Estimating, Audatex/Qapter, DAT and GT Motive was not retrieved in this session.
- No source retrieved on paint-mixing software integration APIs or CIECA BMS standard specifics.
- No MENA-specific source on insurer–bodyshop workflows (e.g. Tunisian insurer expert/"expertise" process).

## Tyre centres

### Takeaway
A tyre module needs a tyre hotel (seasonal storage with location, labels, condition, tread depth and billing), tyre size/DOT/label data, fitting-bay booking, and wholesaler connectivity. In the EU, the tyre label data lives in the EPREL registry.

### Cited Findings
- Compilator Autowork's tyre hotel module has capacity alerts, seasonal alerts, barcode and colour-coded labels, SMS/email customer reminders, and an API for CRM/webshop integration. A Swedish retailer (Hedin Wheel Tech) uses it in Stockholm/Gothenburg — [Compilator tyre hotel](https://compilator.com/en/tyre-hotel/); [Hedin case](https://compilator.com/en/hedin-wheel-tech-customer-case/)
- EONTYRE (web-based) covers booking, wheel change, tread depth measurement, labels and stock management, with off-season storage and a 24/7 booking calendar — [EONTYRE](https://eontyre.com/)
- TOPMOTIVE tmERIK tyre hotel identifies tyre sets by registration/KBA number with QR codes, and stores tyres with or without rims — [TOPMOTIVE tmERIK PDF](https://topmotive.eu/wp-content/uploads/2Seiter_tmERIK_Reifenhotel_eng.pdf)
- Hotel Anvelope (Romanian, Linux/mobile) tracks storage fees per season, PDF deposit receipts, payments and outstanding balances — [Snapcraft Hotel Anvelope](https://snapcraft.io/hotel-anvelope)
- Pneu B2B SmartServis tyre hotel covers reception, stock placement, inventory and removal tracking — [pneub2b.eu](https://pneub2b.eu/OurProducts/SmartServis/Storage.aspx)
- EU: all tyres placed on the market after 25 June 2020 must be registered in EPREL. Labels carry a QR code to the EPREL product information sheet (fuel efficiency, wet grip, noise). Suppliers must keep the data available for 5 years after the last unit is sold — [SEAI tyre labelling](https://www.seai.ie/business-and-public-sector/energy-tyre-labelling-and-ecodesign/tyre-labelling); [SEAI EPREL guidance PDF](https://www.seai.ie/publications/EPREL-Supplier-Guidance_Final-5.pdf); [Pirelli EU tyre label](https://pirelli.com/tyres/en-ww/car/driving-and-tyre-tips/eu-tyre-label)
- Tyre data provider WhatTyre added EPREL data to its Tyrepedia database — [Tyrepress](https://www.tyrepress.com/tag/eprel/)

### Inferences
- [unverified background] Data fields: size (width/aspect/rim, e.g. 205/55 R16), load index, speed rating, DOT/manufacture week-year (4-digit DOT date), brand/pattern, season (summer/winter/all-season, 3PMSF), run-flat, XL, tread depth per tyre (4–5 positions, mm/32nds), rim type and torque spec, TPMS sensor ID/frequency, and storage location (rack/shelf/bin).
- [unverified background] TPMS: sensor programming/relearn tools (Bartec, Autel, Schrader) and sensor parts. Fitting jobs need wheel balance, alignment and wheel-torque records (legal-liability record in EU).
- [unverified background] Wholesaler integrations: EU B2B portals (e.g. Interpneu, Tyre24/Alzura, Reifen.com B2B, Oponeo B2B). US: ATD (American Tire Distributors) and TireHub. Online-to-fitter networks (e.g. Tyre24/fitting partner networks, Black Circles) push bookings into the centre.
- [unverified background] KPIs: tyres sold per day, bay utilisation during seasonal peaks (Oct–Nov, Mar–Apr in snow-belt countries), tyre hotel occupancy and revenue, attach rate (alignment, TPMS, valves). Mandatory winter tyre seasons (Germany situational, Nordics, Alps) drive the hotel model. MENA has little seasonal storage demand.

### Gaps
- No official EPREL public API documentation was found. Only scrapers and third-party integrations were found, so programmatic retailer access is unconfirmed.
- No US-specific tyre-shop software (e.g. TireMaster, ASA Tire Systems) features were retrieved.

## Quick service / oil change / quick lube

### Takeaway
Quick lube is a high-volume, low-ticket, lane-based flow. Software must support fast plate/VIN check-in, OEM interval-based recommendations at the counter, next-service window stickers, and upsell tracking. Most profit comes from add-on services, not the oil change.

### Cited Findings
- Oil-change POS systems create work orders at check-in, track bays and technicians, and print next-service stickers. Operators sometimes choose between extending a car wash POS and a separate quick lube system — [Orderry oil change software](https://orderry.com/oil-change-software/); [carwash.com quick lube profits](https://www.carwash.com/quick-lube-additional-profits/)
- Shopmonkey markets a dedicated oil change/quick lube configuration — [Shopmonkey demo](https://www.shopmonkey.io/demo-oil-change-shops-quicklube)
- Practitioner forum: profit comes from recommended add-on services, not the oil change itself. One shop averaged 30–40 oil changes per day, with advisors paid partly via upsell "spiffs" — [DealersEdge forum](https://forums.dealersedge.com/viewtopic.php?p=48688); [DealersEdge pay plans](https://forums.dealersedge.com/viewtopic.php?p=47056)
- An unverified, low-authority source claims that showing OEM interval data at check-in (e.g. cabin filter mileage since last change) raises filter conversion from 14% to 38–44%. No independent corroboration — [Pulse RevOps (low authority)](https://pulserevops.com/knowledge/tk0303)
- NOLN (National Oil & Lube News) is the trade publication for this vertical — [NOLN](https://www.noln.net/articles/4655-what-makes-the-modern-quick-lube?v=preview)

### Inferences
- [unverified background] Required features: lane/bay queue display (cars waiting, in bay, done), stay-in-car drive-through tickets, plate recognition or plate lookup to fetch history, OEM maintenance schedules by VIN, a fluid-capacity lookup (oil spec/viscosity/quantity), a multi-point checklist with traffic-light results, fleet accounts, and coupon/loyalty.
- [unverified background] KPIs: cars per day, average ticket, ticket time (target about 10–15 minutes), upsell/add-on penetration per service (air filter, cabin filter, wipers, fluids), and labour cost per car.
- [unverified background] Specialist systems (US): POS Systems/Lube POS, Shop Boss, Protractor, and franchise-proprietary POS (Valvoline, Jiffy Lube, Take 5). Verify before citing.

### Gaps
- No reliable industry benchmark for cars per day or upsell rates was found. Vendor numbers are case claims.
- No first-party feature page from a quick-lube-specific POS vendor was retrieved.

## Motorcycle / scooter / powersports shops

### Takeaway
Powersports shops typically run a dealer DMS (Lightspeed/CDK Recreation is the incumbent). It combines unit sales, parts and accessories (P&A) e-commerce, service, and F&I. Service needs are similar to car workshops, but with VIN/frame-number handling, seasonal winterisation/storage, and heavy P&A catalogue integration.

### Cited Findings
- Lightspeed DMS serves marine, RV, powersports, trailer, outdoor power equipment and golf dealers, with 4,000+ dealers (another source says 4,500+). It offers mobile access, integrated payments and e-signatures, and connects sales, service, parts and accounting — [autocorp.ai Lightspeed integration](https://autocorp.ai/platform/integrations/lightspeed); [toolradar Lightspeed DMS](https://toolradar.com/tools/lightspeed-dms)
- CDK Global offers Lightspeed EVO DMS designed for powersports — [Motorcycle & Powersports News](https://www.motorcyclepowersportsnews.com/?p=179283)
- Integrations include Turn 14 Distribution parts ordering with live pricing, Yoshimura, Helmet House, and ARI AccessorySmart — [The Shop Mag](https://theshopmag.com/news/turn-14-distribution-enhanced-lightspeed-dealers/?amp=1); [MPN Yoshimura](https://www.motorcyclepowersportsnews.com/lightspeed-yoshimura-partner/); [F&I Magazine Helmet House](https://www.fi-magazine.com/352196/adp-lightspeed-integrates-with-helmet-house); [MPN ARI AccessorySmart](https://www.motorcyclepowersportsnews.com/cdk-global-recreation-integrates-aris-accessorysmart-into-lightspeed-dms/)

### Inferences
- [unverified background] Data fields: frame/VIN and engine number, displacement/class (licence category A1/A2/A in EU), odometer or hours (off-road/ATV/jet ski), chain/sprocket and tyre sizes, and storage/winterisation records.
- [unverified background] Other vendors: DX1, Blackpurl (US), and in Europe brand-specific systems. Distributor integrations: Parts Unlimited/LeMans, Tucker, Western Power Sports (US), plus OEM parts fiche (microfiche diagrams).
- [unverified background] MENA/Tunisia: scooter repair is high-volume and low-ticket, so a simplified workflow (quick job card, parts by model) fits better than a DMS.
- [unverified background] KPIs: service hours sold, P&A gross margin, unit sales per month, and seasonal bay utilisation.

### Gaps
- Service-specific Lightspeed features (tech time, scheduling) were not retrieved. A 2026 Lightspeed AIMExpo interview only returned an intro ([MPN 2026](https://www.motorcyclepowersportsnews.com/lightspeeds-bryan-tierney-tells-you-whats-new-for-2026/)).

## Heavy trucks, buses, trailers

### Takeaway
Heavy-duty shops need multi-unit work orders (tractor plus trailers), DOT/annual inspections and DVIRs, engine-hour and mileage-based PM, VMRS coding, fleet customer billing with PO/approval flows, and mobile/field service. Fullbay targets independent HD shops. TMT (Trimble) and Decisiv serve fleet and dealer networks.

### Cited Findings
- Fullbay is specialised heavy-duty/diesel repair software. It offers multi-unit work orders for trailers, DOT inspection workflows and heavy-duty parts catalogues — [SoftwareConnect Fullbay](https://softwareconnect.com/products/fullbay-heavy-duty-repair-shop-software)
- Fullbay features include invoicing, work orders, PM tracking, inventory with automated ordering, customer communication, QuickBooks integration, mobile access for techs, and DVIR submission — [SoftwareConnect review](https://softwareconnect.com/reviews/fullbay-software/); [GetApp Fullbay](https://www.getapp.com/industries-software/a/fullbay/); [Capterra AE Fullbay](https://www.capterra.ae/reviews/170876/fullbay)
- Capterra lists QuickBooks Online as Fullbay's only listed integration — [Capterra IL](https://www.capterra.co.il/software/170876/fullbay)
- No source retrieved confirms Fullbay VMRS support — (search returned nothing on it; see Gaps)

### Inferences
- [unverified background] VMRS (Vehicle Maintenance Reporting Standards, maintained by ATA's Technology & Maintenance Council) codes systems, assemblies, components, reason-for-repair and work-accomplished. Fleets often require VMRS-coded invoices. TMT Fleet Maintenance and Decisiv use VMRS natively.
- [unverified background] Data fields: unit number, VIN, engine make/model/serial (Cummins, Detroit, PACCAR), engine hours, odometer, PTO hours, axle config, trailer type, DOT number, annual inspection due date, and reefer hours.
- [unverified background] Compliance: US FMCSA annual inspection (49 CFR 396.17) and DVIR. EU roadworthiness (Directive 2014/45/EU) requires annual tests for HGVs and buses. Also tachograph calibration. UK operators follow the DVSA "Guide to maintaining roadworthiness" with 6–13 week PMI intervals.
- [unverified background] Integrations: telematics fault codes (Samsara, Geotab, Platform Science), OEM warranty (Decisiv is used by Volvo/Mack/PACCAR dealer networks for case management and ASIST), parts (FleetPride, TruckPro), and fleet billing portals with PO numbers and approval thresholds.
- [unverified background] KPIs: dwell time/downtime, comeback rate, PM compliance %, tech efficiency, and parts fill rate.

### Gaps
- VMRS support in Fullbay, and TMT/Decisiv feature pages, were not verified in this session.

## Agricultural & construction machinery dealers/workshops

### Takeaway
Heavy equipment service is hour-based (engine hours, not km), serial-number centric, often on-site in the field, and tightly tied to OEM dealer systems. A module needs hours-based PM, PIN/serial tracking, field service vans, and machine-down prioritisation.

### Cited Findings
- Lightspeed DMS also serves outdoor power equipment and trailer dealers, which overlaps with small agri/OPE dealers — [autocorp.ai Lightspeed](https://autocorp.ai/platform/integrations/lightspeed)
- Fleetio pulls engine hours from telematics and computes cost per hour as well as per mile/km, which applies to mixed fleets with machinery — [Fleetio cost reduction](https://fleetio.com/solutions/fleet-cost-reduction-software); [Capterra Fleetio](https://capterra.com/p/120855/Fleetio/)

### Inferences
- [unverified background] Specialist systems: John Deere dealers use JDQuote/dealer business systems plus JDLink telematics. CNH, AGCO and Caterpillar have proprietary dealer systems (CAT DBS). Independent ag/construction DMS: e-Emphasys, Ideal (IDEAL Computer Systems), Equipment Systems (EQUIP), Tenna (construction assets), and in the EU Agroplus/Kerridge/Incadea-like ERP derivatives.
- [unverified background] Data fields: PIN/serial number, model, attachments/implements with their own serials, engine hours, machine location (GPS), and warranty start date. Rental hire of machines is common at dealers.
- [unverified background] Workflows: field service dispatch with travel time/km billing, machine-down priority, seasonal pre-season inspections (harvest), and OEM warranty claims.

### Gaps
- No vendor feature pages for ag/construction dealer systems were retrieved in this session.

## EV specialist workshops

### Takeaway
EV workshops need high-voltage (HV) safety controls and technician qualification records, HV battery state-of-health (SoH) reports, and battery repair/module tracking. In the UK, IMI qualifications (Levels 2–4) and the TechSafe register are the reference.

### Cited Findings
- IMI Level 4 Award in Diagnosis, Testing and Repair of Electric/Hybrid Vehicles covers BMS relay weld testing and HV battery component diagnosis, with practical, oral and written assessments — [Coleg Gwent](https://coleggwent.ac.uk/course/LA0173/imi-diagnosis-testing-and-repair-of-electrical-hybrid-vehicles-and-components-level-4); [GTG](https://gtg.co.uk/courses/imi-level-4-award-in-the-diagnosis-testing-and-repair-of-electrichybrid-vehicles-and-components/)
- IMI course content includes "determination of the state of the HV Battery", four-wire milliohm and insulation testing, ending in IMI registration — [Alliance Automotive WPTATTEV4 PDF](https://assets.allianceautomotive.co.uk/m/6d11815ac8be453c/original/WPTATTEV4_.pdf)
- UK national occupational standard IMIEV5 covers diagnosing, testing and repairing HV batteries (legacy, 2017) — [UK Standards](https://www.ukstandards.org.uk/en/nos-finder/IMIEV5/diagnose%2C-test-and-repair-electric-and-hybrid-vehicle-high-voltage-batteries-legacy)
- After at least a Level 2 EV qualification, technicians can join the IMI professional register (IMI TechSafe) — [IMI EV technician accreditation](https://gtg.co.uk/courses/imi-accreditation-electric-vehicle-technician-ata/)
- Fleets (e.g. Veolia) run approved EV technician training schemes — [Fleet News](https://www.fleetnews.co.uk/news/latest-news/2023/08/22/veolia-implements-approved-technician-training-scheme-for-electric-vehicles)

### Inferences
- [unverified background] Module features: technician HV qualification level with expiry, gating so only qualified techs can be assigned HV jobs, HV isolation/de-energisation checklist with sign-off and PPE checks, quarantine bay marking for damaged packs, and battery SoH certificate (e.g. from Aviloo, TÜV battery test, or OBD-based tools) attached to the vehicle record for resale.
- [unverified background] Data fields: battery capacity (kWh), chemistry, SoH %, cell/module voltages, charging port type (CCS2/Type 2/NACS/CHAdeMO/GB/T), and OTA software version.
- [unverified background] EU Battery Regulation (EU) 2023/1542 introduces a "battery passport" for EV batteries from Feb 2027, which is a likely future integration point.
- [unverified background] Access to OEM data under EU Right-to-Repair/SERMI security certification (from 2025) affects independent EV diagnostics.

### Gaps
- No source on SoH diagnostic software certification or EV-specific workshop management software was found.

## Car dealership service departments (DMS)

### Takeaway
Dealer service runs inside a DMS (CDK, Reynolds & Reynolds, Keyloop/Autoline, Pinewood, Incadea, Tekion). These handle OEM communication (warranty claims, recalls), vehicle sales, trade-ins and F&I. A general garage app is unlikely to replace a DMS. It can win small/independent dealers in emerging markets or integrate as a service-lane add-on.

### Cited Findings
- DMS market definitions include OEM communication such as warranty claims and recall management — [Gartner DMS reviews](https://external.pi.gpi.aws.gartner.com/reviews/market/dealer-management-systems)
- Keyloop (formerly CDK Global International) launched Service Hub, a cloud-native web aftersales tool, in May 2025. It partnered with ThoughtSpot in Aug 2025 for a BI suite, VEGA — [Wikipedia Keyloop](https://en.wikipedia.org/wiki/Keyloop)
- Large dealer groups praise Keyloop Drive for centralising multi-site data, stock/POS and group reporting. Critics cite opaque pricing, lock-in, and parts/service depth that is weaker than CDK/Reynolds — [rfp.wiki Keyloop](https://www.rfp.wiki/vendors/keyloop-dms); [rfp.wiki Keyloop vs CDK](https://www.rfp.wiki/specialty-industries/dealer-management-systems/keyloop-dms/cdk-global)
- UK suppliers clashed with Keyloop over fee increases for third-party integration access — [Car Dealer Magazine](https://cardealermagazine.co.uk/car-dealers-fear-huge-bill-increases-as-a-result-of-secret-row-between-suppliers-and-keyloop/282613)
- Third-party integrators (Autoflows, Cuedesk, Soniq) connect to Keyloop for service booking including recall bookings — [Autoflows](https://autoflows.com/integrations/keyloop); [Cuedesk](https://www.cuedesk.com/solutions/automotive/integrations/keyloop)
- CDK Global suffered a major ransomware outage (June 2024), which shows the risk of dealer DMS concentration — [monrovia mirror (low quality)](https://ws1.monrovia.com/cdk-global-to-restore-systems-36146.html)

### Inferences
- [unverified background] Service-department workflows: appointment and service-lane check-in (express service), multi-point inspection video, OEM warranty claim with labour-operation codes and OEM flat-rate times, recall/campaign lookup by VIN, internal ROs (reconditioning used cars), goodwill/policy claims, loaner fleet management, and menu pricing.
- [unverified background] Regional DMS: US = CDK, Reynolds, Tekion, Dealertrack. UK = Keyloop (Autoline/Rev8), Pinewood (now Pinewood.AI), Kerridge (K8), DMS Navigator. EU = Incadea (Microsoft Dynamics-based), Keyloop, Loco-Soft/Werbas (DE), Planet/Infinity (FR). MENA = Incadea, SAP/Microsoft Dynamics-based DMS, and Keyloop at large distributors.
- [unverified background] For Tunisia/MENA, many brands are run by importer-distributors with central dealer groups. Smaller sub-dealers and agents may lack a DMS, which could be a gap a garage app can fill (vehicle sales, trade-in valuation, warranty claim tracking).
- [unverified background] KPIs: hours per RO, effective labour rate, service absorption rate, CSI, warranty claim rejection rate, and recall completion rate.

### Gaps
- No Keyloop, CDK or Reynolds document detailing warranty-claim submission or recall workflows was retrieved.

## Car wash & detailing

### Takeaway
Car wash software is membership-driven. Key features are unlimited wash plans with recurring billing, vehicle identification by LPR or RFID, tunnel controller integration, and retention marketing (DRB/Patheon/SiteWatch with Beacon Mobile; Rinsed). Detailing adds package/coating jobs with warranty records.

### Cited Findings
- DRB offers FastID LPR and FastPass RFID vehicle identification, with AI-upgraded LPR firmware that does "more than just recognize wash plan members" — [DRB vehicle identification](https://drb.com/tunnel/point-of-sale/sitewatch/car_wash_vehicle_identification); [DRB FastPass](https://drb.com/products-and-services/pos-add-ons/fastpass/)
- DRB FastID LPR moves washes toward self-pay transactions — [carwash.com DRB FastID](https://www.carwash.com/move-self-pay-transactions-drb-fastid-lpr/)
- DRB acquired Beacon Mobile (2022), a cloud-based membership management solution across DRB brands — [DRB Beacon press release PDF](https://drb.com/getattachment/340a70fe-fcbf-4fca-8ab6-0e45542e140d/beacon_mobile_press_release_-_final.pdf)
- Rinsed, a certified DRB interface developer, expanded its Patheon integration for membership sales, retention and automation — [ICA/carwash.org](https://www.carwash.org/car-wash-news/drb-patheon-customers-get-access-to-new-features-within-rinsed)
- Trade press says LPR is easier to set up than RFID for operators and customers (general claim) — [carwash.com software trends](https://www.carwash.com/trends-carwash-software/)
- Competitor Way Car Wash lists DRB POS with cloud pay station as an add-on in its comparison (competitor-authored) — [Way business](https://www.way.com/carwash)

### Inferences
- [unverified background] Data fields: membership plan, billing status (active/past-due/cancelled), plate(s) linked to membership, RFID tag ID, wash package, add-ons, detail package with checklists, ceramic coating product, batch number, layers, cure date and warranty period, plus before/after photos.
- [unverified background] KPIs: members count, membership churn, member capture rate (new members / retail washes), revenue per car, cars per hour, and chemical cost per car.
- [unverified background] Other vendors: Sonny's (SonnysDirect/Hanna), ICS, WashCard; for detailing, Urable, Mobile Tech RX, Orderry. In MENA, hand wash/detailing centres are common, so membership and package tracking fits better than tunnel controller integration.

### Gaps
- No primary page on detailing-specific software (ceramic coating warranty registration, e.g. via Gtechniq/CQuartz programmes) was retrieved.

## Auto glass

### Takeaway
Auto glass runs on NAGS part numbers and pricing, EDI billing to insurer third-party administrators (TPAs), mobile job scheduling, and increasingly ADAS camera recalibration documentation. Omega EDI, GlassBiller, Mainstreet and Glaxis are the shop-side systems. Mitchell runs insurer-side glass claims.

### Cited Findings
- Auto glass management platforms: GlassBiller, Mainstreet, Glaxis and Omega EDI, at roughly $100–$400/month (low-authority aggregators). Omega EDI focuses on EDI billing and workflow automation — [alwaysdobetter auto glass](https://alwaysdobetterllc.com/auto-glass-software/); [pulserevops (low authority)](https://pulserevops.com/tech-stacks/tk342)
- NAGS publishes a benchmark catalogue of glass part prices, labour units and adhesive kits. TPAs usually pay below the benchmark. EDI submits claims through TPAs such as Safelite Solutions and LYNX — [beancount.io auto glass guide (low authority)](https://beancount.io/blog/2026/06/03/mobile-auto-glass-windshield-replacement-adas-recalibration-bookkeeping-asc-606-insurance-billing-fmvss-205-agsc-agrss-rolags-section-179-cargo-van-tpa-network-kpi-guide)
- The same low-authority source calls ADAS recalibration the biggest change in glass economics in a decade, at roughly $99–$400 add-on per job. It cites FMVSS 205, the AGSC/AGRSS (ROLAGS) safety standard, and cargo-van mobile operations — [beancount.io (low authority)](https://beancount.io/blog/2026/06/03/mobile-auto-glass-windshield-replacement-adas-recalibration-bookkeeping-asc-606-insurance-billing-fmvss-205-agsc-agrss-rolags-section-179-cargo-van-tpa-network-kpi-guide)
- Mitchell's cloud glass claims and repair management solution (launched 2020) links OEM repair procedures and recalibration requirements to the glass claim workflow — [Business Wire](https://www.businesswire.com/news/home/20200819005109/en/Mitchell-Announces-Cloud-Based-Glass-Claims-and-Repair-Management-Solution); [Mitchell glass claims](https://www.mitchell.com/solutions/auto-insurers/estimating/glass-claims-management)
- Mygrant is listed as a glass parts distributor to connect to the stack. No integration detail was found — [pulserevops (low authority)](https://pulserevops.com/tech-stacks/tk342)

### Inferences
- [unverified background] Data fields: NAGS part number, glass features (rain sensor, HUD, heated, acoustic, camera bracket), OEM vs aftermarket (OEE), urethane brand/batch and safe-drive-away time, ADAS calibration type (static/dynamic), pre/post calibration printout, and insurer/TPA/claim/deductible. Mobile jobs need address, GPS and weather.
- [unverified background] EU: brand networks (Carglass/Belron, Autoglass UK) dominate. Independent shops use insurer portals rather than US-style NAGS/EDI, and Audatex/DAT glass catalogues may be used. In MENA, glass work is largely cash or through insurer expert approval.
- [unverified background] KPIs: jobs per tech per day, calibration attach rate, TPA payment days, and re-do/leak rate.

### Gaps
- No first-party Omega EDI or GlassBiller feature page was retrieved. Whether they natively document ADAS calibrations is unconfirmed.

## Fleet in-house workshops

### Takeaway
Fleet maintenance software (Fleetio is the reference) centres on the asset, not the customer. Core features are asset registry, PM schedules by miles, hours or time, inspections/DVIRs from drivers, telematics and fuel-card ingestion, parts inventory, outsourced-shop work, and cost per mile/km/hour.

### Cited Findings
- Fleetio integrates with telematics and fuel cards to import mileage, engine hours and fuel transactions. It also offers automated odometer updates, DTC (fault code) handling and fuel location reporting — [SoftwareConnect Fleetio](https://softwareconnect.com/reviews/fleetio/); [TrustRadius Fleetio](https://www.trustradius.com/products/fleetio/details)
- Fleetio calculates cost per mile, km or hour automatically per vehicle, with total fleet operating cost by month — [Fleetio fleet cost reduction](https://fleetio.com/solutions/fleet-cost-reduction-software); [Fleetio reports](https://www.fleetio.com/reports)
- Features include customisable inspections with photos from mobile, fuel economy and fuel-theft prevention, and integrations with GPS, fuel cards and repair shops — [fitgap Fleetio](https://us.fitgap.com/products/012103/fleetio)
- Fleetio tiers: Essential (base), Professional (adds third-party shop maintenance and parts management), and Premium (full parts & inventory). The base price is listed at $4/vehicle/month annual or $5 monthly, though sources disagree — [Fleetio pricing](https://fleetio.com/pricing); [Software Advice](https://www.softwareadvice.com/fleet-management/fleetio-profile/)
- Fleetio integrates with Lytx (video telematics) — [Lytx](https://www.lytx.com/software-integrations/fleetio)

### Inferences
- [unverified background] Fleetwise (UK fleet maintenance/hire software) and Chevin FleetWave (UK/EU), along with Fleetio, are references. Workflows include driver defect reporting, which feeds a work order, which feeds a vehicle-off-road (VOR) status. Also: recall tracking, tyre management, and accident/damage management.
- [unverified background] KPIs: cost per km, PM compliance %, VOR/downtime %, mean time between failures, fuel consumption (L/100 km), and parts spend vs budget.
- [unverified background] For GaragePro, two angles: a "fleet customer" portal for independent garages that serve fleets (approval workflow, PO numbers, monthly consolidated invoicing), and an in-house workshop mode where the customer equals an internal cost centre.

### Gaps
- Fleetwise product features were not retrieved.

## Roadside assistance / towing

### Takeaway
Towing software is dispatch-centric. It needs call intake, driver/truck GPS dispatch, digital motor-club job acceptance and billing, impound/storage yard management with daily storage fees and release paperwork, and mobile driver apps with photos and signatures.

### Cited Findings
- Towbook removes manual entry of motor club calls, accepts digital dispatches from major clubs, submits invoices to motor clubs, and imports payment data to mark invoices paid. Club lists vary by source (Agero, Allstate, GEICO, Road America, Quest, National Auto Club, Tesla, Swoop) — [Towbook features](https://towbook.com/features); [Towbook](https://towbook.com/)
- Impound and storage management is a core Towbook feature — [GetApp Towbook](https://www.getapp.com/industries-software/a/towbook/)
- Towbook integrates with Square payments and with Azuga telematics/GPS — [Square marketplace](https://squareup.com/us/en/app-marketplace/app/towbook-management-software); [Azuga partner](https://www.azuga.com/partners/towbook)
- Competitors include Ranger SST, TRAXERO Dispatch Anywhere and DATOW — [SourceForge towing software](https://sourceforge.net/software/towing/usa/); [SourceForge DATOW alternatives](https://sourceforge.net/software/product/DATOW/alternatives)

### Inferences
- [unverified background] Omadi is a towing/impound and law-enforcement/private-property-impound platform (verify). Data fields: call type (tow, jump, lockout, fuel, tyre change, winch), pickup/drop GPS, ETA, PO/motor club job number, truck class (light/medium/heavy duty), mileage loaded/unloaded, impound date, storage rate per day, lien/auction status, release authorisation, and police hold.
- [unverified background] KPIs: ETA vs actual arrival, calls per truck per day, motor club acceptance rate and scorecards, and storage receivables.
- [unverified background] EU/MENA: assistance is run by insurers/assisters (e.g. Europ Assistance, Allianz Partners, AXA, ARC Europe; in Tunisia, assistance companies tied to insurers). Providers receive jobs via assister platforms rather than US motor clubs. A garage app with a towing add-on (dispatch plus vehicle intake into the workshop) fits MENA garages that run their own tow truck.

### Gaps
- No Omadi feature page was retrieved. EU assister platform APIs were not researched.

## Periodic technical inspection centres (Tunisia ATTT visite technique, EU PTI, UK MOT)

### Takeaway
Inspection centres use regulator-mandated systems. Results are reported to the national system (DVSA MOT Testing Service in the UK, ATTT systems in Tunisia, national registers in the EU). Garage apps add value by integrating MOT/PTI due dates and history, reminders, and pre-inspection checks, rather than replacing the test lane software.

### Cited Findings
- UK: The MOT Testing Service (MTS) exposes an API that "connected equipment" uses to send results. This covers roller brake testers, decelerometers, exhaust gas analysers and diesel smoke meters, via AWS cloud infrastructure — [GEA connected equipment](https://gea.co.uk/learn-about-mot-connected-equipment/); [GEA](https://gea.co.uk/mot-connected-equipment/)
- Connected roller brake testers became mandatory for new/replacement equipment from 1 Oct 2019, and decelerometers (classes 3, 4, 5, 7) from 1 Feb 2020. Non-connectable models can sometimes be upgraded by software — [GEA](https://gea.co.uk/?p=19466); [PMM Online DVSA updates](https://pmmonline.co.uk/?p=23676); [Concept GE](https://concept-ge.co.uk/learn-about-mot-connected-equipment/)
- Tunisia: visite technique is run by the public agency ATTT (Agence Technique des Transports Terrestres) through its own centres. New centres were created by JORT decree (Menzel Bourguiba, Bizerte, opening 27 Jan 2025; Utique under construction at 44%) — [Managers.tn Dec 2025](https://managers.tn/2025/12/08/tunisie-ouverture-de-deux-nouveaux-centres-de-visite-technique/); [La Presse 2025](https://lapresse.tn/2025/01/13/tunisie-menzel-bourguiba-se-dote-de-son-centre-de-controle-technique-des-vehicules); [African Manager](https://africanmanager.com/nouveau-centre-de-visite-technique-a-menzel-bourguiba/)
- ATTT recommends online booking via www.attt.com.tn. The booking receipt serves as a provisional technical-inspection certificate until the appointment date. ATTT has increased centre capacity — [Tunisie Numérique](https://www.tunisienumerique.com/tunisie-rendez-de-visite-technique-programmes-a-partir-de-cette-date/); [Managers.tn 2024](https://managers.tn/2024/10/23/tunisie-les-centres-de-controle-technique-augmentent-leur-capacite-daccueil/); [Webdo](https://www.webdo.tn/fr/actualite/national/tunisie-prolongation-de-la-validite-des-rendez-vous-de-visite-technique/136388/)
- ATTT reported revenue above 160 MD (million dinars) — [African Manager](https://africanmanager.com/attt-un-ca-de-plus-de-160-md-et-plein-de-nouveautes/)

### Inferences
- [unverified background] UK: DVSA offers a public MOT History API (registration lookup for test history, expiry and advisories) for third parties. Garage software (e.g. GarageHive, TechMan, MAM) uses it for reminders and to prefill vehicle data. Booking MOTs and recording results in MTS is done by the authorised testing station via MTS itself.
- [unverified background] EU: PTI is governed by Directive 2014/45/EU, run by private operators in many countries (e.g. DEKRA, TÜV, Applus+, SGS). France uses OTC/UTAC-licensed centres (contrôle technique). Germany uses HU/AU by TÜV/DEKRA/GTÜ/KÜS. Inspection centre software handles appointments, lane equipment integration, defect catalogue per national manual, certificate printing and regulator upload.
- [unverified background] For Tunisia, ATTT centres are state-operated (private centres not confirmed in this research). So GaragePro's opportunity is "visite technique" due-date tracking, reminders, pre-inspection checklists mapped to common ATTT defect categories, and a concierge service where the garage takes the car to inspection. Also storing the inspection certificate/expiry per vehicle.
- [unverified background] KPIs (centres): tests per lane per day, pass/fail rate, re-test rate, and booking no-show rate.

### Gaps
- Whether Tunisia licenses private visite technique centres, and whether ATTT exposes any API, was not found.
- No DVSA MOT History API primary page was retrieved this session. The cited sources on the MTS equipment API date from 2019–2020.

## Parts retailers / counters

### Takeaway
Parts counters need fast POS, catalogue lookup by vehicle (TecDoc in EU/MENA, ACES/PIES in US), B2B trade accounts with price tiers and credit limits, delivery runs to garages, and supplier/stock interchange (cross-references).

### Cited Findings
- Parts distribution integrations matter across verticals. Examples: Turn 14 Distribution live pricing/ordering into Lightspeed DMS for powersports, and TOPMOTIVE (a TecDoc-based catalogue/ERP provider) for tyre hotel/ERP — [The Shop Mag](https://theshopmag.com/news/turn-14-distribution-enhanced-lightspeed-dealers/?amp=1); [TOPMOTIVE PDF](https://topmotive.eu/wp-content/uploads/2Seiter_tmERIK_Reifenhotel_eng.pdf)

### Inferences
- [unverified background] EU/MENA: TecDoc (TecAlliance) is the de-facto aftermarket catalogue (article numbers, OE cross-references, KType vehicle IDs). TecRMI provides repair and maintenance data. US: ACES/PIES standards (Auto Care Association), with Epicor (Vision/Activant), PartsTech and WorldPac speedDIAL as references.
- [unverified background] Required: VIN/plate to vehicle to parts lookup, OE-to-aftermarket interchange, multiple price levels (retail/trade/garage), customer credit accounts and statements, returns/cores (core charges in US), back orders, delivery driver routing, and barcode stock.
- [unverified background] KPIs: fill rate, lost sales (no-stock), inventory turns, gross margin by category, and delivery time.

### Gaps
- No primary TecDoc/TecAlliance or Epicor page was retrieved in this session.

## Mobile mechanics

### Takeaway
Mobile mechanics need field-service features: map-based scheduling with travel time, route optimisation, on-site job cards on mobile (offline), photo/signature capture, card payment on-site, and van stock management.

### Cited Findings
- Comparable field patterns appear in adjacent verticals. Fullbay offers mobile tech access and DVIRs for HD mobile service. Towbook has mobile driver apps with GPS (Azuga). Mobile auto glass runs cargo-van field operations — [GetApp Fullbay](https://www.getapp.com/industries-software/a/fullbay/); [Azuga Towbook](https://www.azuga.com/partners/towbook); [beancount.io auto glass (low authority)](https://beancount.io/blog/2026/06/03/mobile-auto-glass-windshield-replacement-adas-recalibration-bookkeeping-asc-606-insurance-billing-fmvss-205-agsc-agrss-rolags-section-179-cargo-van-tpa-network-kpi-guide)

### Inferences
- [unverified background] Data fields: job address/geo, time window, travel time/distance billing, van ID with its van stock location, and parts pickup from supplier en route.
- [unverified background] KPIs: jobs per day, drive time vs wrench time ratio, first-time fix rate, and revenue per van.
- [unverified background] Generic FSM tools (Jobber, ServiceM8, Tradify) are often used by mobile mechanics in UK/AU, alongside garage apps with mobile modes.

### Gaps
- No mobile-mechanic-specific software source was retrieved.

## Rental / car rental maintenance

### Takeaway
Rental fleets need maintenance tied to utilisation. That means service due by km/time between rentals, damage check-out/check-in inspections with photos, rapid turnaround (cleaning/prep), recall compliance before renting, and integration with the rental reservation system for availability.

### Cited Findings
- Fleet maintenance capabilities (inspections with photos, PM by km/hours, recall and cost tracking, telematics odometer sync) apply directly to rental fleets — [fitgap Fleetio](https://us.fitgap.com/products/012103/fleetio); [Fleetio cost reduction](https://fleetio.com/solutions/fleet-cost-reduction-software)

### Inferences
- [unverified background] Rental software (e.g. RENTALL, Rent Centric, HQ Rental Software, TSD, Bluebird, Wheelbase in EU/MENA) handles reservations. Maintenance is often a module or delegated to a fleet system. US law (Raechel and Jacqueline Houck Safe Rental Car Act 2015) bars renting vehicles with open safety recalls. A recall check gate before checkout is a key feature.
- [unverified background] Workflows: check-out/check-in damage diagrams with photos, chargeback of damage to renter/insurer, between-rental prep checklist, defleet/remarketing condition reports, and fines/tolls processing.
- [unverified background] KPIs: fleet utilisation %, vehicles out-of-service %, turnaround time, damage recovery rate, and maintenance cost per km.
- [unverified background] In Tunisia/MENA, many small rental agencies (location de voitures) use their own workshop or a partner garage. A garage app could offer a "rental partner" portal (vehicle availability, km-based service reminders, damage repair).

### Gaps
- No rental-maintenance-specific software pages were retrieved in this session.
