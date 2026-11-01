# Third-party integrations for a global and Tunisia/MENA garage management SaaS (2025-2026)

Method note: 15 web searches (budget cap). Most results were vendor pages, help centres, trade press and third-party aggregators. Where a claim rests only on an aggregator or vendor marketing, that is noted. Items known from general industry knowledge but NOT verified in this session are kept in Inferences or Gaps and flagged "unverified", never cited.

## Parts catalogues and data standards (TecDoc, ACES/PIES, US punch-out, EU wholesalers, Tunisia/MENA distributors)

### Takeaway
In the US, competitors do not build parts catalogues. They embed punch-out or ordering aggregators (PartsTech, Nexpart, Worldpac SpeedDial, Epicor). In Europe/MENA, TecAlliance TecDoc is the de facto catalogue standard. It is licensed commercially, prices are negotiated, and access goes via SOAP/REST (Pegasus 3.0). In Tunisia no online B2B parts ordering platform for garages surfaced. Ordering appears to be largely offline (phone/counter), and used parts matter a lot.

### Cited Findings
- Tekmetric supports three parts integrations launched from inside the app: PartsTech, Nexpart and Worldpac SpeedDial. One vendor (e.g. NAPA) can be reached through several of them. There is no direct NAPA TRACS integration. — [Tekmetric support](https://support.tekmetric.com/hc/en-us/articles/360041671633)
- Worldpac SpeedDial is a desktop app that must be installed on each PC. Nexpart is configured with Multi-Seller credentials under Shop Settings > Integrations and punches out to complete the PO. PartsTech connects via sign-in plus "Connect". — [Tekmetric support](https://support.tekmetric.com/hc/en-us/articles/360041671633); [Tekmetric Nexpart setup](https://tours.tekmetric.com/answers/integrate-nexpart-multi-seller-with-tekmetric); [Tekmetric PartsTech setup](https://tours.tekmetric.com/answers/partstech-set-up-tekmetric)
- Aug 2025: the Nexpart–Tekmetric integration added one-click transfer of parts and tires back into Tekmetric estimates. Nexpart promotes repair data "powered by MOTOR TruSpeed". — [MOTOR](https://www.motor.com/2025/08/nexpart-tekmetric-integration-streamlines-shop-supply-chains/); [Digital Commerce 360](https://www.digitalcommerce360.com/2025/08/28/tekmetric-adds-nexpart-digital-integration-to-expand-parts-access/)
- Tekmetric claims 70+ integrations in total. — [Tekmetric integrations](https://tours.tekmetric.com/answers/integrations-tekmetric)
- Shopmonkey lists parts procurement through PartsTech, Nexpart, Epicor and WorldPac. — [Shopmonkey help](https://support.shopmonkey.io/hc/en-us/articles/38743737653908-Getting-Started-Integrations-with-Shopmonkey)
- TecDoc licence:
  - The licence is obtained from TecAlliance GmbH. There is no public fixed price; terms are negotiated annually, and official partners can broker it in most EU countries.
  - Access is via SOAP/REST web services. Data must be mapped into your own model.
  - Prices and stock come separately (e.g. TecCom).
  - Source: a secondary, agency-written guide. — [dev-opla guide](https://dev-opla.com/resources/what-is-tecdoc-auto-parts-ecommerce-guide)
- The Pegasus 3.0 SOAP endpoint is webservice.tecalliance.services/pegasus-3-0. Open-source clients need a provider ID, API key and language code. — [Nextis wiki](https://podpora.nextis.cz/index.php/Integration_overview); [gerfey/tecdoc-client](https://github.com/gerfey/tecdoc-client)
- UK: Garage Hive has a partnership with parts supplier GSF Car Parts. — [S&P Aftermarket Insight](https://aftermarketinsight.spglobal.com/news/1183/gsf-car-parts-partners-with-garage-management-software-specialist-garage-hive)
- France B2B parts channels for garages:
  - Vroomly Parts launched in late 2020 with 600+ garages. — [j2rauto](https://j2rauto.com/rechange/vroomly-passe-a-la-vitesse-superieure)
  - Originauto (Mobivia) targets repairers. — [j2rauto](https://j2rauto.com/rechange/e-commerce/originauto-veut-simposer-comme-un-fournisseur-referent-pour-les-reparateurs)
  - Marketparts.com is a B2B sourcing/destocking marketplace. — [j2rauto](https://j2rauto.com/rechange/top-depart-pour-marketparts-com)
  - Autodoc is developing a range for repair professionals. — [Auto Infos](https://www.auto-infos.fr/plateforme-de-pieces/9/)
- Tunisia:
  - A 2024 spare-parts crisis was linked to dinar depreciation and limited availability. The press also notes that used parts are highly sought and new parts can cost 2-3x more. — [La Presse](https://www.lapresse.tn/?p=148333)
  - Tunisia has 260+ automotive component firms, but they are export manufacturing, not aftermarket distribution. — [Tunisie Numérique](https://www.tunisienumerique.com/la-tunisie-simpose-comme-une-plateforme-regionale-pour-les-composants-automobiles/)
  - The Précisium network, entering Tunisia, had to work with local platforms and equipment makers for OE parts. — [j2rauto](https://j2rauto.com/non-classe/precisium-simplante-en-tunisie-2)

### Inferences
- For MENA, the realistic path is (a) a TecDoc licence through a TecAlliance partner, for parts identification and cross-references, plus (b) a supplier-agnostic "quote request" workflow (WhatsApp/PDF/email to local distributors) rather than API ordering, because no Tunisian distributor APIs surfaced.
- A US-market launch would require PartsTech and Nexpart integrations at minimum. Both are aggregator partner programmes, so one integration reaches many suppliers.
- Unverified (general knowledge, not checked this session): ACES (fitment) and PIES (product attributes) are Auto Care Association standards licensed to members/subscribers; Partslink24 is a paid OE catalogue portal covering many OEM brands.

### Gaps
- No official TecAlliance price or workshop-software (DMS) licence terms were found. Contact TecAlliance/TecRMI directly.
- ACES/PIES licensing, Partslink24 API access and Epicor/WorldPac API terms were not verified.
- No named Tunisian/MENA parts distributors with online ordering or APIs were found. Field research is needed: Tunis distributors, and GCC players.

## Repair and maintenance data / labour times

### Takeaway
Competitors embed a third-party data provider rather than build their own:
- US: ALLDATA, MOTOR via partners, and Mitchell.
- UK/EU: Autodata and HaynesPro.

HaynesPro explicitly sells all of its data via web services/API to software partners, and some UK DMS vendors bundle it at no extra cost. ALLDATA integrations need the shop's own ALLDATA subscription and exclude diagrams/procedures.

### Cited Findings
- HaynesPro (Infopro Digital Automotive) provides all its data via data exchange services (web services/API). Integration can be partial (e.g. only service bulletins). It claims to be the first automotive data supplier to offer web-service integration. — [Infopro Digital Automotive](https://www.infopro-digital-automotive.com/news/improving-technical-capabilities-of-diagnostic-tools-with-haynespro-data/)
- Workshop Software (AU) integrates HaynesPro WorkshopData so invoices, bookings and job cards are auto-populated with technical data. — [Workshop Software](https://workshopsoftware.com/workshopdata-release/)
- TechMan's GMS gives garages HaynesPro data access at no extra subscription cost. — [IAAF](https://iaaf.co.uk/news/subscription-free-haynespro-data-access-a-hit-for-technicians-and-reception-staff-using-techman)
- Garage Hive includes integrated Autodata repair times. Pricing starts at about £145/month (aggregator). — [Invoco](https://www.invoco.net/integrations/garage-hive/); [fitgap](https://us.fitgap.com/products/021429/garagehive)
- Shopmonkey ALLDATA integration:
  - It pulls parts and labour lookups into estimates.
  - It requires an active ALLDATA subscription.
  - ALLDATA does not allow diagrams/procedures in the integration.
  - Source: [Shopmonkey help](https://help.shopmonkey.io/en/articles/6097577-getting-started-integrations-with-shopmonkey)
- Shopmonkey had no ProDemand integration as of April 2026; users have requested one. — [Trustpilot](https://at.trustpilot.com/review/shopmonkey.io)
- Tekmetric can auto-apply markups on labour items from the MOTOR labour guide. — [GetApp](https://www.getapp.com/auto-repair-software/a/tekmetric)

### Inferences
- For EU/MENA vehicle parc (heavy European/Asian makes: Peugeot, Renault, VW, Kia, Hyundai), HaynesPro or Autodata are the natural fits. HaynesPro's API-first partner model looks easiest for a new SaaS.
- A "bring your own subscription" model (as with ALLDATA) moves licence cost to the garage. A bundled model (TechMan/HaynesPro) is a differentiator but needs a reseller deal.
- Unverified: Identifix (Solera) Direct-Hit and Mitchell ProDemand are US-centric. Autodata belongs to Solera.

### Gaps
- No public prices for HaynesPro/Autodata/MOTOR API licences.
- MENA coverage of Gulf-spec/Asian vehicles is unknown.
- OEM service-schedule APIs (direct from OEMs) were not researched.

## VIN / plate decoding

### Takeaway
UK plate-to-vehicle data is government-backed but gated. The DVSA MOT History API needs an application and approval to get an API key. Commercial wrappers resell it. No Tunisia/MENA plate-to-vehicle API surfaced. VIN decoding (where a VIN is available) is the only practical route there.

### Cited Findings
- The DVSA MOT History API is for "authorised third-party organisations". You apply with organisation and use details, then receive an API key if approved. The page was last updated Dec 2022. — [DfT Find Transport Data](https://findtransportdata.dft.gov.uk/dataset/mot-history-api)
- Commercial wrappers (Apify actors) resell DVSA MOT data so users do not need their own key. — [Apify](https://apify.com/wildorigins/uk-mot-history)
- Shopmonkey integrates CARFAX for vehicle service and recall history (US). — [Shopmonkey help](https://support.shopmonkey.io/hc/en-us/articles/38743737653908-Getting-Started-Integrations-with-Shopmonkey)

### Inferences
- Unverified: NHTSA vPIC is a free US government VIN decoder, best for North American VINs. It is weak for European/Asian-market VINs. EU VIN decoders such as Vincario, CarVertical and autoDNA are paid per call.
- TecDoc can also link vehicles via KBA/type numbers, VIN or plates in some EU countries. This is unverified this session.
- In Tunisia, plates (e.g. "123 TU 4567") are not linked to any public vehicle API. The product should support VIN entry plus manual make/model/engine selection from the TecDoc tree.

### Gaps
- No official DVLA Vehicle Enquiry Service terms or pricing were found (only a low-quality aggregator).
- No Tunisia/MENA registry API was found. GCC (e.g. Saudi/UAE) traffic-authority data access is unknown.
- Pricing for Vincario, CarVertical and autoDNA was not verified.

## Payments by region

### Takeaway
Tunisia has API-accessible, Central-Bank-licensed gateways (Konnect, Flouci) that support TND, cards, wallets and e-DINAR. Konnect holds the first Tunisian Payment Facilitator licence. ClicToPay (SMT) works through hosted-page redirection with community connectors. In MENA, Paymob (Egypt/UAE/KSA/Oman) and HyperPay (KSA plus region, with Tap-on-Phone) are scaling. In the US, embedded consumer financing (Sunbit) is a competitive feature.

### Cited Findings
- Konnect:
  - The PHP SDK has sandbox/production modes. initPayment returns a payment URL and reference; getPaymentDetails looks up a payment. Webhooks and success/fail redirects are supported. — [Konnect php-sdk](https://github.com/Konnect-Networks/php-sdk)
  - Methods include Flouci, bank card, wallet and e-DINAR; currencies are TND, EUR and USD. — [Odoo payment_konnect](https://apps.odoo.com/apps/modules/17.0/payment_konnect)
  - Konnect is licensed by the Central Bank of Tunisia and was the first recipient of a Payment Facilitator licence. It raised funding in Dec 2024. — [Wamda](https://www.wamda.com/index.php/2024/12/tunisia-konnect-secures-undisclosed-funding-renew-capital); [Daba Finance](https://dabafinance.com/en/news/tunisias-konnect-secures-funding-to-expand-digital-payment-solutions)
- Flouci:
  - Official API docs exist, plus a developer portal. Registration creates both a live account and a developer test account. — [Flouci docs](https://docs.flouci.com/)
  - TND only. — [Odoo payment_flouci](https://apps.odoo.com/apps/modules/17.0/payment_flouci)
- ClicToPay (SMT):
  - No official public API docs were found. An Odoo connector redirects to the hosted page and converts TND to millimes, as the API requires. — [Odoo ics_payment_clictopay](https://apps.odoo.com/apps/modules/19.0/ics_payment_clictopay)
- Paymob:
  - Paymob operates in Egypt, UAE, KSA and Oman, with 390k+ merchants.
  - It holds a UAE licence (Jan 2025) and a Saudi Payments PTSP licence, and opened a Riyadh office.
  - It raised $35M pre-Series C.
  - Source: [PYMNTS](https://www.pymnts.com/?p=4215148); [AGBI](https://www.agbi.com/articles/egypts-paymob-in-gulf-expansion-drive-following-50m-funding/)
- HyperPay:
  - It processes more than $2.5B per month (Nov 2025) and has offices in UAE, Bahrain, Qatar, Lebanon, Egypt, Iraq and Jordan. — [Sharikat Mubasher](https://sharikatmubasher.com/media-hub/news/21518055/ibrahim-hyperpay-processes-over-25bn-in-monthly-transactions?lang=en)
  - It launched Tap-on-Phone in the UAE (Mar 2025), with KSA/Egypt planned. — [CairoScene](https://cairoscene.com/Business/HyperPay-Introduces-Tap-on-Phone-Payment-Solution-for-UAE-Businesses)
  - It runs on Paymentology processing in KSA. — [HyperPay blog](https://www.hyperpay.com/blog/hyperpay-taps-paymentologys-payment-processing-platform-in-saudi-arabia/)
- US financing:
  - Tekmetric integrates Sunbit financing. Sunbit's case study claims 3x higher average repair order and 5x approval rate versus other BNPLs (vendor claim). — [Sunbit](https://sunbit.com/?p=249374)
  - Reynolds and Reynolds partnered with Sunbit, with a launch planned for Q2 2025. It uses automated prescreening through the service journey. — [BusinessWire](https://www.businesswire.com/news/home/20250123947905/en)
  - Tekmetric lists financing among its built-in payment features. — [GetApp](https://www.getapp.com/retail-consumer-services-software/a/tekmetric/features/)

### Inferences
- Tunisia MVP: Konnect, because it aggregates Flouci, cards, wallets and e-DINAR. Flouci is a secondary option. Pay-by-link sent via WhatsApp/SMS fits the market.
- MENA expansion: Paymob for Egypt/GCC, HyperPay for KSA (Mada). Unverified this session: Tap Payments (GCC), Fawry (Egypt cash/kiosk), CMI (Morocco), STC Pay.
- EU/US: Stripe as the default (Terminal, payment links). Adyen or Mollie for EU, with SEPA. Square or Stripe Terminal for US card-present. Sunbit, Affirm or Synchrony for financing. Text-to-pay is standard in US competitors. These points are unverified this session beyond the Sunbit/Tekmetric link.

### Gaps
- Paymee, D17 (La Poste Tunisienne) and Tap Payments returned no usable results.
- No fee schedules were found for any Tunisian gateway.
- Africa (M-Pesa, Flutterwave, Paystack), India UPI and EU/US card-terminal specifics were not researched within budget.

## Messaging (WhatsApp, SMS, RCS)

### Takeaway
Since 1 July 2025 the WhatsApp Business Platform bills per message. Utility templates are free inside an open 24h customer-service window. Marketing and authentication templates are always charged. This favours transactional garage flows (status updates, invoices) triggered after a customer messages. In Tunisia, bulk SMS goes via operators (contract needed) or aggregators. INT must approve alphanumeric sender IDs.

### Cited Findings
- Effective 1 Jul 2025, Meta charges per message instead of per conversation. Utility templates within an open customer-service window are free. Marketing and authentication templates are charged per message. Meta also lowered utility/authentication rates in several markets and added volume tiers. — [Meta developer docs](https://developers.facebook.com/docs/whatsapp/pricing); [Omnichat](https://blog.omnichat.ai/whatsapp-business-platform-announces-pricing-updates-2025)
- Tunisia SMS access:
  - Orange, Ooredoo and Tunisie Telecom each offer business SMS/API access under separate commercial contracts. — [sent.dm](https://sent.dm/en/resources/sms-pricing/tunisia-sms-pricing)
  - Twilio, Plivo, Sinch and Infobip can deliver to Tunisia. — [sent.dm](https://www.sent.dm/resources/tunisia-sms-pricing)
- INT validates alphanumeric sender IDs, which then work across all three networks. — [sent.dm guide](https://www.sent.dm/resources/tunisia-sms-guide)
- Indicative aggregator price is about €0.31/SMS on Orange Tunisia (confirm with sales). — [Messaggio](https://messaggio.com/bulk-sms/tunisia)
- Celcom Africa offers direct connections to all three Tunisian networks, billed in TND. — [Celcom Africa](https://celcomafrica.com/bulk-sms-tunisia)
- Twilio has logged delivery delays to Ooredoo Tunisia, since resolved. — [Twilio status](https://status.twilio.com/incidents/slx5gwh4bsnh)
- Odoo modules exist for Tunisian SMS providers, a sign of a local reseller ecosystem. — [Odoo tunisie_sms](https://apps.odoo.com/apps/modules/15.0/tunisie_sms)
- Sources conflict on Tunisian operator market share (Ooredoo about 42% vs Tunisie Telecom about 40%). — [sent.dm FR](https://sent.dm/fr/resources/sms-pricing/tunisia-sms-pricing); [D7 Networks](https://d7networks.com/sms/tunisia/)

### Inferences
- International SMS to Tunisia (about €0.3) is expensive relative to TND repair tickets. WhatsApp should be the primary channel, with a local SMS aggregator as fallback.
- US competitors use two-way SMS (e.g. Podium, AutoFlow integrations in Tekmetric). — [Podium marketplace](https://www.podium.com/marketplace/tekmetric-2); [AutoFlow](https://autoflow.com/help-center/training/sms-training/tekmetric-integration-training/)

### Gaps
- Per-country WhatsApp rates for Tunisia/MENA need checking on Meta's rate card.
- RCS availability in Tunisia was not researched.
- Vonage/Infobip pricing was not verified.

## Accounting

### Takeaway
US/UK competitors integrate QuickBooks (Online and Desktop). Xero and "accountancy integrations" are common in the UK. For Tunisia, Odoo is a natural target given its existing local payment and SMS modules.

### Cited Findings
- Shopmonkey integrates QuickBooks Desktop and QuickBooks Online. — [Shopmonkey help](https://support.shopmonkey.io/hc/en-us/articles/38743737653908-Getting-Started-Integrations-with-Shopmonkey)
- Garage Hive lists "accountancy integrations". It is built on Microsoft Dynamics 365 Business Central (Microsoft marketplace listing). — [fitgap](https://us.fitgap.com/products/021429/garagehive); [Microsoft Marketplace](https://marketplace.microsoft.com/product/web-apps/PUBID.garagehive%7CAID.ghft-integration%7CPAPPID.f4958b4f-c50c-44a3-acbd-5fd9cea51bd6)
- Odoo has Tunisian payment modules (Konnect, Flouci, ClicToPay) and SMS modules, which points to a local Odoo integrator ecosystem. — [Odoo apps](https://apps.odoo.com/apps/modules/17.0/payment_konnect)

### Inferences
- Unverified: Tunisian e-invoicing (TTN El Fatoora) and local accounting tools are relevant for compliance. A CSV/Excel export to a local accountant is the baseline requirement.

### Gaps
- Local Tunisian accounting software names, export formats and e-invoice obligations for garages were not researched within budget.
- Xero and Sage integrations by competitors were not verified.

## Insurance estimating and claims

### Takeaway
Solera Audatex/Qapter is the dominant estimating platform in the Middle East. It is now tied to Saudi Arabia's national claims platform, Najm. MENA garages doing insurance work will likely need to export to, or coexist with, Audatex/Qapter.

### Cited Findings
- Solera partnered with Najm for Insurance Services, the national motor-accident reporting and claims platform in KSA, to deploy Qapter and Intelligent Estimating. The page date (Aug 2026) could not be confirmed. — [collisionweek](https://collisionweek.com/?p=37473)
- Solera described Audatex as having "proven leadership in the Middle East" through estimating, and partnered with Motori in the UAE on AI estimating (2022). — [BusinessWire](https://www.businesswire.com/news/home/20221006005120/en/Solera-and-Motori-Team-up-to-Bring-New-Artificial-Intelligence-Breakthrough-to-UAE)
- "Audatex is Qapter": Qapter is the AI-driven end-to-end claims suite that includes Audatex Estimating and photo-based AI estimating. — [Repairer Driven News](https://www.repairerdrivennews.com/2020/07/10/solera-new-version-of-qapter-allows-ai-photo-estimating/)

### Inferences
- Unverified: DAT dominates in Germany, GT Motive in Spain, CCC and Mitchell in the US. Partner APIs are usually gated to certified partners.

### Gaps
- Tunisian insurers' claims workflows (e.g. STAR, GAT, Comar) and the expert/assessor platforms they use were not found.
- DAT and GT Motive MENA presence was not found.

## Telematics, connected car and OBD

### Takeaway
OEM-data aggregators offer free developer tiers and usage/vehicle-based paid plans with custom quotes. They mainly cover EU/US OEMs, which makes them low priority for Tunisia.

### Cited Findings
- Smartcar has a free $0 plan for exploration. Paid tiers scale with connected vehicles. — [Smartcar pricing](https://smartcar.com:443/pricing); [PricingSaaS](https://pricingsaas.com/companies/smartcar)
- Smartcar partnered with BMW Group Europe in Feb 2025. — [BusinessWire](https://www.businesswire.com/news/home/20250220760235/en)
- High Mobility has a free developer tier and custom Pro/Enterprise plans (low-quality aggregator source). It added VW Group and Nissan data. — [subger](https://subger.com/en/service/high-mobility); [High Mobility blog](https://www.high-mobility.com/blog)

### Gaps
- Geotab/Samsara marketplace terms, Caruso pricing and OBD-dongle options were not researched within budget.

## Calendars, reviews and marketplaces

### Takeaway
In France, the booking marketplaces Vroomly and iDGARAGES are the reference models. iDGARAGES charges a commission of about 9% plus a subscription. US competitors integrate review/reputation tools such as Podium and Birdeye. No Tunisian garage marketplace was found.

### Cited Findings
- Vroomly offers online booking only at "Garage de confiance" labelled workshops. It lists the Midas and Speedy networks and has 3,850+ partner garages (historic figure). — [j2rauto](https://j2rauto.com/rechange/vroomly-propose-desormais-la-reservation-de-rendez-vous-en-ligne); [j2rauto](https://j2rauto.com/rechange/vroomly-atteint-les-3-850-garages-partenaires)
- My.iDGarages provides garages with a connected planning tool, quotes and web visibility. Its model is a 9% referral commission plus revenue-based billing plus a monthly subscription (about 2020-2022 data). — [j2rauto](https://j2rauto.com/services/idgarages-devoile-sa-nouvelle-plateforme); [Journal de l'Automobile](https://journalauto.com/services/idgarages-veut-accelerer-la-digitalisation-des-ateliers)
- Tekmetric integrates Podium, Birdeye and AutoVitals (DVI). — [Podium](https://www.podium.com/marketplace/tekmetric-2); [Birdeye](https://birdeye.helpjuice.com/en_US/available-integrations-/integrating-birdeye-with-tekmetric-); [AutoVitals](https://support.autovitals.com/hc/en-us/articles/4406894756116-Enabling-AutoVitals-In-Tekmetric)

### Gaps
- Google Business Profile booking/review API terms, Openbay/RepairPal and Tunisian marketplaces were not verified.
- 2025 status of Vroomly/iDGARAGES APIs is unknown.

## Diagnostic tool integration (Bosch ESI[tronic], Autel, Launch)

### Takeaway
No sources were found within budget. HaynesPro sells data into diagnostic tools (the reverse direction of this integration).

### Cited Findings
- HaynesPro data is integrated into diagnostic tools by tool makers. — [Infopro Digital Automotive](https://www.infopro-digital-automotive.com/news/improving-technical-capabilities-of-diagnostic-tools-with-haynespro-data/)

### Gaps
- Bosch ESI[tronic] / Connected Repair, Autel cloud and Launch X-431 report export/API options were not researched. Follow-up is needed. Launch and Autel tools are common in Tunisia (unverified).
