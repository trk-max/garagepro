# Business models, pricing and market examples: connected-car / OBD telematics data used by garages to win repair work (2024-2026, with older failures as dated lessons)

Research note scope: 15 tool calls. Several fetches failed because the session blocks those hosts: news.dealershipguy.com, iphone-ticker.de and connectedcars.io. Where a fetch failed, findings come from search-result snippets and are flagged. Many pricing sources are affiliate or vendor pages and are flagged as such.

## 1. Examples: who turns automatic vehicle data into repair bookings, and how

### Takeaway
The models that survive in 2024-2026 are B2B. Either the OEM or a data platform hands dealers and workshops "connected car leads" (Mercedes, Ford, BMW, Connected Cars/VW in Denmark), or fleet telematics feeds fault codes into maintenance software (Geotab to Fleetio). Consumer OBD-dongle-plus-app businesses (Automatic, Hum, ryd) have mostly shut down. The main consumer survivor, FIXD, makes its money from a paid app subscription, not from garage referrals.

### Cited Findings
**OEM / dealer proactive service (connected data to service appointment)**
- A New Jersey Mercedes-Benz dealer's service director says Mercedes-Benz "are really good at giving us connected car leads, so we're doing a lot of outbound." Mercedes sends daily lists of owners due for service, based on real-time vehicle data. The headline claims a 20% lift in service conversions (Aug 2025), but I could not fetch the body, so the 20% is unverified. — [DealershipGuy, 2025-08-05](https://news.dealershipguy.com/p/mercedes-dealer-boosts-service-conversions-by-20-using-connected-car-data-2025-08-05)
- Ford's Vehicle Care Portal uses connected vehicle data to alert dealer teams to upcoming service needs, check-engine lights and low tire pressure, so staff can contact customers right away. No conversion rate is given. — [VinSolutions blog](https://www.vinsolutions.com/resources/blog/proactive-approach-to-creating-converting-leads/)
- BMW runs "Proactive Care," described as a digital concierge for BMW customer service that uses vehicle data. — [BMW Group PressClub UK](https://press.bmwgroup.com/united-kingdom/article/detail/T0437242EN_GB/proactive-care-–-the-digital-concierge-for-bmw-customer-service)
- An OEM outreach case run by a contact-centre vendor reports a 274% increase in outreach volume. That measures volume, not bookings. — [Percepta client story](https://www.percepta.com/client-story/when-you-care-first-loyalty-follows)

**Aftermarket / independent "connected workshop" platforms**
- Connected Cars A/S (Denmark, 51-200 employees per a March 2026 ranking) sells ConnectedWorkshop, CC-DataStream, a consumer app and CC-Link retrofit hardware for real-time diagnostics, predictive maintenance and automated service workflows. — [RankMyAI listing, Mar 2026](https://www.rankmyai.com/tools/2c9cd7dc-44e3-40a5-8d96-5b46d7d81beb/connected-cars)
- Connected Cars gets data through OEM APIs across brands. For deeper technical data and proactive service it recommends its own CC-Link OBD hardware over OEM APIs. — [Connected Cars, ConnectedWorkshop benefits](https://connectedcars.io/connectedworkshops-benefits-for-your-dealership-in-the-digital-age/)
- VW Randers (Denmark) has used Connected Cars since 2017 for customer service, maintenance planning and workshop efficiency, combining DTC insights, live vehicle data and real-time chat. — [Connected Cars case study](https://connectedcars.io/case-studies/how-volkswagen-randers-transformed-its-after-sales-service-with-connectedworkshop/)
- Vendor claim: Volkswagen Commercial Vehicles Denmark saw "up to 86% revenue boost for cars seven years and older" after connecting them. This is a vendor case study; the 86% is unaudited. — [Connected Cars success story](https://connectedcars.io/customer-success-story-volkswagen-commercial-vehicles-denmark-increases-revenue-and-brand-loyalty-through-connectivity/)
- Connected Cars has also published "OBD II Device can retain customers for the workshops," which pitches the dongle as a retention tool for workshops. — [Connected Cars](https://connectedcars.io/?p=3441)
- Bosch Drivelog Connect (from Bosch subsidiary Mobility Media) was a Bluetooth OBD2 dongle plus app. German press described it as positioned mainly as a "diagnostic assistant and workshop helper" with a direct line to breakdown service. In 2017 Argus found a vulnerability that allowed CAN-bus message injection. I found no source on its current status or a garage program. — [S&P AutoTechInsight on Argus finding](https://autotechinsight.spglobal.com/news/5239588/argus-cyber-security-detects-vulnerability-in-bosch-drivelog-connector-dongle-and-drivelog-connect-app); [SecurityWeek](https://www.securityweek.com/flaws-bosch-car-dongle-allow-hackers-stop-engine/amp/)

**Fleet telematics into maintenance software**
- In the Geotab to Fleetio integration, DTCs, engine faults and DVIR defects sync automatically to Fleetio "to instantly kick off a maintenance workflow," along with automatic odometer updates. It works whether maintenance is in-house or done by third-party vendors. — [Fleetio blog](https://www.fleetio.com/blog/geotab-integration); [Fleetio Geotab overview PDF](https://marketing-cdn.fleetio.com/documents/app-directory/geotab-integration-overview.pdf); [Business Fleet](https://www.businessfleet.com/news/geotab-adds-fleetios-odometer-updates)
- Vendor claim from FleetNet America: fleets adopting remote diagnostics "can experience up to a 30% reduction in downtime." — [FleetNet America](https://fleetnetamerica.com/?p=2010)

**Shop management software (Tekmetric, Shopmonkey)**
- I found no evidence of a telematics-to-shop lead pipeline in Tekmetric or Shopmonkey. Shopmonkey markets fleet customer profiles with custom labour rates and an embeddable web work-request form for lead capture. Tekmetric claims 70+ integrations, but none named in the results is a telematics vendor, and its API access needs partnership approval. — [Shopmonkey vs Tekmetric](https://www.shopmonkey.io/shopmonkey-vs-tekmetric); [Supergood Tekmetric API docs](https://supergood.ai/docs/tekmetric-api)

**Consumer OBD with paid app**
- FIXD sells a sensor for about $59.99 plus a "Premium" subscription. Reported prices vary: $8.99/month or $69.99/year in one source, about $99-99.99/year in others. Several reviews report automatic enrolment into a trial that converts to an annual charge, with some refunds only after disputes. Most of these are affiliate review sites. — [ConsumerAffairs](https://www.consumeraffairs.com/automotive/fixd.html); [unitQ](https://unitq.com/unitq-scorecards/fixd); [iamcarhacker](https://iamcarhacker.com/fixd-obd2-scanner/); [OBDAdvisor 2026](https://obdadvisor.com/fixd-vs-bluedriver/); [Innova comparison (competitor)](https://www.innova.com/pages/innova-vs-fixd)

**Insurance telematics**
- Italy is the world leader. PTOLEMUS counts almost 9 million telematics policies and says Italy has the highest penetration in the world. — [PTOLEMUS](https://www.ptolemus.com/blog/will-italy-mandate-telematics-in-insurance/)
- IVASS data via Il Sole 24 Ore puts the black-box rate at 16% of passenger cars in Q2 2026, down from 17.2% a year earlier. — [Il Sole 24 Ore English](https://en.ilsole24ore.com/art/average-car-insurance-premium-422-euros-16-per-cent-2025-AJhQP9NB)
- MarqStats cites 17.8% active telematics policy penetration against a 40.3M-vehicle fleet. It estimates about 3.13M installed boxes are not tied to an active policy. Penetration is highly regional: 59.4% in Caserta and 46.6% in Naples (high fraud and theft areas) versus 9.8% in Bolzano. — [MarqStats](https://marqstats.com/insights/the-3-million-italian-black-boxes-that-arent-actually-insured/)
- Unipol launched Unibox, Italy's first insurance telematics device, in 2004. It describes the black-box market as showing saturation. Italy's 2024 competition law (DDL Concorrenza) mandates black-box data portability to a competing insurer at renewal, and a 2017 law obliges insurers to give a discount when a device is installed. — [PTOLEMUS on Unipol](https://www.ptolemus.com/insight/how-unipol-became-europes-leading-ubi-insurance-company/); [PTOLEMUS Italy insight](https://www.ptolemus.com/insight/the-next-turn-for-telematics-insurance-in-italy/)

### Inferences
- The proven pattern is "data source → lead list → human outbound call by the service advisor." No case found relies on the alert alone to self-book. A GaragePro feature should therefore produce a daily call list for the garage, not only push notifications to car owners.
- OEM programmes run free to the consumer and are paid for by the dealer or OEM aftersales budget. That is the reference model for a garage-paid tool.
- Italy's insurance boxes are concentrated where theft and fraud are high. That suggests the consumer willingness-to-pay driver is theft or anti-fraud, not diagnostics. This is likely relevant to Tunisia, where theft-recovery GPS is the existing consumer product.

### Gaps
- I found no 2024-2026 sources on Continental, Valeo, Michelin/Masternaut, Carly, Mojio, Vinli, CarStar or Pep Boys connected-garage programmes within budget. Background knowledge, unverified here: Mojio pivoted to selling white-label through mobile carriers, and Vinli pivoted to B2B fleet/mobility. Check before use.
- I found no published conversion rates for alert → booking, from any source.
- I found no MENA or South Africa insurance telematics data (for example Discovery Insure Vitalitydrive, or GCC insurers).

## 2. Pricing benchmarks

### Takeaway
- **Consumer apps:** consumer OBD apps price at about $60 for the device plus $70-100/year.
- **Fleet tracking:** about $15-36/vehicle/month in the US, £15-30 in the UK and €10-22 in France.
- **Tunisia:** indicative fleet tracking prices are about 20-40 TND/vehicle/month. This is a single blog estimate.
- **Garage lead generation (US):** garages pay roughly $25-45 per lead.

### Cited Findings
**Consumer**
- FIXD: about $59.99 for the device plus $69.99-$99.99/year Premium (see section 1 sources).
- Verizon Hum X launched in March 2017 at $15/month. Hum always required a monthly service fee. — [Wikipedia: Hum (system)](https://en.wikipedia.org/wiki/Hum_(system)); [droid-life, Oct 2025](https://www.droid-life.com/2025/10/02/verizon-hum-to-be-discontinued-end-of-2025/)

**Fleet (global)**
- Zubie (pivoted to small business fleets) lists:
  - OBD-II plan: $24/vehicle/month on a 24-month plan
  - Dashcam tier: $36/month, with $399 one-time hardware
  - AssetTrak: $15/month
  - Annual plan: $179.95/year/device, including device and cellular
  - Prepaid saves about $2/month/vehicle
  - A competitor source quotes $55 per device upfront and a $2/month premium for month-to-month.

  — [Fitgap](https://us.fitgap.com/products/zubie); [SoftwareFinder](https://softwarefinder.com/fleet-management-software/zubie); [Capterra CA](https://www.capterra.ca/software/144648/zubie); [Zubie blog](https://zubie.com/blog/three-simple-steps-how-zubie-handles-fleet-management-pricing/); [Airpinpoint (competitor)](https://airpinpoint.com/compare/airtags-vs-zubie)
- US fleet tracking typically costs $25-45/vehicle/month depending on features. — [GPS Insight 2026 pricing guide](https://www.gpsinsight.com/blog/gps-fleet-tracking-pricing-cost-per-vehicle/)
- UK: most fleets pay £15-30/vehicle/month. — [Expert Market UK 2025](https://www.expertmarket.com/?p=22820)
- France:
  - Subscriptions start from €10-15/vehicle/month, and the average observed rental price is €22 HT/vehicle/month.
  - Hardware purchase is about €350 per box, excluding installation.
  - Contracts commonly run 36-48 months.

  — [Companeo, prix géolocalisation](https://www.companeo.com/geolocalisation-de-vehicules/guide/systemes-de-geolocalisation-de-vehicule-:-quel-prix)
- West/Central Africa: a GPS/OBD tracker costs 25,000-60,000 FCFA (about €38-91) plus a data SIM at 1,000-2,500 FCFA/month (about €1.5-3.8). — [Kolonell blog, 2026](https://kolonell.com/en/blog/fleet-tracking-app-africa-2026)

**Tunisia / North Africa**
- A Tunis-focused blog estimates 20-40 TND/vehicle/month for a fleet of about 15 vehicles. This is an "order of magnitude" estimate, not a tariff sheet. It also says hardware boxes are considered more reliable than phone apps because they work with the phone off. — [Kolonell FR, ambulances Tunis 2026](https://kolonell.com/fr/blog/meilleure-application-societe-ambulances-transport-sanitaire-tunis-2026)
- Tunisie Telecom "Tracking GPS" business package: 6 DT TTC/month for 2 MB of GPRS data. The article is undated and likely old. This is the connectivity cost only, which is useful as a floor for SIM cost. — [BusinessNews.com.tn](https://businessnews.com.tn/?p=1088285)
- Topnet launched IRIS GPS in August 2020: an in-vehicle box with a mobile app and web platform, built with Tunisian startup Be Wireless Solution. No price was published. — [automobile.tn, 2020-08-12](https://www.automobile.tn/fr/magazine/actu/2020-08-12-iris-gps-topnet-lance-sa-solution-de-geolocalisation-pour-les-flottes.html); [African Manager](https://africanmanager.com/topnet-lance-sa-solution-de-geolocalisation-des-vehicules-le-iris-gps/)
- Tunisian public tenders (pm.gov.tn, 2026) include contracts for "maintenance et abonnement du système de géolocalisation pour la flotte." This confirms the public sector buys tracking as a recurring subscription. Amounts were not visible. — [pm.gov.tn tender, 2026-06](https://pm.gov.tn/sites/default/files/2026-06/Avis%20d%E2%80%99Appel%20d%E2%80%99Offres%20n%C2%B0%20182026%20%C3%A0%20Proc%C3%A9dures%20simplifi%C3%A9es.pdf)
- Morocco: StarFleet PRO claims to be the cheapest tracker in Morocco but publishes no prices. Frotcom added a certified Morocco partner in July 2025. — [StarFleet PRO](https://mwm.ai/apps/starfleet-pro/1613136929); [Frotcom, Jul 2025](https://www.frotcom.com/blog/2025/07/frotcom-morocco-joins-frotcoms-global-network-certified-partners)

**What garages pay for leads**
- Google Local Services Ads for auto repair cost about $25/lead (wide variation; some shops report about $7/call). — [Semrush](https://www.semrush.com/blog/google-local-services-ads/); [Auto Repair Marketing podcast](https://www.autoshopowner.com/forums/topic/20820-googles-local-service-ads-everything-you-need-to-know-e145-the-auto-repair-marketing-podcast)
- Average Google Ads cost per lead for auto repair is $29.96-$44.26 (agency data, 2026). — [Webtonic](https://www.webtonic.io/blog/auto-repair-google-ads-statistics)
- UK: £28.50 per garage lead. — [Whito research](https://whito.co.uk/research/uk-automotive-marketing-costs/)
- RepairPal-certified shops pay a recurring monthly fee after approval. The only figure found is a promotional "$49 Certification Fee." — [RepairPal FAQ](https://repairpal.com/faq?partner=carmax)

### Inferences
- Rough conversion assumes TND ≈ 0.30 EUR, so check the current rate. On that basis, 20-40 TND/month is about €6-12, roughly half of French pricing. A garage-paid add-on in Tunisia probably needs to land at about 10-25 TND/vehicle/month to sit below existing fleet trackers.
- Raw connectivity is cheap: TT's 6 DT/month, or about €1.5-4 in African SIM benchmarks. That leaves room for a margin on 15-30 TND.
- US lead prices ($25-45) suggest a value anchor. If one alert-driven repair job is worth roughly one paid lead, a garage paying a few dinars per connected car per month breaks even with very low conversion. This is my inference, not measured.
- Consumer subscriptions (FIXD and Hum at $70-180/year) sell in rich markets, and even there they rely on auto-enrolment tactics. A direct-to-consumer subscription in Tunisia is likely a hard sell.

### Gaps
- I found no verified Tunisian tariff sheet (for example from Be Wireless, Topnet IRIS, Ooredoo or Orange business tracking). Get quotes locally.
- I found no MENA (GCC, Egypt) per-vehicle pricing within budget.
- I found no source on what garages pay specifically for telematics-derived leads, as opposed to generic ad leads.

## 3. Evidence on results, and why consumer dongle businesses failed or pivoted

### Takeaway
Hard data on alert-to-booking conversion is not public. What exists are vendor claims: a 20% lift for a Mercedes dealer (unverified), up to 86% revenue on 7+ year-old VW vans, and up to 30% less downtime. The consumer dongle graveyard is consistent:
- Automatic (SiriusXM) shut down in May 2020.
- Verizon Hum shut down on 31 December 2025.
- ryd (Germany, SIM+GPS OBD) shut down on a 1 May (year not confirmed).

Causes cited include weak economics, OEM embedded connectivity crowding out dongles, network sunsets, and privacy backlash.

### Cited Findings
- **Automatic Labs** (acquired by SiriusXM in 2017 for over $100M) announced on about 1 May 2020 that service would end on 28 May 2020. It cited COVID-19 reducing auto sales and demand. Some buyers got rebates. Contemporary coverage added context: automakers were pressuring dongle makers with their own connected services, and there was talk of restricting OBD-port data. — [Engadget](https://www.engadget.com/automatic-obd-diagnostic-dongle-shuts-down-192653493.html); [SlashGear](https://www.slashgear.com/automatic-labs-connected-car-dongle-shutdown-iot-siriusxm-01618989/); [S&P AutoTechInsight](https://autotechinsight.spglobal.com/news/5255001/covid-19-pandemic-connected-car-company-automatic-labs-to-shut-operations-by-end-may); [9to5Mac](https://9to5mac.com/2020/05/01/automatic-labs-shutting-down/)
- **Verizon Hum (Hum+ / HumX)** was discontinued on 31 December 2025. The app and device stopped working, ending crash response, roadside assistance, diagnostics and location. Devices had not been sold for some time. — [9to5Google, 2025-10-01](https://9to5google.com/2025/10/01/verizon-hum-shutting-down/); [droid-life, 2025-10-02](https://www.droid-life.com/2025/10/02/verizon-hum-to-be-discontinued-end-of-2025/)
- **ryd** (Germany, OBD plug with SIM and GPS): an iphone-ticker.de headline reads "Zum 1. Mai: Elektroschrott-Autotracker ryd stellt den Betrieb ein" ("From 1 May: e-waste car tracker ryd ceases operations"). Only the snippet title is available; the page was blocked, so the year and reasons are unverified. The same site also reported a standstill of O2 Car Connection, an operator-branded OBD adapter. — [iphone-ticker.de, ryd](https://www.iphone-ticker.de/zum-1-mai-elektroschrottauto-tracker-ryd-stellt-den-betrieb-ein-229247/); [iphone-ticker.de, O2 Car Connection](https://www.iphone-ticker.de/auto-adapter-stillstand-bei-o2-car-connection-verzoegerung-bei-bosch-89023/)
- **Zubie** moved from consumer to business. It launched "Zubie Business" and was distributed to small and medium fleets through ProTradeNet. — [Zubie blog](https://zubie.com/blog/introducing-zubie-business/); [Automotive Fleet](https://www.automotive-fleet.com/news/protradenet-offers-zubie-telematics-to-small-medium-fleets)
- **Network sunsets**: Zubie published 3G shutdown guidance, which shows the device-replacement cost of cellular sunsets. — [Zubie, 3G shutdown info](https://zubie.com/blog/three-simple-steps-how-zubie-handles-fleet-management-pricing/)
- **Privacy backlash (GM / OnStar Smart Driver)**:
  - A New York Times investigation showed that driving-behaviour data from GM's free Smart Driver feature was sold to LexisNexis and Verisk for insurer reports.
  - GM ended Smart Driver in 2024, unenrolled all customers and cut those relationships.
  - The FTC proposed an order in January 2025 and finalized it on 14 January 2026. It bans GM from disclosing geolocation and driver-behaviour data to consumer reporting agencies for 5 years. It is a 20-year order requiring affirmative express consent for collecting, using or sharing connected-vehicle data, plus deletion, access and opt-out of location tracking.
  - There was no fine, but class actions continue, and the Texas AG also took action.

  — [TechCrunch, 2026-01-14](https://techcrunch.com/2026/01/14/the-ftcs-data-sharing-order-against-gm-is-finally-settled); [Repairer Driven News, 2026-01-27](https://www.repairerdrivennews.com/2026/01/27/ftc-finalizes-20-year-gm-onstar-data-collection-order/); [Repairer Driven News, 2025-01-20](https://www.repairerdrivennews.com/2025/01/20/ftc-bans-gm-from-disclosing-consumer-driving-data-for-5-years/); [Captain Compliance](https://captaincompliance.com/news/ftc-finalizes-settlement-with-gm-over-unauthorized-driver-data-sales-as-texas-ag-targets-connected-car-privacy-violations/)
- **Subscription conversion benchmark**: a LexisNexis survey (2022) found nearly half of buyers converted to a paid connected-services subscription when the free trial ended. — [Repairer Driven News, 2022-07-27](https://www.repairerdrivennews.com/2022/07/27/lexisnexis-survey-shows-strong-interest-in-connected-services-among-vehicle-buyers/)
- **Dealer baseline**: Cox Automotive's 2025 service study reports only a 25% introduction rate and 23% scheduling rate for the first service appointment at point of sale. That shows how much retention headroom proactive outreach targets. — [Cox Automotive Ownership Study](https://www.coxautoinc.com/retail/resources/ownership-study/)

### Inferences
- Every failed consumer dongle had to carry hardware, SIM and app costs against a consumer subscription. When a carrier or SiriusXM parent lost interest, the service died and the devices became e-waste. That is the "Elektroschrott" framing. A garage SaaS should avoid being stuck with a consumer-funded device base.
- The GM case shows that monetising driving data to insurers without explicit consent creates legal and reputational risk. Tunisia's personal data law (Loi organique 2004-63, administered by INPDP) would need checking; this is not researched here.
- Survivors (Zubie, Connected Cars, Geotab) sell B2B, priced per vehicle per month, with multi-year terms.

### Gaps
- I found no independent, audited alert-to-booking conversion or retention data.
- I could not access the reasons for the ryd shutdown or its date.
- Background knowledge only, unverified here: Mojio and Vinli pivot details, and churn figures for FIXD.

## 4. Risks: theft and unplugging, support, battery drain, accuracy, liability, insurance interest

### Takeaway
- **Battery drain:** parasitic drain from always-on dongles is the most-documented complaint.
- **Theft and security:** visible OBD dongles are easy for thieves to remove, and have shown CAN-injection vulnerabilities (Bosch 2017).
- **Installation and support:** poor installation creates complaint and liability exposure.
- **Insurance interest:** high where theft or fraud is common (Italy's south), but data portability and consent rules are tightening.

### Cited Findings
- **Battery drain, mechanic case:** a dongle stayed powered with the ignition off, drawing current 24/7, and caused repeated battery replacements. Unplugging it fixed the draw. — [Motor1](https://www.motor1.com/news/775451/mechanic-solves-toyota-dead-battery-mystery/)
- **Battery drain, insurance box:** an insurer telematics box drew 0.07-0.12 A, which the dealer confirmed as the cause. The insurer's telematics provider declined to investigate drains below 3 A. This is an anecdote. — [Toyota Owners Club forum](https://toyotaownersclub.com/forums/topic/177301-acceptable-battery-drain-from-telematics-box)
- **Battery drain, EVs:** a Nissan Leaf owner reports an OBDII dongle causing 12 V battery failure. — [MyNissanLeaf forum](https://www.mynissanleaf.com/threads/obdii-dongle-causes-12v-battery-failure.33139/)
- **Battery drain, OEM warning:** Ford Maverick owners were warned not to leave OBD-II connectors plugged in. — [MaverickTruckClub forum](https://www.mavericktruckclub.com/forum/threads/maverick-owners-warned-not-to-use-obd-11-connector.39292/post-704827)
- **Installation liability:** a UK Financial Ombudsman decision concerned a telematics box fitted incorrectly that may have left a battery terminal loose, causing a breakdown. — [FOS DRN-3791811](https://www.financial-ombudsman.org.uk/decision/DRN-3791811.pdf)
- **Security:** Bosch Drivelog Connect flaws allowed injecting CAN messages, which could stop the engine. — [SecurityWeek](https://www.securityweek.com/flaws-bosch-car-dongle-allow-hackers-stop-engine/amp/); [TechCrunch 2017](https://techcrunch.com/2017/04/19/that-fancy-smart-gadget-you-plugged-into-your-car-could-allow-hackers-to-turn-off-the-engine/?ncid=rss)
- **Theft and unplugging:** forum users say a plugged-in OBD dongle is among the first things a thief removes. This is anecdotal. — [MBClub UK forum](https://forums.mbclub.co.uk/threads/obd-dongles-secure.133674)
- **Insurance interest:**
  - Italian telematics penetration is concentrated in high-theft and fraud provinces (Caserta 59.4%, Naples 46.6%).
  - About 3.1M boxes are installed but not tied to active policies.
  - A 2024 law mandates data portability between insurers.

  — [MarqStats](https://marqstats.com/insights/the-3-million-italian-black-boxes-that-arent-actually-insured/); [PTOLEMUS](https://www.ptolemus.com/insight/how-unipol-became-europes-leading-ubi-insurance-company/)
- **Data accuracy:** reviewers say FIXD is a branded ELM327-class reader with limited free features. That implies generic OBD data (DTCs, mileage estimates) is shallow compared with OEM data. Connected Cars itself recommends its own hardware over OEM APIs for "detailed technical data." — [iamcarhacker](https://iamcarhacker.com/fixd-obd2-scanner/); [Connected Cars](https://connectedcars.io/connectedworkshops-benefits-for-your-dealership-in-the-digital-age/)

### Inferences
- **Product requirements:** require low-sleep-current hardware with voltage-based sleep. Offer installation behind the dash with a Y-cable (common practice, not sourced here) to reduce theft, unplugging and blocking of the OBD port.
- **Customer terms:** state in T&Cs that alerts are informational, not a safety guarantee, to limit liability for missed alerts. This is a legal point to verify with Tunisian counsel.
- **Consent design:** keep any insurer data partnership opt-in, per GM/FTC.

### Gaps
- I found no quantified support cost per device, or unplug or churn rates, for any operator.
- I found no source on Tunisian insurer interest in telematics (for example STAR, Comar, GAT) or on Tunisian theft statistics.
- I found no legal sources on liability for missed alerts.

## 5. Recommended go-to-market for a small player: fleets/taxis first vs consumers

### Takeaway
The evidence points to B2B first: fleets, taxis/louage, rental agencies, ambulances, and public tenders. These buyers are paid per vehicle per month on multi-year contracts, are installed by the garage, and are bundled with maintenance. The data source is the device or the fleet's existing tracker. Consumer direct subscriptions have a poor track record even in rich markets.

### Cited Findings
- **Fleet-first survivors:** Zubie (consumer → business), Geotab/Fleetio (fleet DTC → maintenance workflow) and Connected Cars (dealer/workshop B2B, VW Commercial Vehicles) sell to businesses per vehicle per month. — [Zubie Business](https://zubie.com/blog/introducing-zubie-business/); [Fleetio](https://www.fleetio.com/blog/geotab-integration); [Connected Cars VW CV Denmark](https://connectedcars.io/customer-success-story-volkswagen-commercial-vehicles-denmark-increases-revenue-and-brand-loyalty-through-connectivity/)
- **Consumer-funded failures:** Automatic shut down in 2020 and Hum in 2025. — [Engadget](https://www.engadget.com/automatic-obd-diagnostic-dongle-shuts-down-192653493.html); [9to5Google](https://9to5google.com/2025/10/01/verizon-hum-shutting-down/)
- **Tunisian B2B demand exists:**
  - Topnet/Be Wireless sell fleet geolocation (2020).
  - Public tenders buy tracking subscriptions (2026).
  - SME fleets such as ambulances are quoted 20-40 TND/vehicle/month.

  — [automobile.tn](https://www.automobile.tn/fr/magazine/actu/2020-08-12-iris-gps-topnet-lance-sa-solution-de-geolocalisation-pour-les-flottes.html); [pm.gov.tn](https://pm.gov.tn/sites/default/files/2026-06/Avis%20d%E2%80%99Appel%20d%E2%80%99Offres%20n%C2%B0%20182026%20%C3%A0%20Proc%C3%A9dures%20simplifi%C3%A9es.pdf); [Kolonell](https://kolonell.com/fr/blog/meilleure-application-societe-ambulances-transport-sanitaire-tunis-2026)
- **Contract norms:** French fleet tracking contracts typically run 36-48 months, often as box rental. — [Companeo](https://www.companeo.com/geolocalisation-de-vehicules/guide/systemes-de-geolocalisation-de-vehicule-:-quel-prix)

### Inferences (the pricing model recommendation is the researcher's synthesis)
1. **Primary model: garage-paid or fleet-paid monthly fee per connected vehicle, with the device rented, not sold.** The device is included in the subscription with a 12-24 month commitment and a deposit or early-termination fee to cover hardware. This mirrors Zubie's annual plan with device and cellular included, and French box rental. Indicative Tunisian price: about 15-30 TND/vehicle/month for fleets (below the 20-40 TND tracking benchmark if GPS-light, or at parity if full GPS).
2. **Garage as reseller and installer.** The garage buys or rents devices from GaragePro and places them in its fleet clients' vehicles, either bundled into a maintenance contract or as "free with service contract." GaragePro charges the garage per active device. This turns the device into a retention lock-in for the garage, the Connected Cars "OBD device retains customers for workshops" pitch.
3. **Consumers: do not lead with a paid consumer subscription.** If offered at all, make it garage-subsidised: a free device on a loyalty or maintenance plan, with the garage paying a small monthly fee and recouping it through captured repairs, as in OEM dealer programmes. Avoid FIXD-style auto-renew tactics.
4. **Do not sell outright as the main model.** Outright device sales leave GaragePro with SIM costs and no recurring revenue. Data value and retention come from the subscription, and the failed dongle firms show the risk of stranded hardware when service ends.
5. **Adjacent revenue to test later.** Theft recovery and GPS have proven consumer WTP in high-theft markets (Italy's south). An insurer partnership must be strictly opt-in (GM/FTC lesson).
6. **Pilot order:** taxis/louage cooperatives, rental agencies and SME delivery fleets serviced by partner garages, then public-sector tenders, then subsidised consumer loyalty.

### Gaps
- I found no Tunisian or MENA case of a garage-led telematics programme.
- I found no data on louage/taxi fleet willingness-to-pay or maintenance spend.
- Device BOM and SIM costs for a Tunisian deployment are not researched here; another note in this folder may cover them.
