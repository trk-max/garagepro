# Tunisia: legal, regulatory and connectivity requirements for SIM-equipped GPS/4G OBD-II trackers (2024-2026)

Research date: 2026-11-01. Method caveat: in this research session direct page fetches to most sites were blocked (cert.tn, orange.tn, inpdp, ins.tn, bkassocies.tn, 5mglobal.com, onomondo.com, Tunisian vendor sites all failed DNS in the sandbox). Findings below therefore come from search-engine result extracts of those pages, not from full reading. Treat specific figures as "reported by source X" and re-verify on the primary page before relying on them. Nothing here is legal advice.

## 1. Telecom equipment homologation / type approval, import and GPS restrictions

### Takeaway
Any 2G/3G/4G radio device (including a GPS/LTE OBD tracker or M2M module) sold or imported commercially in Tunisia needs CERT homologation under Government Decree 2020-48, through a Tunisian-registered applicant/local representative, typically with CERT lab testing; reported lead times are about 6-10 weeks and certificates are reported to have unlimited validity. No current rule specifically banning or licensing GPS receivers was found; the historic GPS restriction (OTC / Ministry of Defence) was defeated in court in 2009-2010, but this should be confirmed with customs before import.

### Cited Findings
- Legal basis: Décret gouvernemental n° 2020-48 du 23 janvier 2020 "relatif aux procédures d'homologation, d'importation et de commercialisation des équipements terminaux de télécommunications et des équipements radioélectriques" — [legislation-securite.tn](https://legislation-securite.tn/latest-laws/decret-gouvernemental-n-2020-48-du-23-janvier-2020-relatif-aux-procedures-dhomologation-dimportation-et-de-commercialisation-des-equipements-terminaux-de-telecommunications-et-des-equipemen/)
- CERT approval is mandatory for telecom and radio products marketed in Tunisia; legal basis cited as Law 2001-1 of 15 January 2001 (Telecommunications Code) and Decree 2020-48 — [Applus Laboratories](https://www.appluslaboratories.com/global/en/what-we-do/service-sheet/other-middle-east-central-asia-and-african-countries-radio-type-approval); [Applus PDF (FR)](https://appluslaboratories.com/dam/PDFServices/Laboratories/fr/atr-autres-pays-moyen-orient-asie-centrale-afrique_fr.pdf)
- Decree 2020-48 sets administrative deadlines: the one-stop window (guichet unique) processes files within max 3 working days; files needing the opinion of the frequency agency (ANF) get max 21 working days — [legislation-securite.tn (decree page, via search extract)](https://legislation-securite.tn/latest-laws/decret-gouvernemental-n-2020-48-du-23-janvier-2020-relatif-aux-procedures-dhomologation-dimportation-et-de-commercialisation-des-equipements-terminaux-de-telecommunications-et-des-equipemen/)
- A Tunisian-registered local entity / local representative is required to apply — [Nanotech Sol](https://www.nanotechsol.com/tunisia-cert-type-approval); [IB-Lenhardt](https://ib-lenhardt.com/type-approval/tunisia); [Eleos Compliance](https://www.eleoscompliance.com/en/type-approval/tunisia)
- Reported lead times: ~6-8 weeks, "typically 8 weeks", or "10 weeks average" (sources disagree) — [Nanotech Sol](https://www.nanotechsol.com/post/tunisia-cert-type-approval-important-points-you-should-not-miss); [IB-Lenhardt](https://ib-lenhardt.com/type-approval/tunisia); [Eleos Compliance](https://www.eleoscompliance.com/en/type-approval/tunisia)
- Testing in the CERT lab is commonly required; certificate of conformity reported as permanent/unlimited validity — [Nanotech Sol](https://www.nanotechsol.com/tunisia-cert-type-approval); [Eleos Compliance](https://www.eleoscompliance.com/en/type-approval/tunisia)
- Applus states CERT radio approval has no labelling requirements — [Applus PDF](https://appluslaboratories.com/dam/PDFServices/Laboratories/fr/atr-autres-pays-moyen-orient-asie-centrale-afrique_fr.pdf)
- Since Decree 2020-48, CERT also handles the former ANCE encryption approvals (relevant if the tracker uses encrypted communications, e.g. TLS/DTLS) — [Eleos Compliance (ANCE)](https://www.eleoscompliance.com/en/article/Tunesien-ANCE-Verschlüsselungsanforderungen)
- A 2014 CERT/ITU type-approval training listed mobile terminals including "Bluetooth, WiFi, GSM, HSDPA, UMTS, GPS" among device types under its testing scope — [ITU / CERT training 2014](https://itu.int/en/ITU-D/Technology/Documents/Events2014/CI_Training_AFR_Tunis_June14/Part2_CERT_TypeApprovalTraining_%20juin2014.pdf)
- Frequency management/assignment is handled by the Agence Nationale des Fréquences (ANF) — [anf.tn](https://www.anf.tn/en/assignation)
- Historic GPS restriction: the Office de la Topographie et de la Cartographie (OTC, then under Ministry of Defence per press) obtained a court order in Feb 2009 to stop Tunisiana and NGI selling the "Weenee" GPS navigation product; on 24 June 2009 the Cour de cassation (arrêts n° 34616 and 34502) ruled for Tunisiana/NGI; in Jan 2010 the Tunis Court of Appeal (21st chamber) rejected OTC's further request, reported as final — [Business News](https://businessnews.com.tn/?p=1091964); [Business News 2010](https://businessnews.com.tn/2010/02/02/article-1093441/1093441/); [Business News](https://businessnews.com.tn/?p=1092012)
- OTC cartographic/remote-sensing duties were transferred to the Centre national de la cartographie et de la télédétection (CNCT) by Law 2009-24 — [legislation-securite.tn Law 2009-24](https://legislation-securite.tn/wp-content/uploads/sites/5/2023/11/loi-n°-2009-24-du-11-mai-2009.pdf); [juridoc.tn Law 2009-26](https://juridoc.tn/fr/document/law-n--2009-26-dated-11-may-2009-amending-law-n--74-100-dated-25-december-1974-forming-the-topography-and-cartography-office/17491)
- GPS tracking is openly sold and procured today: the Présidence du Gouvernement issued 2026 tenders for GPS/GPRS geolocation boxes for 234 government vehicles; the Commune of Gabès tendered a GPS-GPRS fleet tracking system with hosting in Tunisia — [pm.gov.tn tender 2026](https://pm.gov.tn/sites/default/files/2026-06/Avis%20d%E2%80%99Appel%20d%E2%80%99Offres%20n%C2%B0%20182026%20%C3%A0%20Proc%C3%A9dures%20simplifi%C3%A9es.pdf); [marchespublics.gov.tn 2026](https://www.marchespublics.gov.tn/storage/tender/2026/04/30/47d5cab7-50fb-46c2-9c0d-54143db2427f_1777564785_aaaeee6678e9fa52ecc70fda03ffd9cf.pdf); [Commune de Gabès](http://www.commune-gabes.gov.tn/ar/pdfs/AOs/cahier%20des%20charge%20GPS%20Commune%20de%20gabes.pdf)
- Drones (not GPS trackers) require Ministry of Interior permission to import — shown only as an example of Interior-controlled imports — [idaraty.tn](https://idaraty.tn/public/index.php/fr/procedures/permission-de-piloter-un-drone-en-tunisie)
- Customs traveller guide lists goods requiring special authorisation (e.g. professional audiovisual equipment); GPS not mentioned in the extract — [douane.gov.tn Guide Voyageur](https://www.douane.gov.tn/fileadmin/guides_formulaires/guides/Guide_Voyageur_FR.pdf)

### Inferences
- An OBD-II tracker with an LTE Cat-1/Cat-M module is a "radio terminal" and almost certainly needs its own CERT homologation per model before customs clearance and sale; a module-level certificate may not suffice (unverified). Budget ~2-3 months for the first model and use a Tunisian entity (GaragePro itself or the importer) as applicant.
- Customs will normally ask for the CERT homologation / import visa at clearance (the decree's title covers import); importing samples for testing likely needs a CERT temporary/test authorisation.
- The GPS function itself appears no longer to be a separate legal barrier: the 2009-2010 Weenee rulings, government tenders and many vendors openly selling trackers suggest civilian GPS is tolerated. No 2024-2026 decree restricting GPS import was found.
- If the device firmware uses encryption, ask CERT whether the former ANCE encryption authorisation applies (now merged into CERT).

### Gaps
- Official CERT fee schedule (homologation and testing costs in TND) not found.
- Whether CERT requires full in-country testing for LTE trackers already holding CE/RED, or accepts foreign test reports — sources conflict/unclear.
- No primary text found confirming whether any Ministry of Interior/Defence prior authorisation still applies to GPS trackers in 2024-2026. Recommend asking CERT and customs (douane.gov.tn) directly.
- Whether renting (vs selling) devices changes obligations: not found.

## 2. Data protection: Law 2004-63, INPDP, geolocation, fleets, transfers, new bill

### Takeaway
Organic Law 2004-63 (still the operative text unless the 2025 bill has been published in the JORT) requires prior declaration to the INPDP for processing personal data, prior authorisation for transfers abroad, and consent or another legal basis; no Tunisia-specific INPDP guidance on vehicle geolocation was found. A replacement GDPR-like bill (PLO 095/2025) was filed at the ARP; its adoption status is unconfirmed.

### Cited Findings
- Law: Loi organique n° 2004-63 du 27 juillet 2004 portant sur la protection des données à caractère personnel; INPDP is the supervisory authority — [INS (text FR)](https://www.ins.tn/sites/default/files/2020-04/Loi%2063-2004%20Fr.pdf); [English text, ICT Policy Africa](https://ictpolicyafrica.org/es/document/1bmfv348zkf); [DPO Consulting guide 2026](https://www.dpo-consulting.com/fr-fr/blog/loi-tunisienne-sur-la-protection-des-donnees)
- Transfers of personal data abroad require authorisation under 2004-63; INPDP has a list of countries deemed adequate, which eases transfers — [DPO Consulting](https://www.dpo-consulting.com/fr-fr/blog/loi-tunisienne-sur-la-protection-des-donnees); [Boussayen Knani & Associés practical guide](https://bkassocies.tn/en/practical-guide-application-of-tunisian-legislation-on-personal-data-protection/)
- A Tunisian GPS vendor states vehicle geolocation for business use is lawful if compliant with Organic Law 2004-63 under INPDP supervision, and advises against tracking outside working hours without proper legal basis — [Belive](https://www.belive.com.tn/geolocalisation-des-vehicules/) (vendor claim, not authority guidance)
- New bill: Projet de loi organique relatif à la protection des données à caractère personnel, filed at the ARP as PLO 095/2025, would repeal 2004-63 — [regulations.ai](https://regulations.ai/regulations/RAI-TN-NA-PERSONA-2025); [Global Law Experts](https://globallawexperts.com/tunisia-moves-replace-its-twentyyearold-data/)
- Reported bill content: INPDP moves from consultative to enforcement powers; 72-hour breach notification to INPDP; mandatory DPO for large-scale or sensitive processing; records of processing; DPIAs for high-risk processing; transfer framework with INPDP standard contractual clauses — [regulations.ai news](https://regulations.ai/news/tunisia-data-protection-law-2026-deadline-gdpr-like-rules); [Global Law Experts](https://globallawexperts.com/tunisia-moves-replace-its-twentyyearold-data/); [Elair Avocat](https://www.elair-avocat.com/en/news/gdpr-tunisian-law-ai-obligations-2026/)
- Status conflict: some sources give 11 July 2026 as entry into force — [regulations.ai news](https://regulations.ai/news/tunisia-data-protection-law-2026-deadline-gdpr-like-rules); others say it is still under ARP review / not confirmed published in the JORT — [Maître Haifa Guedhami](https://maitre-haifaguedhami.me/en/actualites/protection-donnees-personnelles-tunisie-2026); [Elair Avocat](https://www.elair-avocat.com/en/news/gdpr-tunisian-law-ai-obligations-2026/)
- Regional comparator (Morocco CNDP): employee vehicle tracking must be declared via a standard form; non-conforming set-ups require prior authorisation — [CNDP deliberation 17-2014](https://www.cndp.ma/wp-content/uploads/2023/01/deliberation-n-17-2014-10-01-2014.pdf)

### Inferences
- Practical compliance under 2004-63 (based on general knowledge of the law; verify article numbers on the text): file a prior declaration with INPDP before starting processing (the law provides that silence for one month after declaration is deemed acceptance — unverified here); obtain written/express consent of the car owner; for fleets, inform employees, limit tracking to working hours and stated purposes, and consider worker-representative consultation.
- Hosting on EU servers: the EU is generally treated as adequate, but 2004-63 still requires INPDP authorisation for transfers abroad. Hosting in Tunisia (or obtaining authorisation before launch) reduces risk; note some public tenders (Gabès) demand hosting in Tunisia.
- Geolocation data tied to a vehicle owner/driver is personal data. GaragePro will often be a processor for garages/fleets (they are controllers for their customers/employees) and a controller for its own B2C users; contracts should allocate roles.
- Prepare now for the new bill's GDPR-like duties (DPO, records, DPIA for large-scale location tracking, 72h breach notice), since status is uncertain and may already be in force.

### Gaps
- No INPDP deliberation or guidance specific to geolocation/vehicle tracking found.
- INPDP declaration fees, current processing times, and the official adequacy list not retrieved.
- Retention limits for location data under Tunisian law not found.
- Whether PLO 095/2025 was adopted and published in the JORT as of Nov 2026: unconfirmed.
- Labour Code rules on employee monitoring not researched.

## 3. Other laws: stolen-vehicle tracking, insurers' telematics, tracking service licences, local providers

### Takeaway
No specific licence for "vehicle tracking service providers" in Tunisia was found; the market operates with operators (Tunisie Telecom, Topnet/Be Wireless) and private integrators selling openly, under general telecom (CERT for devices, operator SIM contracts) and data-protection rules. Insurer telematics is nascent (Maghrebia 2017 connected-driving launch).

### Cited Findings
- Topnet launched IRIS GPS vehicle/fleet geolocation with startup Be Wireless Solution (Aug 2020), covering all Tunisian territory — [automobile.tn](https://www.automobile.tn/fr/magazine/actu/2020-08-12-iris-gps-topnet-lance-sa-solution-de-geolocalisation-pour-les-flottes.html); [African Manager](https://africanmanager.com/topnet-lance-sa-solution-de-geolocalisation-des-vehicules-le-iris-gps/)
- Tunisie Telecom signed a geolocation contract with SNTRI and 12 regional transport companies, described as turnkey at a highly advantageous price — [Business News](https://businessnews.com.tn/?p=1090537)
- Private vendors selling trackers/fleet geolocation: GPS Tunisie / tunisiegps.com, Belive, Smart Mobility Solutions (mini trackers "puce GPS"), gps-tunisie.tn — [tunisiegps.com](https://tunisiegps.com/); [Belive](https://www.belive.com.tn/geolocalisation-des-vehicules/); [Smart Mobility](https://smartmobility-solutions.com/puce-gps-tunisie/); [gps-tunisie.tn privacy policy](https://www.gps-tunisie.tn/politique-de-confidentialite/)
- Ooredoo partnership with Alliance Technologie using Ooredoo Business "IoT Connect Manager" for M2M services over 3G/4G — [Kapitalis](https://kapitalis.com/tunisie/?p=46590)
- Assurances Maghrebia launched what was billed as the first connected-driving service in Tunisia (2017) — [Atlas Magazine](https://atlas-mag.net/fr/articles/un-nouveau-service-de-conduite-connectee)
- Government administrative vehicles to be equipped with GPS trackers (State Domains ministry controls) — [Webdo](https://www.webdo.tn/fr/?p=378526)
- Algeria (comparator) requires an ARPCE authorisation with a cahier des charges for satellite positioning/geolocation service providers — [ARPCE](https://www.arpce.dz/fr/file/g9k9y0); a 2018 note on Algerian geolocation operating-authorisation formalities — [abderrafiq blog](https://abderrafiq.wordpress.com/2018/03/20/geolocalisation-les-formalites-de-demande-dautorisation-dexploitation-ouvertes/)

### Inferences
- A SaaS provider using operator M2M SIMs is a customer of a licensed operator, not itself a telecom operator; no separate INT licence appears needed unless reselling connectivity as an MVNO-like service (unverified; ask INT).
- Stolen-vehicle recovery should be framed as providing location data to the owner, who reports to police/Garde nationale; no Tunisian rule on private recovery found.
- Insurer partnerships (Maghrebia, STAR, GAT, Comar) are a possible channel but no current Tunisian usage-based insurance product with published terms was found.

### Gaps
- No Tunisian law/decree specific to stolen-vehicle tracking found.
- Whether reselling SIM connectivity bundled with the device requires an INT authorisation: not found.
- Current insurer telematics offers in Tunisia (2024-2026): not found.

## 4. IoT/M2M SIM offers, coverage, 2G/3G sunset, foreign roaming SIMs

### Takeaway
Orange Tunisie publishes M2M data plans (reported 5 TND/5 MB, 14 TND/20 MB, 18 TND/100 MB per SIM/month TTC); Ooredoo offers managed M2M via an Ericsson-based "IoT Connect Manager" platform (prices not public); no Tunisie Telecom M2M price list found. 3G phase-out is planned from mid-2027; 4G covers ~96% of population vs 99% for 3G. Multi-network roaming IoT SIMs (Onomondo, Deplofy) claim coverage on all three Tunisian networks; no explicit permanent-roaming ban was found but it is unverified.

### Cited Findings
- Orange Tunisie Business M2M page: offers for regular data exchange between dispersed devices and servers; reported tariffs TTC per SIM per month: 5 MB = 5 TND; 20 MB = 14 TND; 100 MB = 18 TND (page date unknown) — [orange.tn offres M2M](https://www.orange.tn/business/offres-m2m)
- Orange Tunisie launched M2M offers (older press) — [Kapitalis archive](https://www.kapitalis.com/archive/187-kanal/9617-orange-tunisie-lance-des-offres-innovantes-m2m)
- Ooredoo Business launched managed M2M connectivity platform (with Ericsson) in Nov 2015, web portal to activate/manage/track SIMs remotely — [Webdo](https://www.webdo.tn/fr/actualite/tech/ooredoo-business-lance-avec-ericsson-sa-nouvelle-plateforme-m2m/179667/); [Kapitalis](https://kapitalis.com/tunisie/?p=25929); Ericsson marketplace lists Ooredoo Tunisia connectivity management with "Positioning & Tracking" use case — [Ericsson](https://www.ericsson.com/en/partners/marketplace/offering-catalog/ooredootunisia-connectivity-management)
- Ooredoo and Sagemcom launched Tunisia's first dedicated IoT (LoRa) network (2018) — [Kapitalis](https://kapitalis.com/tunisie/?p=126618); [Arab Advisors](https://arabadvisors.com/product/ooredoo-tunisie-and-sagemcom-launched-the-first-dedicated-internet-of-things-iot-network-in-tunisia)
- 5G launched in Tunisia in Feb 2025 — [Ecofin](https://www.ecofinagency.com/news-digital/2302-53162-tunisia-to-begin-3g-shutdown-in-2027-central-bank-warns-of-payment-impact)
- 3G phase-out planned from mid-2027 / first half 2027; central bank warned about payment-terminal impact; 3G population coverage 99% vs 4G 96% (ITU); INT data: 3G-only devices = 5% of active connections at end Sept 2025 — [Ecofin, Feb 2026](https://www.ecofinagency.com/news-digital/2302-53162-tunisia-to-begin-3g-shutdown-in-2027-central-bank-warns-of-payment-impact); [Osiris](https://osiris.sn/tunisie-l-extinction-du-reseau-mobile-3g-prevue-pour-le-premier-semestre-2027.html)
- POS terminals and other M2M equipment remain mostly 3G-limited; 3G end programmed for banking/postal services by 2027 — [Webdo](https://www.webdo.tn/fr/actualite/national/tunisie-fin-programmee-de-la-3g-dans-les-services-bancaires-et-postaux-dici-2027/393482/)
- Tunisie Telecom stated (2022) intent to shut 3G and refarm to 4G, ~80% of consumers having 4G handsets — [Developing Telecoms](https://developingtelecoms.com/telecom-business/operator-news/13685-tunisie-telecom-to-sideline-3g.html); [Omdia View July 2022](https://www.connectingafrica.com/5g-networks/omdia-view-july-2022)
- Onomondo states its IoT SIM connects to Ooredoo Tunisia, Orange Tunisia and Tunisie Telecom; Deplofy describes an IoT SIM switching across all three — [Onomondo](https://onomondo.com/iot-sim/the-best-iot-sim-cards-for-tunisia/); [Deplofy](https://deplofy.com/product/iot-data-sim-card-for-tunisia/)
- White-spots coverage programme (phase 2) to extend rural coverage — [Developing Telecoms](https://www.developingtelecoms.com/telecom-business/telecom-regulation/14488-tunisia-launches-second-phase-of-white-spots-coverage-project.html)

### Inferences
- Choose LTE Cat-1 (or Cat-1 bis) devices with 2G fallback rather than 3G fallback; avoid 3G-only modules given the 2027 phase-out. 2G sunset date: none announced (not found).
- An OBD tracker typically uses 5-30 MB/month at 30-60 s reporting; Orange's 20 MB (14 TND) or 100 MB (18 TND) tiers would be the reference, i.e. roughly 4-6 EUR/month — high relative to EU global IoT SIMs, so negotiate volume/pooled pricing.
- Local SIMs avoid regulatory risk on permanent roaming and give local data hosting options; foreign SIMs (1NCE, Emnify, Hologram, Things Mobile) are easier to manage but their Tunisia support and pricing zone must be checked per provider.

### Gaps
- Ooredoo and Tunisie Telecom current M2M prices, APN/static IP/private APN options and platform features: not found (contact business sales).
- Whether Orange's published prices are current (2025-2026) and HT/TTC confirmation: unverified.
- LTE-M / NB-IoT availability in Tunisia: not found.
- 1NCE, Emnify, Hologram, Things Mobile Tunisia coverage and permanent-roaming policy: not verified (provider coverage pages could not be fetched). No INT rule on permanent roaming was found.
- 2G sunset plan: none found.

## 5. Tunisian/Maghreb GPS fleet tracking market benchmarks and pricing

### Takeaway
Local players include Topnet IRIS GPS (with Be Wireless), Tunisie Telecom (B2G fleet deals), and integrators such as GPS Tunisie, Belive, Smart Mobility; none of the retrieved pages exposed TND prices. European benchmarks: 80-350 EUR per device and 12-45 EUR per vehicle per month.

### Cited Findings
- Topnet IRIS GPS with Be Wireless Solution, fleet geolocation (2020) — [automobile.tn](https://www.automobile.tn/fr/magazine/actu/2020-08-12-iris-gps-topnet-lance-sa-solution-de-geolocalisation-pour-les-flottes.html)
- Tunisie Telecom / SNTRI + 12 regional transport companies geolocation deal — [Business News](https://businessnews.com.tn/?p=1090537)
- Vendors: [tunisiegps.com](https://tunisiegps.com/), [Belive](https://www.belive.com.tn/geolocalisation-des-vehicules/), [Smart Mobility Solutions](https://smartmobility-solutions.com/puce-gps-tunisie/), [gps-tunisie.tn](https://www.gps-tunisie.tn/politique-de-confidentialite/); TUNAV, a Tunisian GPS tech firm exhibited at CeBIT 2005 — [Webmanagercenter](https://www.webmanagercenter.com/2005/03/17/10007/cebit-2005-a-hanovre-tunav-expose-son-savoir-faire-tunisien-en-technologie-gps/)
- European benchmarks: 12-30 EUR/month/vehicle — [Companeo](https://www.companeo.com/geolocalisation-de-vehicules/guide/systemes-de-geolocalisation-de-vehicule-:-quel-prix); device 80-350 EUR HT and 15-45 EUR HT/month/vehicle — [Expert Market](https://www.expertmarket.com/fr/geolocalisation-vehicules/combien-coute-un-traceur-de-vehicule)
- Morocco: RMA Watanya connected-driving box bundled with motor insurance for under 1.50 MAD/day — [La Vie Éco](https://www.lavieeco.com/?p=95868)

### Inferences
- Local Tunisian pricing is likely well below EU levels (anecdotally 20-40 TND/month and 200-400 TND per device) but this is NOT sourced; obtain quotes from 3-4 local vendors to benchmark.

### Gaps
- No verified TND device or subscription prices for any Tunisian provider (vendor sites could not be fetched; search extracts contained no prices).
- Market size, number of fleet tracking companies, and leaders' market share: not found.
