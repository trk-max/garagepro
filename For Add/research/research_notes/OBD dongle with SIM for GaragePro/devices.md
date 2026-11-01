# 4G/LTE (and 2G/LTE-M fallback) OBD-II telematics dongles with own SIM, for GaragePro (Tunisia), 2025-2026

Research note: the session network blocked direct fetches of wiki.teltonika-gps.com, navixy.com and gowifi.co.nz, so findings below come from search-engine extracts of those pages (vendor wiki, datasheets, distributor listings, forums). Exact wording in vendor datasheets should be re-checked before purchase.

## Q1. Models and vendors: which read DTCs, OBD PIDs, real odometer, battery voltage, crash, unplug/tow, idle, fuel

### Takeaway
Teltonika FMC003 (LTE Cat 1 + 2G fallback) is the best-documented OBD dongle for this use case: it reads DTCs, MIL status, VIN, OBD PIDs and, on supported vehicles, OEM real odometer and fuel level; its FMM003 sibling is the LTE-M/NB-IoT option. The 2G-only FMB003 is end-of-life. Queclink GV500 family, Ruptela Plug5 and Jimi VL-series also exist, but their DTC support is less clearly documented.

### Cited Findings
**Teltonika FMC003 (LTE Cat 1, 2G fallback)**
- Vendor positioning: "The main feature of FMC003 is its possibility to read OEM parameters (PIDs) via OBD port... read Real Odometer and Real Fuel Level data"; datasheet says it reads "OEM Fuel level, odometer and up to 32 vehicle onboard parameters" — [Teltonika DS FMC003](https://wiki.teltonika-gps.com/images/2/23/DS-FMC003.pdf); [PB Tech listing](https://www.pbtech.com/pacific/product/NETTTK0031/Teltonika-FMC003-4G-LTE-Cat-1-tracker-with-OBD-OEM)
- Teltonika FMx003 feature list includes mileage, DTC, DTC value, time since codes cleared, and distance travelled with MIL on — [FMx003 features and parameters PDF](https://wiki.teltonika-gps.com/images/b/b0/FMx003-features-and-parameters.pdf)
- Platform (Navixy) exposes FMC003 fields: OBD DTC codes, DTC number, DTC-cleared distance, MIL-activated distance, MIL status, OBD VIN, OBD custom odometer, hardware mileage, MIL run time — [Navixy FMC003](https://www.navixy.com/en/devices/teltonika/teltonika-fmc003)
- DTC fault codes are Parameter ID 40420 / AVL ID 281 (firmware 03.28.03); AVL IDs above 255 need Codec 8 Extended enabled — [Teltonika community: faultcodes in configurator](https://community.teltonika-gps.com/27228/fmc003-settings-faultcodes-missing-configurator-obdii-server)
- OEM odometer is AVL ID 389. To get it, the vehicle must be on Teltonika's OEM supported-vehicle list and "OEM Total Mileage" must be set to Low Priority in the OBDII tab — [Teltonika community: io389](https://community.teltonika.lt/t/fmc003-dont-read-io389-obd-odometer-value/14308); [Traccar forum FMB003](https://www.traccar.org/forums/topic/teltonika-fmb003/)
- Status: active. EU/MEA variant (product code X4****) uses a MeiG SLM320-PE2C module — [Teltonika Frequency Bands wiki](https://wiki.teltonika-gps.com/view/Frequency_Bands)
- A successor/variant in the OBD family, FMC800 ("OBDII Plug and Play 4G LTE CAT1 Tracker"), is also sold — [GoWiFi FMC800](https://www.gowifi.co.nz/cabling/fmc800.html?Itemid=318); [PB Tech FMC800](https://www.pbtech.com/product/NETTTK1028/Teltonika-FMC800-4G-LTE-CAT1Tracker)

**Teltonika FMM003 (LTE Cat M1 / NB-IoT / EGPRS)**
- Module Quectel BG95-M3 (Teltonika TM2500); LTE Cat M1 / Cat NB2 / EGPRS / GNSS / Bluetooth LE; OBD OEM data reading — [Voelkner FMM003](https://www.voelkner.de/products/13625784/FMM003-OBD-Tracker-mit-4G-LTE-Cat-M1-und-OEM-Datenauslesung.html)

**Teltonika FMB003 (2G only)**
- Teltonika's French product page marks FMB003 as end-of-life ("Notre plus petit traceur 2G..."), with end-of-order/production dates blank in the snippet — [Teltonika FMB003 (FR)](https://www.teltonika-gps.com/fr/products/trackers/obd-data/fmb003)
- Ultra-small OBD device, GNSS + GSM + BLE 4.0 — [GPS-Trace FMB003](https://gps-trace.com/en/devices/teltonika-fmb003)
- (FMB020 OBD variant: not found in results — see Gaps.)

**Queclink**
- GV500MA: plug-in OBD-II tracker, LTE Cat M1/NB1 with 2G (EGPRS) fallback, -30 to 80 °C; Queclink catalog frames the fallback "for operation in North America" — [EmbeddedWorks GV500MA](https://embeddedworks.net/product/tdev252/); [Queclink catalog via DirectIndustry](https://pdf.directindustry.com/pdf/queclink/gv500ma-lte-cat-ml-nbl-plug-in-vehicle-tracker-designed-car-light-truck-tracking-breakdown-assistancedealer-lot-management-new-driver-monitoring/4568919-1088360.html)
- GV500MAP (sibling): Navixy lists OBD DTC codes, DTC number, MIL status, DTC-cleared distance, RPM, speed, coolant temp — [Navixy GV500MAP](https://www.navixy.com/devices/queclink/queclink-gv500map)
- GV500 (older): Wialon lists DTC field and DTC count — [Wialon GV500](https://wialon.com/en/gps-hardware/obd/queclink-gv500)
- GV500CNA: compact LTE Cat 1 bis OBD tracker, BLE 5.1, crash detection and driver behaviour, 8-32 V — [EmbeddedWorks GV500CNA](https://embeddedworks.net/product/tdev303/)
- GV501LG: LTE Cat 4 OBD "router" with Wi-Fi AP, for insurance/leasing — [Queclink catalog via DirectIndustry](https://pdf.directindustry.com/pdf/queclink/gv501lg-lte-cat-4-easy-install-obd-router-wifi-ap-mode-specially-designed-insurance-car-leasingand-real-time-monitoring-applications/4568919-1088361.html)

**Concox / Jimi IoT**
- Concox OB22: plug-and-play OBD tracker on GSM/GPRS (2G); alarms include SOS, power cut, vibration, geofence, overspeed, harsh accel/brake; Navixy lists OBD plug/unplug and crash alarm; no DTC reading documented — [Navixy OB22](https://navixy.com/en/devices/jimi-iot-concox/concox-ob22); [Wialon OB22](https://wialon.com/en/gps-hardware/obd/concox-ob22)
- Jimi JM-VL04: "professional 4G OBD vehicle tracker"; listed OBD data: RPM, coolant temp, engine load, fuel; no fault codes in listing — [Navixy JM-VL04](https://navixy.com/en/devices/jimi-iot-concox/jimi-iot-jm-vl04)
- Jimi JM-VL505: 4G LTE OBD tracker, "remote diagnostics" (DTC not explicit) — [Navixy JM-VL505](https://navixy.com/en/devices/jimi-iot-concox/jimi-jm-vl505)
- JimiLab VL502: LTE OBD-II tracker; alerts: Car Fault, Over-Speed, Ignition, Collision, Geo-fence, Power on, Device pull-out, Engine idling — [PB Tech VL502](https://www.pbtech.com/product/IPCJIM0005/JimiLab-VL502-LTE-OBDII-GNSS-Tracker-On-board-diag); [Newegg](https://www.newegg.com/p/0FA-06RJ-00084)

**Ruptela**
- Plug5: plug-and-play OBD; CAN (FMS, J1708, J1939), OBD-II and DTC reading; LTE Cat 4 and LTE-M; 9-30 V; 3-axis accelerometer; internal backup battery — [StepGlobal Plug5](https://shop.stepglobal.com/Plug5/Ruptela-Plug5%3A-Advanced-Plug-_and_-Play-OBD-GPS-Tracker/pd.php); [Trackobit Plug5](https://trackobit.com/?p=16334)
- FM-Plug4/Plug4+: older OBD units with basic OBD/DTC, 2G GPRS — [Trackobit FM-Plug4](https://trackobit.com//gps-trackers/obd-gps-trackers/ruptela-fm-plug4-obd2)
- FM-Eco4 / Eco4 Light: hardwired trackers (10-32 V, IP67), not OBD dongles — [Trackobit Eco4 Light](https://trackobit.com//gps-trackers/avl-devices/ruptela-fm-eco4-light)

**CalAmp**
- LMU-3045: 4G LTE/3G Cat 1 OBD-II tracker, BT and buzzer, SKU sold for AT&T/T-Mobile (US carriers) — [EmbeddedWorks LMU-3045](https://embeddedworks.net/product/wwan1282/)

### Inferences
- For "DTC + odometer + voltage + unplug alert" on mixed European/Asian cars, Teltonika FMC003 is the strongest documented choice. FMM003 is the alternative if LTE-M works locally, but LTE-M availability in Tunisia was not confirmed (see Q2), so FMC003 (Cat 1 + 2G fallback) looks safer.
- Queclink GV500MA and CalAmp LMU-3045 SKUs found are North-America oriented. They would need a regional variant for Tunisia.
- Low-cost Jimi/Concox units suit GPS/anti-theft (unplug, collision, ignition) better than real diagnostics.

### Gaps
- Teltonika FMB020 OBD variant: no results found.
- Geotab GO, Suntech and Meitrack OBD models: not researched within the tool budget. Geotab is widely known as a closed ecosystem needing a reseller/MyGeotab, but this was not sourced here.
- Full FMC003 PID list, and battery-voltage AVL IDs (external voltage is a standard Teltonika I/O), were not retrieved because the wiki was blocked.
- DTC reading on GV500MA itself and on Jimi VL04/VL505 is not confirmed.

## Q2. Network support in Tunisia (bands, 2G sunset, LTE-M, eSIM)

### Takeaway
Tunisian operators run 4G on B3 (1800) and B20 (800), and 2G on 900/1800. The FMC003 EU/MEA variant covers B3 and B20 plus 2G fallback, so it matches. No 2G switch-off date for Tunisia was found.

### Cited Findings
- 4G bands B3 (1800 MHz) and B20 (800 MHz) for Ooredoo, Orange and Tunisie Telecom; 2G on B3/B8 (1800/900) — [Kimovil frequency checker TN](https://www.kimovil.com/fr/frequency-checker/TN) (secondary, not guaranteed)
- Ooredoo and Tunisie Telecom launched 4G LTE in March 2016 on those bands; they have an infrastructure-sharing arrangement; Ooredoo 2G on 900 MHz, TT on 900/1800 — [Powertec Ooredoo Tunisia](https://portal.powertec.com.au/industry-resources/companies/ooredoo-tunisia); [Powertec Tunisie Telecom](https://portal.powertec.com.au/industry-resources/companies/tunisie-telecom)
- Tunisie Telecom executive had planned a 3G shutdown (June 2022 target) to refarm spectrum. 5G licences: 700 MHz and 3.5 GHz — [OperatorWatch 2024](https://www.operatorwatch.com/2024/05/tunisia-is-ready-to-launch-5g-in-2024.html)
- FMC003 EU/MEA (X4****) LTE-FDD bands: B1, B3, B7, B8, B20, B28, plus GSM fallback — [Teltonika Frequency Bands wiki](https://wiki.teltonika-gps.com/view/Frequency_Bands); [Linitx FMC003X4NJ01](https://linitx.com/product/teltonika-telematics-fmc003-4g-lte-cat1-obd-gnss-bluetooth-advanced-gps-tracker-fmc003x4nj01/17218)
- One retailer page describes FMC003 as LTE Cat M1/NB-IoT, which conflicts with Teltonika's Cat 1 classification — [search extract: Voelkner/other retailers](https://www.voelkner.de/products/13863761/FMC003-4G-LTE-Cat-1-OBD-Tracker-mit-OEM-Datenzugriff.html)
- A community thread reports an "FMC003 which never connects to 4G in France/Europe" (content not visible) — [Teltonika community](https://community.teltonika.lt/t/fmc003-which-never-connects-to-4g-in-france-europe/19415)

### Inferences
- Order the EU/MEA FMC003 variant (X4 product code). It covers both Tunisian 4G bands and falls back to 2G, which is still live.
- Because 2G is still live and 3G is being retired, 2G-only devices (FMB003, OB22) would work today but carry sunset risk. 4G Cat 1 with 2G fallback hedges both ways.

### Gaps
- No evidence that LTE-M or NB-IoT is commercially available in Tunisia, which matters for FMM003/GV500MA.
- No official 2G sunset date from INTT or the operators.
- eSIM/M2M IoT SIM offers from Tunisian operators were not researched.

## Q3. Protocols to server and configuration tools

### Takeaway
Teltonika uses Codec 8 / Codec 8 Extended over TCP/UDP (Codec 8E is mandatory for OBD AVL IDs above 255, such as DTCs and OEM odometer). Concox uses its own binary protocol, configured by SMS. Traccar supports Teltonika, but FMC003 OBD fields may need decoder work.

### Cited Findings
- Codec 8 Extended needed for AVL IDs > 255 (DTC ID 281 is fine, OEM odometer 389 is not) — [Teltonika community](https://community.teltonika-gps.com/27228/fmc003-settings-faultcodes-missing-configurator-obdii-server); [Traccar forum FMB003](https://www.traccar.org/forums/topic/teltonika-fmb003/)
- Traccar thread: the server may not decode FMC003 OBD data; one user patched the decoder and rebuilt — [Traccar forum FMC003 support](https://www.traccar.org/forums/topic/support-for-teltonika-fmc003-tracker-in-traccar/)
- Open-source Codec parsers exist (e.g. Elixir `teltonika_codec`) — [hex.pm teltonika_codec](https://hex.pm/packages/teltonika_codec)
- Concox OB22: server port 47755 (Navixy) / 21687 (Wialon); APN, server and interval set by SMS commands — [Navixy OB22](https://navixy.com/en/devices/jimi-iot-concox/concox-ob22); [Wialon OB22](https://wialon.com/en/gps-hardware/obd/concox-ob22); [Tamyeez OB22](https://tamyeez.odoo.com/shop/product/ob22-jimi-ob22-gnss-tracker-at-rs3500-10572)

### Inferences
- GaragePro would need its own Codec 8E TCP listener, or a middleware such as Traccar/flespi, to ingest data. Expect to write custom handling for OBD AVL IDs.

### Gaps
- MQTT support on FMC003 and Queclink @Track ASCII details were not confirmed in sources retrieved.
- Teltonika FOTA WEB pricing and terms were not retrieved.

## Q4. Accuracy and limits: DTC, odometer, battery drain, theft/unplug

### Takeaway
Real OEM odometer works only on vehicles on Teltonika's supported list. Otherwise the device can silently mirror GPS-calculated mileage into the OEM field, so GaragePro must validate. Generic OBD DTC reading has protocol pitfalls. Sleep current is low (about 3-5 mA in deep sleep on FMC003).

### Cited Findings
- Ford Ranger: OEM odometer supported up to around 2022 but not newer models (Teltonika confirmed) — [Traccar forum fmc003 odometer](https://www.traccar.org/forums/topic/fmc003-odometer/)
- Renault Trafic 2024 not on FMC003 supported-vehicle list. The displayed "OEM" value was the GPS odometer mirrored, which the poster called "misleading, as it looks like a valid OBD value when it's not" — [Teltonika community io389](https://community.teltonika.lt/t/fmc003-dont-read-io389-obd-odometer-value/14308)
- BMW 3 Series (E92): OBD data readable over Bluetooth but not transmitted. The device detected ISO 14230-4 (KWP) instead of ISO 15765-4 (CAN) — [Teltonika community BMW](https://community.teltonika.lt/t/fmc003-no-obd-data-transmission-for-bmw-3-series/16235)
- Firmware changelog: fixes restoring real odometer from standard sources to AVL 389, and fixing DTC packing for some EV/hybrids — [FMC003 Firmware Changelog](https://wiki.teltonika-gps.com/view/FMC003_Firmware_Changelog)
- flespi forum: users unable to get odometer and fuel level from FMC003 — [flespi forum 937](https://forum.flespi.com/d/937-cannot-get-odometer-and-fuel-level-values-on-a-fmc003-from-teltonika)
- FMC003 consumption at 12 V: about 35 mA nominal, 12 mA GPS sleep, 4.5 mA deep sleep (wiki); datasheet says under 5 mA deep sleep, under 3 mA ultra deep sleep — [FMC003 General description](https://wiki.teltonika-gps.com/view/FMC003_General_description); [DS FMC003](https://wiki.teltonika-gps.com/images/2/23/DS-FMC003.pdf)
- FMB003 at 12 V: 79.6 mA when sending every 1 s; about 33 mA without sleep; 16 mA GPS sleep; 13 mA deep sleep; 11.7 mA ultra deep sleep. Deep sleep turns off GNSS and GSM, and the unit wakes on movement or ignition — [FMB003 Sleep modes](https://wiki.teltonika-gps.com/view/FMB003_Sleep_modes)
- Known issue: an FMC003 never entered deep sleep, depending on GPS time sync and the "records saving without TS" setting — [Teltonika community deep sleep](https://community.teltonika.lt/t/fmc003-never-enters-deep-sleep-mode/18378)
- Teltonika sells an "OBD-II and OEM data extension cable", a splitter/extension that lets the dongle be hidden — [Teltonika OBD-II extension cable](https://teltonika-gps.com/products/accessories/data-cables/obd-ii-and-oem-data-extension-cable)
- Unplug/pull-out alerts are offered on Concox OB22 and JimiLab VL502 — [Navixy OB22](https://navixy.com/en/devices/jimi-iot-concox/concox-ob22); [PB Tech VL502](https://www.pbtech.com/product/IPCJIM0005/JimiLab-VL502-LTE-OBDII-GNSS-Tracker-On-board-diag)

### Inferences
- Calculation: at 4.5 mA, deep sleep draws about 0.11 Ah/day, or about 3.2 Ah/month, which is acceptable for a healthy 60 Ah battery. A unit stuck at 35 mA would draw about 25 Ah/month, which could flatten a weak battery on a car parked for weeks. Sleep configuration must be verified on each install.
- GaragePro should flag odometer readings as "OEM" only when they are not equal to the GPS odometer (AVL 16). It should check each car model and year against Teltonika's supported-vehicle list, which matters given Tunisia's older and Chinese-brand fleet.
- An exposed OBD dongle can be unplugged by a thief, so anti-theft use needs the extension cable to hide the unit, plus unplug alerts.

### Gaps
- Coverage of Teltonika's OEM list for Chinese brands (Chery, Geely, MG, etc.) and for older 2005-2015 European/Korean cars was not retrieved.
- How well generic DTC reading handles manufacturer-specific (P1xxx) codes and non-engine modules (ABS, airbag) is not documented in the sources found. Generic OBD-II mode 03 is typically limited to emission-related powertrain codes, but this was not sourced here.
- Petrol cars sold in Europe from 2001 and diesels from about 2004 should have EOBD, but no source for this was retrieved.

## Q5. Prices, data consumption, warranty, certifications

### Takeaway
Retail FMC003 costs about EUR 74 net (about EUR 86 incl. VAT) and FMM003 about EUR 87 incl. VAT in Germany. Typical Teltonika data use is about 3-30 MB per month depending on reporting interval.

### Cited Findings
- FMC003: EUR 74.01 + VAT (Lieske); EUR 86.46 (Voelkner); GBP 70.99 ex VAT / 85.19 inc VAT (Linitx); AUD 150.73 + GST (PB Tech) — [Linitx](https://linitx.com/product/teltonika-telematics-fmc003-4g-lte-cat1-obd-gnss-bluetooth-advanced-gps-tracker-fmc003x4nj01/17218); [Voelkner FMC003](https://www.voelkner.de/products/13863761/FMC003-4G-LTE-Cat-1-OBD-Tracker-mit-OEM-Datenzugriff.html); [PB Tech AU](https://www.pbtech.com/au/product/NETTTK0031/Teltonika-FMC003-4G-LTE-Cat-1-tracker-with-OBD-OEM)
- FMM003: EUR 86.88 incl. VAT, 3-4 weeks delivery (Voelkner) — [Voelkner FMM003](https://www.voelkner.de/products/13625784/FMM003-OBD-Tracker-mit-4G-LTE-Cat-M1-und-OEM-Datenauslesung.html)
- FMB003: best UK price around GBP 64.86 — [PriceSpy UK](https://pricespy.co.uk/product.php?p=16305308)
- FMC800: AUD 126.19 (PB Tech), NZD 173 + GST (GoWiFi) — [PB Tech FMC800](https://www.pbtech.com/product/NETTTK1028/Teltonika-FMC800-4G-LTE-CAT1Tracker)
- Generic Cat 1 OBD (UM405, Quectel EC25) on eBay.de: about USD 189 — [eBay.de](https://www.ebay.de/itm/126748210631); low-cost 4G OBD trackers from about USD 15 on Walmart, some subscription-locked — [Walmart](https://www.walmart.com/c/kp/obd-gps-tracker)
- Data: "most professional Teltonika customers consume roughly 3 to 6 MB per month" (Truphone SIM seller) — [Teltonika community Truphone](https://community.teltonika-gps.com/15366/teltonika-truphone-io3-sim-card-400mb-5-year-prepaid?show=15422); about 5 MB/month for 1,600 km with 30-min wake-ups, about 10 MB/month with TCP+TLS — [Traccar forum mobile data usage](https://www.traccar.org/forums/topic/mobile-data-usage/); 10-30 MB/month at a 5-min interval — [GPS-Trace blog](https://gps-trace.com/en/blog/consumption-of-mobile-traffic-gps-trackers); 1-10 MB typical — [Things Mobile](https://www.thingsmobile.com/q-a/how-much-data-traffic-does-a-gps-tracker-use)

### Inferences
- Budget about EUR 60-75 per unit (ex VAT) for Teltonika FMC003 at retail, likely less at volume through a distributor, plus Tunisian import duties. Plan an IoT SIM of 20-50 MB/month per car.

### Gaps
- Volume/distributor pricing and Alibaba prices for Chinese 4G OBD units were not found.
- Warranty terms and CE/RED/E-Mark certificates were not retrieved (datasheet was blocked).

## Q6. Availability in Tunisia / North Africa

### Takeaway
No Tunisian Teltonika, Queclink, Ruptela or Jimi distributor was found in searches. Import from EU distributors, or a regional partner located through vendors' partner locators, seems required.

### Cited Findings
- English and French searches ("Teltonika Tunisie revendeur") found no Tunisian or Maghreb reseller. Results covered Uzbekistan, Saudi Arabia and Azerbaijan; GPS Solutions (Azerbaijan) claims official distribution of Gurtam, Teltonika and Ruptela — [gps.az](https://gps.az/en/wp-json/wp/v2/posts/2860)
- Teltonika publishes French-language product pages, including for FMB003 — [Teltonika FMB003 (FR)](https://www.teltonika-gps.com/fr/products/trackers/obd-data/fmb003)

### Inferences
- GaragePro should contact Teltonika sales directly for a North Africa partner and check Tunisian import rules for radio equipment (type approval) before ordering.

### Gaps
- Tunisian type-approval (CERT / INTT homologation) requirements for GSM trackers were not researched.
- Local Tunisian GPS-tracking installers (Facebook marketplaces, Tunisian fleet companies) were not identified.
