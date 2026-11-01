# Plug-in 4G dongles can turn GaragePro proactive

GaragePro can offer SIM-equipped OBD-II dongles that report fault codes, mileage, battery voltage and GPS/anti-theft events with no phone or person involved. The device to build on is the **Teltonika FMC003 in its EU/MEA variant (product code X4)**. It covers both Tunisian 4G bands, falls back to 2G, and reads DTCs, MIL status, VIN and, on supported cars, the real odometer. It costs about **EUR 74 ex VAT at EU retail**, and no Tunisian distributor was found. The technology works, but four things decide whether the business works. First, **Vercel cannot be the device endpoint**: trackers keep raw TCP sockets open, so a small always-on decoder (flespi or self-hosted Traccar) has to sit in front of Next.js and Supabase. Second, **each device model needs CERT homologation** through a Tunisian applicant, and location data falls under Organic Law 2004-63, which requires an INPDP declaration and authorisation to transfer data abroad. Third, the unit cost is tight: hardware amortisation, an Orange M2M SIM and middleware come to about **13-27 TND per vehicle per month** at pilot scale, against a local fleet-tracking benchmark of roughly 20-40 TND. Fourth, no consumer-funded dongle business has lasted: Automatic shut down in 2020 and Verizon Hum at the end of 2025. On who pays, the recommendation is: **fleets pay for GPS and anti-theft, garages pay a per-active-device fee as a customer-retention tool, and private motorists pay nothing by default**, with the device rented rather than sold. The next step is a **10-vehicle pilot on flespi's free tier** with one partner garage and one taxi, louage or rental fleet, run while the CERT file is in progress.

## The Teltonika FMC003 fits Tunisian networks and the four feature groups

The FMC003 is the best-documented OBD dongle for this use case. Teltonika says its main feature is reading OEM parameters through the OBD port, including "Real Odometer and Real Fuel Level data" and "up to 32 vehicle onboard parameters" ([Teltonika DS FMC003](https://wiki.teltonika-gps.com/images/2/23/DS-FMC003.pdf)). Its parameter list includes **DTCs, number of DTCs, distance and time since codes were cleared, and distance driven with the MIL on** ([FMx003 features PDF](https://wiki.teltonika-gps.com/images/b/b0/FMx003-features-and-parameters.pdf)). Platforms such as Navixy also expose OBD VIN and MIL run time ([Navixy FMC003](https://www.navixy.com/en/devices/teltonika/teltonika-fmc003)). Battery health comes from the standard external-voltage input that every Teltonika tracker reports. Anti-theft uses GNSS position plus power-cut and unplug events. So one unit covers all four feature groups the user chose.

Network fit is the second reason to choose it. Ooredoo, Orange and Tunisie Telecom run 4G on **B3 (1800 MHz) and B20 (800 MHz)** and 2G on 900/1800 MHz ([Kimovil TN](https://www.kimovil.com/fr/frequency-checker/TN)). The EU/MEA FMC003 supports B1, B3, B7, B8, B20 and B28 with GSM fallback ([Teltonika frequency bands](https://wiki.teltonika-gps.com/view/Frequency_Bands)). The alternatives each fail on one point:

- **FMM003 (LTE-M/NB-IoT):** no evidence was found that LTE-M or NB-IoT is commercially available in Tunisia.
- **3G-fallback modules:** Tunisia plans to start switching off 3G in the first half of 2027 ([Ecofin](https://www.ecofinagency.com/news-digital/2302-53162-tunisia-to-begin-3g-shutdown-in-2027-central-bank-warns-of-payment-impact)).
- **FMB003 (2G only):** Teltonika lists it as end-of-life ([Teltonika FMB003](https://www.teltonika-gps.com/fr/products/trackers/obd-data/fmb003)).

LTE Cat 1 with 2G fallback avoids all three problems. No 2G switch-off date has been announced.

| Device | Network | Diagnostics (DTC/odometer) | Anti-theft | Role for GaragePro |
|---|---|---|---|---|
| Teltonika FMC003 (X4, EU/MEA) | LTE Cat 1 + 2G | DTC, MIL, VIN, OEM odometer on supported cars | GNSS, unplug and power events | **Primary device** |
| Teltonika FMC800 | LTE Cat 1 | Same OBD family ([PB Tech](https://www.pbtech.com/product/NETTTK1028/Teltonika-FMC800-4G-LTE-CAT1Tracker)) | Yes | Second source; check bands |
| JimiLab VL502 | LTE | "Car Fault" alert only, DTCs not documented | Collision, pull-out, ignition, idling ([PB Tech](https://www.pbtech.com/product/IPCJIM0005/JimiLab-VL502-LTE-OBDII-GNSS-Tracker-On-board-diag)) | Low-cost anti-theft tier only |
| Ruptela Plug5 | LTE Cat 4 / LTE-M | OBD-II and DTC ([StepGlobal](https://shop.stepglobal.com/Plug5/Ruptela-Plug5%3A-Advanced-Plug-_and_-Play-OBD-GPS-Tracker/pd.php)) | Accelerometer, backup battery | Benchmark quote |
| Queclink GV500MA, CalAmp LMU-3045 | LTE-M / US carriers | Partial | Yes | Avoid (North America SKUs) |

The device has limits, and the product has to be honest about them. The **real odometer works only on cars on Teltonika's supported-vehicle list**. A 2024 Renault Trafic owner found that the "OEM" field silently mirrored the GPS odometer, which the poster called "misleading, as it looks like a valid OBD value when it's not" ([Teltonika community](https://community.teltonika.lt/t/fmc003-dont-read-io389-obd-odometer-value/14308)). Teltonika also confirmed that newer Ford Rangers are not supported ([Traccar forum](https://www.traccar.org/forums/topic/fmc003-odometer/)). On a BMW E92 the dongle detected the KWP protocol instead of CAN and sent no OBD data ([Teltonika community](https://community.teltonika.lt/t/fmc003-no-obd-data-transmission-for-bmw-3-series/16235)). About half of Tunisian cars are more than 15 years old ([Webdo](https://www.webdo.tn/fr/actualite/national/en-tunisie-50-des-voitures-ont-plus-de-15-ans/380532/)), and the fleet includes many Chinese brands and grey imports. Odometer and DTC coverage therefore has to be measured car by car in the pilot, not assumed.

On battery drain, the datasheet figures are reassuring. The FMC003 draws about **35 mA when active and 4.5 mA in deep sleep** ([FMC003 general description](https://wiki.teltonika-gps.com/view/FMC003_General_description)). Deep sleep works out to about 3 Ah a month, which a healthy battery absorbs easily. A unit that never enters sleep, which users have reported ([Teltonika community](https://community.teltonika.lt/t/fmc003-never-enters-deep-sleep-mode/18378)), draws about 25 Ah a month and can flatten a weak battery on a car parked for weeks.

## A small always-on decoder must sit in front of Vercel and Supabase

Teltonika devices open a raw binary TCP connection and send their IMEI. The server replies with a single byte to accept or reject the device, and data packets in Codec 8 or Codec 8 Extended follow ([Teltonika server FAQ](https://wiki.teltonika-gps.com/index.php?oldid=95906&title=Help_with_Server_FAQ)). Vercel Functions accept only HTTP(S). Their new WebSocket support (public beta in June 2026) is capped at about five minutes per connection ([releases.sh](https://releases.sh/release/rel_yNUn74KGsQqbJOSpgMBnY-vercel-launches-websocket-support-in-public-beta-for-functions); [Classmethod test](https://dev.classmethod.jp/en/articles/vercel-functions-websocket-public-beta-verification/)), and trackers do not speak WebSocket anyway. GaragePro's own app cannot receive device data directly.

The architecture that fits the current stack has five stages:

1. **Device to decoder.** The dongle connects to an ingestion tier: a flespi channel, or Traccar on a Hetzner VPS with a static IP.
2. **Decoder to rules.** The decoder turns Codec 8E into JSON and works out events: a new DTC (compared with the previous set of codes), a mileage step, low battery voltage, unplug or tow, geofence exit.
3. **Rules to Vercel.** The decoder posts only those events to an HMAC-signed route such as `/api/telemetry/webhook`.
4. **Vercel to Supabase.** The route writes to Supabase.
5. **Supabase to people.** The existing reminder and agenda logic sends the client a WhatsApp or PWA alert with a proposed slot, and adds the car to the garage's call list.

flespi is the fastest way to an MVP. It parses Teltonika data into JSON and streams it over HTTP ([flespi Teltonika](https://flespi.com/protocols/teltonika)). Its free tier covers **10 devices** ([fitgap](https://us.fitgap.com/products/014797/flespi)), and flespi says commercial plans work out to roughly EUR 0.03-0.50 per device per month ([flespi blog](https://flespi.com/blog/flespi-pricing-simplification)).

Traccar is the alternative for ownership and cost at scale. It is free under the Apache 2.0 licence, supports more than 200 protocols, and can forward events as JSON webhooks ([GitHub](https://github.com/traccar/traccar); [Traccar forwarding](https://www.traccar.org/forward/)). In exchange, GaragePro takes on Java and MySQL operations, and the FMC003 OBD fields may need decoder patches ([Traccar forum](https://www.traccar.org/forums/topic/support-for-teltonika-fmc003-tracker-in-traccar/)). White-label fleet platforms such as Wialon (about $5-10 per vehicle per month, [ITQlick](https://www.itqlick.com/wialon/pricing)) duplicate GaragePro's own interface and cost more, so they are not a good fit. AWS IoT FleetWise has been closed to new customers since 30 April 2026 ([AWS](https://docs.aws.amazon.com/ja_jp/iot-fleetwise/latest/developerguide/iotfleetwise-availability-change.html)).

Supabase needs three tables:

- **`telemetry`:** raw positions, partitioned by time with pg_partman and pg_cron. TimescaleDB is no longer bundled on Postgres 17 ([Supabase changelog](https://supabase.com/changelog/35851-forthcoming-postgres-17-release-notes); [pg_partman guide](https://supabase.com/docs/guides/database/migrating-to-pg-partman)). Old partitions are dropped after, for example, 90 days.
- **`vehicle_state`:** last odometer, battery voltage and current DTC set for each car.
- **`telemetry_events`:** the events that drive the UI and messaging.

Supabase Realtime should broadcast only derived events, because the Pro plan caps traffic at 500 messages per second ([Supabase limits](https://supabase.com/docs/guides/realtime/limits)).

For fault-code text, the open OBDex dataset (CC0) covers generic codes. It deliberately excludes manufacturer-specific P1xxx and B1xxx codes ([OBDex](https://github.com/foerbsnavi/OBDex)), because the same code means different things on different makes ([YouCanic](https://www.youcanic.com/glossary/manufacturer-codes/)). The alert should therefore show "code + generic meaning + bring it in for a full scan". That suits GaragePro, which already scans cars at the garage.

Security needs separate controls at each link:

- **Device to decoder.** The device's identity is just its IMEI, sent in clear text. Use an IMEI allowlist per tenant, TLS between device and decoder (Teltonika and flespi both support it), and plausibility checks on the data.
- **Decoder to Vercel.** Sign the webhook separately.
- **Hardware.** In 2017, Bosch's Drivelog dongle was shown to allow CAN-bus message injection that could stop the engine ([SecurityWeek](https://www.securityweek.com/flaws-bosch-car-dongle-allow-hackers-stop-engine/amp/)). Lock remote configuration through Teltonika FOTA WEB ([Teltonika FOTA WEB](https://teltonika-gps.com/products/solutions/fota-web)), and never let customers push device commands.

On messaging cost, Meta has billed WhatsApp per message since July 2025. Utility templates are free only inside an open 24-hour customer-service window ([Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)). An unprompted fault alert is therefore a paid utility message. Budget for it, and limit alerts to events that matter.

## Unit cost runs about 13-27 TND a month, so fleets and garages should pay

The cost per connected vehicle comes from three published inputs: hardware, SIM and middleware.

- **Hardware.** EUR 74 ex VAT is about 247 TND at roughly 0.30 EUR per TND (check the current rate). Spread over 24-36 months, that is **7-10 TND per month**, before import duty, VAT, homologation and installation.
- **SIM.** Orange Tunisie's M2M page lists **5 TND for 5 MB, 14 TND for 20 MB and 18 TND for 100 MB per SIM per month, VAT included** ([Orange M2M](https://www.orange.tn/business/offres-m2m)). Data use depends on the reporting interval. Professional Teltonika customers typically use 3-6 MB a month ([Teltonika community](https://community.teltonika-gps.com/15366/teltonika-truphone-io3-sim-card-400mb-5-year-prepaid?show=15422)), while a 5-minute interval uses 10-30 MB ([GPS-Trace](https://gps-trace.com/en/blog/consumption-of-mobile-traffic-gps-trackers)). Diagnostics-only cars fit the 5 MB tier. Live anti-theft tracking needs the 20 MB tier.
- **Middleware.** flespi's commercial plans work out to roughly EUR 0.03-0.50 per device per month ([flespi blog](https://flespi.com/blog/flespi-pricing-simplification)), up to about EUR 1 per device at pilot scale on an entry plan. That is **0-3 TND per month**.

Together these give roughly **13 TND for a diagnostics-only car and 27 TND for a fully tracked car**, before support.

Local benchmarks put the price ceiling close to that cost. A Tunis-focused blog estimates fleet tracking at **20-40 TND per vehicle per month** ([Kolonell](https://kolonell.com/fr/blog/meilleure-application-societe-ambulances-transport-sanitaire-tunis-2026)). European rental pricing averages about EUR 22 per month on 36-48-month contracts ([Companeo](https://www.companeo.com/geolocalisation-de-vehicules/guide/systemes-de-geolocalisation-de-vehicule-:-quel-prix)). The margin therefore depends on negotiating pooled or volume SIM pricing with Orange, Ooredoo (which runs an Ericsson-based IoT Connect Manager, [Ericsson](https://www.ericsson.com/en/partners/marketplace/offering-catalog/ooredootunisia-connectivity-management)) or Tunisie Telecom, and on buying hardware through a distributor rather than at retail.

| Offer | Who pays | Indicative price (TND/vehicle/month) | What is included |
|---|---|---|---|
| Fleet Pro (taxis, louages, rental, SME delivery, ambulances) | Fleet owner | 30-40, 24-36-month rental | All four feature groups, live GPS, unplug and tow alerts, maintenance agenda |
| Garage Retention | Garage (as a GaragePro add-on) | 15-20 per active device | DTC, mileage and battery alerts with booking proposals; GPS only for theft events |
| Anti-theft upgrade | Motorist (optional, on top of Garage Retention) | +10-15 | Live tracking and theft alerts |

These prices are a synthesis from the cost and benchmark figures above, not market-tested quotes.

The case against consumer subscriptions is strong. Automatic shut down in May 2020 ([Engadget](https://www.engadget.com/automatic-obd-diagnostic-dongle-shuts-down-192653493.html)). Verizon Hum stopped working on 31 December 2025, taking crash response and diagnostics with it ([9to5Google](https://9to5google.com/2025/10/01/verizon-hum-shutting-down/)). FIXD survives on a USD 70-100 yearly app subscription that reviewers tie to auto-renewal complaints ([ConsumerAffairs](https://www.consumeraffairs.com/automotive/fixd.html)).

The models that last are B2B. Zubie moved from consumers to business fleets ([Zubie](https://zubie.com/blog/introducing-zubie-business/)). Geotab sends fault codes into Fleetio "to instantly kick off a maintenance workflow" ([Fleetio](https://www.fleetio.com/blog/geotab-integration)). Connected Cars in Denmark sells OBD hardware to workshops as a way to retain customers, and claims up to **86% more revenue on vans seven years or older**, a vendor figure that has not been audited ([Connected Cars](https://connectedcars.io/customer-success-story-volkswagen-commercial-vehicles-denmark-increases-revenue-and-brand-loyalty-through-connectivity/)).

Carmaker programmes are free to the motorist and funded from dealer aftersales budgets. They also work through people: a Mercedes dealer describes connected-car leads that drive "a lot of outbound" calls ([DealershipGuy](https://news.dealershipguy.com/p/mercedes-dealer-boosts-service-conversions-by-20-using-connected-car-data-2025-08-05)). That supports the user's "alert + propose a slot" design, with one addition: the garage should also get a **daily call list**, because no published case shows an alert converting into a booking on its own.

The garage-paid fee also holds up against the value of a lead. US garages pay about **$25-45 per lead** from ads ([Webtonic](https://www.webtonic.io/blog/auto-repair-google-ads-statistics)). At 15-20 TND a month per car, one captured repair job a year pays for the device.

GaragePro should not sell devices outright as its main model. Outright sales leave it paying for SIMs without recurring revenue, and leave stranded hardware if the service ends. Rental with a deposit or early-termination fee, as in French box rental, avoids both problems.

## CERT homologation and INPDP filings come before the first paid install

Tunisian law requires two filings before the first paid installation, plus a few points to confirm.

**Device homologation (CERT).** Under **Government Decree 2020-48**, telecom terminals and radio equipment need homologation before import and sale ([legislation-securite.tn](https://legislation-securite.tn/latest-laws/decret-gouvernemental-n-2020-48-du-23-janvier-2020-relatif-aux-procedures-dhomologation-dimportation-et-de-commercialisation-des-equipements-terminaux-de-telecommunications-et-des-equipemen/)). CERT approval is mandatory, and its legal basis also includes the 2001 Telecommunications Code ([Applus](https://www.appluslaboratories.com/global/en/what-we-do/service-sheet/other-middle-east-central-asia-and-african-countries-radio-type-approval)). The application must come from a **Tunisian-registered entity or local representative**. Testing in CERT's lab is common, lead times are reported at **6-10 weeks**, and certificates reportedly do not expire ([Nanotech Sol](https://www.nanotechsol.com/tunisia-cert-type-approval); [IB-Lenhardt](https://ib-lenhardt.com/type-approval/tunisia); [Eleos](https://www.eleoscompliance.com/en/type-approval/tunisia)). CERT also absorbed the former ANCE encryption approvals ([Eleos](https://www.eleoscompliance.com/en/article/Tunesien-ANCE-Verschlüsselungsanforderungen)), so ask whether enabling TLS on the dongles triggers that review.

**GPS.** GPS itself no longer appears to be a legal barrier. The topography office lost its 2009-2010 court fight against the sale of GPS navigation devices ([Business News](https://businessnews.com.tn/2010/02/02/article-1093441/1093441/)). The Présidence du Gouvernement itself put GPS/GPRS boxes for 234 vehicles out to tender in 2026 ([pm.gov.tn](https://pm.gov.tn/sites/default/files/2026-06/Avis%20d%E2%80%99Appel%20d%E2%80%99Offres%20n%C2%B0%20182026%20%C3%A0%20Proc%C3%A9dures%20simplifi%C3%A9es.pdf)). Customs should still confirm this in writing.

**Data protection (INPDP).** Location data linked to an owner or driver is personal data under **Organic Law 2004-63**. The law requires a prior declaration to the INPDP and **authorisation for transfers abroad** ([INS text](https://www.ins.tn/sites/default/files/2020-04/Loi%2063-2004%20Fr.pdf); [Boussayen Knani](https://bkassocies.tn/en/practical-guide-application-of-tunisian-legislation-on-personal-data-protection/)). This matters because flespi is a Latvian service and GaragePro's Supabase project is presumably hosted outside Tunisia.

A GDPR-style replacement bill, **PLO 095/2025**, would add a data protection officer, impact assessments for high-risk processing and 72-hour breach notification. Its status is unclear: some sources give 11 July 2026 as its entry into force, while others say it has not been published in the official journal ([regulations.ai](https://regulations.ai/news/tunisia-data-protection-law-2026-deadline-gdpr-like-rules); [Elair Avocat](https://www.elair-avocat.com/en/news/gdpr-tunisian-law-ai-obligations-2026/)). Build to the stricter standard now:

- explicit written consent from the car owner;
- for fleets, telling drivers about the tracking and limiting it to working hours;
- contracts that make the garage or fleet the data controller and GaragePro the processor;
- deletion when a contract ends.

The GM OnStar case shows what happens otherwise. The FTC's 20-year order, finalised in January 2026, now requires express consent for connected-vehicle data and bans GM from sharing it with consumer reporting agencies for five years ([TechCrunch](https://techcrunch.com/2026/01/14/the-ftcs-data-sharing-order-against-gm-is-finally-settled)). Any future insurer data partnership should therefore be strictly opt-in.

**SIM and connectivity.** No licence specific to vehicle tracking services was found. Topnet with Be Wireless, Tunisie Telecom and several private integrators already sell tracking openly ([automobile.tn](https://www.automobile.tn/fr/magazine/actu/2020-08-12-iris-gps-topnet-lance-sa-solution-de-geolocalisation-pour-les-flottes.html); [Business News](https://businessnews.com.tn/?p=1090537)). Using operator M2M SIMs makes GaragePro an operator's customer, not an operator. Whether bundling SIM connectivity into a rental needs an INT authorisation was not found, so ask INT.

Foreign multi-network IoT SIMs such as Onomondo claim to work on all three Tunisian networks ([Onomondo](https://onomondo.com/iot-sim/the-best-iot-sim-cards-for-tunisia/)). Permanent-roaming rules are unverified, though, so a **local M2M SIM is the lower-risk default**. 4G reaches about **96% of the population**, against 99% for 3G ([Ecofin](https://www.ecofinagency.com/news-digital/2302-53162-tunisia-to-begin-3g-shutdown-in-2027-central-bank-warns-of-payment-impact)), so expect gaps in rural areas, where the device will fall back to 2G.

## Ten cars on a free tier answer the open questions

The main risks are known and can each be mitigated:

- **Unreliable odometer.** Label a reading "OEM odometer" only when it differs from the GPS odometer (AVL 16), and keep a per-model compatibility table.
- **Shallow fault codes.** Show the generic meaning only and direct the owner to a full garage scan.
- **Battery drain.** Check sleep current at every installation and send an alert when voltage drops.
- **Unplugging by thieves.** Forum users say a visible dongle is one of the first things a thief removes ([MBClub forum](https://forums.mbclub.co.uk/threads/obd-dongles-secure.133674)). Hide the unit behind the dash with Teltonika's OBD extension cable ([Teltonika](https://teltonika-gps.com/products/accessories/data-cables/obd-ii-and-oem-data-extension-cable)), and raise an unplug alert.
- **Installation liability.** A UK ombudsman case involved a badly fitted telematics box that may have caused a breakdown ([FOS](https://www.financial-ombudsman.org.uk/decision/DRN-3791811.pdf)). Use trained installers, and state in the terms that alerts are informational.
- **Unknown alert-to-booking conversion.** No published figure exists anywhere, and the pilot is the only way to get one.

**Pilot plan.** Run it in roughly three steps.

1. **Order samples and file with CERT (month 1).** Order 10-12 FMC003 X4 units and one Teltonika extension cable per car, importing them under CERT's test or sample procedure. Ask Teltonika sales for a North Africa partner and volume pricing. In parallel, file the CERT homologation and the INPDP declaration and transfer request, and ask Orange, Ooredoo and Tunisie Telecom for pooled M2M quotes, a private APN and static IPs.
2. **Build the data path (weeks 2-6).** Point the devices at a flespi free-tier channel with TLS, stream events to an HMAC-signed Vercel route, add the three Supabase tables, and connect events to the existing reminder and agenda engine. The flow is a WhatsApp or PWA alert with two proposed slots, plus a garage call list.
3. **Install and measure (months 2-4).** Fit the units in 5 cars belonging to one partner garage's loyal customers and 5 cars from one taxi, louage or rental fleet. Track:
   - the share of cars with a valid OEM odometer;
   - whether dongle DTCs match the garage's scan tool;
   - deep-sleep current and data use in MB per month;
   - false theft or unplug alarms;
   - alert-to-booking conversion and revenue per alert;
   - installation and support minutes per car.

**Go/no-go.** Scale to 50-100 cars, and move to a paid flespi plan or self-hosted Traccar, only if four conditions hold: at least 70% of pilot cars give useful diagnostics, the SIM quote brings the fully tracked cost under about 20 TND, at least one fleet signs at Fleet Pro pricing, and CERT approval is in hand. The 70% threshold is a judgement call, not a sourced benchmark.

## Conclusion

The question is less whether a 4G dongle can trigger a booking and more who is willing to pay for the dongle. In Tunisia, the willingness to pay for vehicle telematics comes from anti-theft and fleet control, not from diagnostics. That matches Italy, where insurance black boxes are most common in high-theft provinces such as Caserta (59%) and Naples (47%) ([MarqStats](https://marqstats.com/insights/the-3-million-italian-black-boxes-that-arent-actually-insured/)). The approach that follows is to sell GPS and anti-theft to fleets, and let the diagnostic alerts, which feed GaragePro's agenda, generate the extra repair work for garages. Fault codes are where GaragePro is different from tracking vendors, but they are not what sells the device.

Building this also changes GaragePro's operating model. For the first time it would have always-on infrastructure, regulated hardware imports and a database of personal location data. Doing the CERT and INPDP filings early, and choosing open protocols (Teltonika with flespi or Traccar), keeps the exit options open. If the pilot fails, GaragePro can drop the hardware and still use the same webhook and alert pipeline for trackers that fleets already own, or for carmaker data feeds if it expands to Europe.
