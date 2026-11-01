# Legal and Tax Compliance for a Garage Management / Invoicing SaaS (Tunisia + Global), as of Nov 2026

Research note: about 17 tool calls; most sources found are tax-tech vendors and advisory trackers (Sovos, VATupdate, KPMG, EY, vatcalc, fiscal-requirements.com), plus a few official ones (ZATCA, BAR California, idaraty.tn). www.efatourti.tn could not be fetched because it is blocked by the session's network allowlist. Items labelled **[background knowledge, not verified this session]** come from model training data (cutoff mid-2026). The report writer should treat them as lower confidence.

## Tunisia: TTN / El Fatoora e-invoicing, VAT, stamp duty, invoice mentions, data protection

### Takeaway
The 2026 Finance Law (Loi n° 2025-17 of 12 Dec 2025, art. 53) extended mandatory TTN El Fatoora e-invoicing in TEIF XML to service providers from 1 Jan 2026. That brings garages into scope. Enforcement is unclear: a committee amendment to postpone art. 53 was reported in April 2026, but it had not been published in the JORT as of Oct 2026, and the sanctions are reportedly not yet applied. Data protection is still governed by Law 2004-63; a GDPR-style replacement bill is before the ARP but not adopted.

### Cited Findings
- Article 53 of LF 2026 (Law 2025-17, 12 Dec 2025) extends the e-invoicing obligation to services, effective 1 Jan 2026. The platform is El Fatoora, operated by Tunisie TradeNet (TTN), and the format is TEIF XML. — [WMC guide (Jan 2026)](https://www.webmanagercenter.com/2026/01/31/560961/facturation-electronique-tunisie-2026-guide-complet/); [Shazler](https://shazler.com/blog/facturation-electronique-tunisie-2026-el-fatoora); [efacturetn](https://efacturetn.com/fr/blog/facturation-electronique-tunisie-2026-guide-conformite-el-fatoora)
- Population covered: about 340,000 taxpayers per one source, more than 380,000 per others. Auto-entrepreneurs under the VAT franchise or fully VAT-exempt are reportedly not subject. — [Hesabi](https://hesabi.tn/actualites/facturation-electronique-obligatoire-tunisie-2026); [finco.tn](https://finco.tn/blog/guide-complet-facturation-electronique-tunisie)
- Penalties (sources conflict): 100–500 TND per paper invoice, capped at 50,000 TND per year, vs. a flat 500 TND per non-compliant paper invoice, capped at 50,000 TND per tax audit. One source says the LF 2026 financial sanctions have not yet been applied. — [efatourti FAQ (search snippet only, updated Oct 2026)](https://www.efatourti.tn/faq/); [elfatoora.digital](https://elfatoora.digital/index.php?lang=en)
- Postponement: an amendment to defer art. 53 was adopted in the finance committee in April 2026. As of 12 Oct 2026 it had not been published in the Journal Officiel, and adoption in plenary is unconfirmed. — [efatourti FAQ](https://www.efatourti.tn/faq/)
- Transitional regime: classic invoicing can reportedly continue once a filing has been made with TTN. Online El Fatoora enrolment reportedly opened 15 Feb 2026. — [efatourti FAQ](https://www.efatourti.tn/faq/)
- TTN fee cited at 190 millimes per invoice. One source also mentions a monthly subscription, which is unconfirmed. — [efatourti / vendor sites via search](https://www.efatourti.tn/faq/)
- Official procedure: electronic invoices must carry the same mandatory mentions as paper invoices. — [idaraty.tn (official admin portal)](https://idaraty.tn/fr/procedures/utilisation-de-la-facture-electronique)
- VAT rates: 19% standard, with reduced rates of 13% and 7% for designated operations. No source found that states which rate applies to garage labour or parts. — [Copeps](https://copeps.fr/actualites/les-differents-taux-de-tva-en-tunisie/)
- Invoice mentions (Code TVA art. 18, per secondary source): date and sequential number; client identity, address and matricule fiscal; supplier matricule fiscal; description; net amount (HT); VAT rate; VAT amount. Showing the client's matricule fiscal is not required for service providers and retailers in some cases. — [Copeps](https://copeps.fr/actualites/non-assujetti-a-la-tva-tunisie/); [Copeps TVA guide](https://copeps.fr/actualites/tva-steg-tunisie/)
- KPMG Tunisia published a February 2026 fiscal circular on LF 2026 measures. Not read in detail. — [KPMG Tunisie circulaire fév. 2026](https://assets.kpmg.com/content/dam/kpmgsites/tn/pdf/circulaires-fiscales/Circulaire%20fiscale%20f%C3%A9vrier%202026%20final.pdf.coredownload.inline.pdf); [compta.tn LF2026 summary](https://www.compta.tn/blog/loi-de-finances-2026-tunisie-mesures-fiscales/)
- Data protection: Organic Law 2004-63 remains in force. A new organic bill was filed with the ARP (July/Aug 2025) and sent to the rights and freedoms committee. It would create an independent "Autorité de protection des données personnelles" with fines up to 200,000 TND plus prison terms. A further proposal from 18 MPs (Feb 2026) widens the definitions to biometric and genetic data. No evidence found of adoption. — [AllAfrica (Aug 2025)](https://fr.allafrica.com/stories/202508050456.html); [Business News (27 Feb 2026)](https://businessnews.com.tn/2026/02/27/donnees-personnelles-le-parlement-se-penche-sur-la-modernisation-de-la-legislation-tunisienne/1390118/); [Global Law Experts](https://globallawexperts.com/tunisia-moves-replace-its-twentyyearold-data/); [DPO Consulting 2004-63 guide](https://www.dpo-consulting.com/fr-fr/blog/loi-tunisienne-sur-la-protection-des-donnees)

### Inferences
- GaragePro must generate TEIF XML, sign it with an electronic signature certificate (in Tunisia, normally an ANCE/TunTrust certificate or DigiGo signature **[background knowledge]**), submit it to TTN via API or web service, and store the TTN reference and QR code returned. A garage SaaS should support enrolment through TTN, or offer integrator-mode submission on the garage's behalf.
- **[Background knowledge, not verified]** Points to verify against the Code de la TVA and LF texts: the droit de timbre fiscal on invoices was 1 TND per invoice for years and was raised to 1 TND (LF 2025 tweaks may apply). Car repair labour is generally at the 19% standard rate; some parts and items fall in other bands. Retenue à la source applies at 1.5% (or similar) on payments ≥ 1,000 TND TTC made by companies and the state to suppliers, so the software must show the RS and issue RS certificates. Mentions also include "timbre fiscal" and an amount in words in some practices. Accounting record retention is generally 10 years (Code de commerce art. 12 / Code des droits et procédures fiscaux).
- INPDP prior declaration or authorisation is required under 2004-63 for processing personal data. A SaaS processing customer names, phone numbers and plates should file, and plan for cross-border transfer restrictions under 2004-63 (transfers abroad need INPDP authorisation) **[background knowledge]**.

### Gaps
- Official text of art. 53 LF 2026 and its implementing decree (thresholds, B2C scope). The official TTN TEIF schema version could not be retrieved because the efatourti and TTN sites were not fetched.
- The exact current droit de timbre amount, retenue à la source rates and garage VAT classification were not confirmed from an official source.
- No Tunisian rules specific to repair quotes (devis) were found. Consumer protection Law 92-117 and price-display rules were not researched.

## Morocco, Algeria, Egypt, Saudi Arabia, UAE, other Gulf, Jordan

### Takeaway
Saudi Arabia (ZATCA Phase 2, Wave 25 at a SAR 187,500 threshold with integration from 1 Feb 2027) and Egypt (ETA e-invoice plus a phased B2C e-receipt) are live clearance regimes. The UAE has run a voluntary pilot since 1 July 2026 on Peppol PINT AE via Accredited Service Providers, with large businesses mandatory from 1 Jan 2027. Morocco has a legal basis (CGI art. 145-IX) and a UBL/centralised model, but the decree with its calendar was still pending as of mid-2026.

### Cited Findings
- **Saudi Arabia**: ZATCA published the Wave 25 criteria on 24 Jul 2026. Taxpayers with VAT-subject revenue above SAR 187,500 in any of 2022–2025 must integrate with Fatoora between 1 Feb 2027 and 30 Apr 2027 (start date confirmed; end date per vendor). Wave 23 (more than SAR 750k) had a deadline of 31 Mar 2026; Wave 24 (more than SAR 375k) had a deadline of 30 Jun 2026. — [ZATCA Wave 25 news](https://zatca.gov.sa/en/MediaCenter/News/Pages/Wave25-E-invoicing.aspx); [EY Tax News 10 Aug 2026](https://taxnews.ey.com/news/2026-1705-saudi-arabia-announces-25th-wave-of-phase-2-e-invoicing-integration); [VATupdate](https://www.vatupdate.com/2026/07/27/zatca-announces-wave-25-of-e-invoicing-threshold-halved-to-sar-187500-integration-deadline-1-february-2027/); [Grant Thornton KSA Wave 24](https://www.grantthornton.sa/insights/articles-and-publications/wave_24_implementation_of_e_invoicing_in_saudi_arabia/)
- **UAE**: a voluntary pilot from 1 Jul 2026 (MoF announcement 26 Jun 2026). Large businesses (revenue of AED 50M or more) are mandatory from 1 Jan 2027, with the ASP appointment deadline disputed (31 Jul 2026 vs 30 Oct 2026). Others are mandatory from 1 Jul 2027 and government entities from 1 Oct 2027. The format is PINT AE (Peppol, UBL 2.1) in a decentralised 5-corner model: the ASP exchanges invoices and reports to the FTA, with no clearance step. There are 51 mandatory fields. — [KPMG Feb 2026 mandatory fields](https://kpmg.com/us/en/taxnewsflash/news/2026/02/uae-technical-guidance-mandatory-e-invoicing-fields.html); [Sovos UAE](https://sovos.com/en-gb/vat/tax-rules/uae-e-invoicing/); [fiscal-requirements UAE rules v1.1 June 2026](https://www.fiscal-requirements.com/news/5572-uae-issues-updated-e-invoicing-rules-version-11-june-2026); [vatcalc](https://www.vatcalc.com/uae/uae-launches-optional-b2b-4-corner-peppol-e-invoicing/)
- **Morocco**: the legal basis is CGI art. 145-IX, covering IS companies and IR professionals keeping regular accounts. The model is a centralised DGI portal using UBL, rolled out in waves by company size starting with large companies, from 2026. The precise calendar and thresholds await an implementing decree, which was under validation at the SGG. — [EDICOM](https://edicomgroup.com/fr/blog/maroc-obligation-facturation-electronique); [Le360 calendar](https://fr.le360.ma/economie/facturation-electronique-le-detail-du-calendrier-de-mise-en-place_2EQSNG2DTVB6PGBBHQ6OCFT6CY/); [Challenge.ma](https://www.challenge.ma/fiscalite-2026-la-facture-electronique-obligatoire-sur-les-rails-316071/); [Clicpaie (May 2026)](https://clicpaie.ma/blogs/facture-electronique-maroc/)
- **Egypt**: B2C e-receipts are phased by ETA decisions that name the obligated taxpayers rather than by a turnover test. The system is separate from the B2B/B2G e-invoice system, and an expansion was announced in Aug 2025. — [KPMG Jul 2025](https://kpmg.com/us/en/taxnewsflash/news/2025/07/tnf-egypt-new-taxpayers-required-to-comply-with-mandate-to-issue-electronic-receipts-for-b2c-transactions.html); [Thomson Reuters Egypt](https://europe.thomsonreuters.com/news/e-invoicing-in-egypt/); [invoicedataextraction Egypt guide](https://invoicedataextraction.com/blog/egypt-electronic-receipt-compliance-guide)

### Inferences
- **[Background knowledge]** KSA requires a ZATCA-compliant EGS (e-invoice generation solution) producing UBL 2.1 XML with a cryptographic stamp, QR code, previous-invoice hash and UUID. Clearance applies to B2B ("standard") invoices and reporting within 24h to simplified (B2C) invoices. A garage SaaS must pass ZATCA onboarding/compliance checks (CSID) per device or tenant. Retention is 6 years in KSA (longer for some records). VAT is 15%.
- **[Background knowledge]** Egypt e-invoicing uses JSON/XML via the ETA API with an e-seal/USB token signature. E-receipt POS integration requires registering each POS with the ETA. VAT is 14%.
- **[Background knowledge]** UAE VAT is 5%. Oman launched VAT e-invoicing ("Fawtara") with a pilot planned around 2026. Bahrain, Qatar and Kuwait have no e-invoicing mandate in force; Qatar and Kuwait have no VAT. Jordan runs the JoFotara national e-invoicing system (mandatory for VAT-registered taxpayers since 2024–2025). Algeria has no general e-invoicing mandate known. None of this was verified this session.

### Gaps
- Algeria, Oman (Fawtara dates), Bahrain, Qatar, Kuwait and Jordan (JoFotara) were not searched.
- The Morocco implementing decree and its exact wave dates were not found in any official text.
- Egypt 2026 e-receipt phase dates were not found.

## EU: ViDA, France, Germany, Belgium, Poland, Italy, Spain, Portugal; fiscal cash registers

### Takeaway
ViDA (adopted 11 Mar 2025, OJ 25 Mar 2025) lets member states impose domestic e-invoicing without derogation since 14 Apr 2025, and makes EN 16931 e-invoicing plus near-real-time digital reporting mandatory for intra-EU B2B from 1 Jul 2030. National mandates already in force or arriving soon:
- Belgium: Peppol from 1 Jan 2026.
- Poland: KSeF from 1 Feb 2026 for large taxpayers and 1 Apr 2026 for others.
- France: reception for all plus issuance for large companies and ETIs from 1 Sep 2026, SMEs from 1 Sep 2027.
- Germany: issuance from 2027/2028.
- Spain: Verifactu deferred to 2027.

### Cited Findings
- **ViDA**: adopted by the Council 11 Mar 2025 and published in the OJ 25 Mar 2025. From 14 Apr 2025, member states can mandate domestic e-invoicing without recipient consent or derogation. From 1 Jul 2030, intra-EU B2B requires EN 16931 e-invoices, issuance within 10 days, transaction-level reporting, and the recapitulative statements are abolished. Domestic systems must converge by 1 Jan 2035. — [PwC Luxembourg](https://www.pwc.lu/en/newsletter/2025/vat-in-the-digital-age-vida.html); [Sovos ViDA](https://sovos.com/blog/vat/vida-e-invoicing-and-digital-reporting-requirements/); [BDO NL](https://bdo.nl/en-gb/insights/vida-e-invoicing-and-digital-reporting); [VATupdate Mar 2026](https://www.vatupdate.com/2026/03/15/eus-vida-in-motion-how-eu-member-states-are-preparing-for-implementing-digital-reporting-requirements-drr/)
- **France**: from 1 Sep 2026 all VAT-registered businesses must be able to receive e-invoices, and large companies and ETIs must issue e-invoices and file e-reporting. SMEs and micro-enterprises must issue from 1 Sep 2027. The "PDP" is now called "plateforme agréée" (PA), and more than 100 PAs are reportedly registered with the DGFiP. Decree 2026-677 and an order of 27 Jul 2026 were published, the timetable is unchanged, and the Ministry confirmed the start on 31 Aug 2026. Chorus Pro remains the B2G channel. — [Snitechnology (Aug 2026)](https://snitechnology.net/france-finalises-the-regulatory-framework-for-its-e-invoicing-reform/); [Avalara Jul 2026](https://www.avalara.com/blog/en/europe/2026/07/french-e-invoicing-mandate-readiness.html); [vatcalc](https://www.vatcalc.com/?p=52390); [Continia](https://docs.continia.com/en-us/continia-document-output/business-functionality/continia-edocuments/local-functionality/france/einvoicing-in-france/)
- **Germany**: all domestic B2B businesses must be able to receive structured e-invoices from 1 Jan 2025. Issuance becomes mandatory from 1 Jan 2027 for businesses with prior-year turnover above EUR 800,000, and for all businesses from 1 Jan 2028. — [OpenText](https://blogs.opentext.com/e-invoicing-europe-2026-lessons-from-poland-belgium-greece-france-and-germany/); [eConnect](https://econnect.eu/en/blog/mandatory-e-invoicing-in-2026-which-countries-are-affected-0)
- **Belgium**: B2B Peppol e-invoicing has been mandatory for all VAT-registered businesses since 1 Jan 2026, using Peppol BIS Billing 3.0 (EN 16931). The Hermes platform was decommissioned 31 Dec 2025. — [eConnect](https://econnect.eu/en/blog/mandatory-e-invoicing-in-2026-which-countries-are-affected-0); [flick.network](https://www.flick.network/en/peppol-e-invoicing-countries)
- **Poland KSeF**: mandatory from 1 Feb 2026 for taxpayers with turnover above PLN 200M, from 1 Apr 2026 for all other VAT taxpayers, and from 1 Jan 2027 for micro-entrepreneurs. No penalties apply until 1 Jan 2027. — [ecosio](https://ecosio.com/en/blog/e-invoicing-in-poland-7-topics-you-need-to-know-in-2026/); [VATit Poland](https://vatit.com/de/e-invoicing-guide/poland/)
- **Spain Verifactu**: Royal Decree-law 15/2025 (2 Dec 2025, validated by Congress 11 Dec 2025) defers it to 1 Jan 2027 for corporate income taxpayers and 1 Jul 2027 for others. Order HAC/1028/2026 (in force 6 Oct 2026) regulates the public e-invoicing solution under RD 238/2026 (the B2B e-invoice law). Sovos reports plans to push some obligations to Oct 2028; this is unverified. — [KPMG Dec 2025](https://kpmg.com/us/en/taxnewsflash/news/2025/12/tnf-spain-verifactu-invoicing-system-delayed-to-2027.html); [Forvis Mazars](https://www.forvismazars.com/es/en/insights/latest-news/tax-alert-royal-decree-law-15-2025); [fiscal-requirements](https://www.fiscal-requirements.com/news/6062); [Sovos](https://sovos.com/regulatory-updates/global-vat/spain-plans-to-postpone-verifactu-obligations-to-october-2028/)

### Inferences
- A garage SaaS in Spain is a "sistema informático de facturación" and must self-declare compliance (declaración responsable) with RD 1007/2023. It must chain hashes, add a QR code, and optionally send records to AEAT in real time. TicketBAI applies in the Basque provinces. **[Background knowledge]**
- **[Background knowledge, not verified]** Other systems a vendor would need to support:
  - Italy: SDI clearance (FatturaPA XML) mandatory for B2B and B2C since 2019, with retail "corrispettivi telematici" via RT devices.
  - Portugal: certified invoicing software (AT certification), ATCUD code plus QR code (mandatory since 2023), SAF-T (PT) export.
  - France NF525/anti-fraud law (CGI art. 286-I-3° bis): cash and POS software must be certified (NF525 or LNE). LF 2025 removed self-attestation, so from 2025 certification by an accredited body is required, with fines of €7,500 per system.
  - Germany KassenSichV: electronic POS systems require a certified TSE (technical security device), a receipt obligation, and registration of cash systems with tax offices (via ELSTER since 2025).
  - Germany formats: XRechnung or ZUGFeRD 2.x (EN 16931 profiles); plain PDFs no longer qualify for B2B.
  - France formats: Factur-X, UBL and CII.

### Gaps
- Italy, Portugal, NF525 and KassenSichV were not verified this session for 2026 changes.
- The France PA list and the B2C e-reporting details for small garages were not researched.

## UK and North America

### Takeaway
California's BAR rules are the template for US auto repair documentation: a written estimate, authorisation before work, an itemised invoice that marks each part as new, used or rebuilt, and record keeping. The "Write It Right" guide was updated in early 2026. US sales tax on parts versus labour and Canadian GST/HST/PST were not verified this session.

### Cited Findings
- California: a shop must give a written estimate for parts and labour for a specific job. It cannot exceed the estimate without customer authorisation; secondary sources disagree on whether a 10% or $100 tolerance applies. It must provide an itemised invoice identifying new, used, rebuilt or reconditioned parts. The legal basis is B&P Code §§9884–9884.9 and 16 CCR §3356. — [BAR Write It Right](https://bar.ca.gov/wir); [BAR WIR PDF](https://www.bar.ca.gov:443/pdf/WriteItRight.pdf); [BAR consumer sign](https://www.bar.ca.gov/pdf/signs/ARD_Sign.pdf); [terms.law](https://terms.law/2025/12/04/auto-repair-shop-dispute-demand-letters/)
- BAR updated the Write It Right guide in early 2026, and a teardown-estimate rule took effect 1 Jul 2025. — [Repairer Driven News (8 Jan 2026)](https://www.repairerdrivennews.com/2026/01/08/california-bar-updates-write-it-right-guide-on-estimates/)

### Inferences
- **[Background knowledge, not verified]**
  - UK: MTD for VAT applies to all VAT-registered businesses (since Apr 2022), requiring digital records and API submission through HMRC-recognised software. MTD for Income Tax applies to sole traders and landlords with more than £50k income from Apr 2026, and more than £30k from Apr 2027. UK VAT is 20%. UK invoice retention is 6 years.
  - US sales tax on parts vs labour: most states tax parts. Repair labour is taxable in some states (believed to include NY, NJ, CT, PA, WA, OH, and FL for motor vehicle repair). In others it is exempt when separately stated (believed to include CA). All of these state examples need verification against state revenue guidance. Shop supplies fees and environmental/tyre fees are usually taxable if tied to a taxable sale, and many states impose tyre and battery fees. The software needs a per-line tax category (part / labour / fee / disposal) mapped to the jurisdiction, ideally through a tax engine (Avalara, TaxJar).
  - NY (DMV-registered repair shops: written estimate on request, invoice requirements) and Florida (FS 559.905: written estimate for repairs over $100 if requested, a 10%/$10 rule [unverified]) have repair laws.
  - Canada: GST 5%, HST in ON/Atlantic provinces, PST in BC/SK/MB, QST in Quebec. Quebec's SRS/MEV regime applies to restaurants and bars, not garages.

### Gaps
- No verified sources on the state sales tax matrix, NY or Florida repair laws, Canada, or UK MTD. Additional searches are needed.

## Africa and Asia: Kenya, Nigeria, South Africa, India, Indonesia, Malaysia, Philippines, Vietnam

### Takeaway
Malaysia MyInvois raised its exemption threshold from RM1M to RM3M effective 1 Sep 2026. Phase 4 (RM1–5M) started 1 Jan 2026, and the relaxation period may run to end-2027. India requires IRP registration (IRN plus QR) above INR 5 crore turnover. Kenya eTIMS now covers all taxpayers.

### Cited Findings
- Malaysia: HASiL announced on 30 Aug 2026 that taxpayers with turnover below RM3M are exempt from e-invoicing from 1 Sep 2026 (up from RM1M), per guideline v4.8. Phase 4 (RM1M–RM5M) started 1 Jan 2026. The relaxation period was reportedly extended to 31 Dec 2027 (single source). — [Bernama](https://bernama.com/en/news.php?id=2601063); [beancount.io (Sept 2026)](https://beancount.io/de/blog/2026/09/16/malaysia-e-invoicing-phase-4-rm3m-exemption-rm10000-rule-guide); [NST Jun 2025](https://www.nst.com.my/amp/news/nation/2025/06/1226501/lhdn-e-invoice-implementation-revenue-below-rm5mil-deferred-jan-1-2026)
- India: businesses above INR 5 crore aggregate turnover must register B2B invoices on an IRP and obtain an IRN. — [e-invoice.app global tracker](https://www.e-invoice.app/global-e-invoicing-mandates)
- Kenya eTIMS: turnover-based exemptions were removed, so VAT and non-VAT taxpayers must issue eTIMS invoices (source undated). — [innovatetax](https://innovatetax.com/?p=56853)

### Inferences
- **[Background knowledge, not verified]**
  - India: a 30-day reporting limit applies to taxpayers with AATO of INR 10 crore or more (from Apr 2025). Repair services carry 18% GST, and parts are generally taxed at 18–28% (the GST 2.0 rate rationalisation in Sept 2025 moved many auto parts to 18%).
  - Nigeria: FIRS/NRS e-invoicing (MBS) phased in from 2025 for large taxpayers.
  - South Africa: e-invoicing planned for after 2026, with no mandate yet.
  - Indonesia: e-Faktur, plus the Coretax system since Jan 2025.
  - Philippines: EIS rollout for the top 100 taxpayers.
  - Vietnam: mandatory e-invoices (Decree 123/2020, amended by Decree 70/2025), including POS e-invoices for retail.

### Gaps
- Nigeria, South Africa, Indonesia, Philippines and Vietnam were not searched. The India 10-crore/30-day rule was not confirmed.

## Data protection and data residency

### Takeaway
Only Tunisia was researched in detail: 2004-63 remains in force and a reform bill is pending. Other regimes are summarised from background knowledge and must be verified.

### Cited Findings
- Tunisia: see the Tunisia section above (Law 2004-63 in force; new organic bill with fines up to 200,000 TND pending at the ARP). — [Business News Feb 2026](https://businessnews.com.tn/2026/02/27/donnees-personnelles-le-parlement-se-penche-sur-la-modernisation-de-la-legislation-tunisienne/1390118/)

### Inferences
- **[Background knowledge, not verified]**
  - GDPR: a DPA (art. 28) is needed with each garage, plus sub-processor lists and SCCs for non-EU hosting.
  - Saudi PDPL: in force Sept 2023, with enforcement from Sept 2024. Transfer rules apply and SDAIA registration is required for some controllers.
  - UAE PDPL: Federal Decree-Law 45/2021; executive regulations long delayed.
  - Egypt PDPL: Law 151/2020, with executive regulations issued in 2025. Licensing applies.
  - Morocco: Law 09-08, overseen by the CNDP (prior declaration required).
  - India: DPDP Act 2023, with the DPDP Rules notified Nov 2025 and phased compliance over 12–18 months.
  - US: about 20 state comprehensive privacy laws, which generally apply above revenue or data-volume thresholds most small garages miss. The SaaS vendor may still be a "processor".
  - E-invoice data residency: KSA and Egypt store e-invoice data in-country through their authorities. Some GCC sectors expect local hosting.

### Gaps
- None of the non-Tunisian data protection facts were verified this session.

## Right to repair and record retention

### Takeaway
The EU MVBER (Reg. 461/2010) was extended to 31 May 2028 by Reg. 2023/822, with guidelines stressing non-discriminatory access to vehicle-generated data. A Commission staff evaluation on 25 Jun 2026 found that independent repairers still face access barriers. In the US, the federal REPAIR Act advanced in committee in May 2026 but has not been enacted.

### Cited Findings
- Reg. (EU) 2023/822, adopted 17 Apr 2023, extends the MVBER to 31 May 2028. The updated Supplementary Guidelines emphasise sharing vehicle-generated data with independent operators on equal terms with authorised repairers, and Art. 102 TFEU may apply to withholding essential inputs. — [Cuatrecasas](https://cuatrecasas.com/en/latam/art/eu-commission-prolongs-motor-vehicle-block-exemption-regulation); [IEU Monitoring](https://ieu-monitoring.com/editorial/antitrust-eu-commission-prolongs-mvber-and-updates-the-supplementary-guidelines/405172/)
- The Commission staff working document of 25 Jun 2026 found persisting difficulties for independent repairers accessing technical information, vehicle data, parts and diagnostic tools. Renewal beyond 2028 is being discussed. — [Ashurst](https://www.ashurstperkinscoie.com/en/insights/european-commission-evaluates-motor-vehicle-block-exemption/); [auto-infos.fr](https://www.auto-infos.fr/article/reparation-independante-la-commission-europeenne-veut-preserver-la-concurrence-apres-2028.292619)
- US REPAIR Act (H.R. 1566, introduced Feb 2025): an amended version advanced through the House Energy and Commerce Committee in May 2026 as part of the Motor Vehicle Modernization Act of 2026. No floor vote was found. — [search results incl. SEMA](https://sema.org/taxonomy/term/4240?page=1)
- Massachusetts: the AG announced enforcement of the 2020 voter-approved data access law. The current litigation status (First Circuit) was unconfirmed. — [Ratchet+Wrench](https://www.ratchetandwrench.com/site-placement/latest-news/news/33001520/massachusetts-to-enforce-right-to-repair-law); [Nelson Mullins](https://www.nelsonmullins.com/insights/blogs/driving-forward-developments-in-transportation-law-and-innovation/all/automotive-right-to-repair-proceeds-cautiously-while-awaiting-first-circuit-decision)

### Inferences
- **[Background knowledge, not verified]**
  - SERMI: Delegated Reg. (EU) 2021/1244 under Reg. 2018/858. Independent repairers can be accredited for access to security-related RMI; the scheme has been operational since 2023 in the EU.
  - EU Right to Repair Directive (EU) 2024/1799: transposition is due 31 Jul 2026. It covers consumer goods listed in Annex II (washing machines, phones, etc.), not cars.
  - UK: the MVBER was replaced by the UK MVBEO (to May 2029).
  - Retention periods for invoices and records:

    | Country | Retention |
    |---|---|
    | France | 6 years tax / 10 years commercial |
    | Germany | 8 years for invoices since 2025 (Bürokratieentlastungsgesetz IV), 10 years for books |
    | Spain | 4 years tax / 6 years commercial |
    | Italy | 10 years |
    | Belgium | 10 years |
    | Poland | 5 years |
    | UK | 6 years |
    | KSA | 6 years |
    | UAE | 5 years |
    | Tunisia | 10 years |
    | India | 6–8 years (72 months from the annual return due date) |
    | US | IRS generally 3–7 years; CA BAR records 3 years |

    A configurable per-tenant retention setting with immutable archive storage is advisable.

### Gaps
- SERMI and the retention periods were not verified this session. US state right-to-repair laws (Maine 2023 data access law) and UK rules were not researched.
