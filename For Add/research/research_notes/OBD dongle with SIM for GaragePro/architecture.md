# Architecture for ingesting SIM OBD/GPS tracker data into a Vercel + Supabase SaaS (2025-2026)

Research note: in this session, direct page fetches to flespi.com and traccar.org were blocked by the network allowlist. Findings below come from web-search result summaries (including snippets of those official pages), not from full page reads. Figures marked "third-party" should be checked on vendor pages before budgeting.

## Why Vercel serverless cannot be the device endpoint, and what is needed instead

### Takeaway
Trackers (Teltonika Codec 8/8E, GT06, Queclink) open raw TCP (or UDP) sockets to a host:port and keep them open; Vercel Functions only accept HTTP(S), and even the new WebSocket support (beta June 2026, reportedly GA Oct 2026) is HTTP-upgraded, capped at about 5 minutes per connection, and does not accept raw binary TCP. A small always-on ingestion tier (VPS/container or a managed middleware such as flespi) has to sit in front, decode, and POST events to a Vercel webhook route.

### Cited Findings
- Vercel's Knowledge Base historically stated Vercel Functions do not support acting as a WebSocket server; staff said a persistent connection is not possible because of execution-time limits — [Ably summary](https://ably.com/topic/ai-stack/websockets-on-vercel-why-serverless-functions-cant-host-them); [Vercel Community](https://community.vercel.com/t/websoket-connection-detail/756)
- Vercel launched native WebSocket support for Functions in public beta on June 22, 2026 (Node `ws`, Socket.IO work) — [releases.sh](https://releases.sh/release/rel_yNUn74KGsQqbJOSpgMBnY-vercel-launches-websocket-support-in-public-beta-for-functions)
- An aggregator reports WebSocket support went GA on Oct 20, 2026, billed like Function invocations with CPU charged only while processing messages (no Vercel primary source found) — [Create With](https://createwith.com/tool/vercel/updates/vercel-makes-websocket-support-generally-available)
- Default duration cap is 5 minutes; a hands-on test saw disconnect after about 5 min 10 s without a clean close — [Classmethod](https://dev.classmethod.jp/en/articles/vercel-functions-websocket-public-beta-verification/)
- Common workaround: host the socket server on a dedicated container/VM (Fly.io, Railway, cloud VM) — [Ably](https://ably.com/vercel/websockets-on-vercel)
- Teltonika flow is a raw binary TCP handshake: device sends IMEI first, server answers one byte 0x01 (accept) or 0x00 (reject), then AVL packets follow — [Teltonika Wiki FAQ](https://wiki.teltonika-gps.com/index.php?oldid=95906&title=Help_with_Server_FAQ)
- GT06 devices send a login packet (protocol 0x01, BCD-encoded 15-digit IMEI) once per connection and require a server ACK; login and status messages need acknowledgements written back — [gt06 crate docs](https://docs.rs/crate/gt06/latest/source/README.md)
- Fly.io pricing is per-second resource billing; shared-cpu-1x 256MB is about $1.94/month (third-party figures $1.94-2.02); shared-cpu-4x 1GB $7.78/month; dedicated IPv4 about $2/month (third-party); egress about $0.02/GB after 100 GB — [Fly.io pricing](https://fly.io/docs/about/pricing/); [Kuberns](https://kuberns.com/blogs/flyio-pricing/)
- Hetzner CX22 (2 vCPU, 4 GB, 40 GB NVMe, 20 TB traffic) was €3.79/month before the April 1, 2026 increase and about €4.51/month after; one changelog suggests CX22 may be removed/renamed — sources conflict — [Findstack](https://findstack.com/resources/hetzner-price-increase-2026); [agentdeals](https://agentdeals.dev/hetzner-pricing-2026); [Hetzner What's New](https://docs.hetzner.cloud/whats-new)
- Supabase Realtime (Pro): 500 concurrent connections, 500 messages/s (10,000 / 2,500 without spend cap); clients are disconnected when the message rate is exceeded — [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- AWS IoT Core: $0.08 per million connection-minutes (about $0.042 per device-year 24/7), $1.00 per million messages falling to $0.70 at volume, metered in 5 KB increments; rules $0.15/M triggered + $0.15/M actions; 12-month free tier 2.25M connection-minutes and 500k messages — [AWS IoT Core pricing](https://aws.amazon.com/iot-core/pricing/); [Hubble comparison](https://hubble.com/community/comparisons/aws-iot-core-vs-azure-iot-hub-pricing-what-10-000-devices-actually-costs)

### Inferences
- Recommended pattern: Device -> TCP listener (Traccar / custom Node/Go decoder on Hetzner/Fly, or flespi channel) -> normalized JSON -> HTTPS POST to a Vercel route (`/api/telemetry/webhook`) with an HMAC/shared secret -> Supabase insert. Vercel only ever sees short HTTP requests, which fits its model.
- Even GA WebSockets on Vercel would not help: trackers do not speak WebSocket, and a 5-minute cap is incompatible with devices that stay connected for hours.
- Supabase Realtime is for pushing updates to browser dashboards, not for device ingestion; 500 msg/s on Pro could be exceeded if every raw GPS point were broadcast at 10,000 devices — broadcast only derived events.
- AWS IoT Core / Azure IoT Hub are MQTT/HTTPS brokers. Teltonika/GT06 binary TCP still needs a protocol-translation layer, so they add cost and complexity without removing the always-on decoder unless devices speak MQTT natively.
- Fly.io raw TCP requires a dedicated IPv4 and fixed port mapping; Hetzner VPS is the cheapest predictable option and suits a static IP that is written into device configs.

### Gaps
- Could not confirm from Vercel's own docs whether WebSocket support is GA, or confirm any raw TCP support (none found).
- Azure IoT Hub and Railway pricing not retrieved.
- Whether Teltonika FMB firmware offers native MQTT (which would allow direct AWS IoT Core) was not verified.

## Middleware and platforms: flespi, Traccar, Teltonika tools, Wialon, Navixy, ThingsBoard, FleetWise

### Takeaway
flespi is the lowest-effort managed decoder (Teltonika and many protocols to JSON, REST/MQTT/streams, calculators, geofences) with a free 10-device tier and roughly €100/month entry plan; Traccar is free Apache-2.0 self-hosted software covering 200+ protocols with event/position forwarding to HTTP; Wialon/Navixy are full white-label fleet platforms priced per device on quote (much more per device); AWS IoT FleetWise is closed to new customers since April 30, 2026.

### Cited Findings
- flespi free tier: 10 devices, 2 channels, 1 stream, 1 plugin, 50 devices in calculators, 10 assets, 10 geofences, 10 SMS; free-forever, best-effort no SLA — [fitgap](https://us.fitgap.com/products/014797/flespi); [Crozdesk](https://crozdesk.com/software/flespi/pricing)
- flespi entry "Start" plan about €100/month listed with 3 channels, 1000 devices, 3 streams, 2 plugins, 1000 calculators (third-party, conflicting with fitgap listing of €400 Pro / €1,000 Enterprise tiers) — [Crozdesk](https://crozdesk.com/software/flespi/pricing); [SoftwareSuggest](https://www.softwaresuggest.com/flespi); [fitgap](https://us.fitgap.com/products/014797/flespi)
- flespi's own blog: price tag of around €0.03-0.50 per device monthly depending on customer type; pricing simplified, rarely-used items no longer billed — [flespi blog](https://flespi.com/blog/flespi-pricing-simplification)
- flespi geofences: 1,000 included in commercial plans, €0.01 each beyond — [flespi changelog](https://flespi.com/blog/april-2024-change-log)
- flespi parses Teltonika binary into JSON, exposes data via REST API, MQTT and streams to platforms (AWS, Azure, HTTP); setup = create a Teltonika channel, point device at channel host:port, optionally enable TLS between device and channel — [flespi Teltonika](https://flespi.com/protocols/teltonika); [flespi KB](https://flespi.com/kb/teltonika-device-data-via-api)
- Traccar: free open-source (Apache 2.0), 200+ GPS protocols, 2000+ device models; self-host or official managed hosting — [GitHub traccar](https://github.com/traccar/traccar)
- Traccar hosted pricing (third-party): shared "Tracking Account" from $9.95/month; dedicated "Tracking Server" from $49.95/month for 50-1000 devices — [fitgap](https://us.fitgap.com/products/traccar)
- Traccar forwarding: `event.forward.enable`/`event.forward.url` (+ `event.forward.header`) send events; `event.forward.type` json (default), amqp, kafka, mqtt; positions forwarded separately via `forward.url` with `forward.json=true` POSTing JSON. Event forwarding is global (all events), filter at receiver — [Traccar forwarding overview](https://www.traccar.org/forward/); [Traccar forum](https://www.traccar.org/forums/topic/specifyfilter-events-to-forward/); [jpmens.net](https://jpmens.net/2018/09/14/position-and-event-forwarding-from-traccar/)
- Traccar sizing (anecdotal): developer recommends MySQL co-located on the same machine; PostgreSQL "slower than MySQL in our experience, by something like 5x"; a user ran 1,200 devices at 5 s intervals on 4 CPU / 6 GB; hearsay that 8 cores / 32 GB handles >10k objects; 1 GB RAM enough for ~30 devices — [Traccar forum sizing](https://www.traccar.org/forums/topic/sizing/); [Traccar forum hardware](https://www.traccar.org/forums/topic/traccar-server-hardware-vpsdedicatedserver-feedbacks/); [objects tracking limit](https://traccar.org/forums/topic/objects-tracking-limit)
- Teltonika FOTA WEB: SaaS for remote firmware and configuration updates, bulk-assign to device groups, TCT web configurator embedded, can request current config from device; available to all direct Teltonika customers via sales reps; reseller-managed devices may be free, otherwise paid — [Teltonika FOTA WEB](https://teltonika-gps.com/products/solutions/fota-web); [Teltonika use case](https://www.teltonika-gps.com/ja/use-cases/telematics/gps-tracker-deployment-and-maintenance-with-fota-web); [Mirifica](https://mirifica.atlassian.net/wiki/x/EIDpH)
- Navixy publishes no public price; billing per device, daily, post-paid (Navixy's own 2026 comparison); third-party tiers: Starter $99/mo up to 50 assets, $149/mo up to 500, Professional $499/mo, one-time $3,000 Provider tier — [Navixy blog](https://navixy.com/blog/top-white-label-gps-tracking-platforms/); [SoftwareSuggest](https://www.softwaresuggest.com/navixy)
- Wialon public price "on request"; third-party estimate about $10/vehicle/month small fleets down to about $5 at >1,000 vehicles (July 2025) — [Navixy blog](https://navixy.com/blog/top-white-label-gps-tracking-platforms/); [ITQlick](https://www.itqlick.com/wialon/pricing)
- Wialon integrates OEM vehicle data via High Mobility — [Wialon blog](https://wialon.com/en/blog/oem-vehicle-data-in-wialon)
- AWS IoT FleetWise closed to new customers from April 30, 2026; continues for existing customers with no new features; AWS points to "Guidance for Connected Mobility on AWS" — [AWS FleetWise availability change](https://docs.aws.amazon.com/ja_jp/iot-fleetwise/latest/developerguide/iotfleetwise-availability-change.html); [AWS FleetWise](https://aws.amazon.com/iot-fleetwise/)

### Inferences
- For a garage SaaS that owns the customer UI, Wialon/Navixy duplicate the product (their own tracking UI) at $5-10/device; they make sense only as a stopgap. flespi or Traccar act as "pipes" and keep GaragePro as the product.
- flespi is the fastest MVP: device -> flespi channel -> calculator/plugin (trip/mileage, geofence) -> HTTP stream to Vercel. Data ownership: data sits in flespi (EU-hosted, Latvia-based vendor) until streamed; streaming to Supabase gives GaragePro its own copy.
- Traccar self-hosted gives full data ownership and zero license cost, but requires ops (Java server + MySQL, backups, monitoring, upgrades). Its built-in events (alarm incl. power cut/tow where devices report it, geofence enter/exit, ignition, overspeed, device online/offline) can be forwarded as JSON webhooks to Vercel.
- AWS IoT FleetWise should be excluded. ThingsBoard and "Teltonika TAVL" were not researched in this pass (see gaps).

### Gaps
- Official flespi price sheet (fetch blocked); per-message/storage overage pricing; exact count of flespi protocols.
- ThingsBoard pricing/protocol support and Teltonika TAVL status not researched.
- Traccar official hosted price page not retrieved.

## DTC/PID decoding, descriptions, time-series storage, configuration/FOTA

### Takeaway
Generic OBD-II DTC descriptions are available under open licenses (e.g., OBDex, CC0 data) but manufacturer-specific codes (P1xxx, B1xxx...) are proprietary and differ per make, so they need a commercial database or curated per-make tables. On Supabase, TimescaleDB is gone from Postgres 17; use native partitioning with pg_partman + pg_cron for time-series and retention.

### Cited Findings
- OBDex: open dataset of generic OBD-II codes, data CC0-1.0, code MIT; deliberately excludes manufacturer-specific codes (treated as vendor IP); notes SAE J2012 text is copyrighted and descriptions are independently authored (GitHub license sidebar shows "Unknown" — verify LICENSE files) — [OBDex](https://github.com/foerbsnavi/OBDex)
- Manufacturer-specific codes are defined per manufacturer; the same P1xxx can mean different things per brand, so lookup needs make — [YouCanic](https://www.youcanic.com/glossary/manufacturer-codes/)
- Commercial sources: MOTOR diagnostic code data from OEM info; Apify DTC decoder with commercial-licensed full dataset (free 90-code sample) — [MOTOR](https://www.motor.com/wp-content/uploads/2025/10/MOTOR_DiagnosticTroubleCodes.pdf); [Apify](https://apify.com/dataengineered/obd2-dtc-code-repair-lookup)
- Codec 8 Extended is used for AVL IDs above 255 and values longer than 8 bytes (FMB family) — [Teltonika Wiki](https://wiki.teltonika-gps.com/index.php?oldid=95906&title=Help_with_Server_FAQ)
- Open-source decoder `mgf-tele-teltonika` decodes Codec 8/8E with TCP handshake and IMEI authoriser callback; Codecs 12-16 not implemented — [PyPI](https://pypi.org/project/mgf-tele-teltonika/)
- Supabase Postgres 17 bundle dropped timescaledb (plus plv8, pgjwt etc.); supported on PG15 only until about May 2026 EOL; projects must migrate hypertables to standard tables before upgrading — [Supabase changelog](https://supabase.com/changelog/35851-forthcoming-postgres-17-release-notes)
- Supabase migration guide: create partitioned table, copy, drop hypertable; optional pg_partman maintenance via pg_cron; `time_bucket()` and compression are not provided — [Supabase pg_partman migration](https://supabase.com/docs/guides/database/migrating-to-pg-partman); [pg_partman ext](https://supabase.com/docs/guides/database/extensions/pg_partman)
- FOTA WEB handles bulk firmware/config at scale for Teltonika (see previous section) — [Teltonika FOTA WEB](https://teltonika-gps.com/products/solutions/fota-web)

### Inferences
- Store raw positions in a monthly/daily partitioned `telemetry` table (pg_partman), drop old partitions for retention (e.g., 90 days raw), and keep a small `vehicle_state` (last odometer, battery voltage, last DTC set) plus an `events` table that drives the UI; this keeps Supabase DB size small.
- For DTCs: ship OBDex generic table, flag unknown/P1xxx codes as "manufacturer-specific — see garage scan tool", and optionally license a commercial DB later. For a garage audience, raw code + generic description is often enough since the mechanic will scan anyway.
- Event derivation (new DTC = diff vs previous DTC set; mileage update; low battery = external voltage threshold; unplug/tow = Teltonika power-cut/towing IO events or Traccar alarm events; geofence via flespi/Traccar geofences) should happen in the ingestion tier so only meaningful events hit Vercel.

### Gaps
- Whether pg_partman is now bundled by default on Supabase PG17 not confirmed.
- Which OBD dongles expose DTCs/PIDs via Teltonika IO elements (e.g., FMB003/FMC003 OBD) not verified here (other researcher scope).

## Security: device authentication, TLS, spoofing, retention

### Takeaway
Device identity in these protocols is essentially the IMEI sent in cleartext at login (Teltonika, GT06); servers should whitelist IMEIs, prefer TLS where supported (Teltonika supports TLS with certificates uploaded via TCT/FOTA; flespi channels support TLS), and authenticate the forwarder-to-Vercel webhook separately.

### Cited Findings
- Teltonika: server accepts/rejects by IMEI (01/00 reply) — [Teltonika Wiki](https://wiki.teltonika-gps.com/index.php?oldid=95906&title=Help_with_Server_FAQ)
- Teltonika devices support TLS encryption implemented on the server side; for FTM308, server certificates are uploaded via TCT or FOTA WEB to use TLS/DTLS, and encryption applies to TCP/UDP data protocols — [Teltonika Wiki](https://wiki.teltonika-gps.com/index.php?oldid=95906&title=Help_with_Server_FAQ); [FTM308 mobile network](https://wiki.teltonika-gps.com/view/FTM308_Mobile_network)
- flespi allows enabling TLS between device and channel — [flespi KB](https://flespi.com/kb/teltonika-device-data-via-api)
- GT06 identifies itself only via a login packet containing the BCD IMEI — [gt06 crate](https://docs.rs/crate/gt06/latest/source/README.md)

### Inferences
- Because IMEI is a non-secret identifier, anyone knowing an IMEI and the server port could inject fake data over plain TCP. Mitigations: IMEI allowlist bound to a tenant, TLS on Teltonika devices, private APN/SIM with IP filtering (operator-dependent), plausibility checks (impossible speed/jumps), and a signed (HMAC) webhook from ingestion tier to Vercel.
- Privacy (Tunisia's personal data law INPDP, GDPR for EU customers): location data is personal data; implement partition-drop retention, per-vehicle deletion on contract end, and consent from vehicle owner.

### Gaps
- No source found confirming TLS on specific FMB OBD models, or any encryption for GT06/Queclink low-cost trackers (assume none for GT06 clones).
- Tunisian data-protection specifics not researched here.

## Rough monthly cost per device at 100 / 1,000 / 10,000 devices

### Takeaway
Infrastructure-only costs range from about €0.01-0.05/device (self-hosted Traccar on Hetzner) through roughly €0.03-1.00/device (flespi, depending on scale) to $5-10/device (Wialon/Navixy white-label); SIM data plans and engineering/ops time typically dominate.

### Cited Findings
- Hetzner CX22 about €4.51/mo (2026) — [agentdeals](https://agentdeals.dev/hetzner-pricing-2026)
- Traccar 1,200 devices on 4 CPU/6 GB; >10k on 8 cores/32 GB (anecdotal) — [Traccar forum](https://traccar.org/forums/topic/objects-tracking-limit); [Traccar forum hardware](https://www.traccar.org/forums/topic/traccar-server-hardware-vpsdedicatedserver-feedbacks/)
- flespi free 10 devices; about €100/mo start plan with 1,000 devices (third-party); €0.03-0.50/device per flespi blog — [Crozdesk](https://crozdesk.com/software/flespi/pricing); [flespi blog](https://flespi.com/blog/flespi-pricing-simplification)
- AWS IoT Core $0.042/device-year connectivity, $1/M messages — [AWS](https://aws.amazon.com/iot-core/pricing/)
- Wialon about $10 to $5/vehicle; Navixy $99/50 assets, $149/500 assets (third-party) — [ITQlick](https://www.itqlick.com/wialon/pricing); [SoftwareSuggest](https://www.softwaresuggest.com/navixy)

### Inferences (my estimates, not vendor quotes)
| Option | 100 devices | 1,000 devices | 10,000 devices |
|---|---|---|---|
| Self-hosted Traccar/custom decoder on Hetzner (+MySQL, backups) | 1 small VPS ~€5-10 -> ~€0.05-0.10/dev | 1-2 mid VPS ~€15-30 -> ~€0.02-0.03/dev | 8c/32GB dedicated + replica ~€100-200 -> ~€0.01-0.02/dev |
| flespi (managed) | ~€100 plan -> ~€1/dev (free <=10) | ~€100-200 -> ~€0.10-0.20/dev | quote; flespi says €0.03-0.50 -> likely ~€0.05-0.15/dev |
| AWS IoT Core (if MQTT-capable devices; 1 msg/min = ~43k msgs/mo) | ~$0.05/dev + decoder/Lambda | ~$0.05/dev | ~$0.04/dev (volume tier) |
| Wialon / Navixy white-label | ~$1.5-10/dev | ~$5-8/dev | ~$5 or quote |
| Supabase / Vercel downstream | Supabase Pro $25 base + storage; Vercel Pro per seat; events-only webhooks keep invocations low | | |
- Add SIM data (often $1-3/device/month for low-MB IoT plans; not researched here) and device hardware amortization.
- Engineering effort: flespi ~days to MVP; self-hosted Traccar ~1-2 weeks plus ongoing ops; custom decoder ~weeks per protocol.

### Gaps
- No official flespi, Navixy, Wialon price sheets retrieved; Azure IoT Hub not priced; SIM costs in Tunisia not researched.

## Alternative without hardware: OEM connected-car APIs (Smartcar, High Mobility) in Tunisia/MENA

### Takeaway
No evidence that Smartcar or High Mobility cover Tunisia or MENA; documented coverage is the US/Canada (Smartcar) and about 30 mostly European countries (High Mobility). Hardware dongles remain necessary for the Tunisian market.

### Cited Findings
- Smartcar changelogs reference US, Canada and "supported European countries"; 2020 expansion beyond US to Germany, UK, Sweden, Norway — [Smartcar changelog 2022](https://smartcar.com/docs/changelog/2022/july); [Smartcar 2020 roundup](https://smartcar.com/blog/2020-roundup)
- High Mobility: Nissan became the 30th supported brand (April 2026); Hyundai added (July 2026) with odometer, trips, location, tyre monitoring; consent available in 30 countries incl. France, Germany, Italy, Spain, UK — [High Mobility Nissan](https://www.high-mobility.com/blog/nissan-vehicle-data-now-available-via-high-mobility); [High Mobility Hyundai](https://www.high-mobility.com/blog/hyundai-now-available-on-high-mobility); [Eligibility check](https://www.high-mobility.com/blog/how-to-check-if-a-vehicle-is-compatible-with-our-auto-api-opendevtalk-6)
- Search results for "Smartcar Middle East" returned only the unrelated "smart" car brand expanding into Morocco, Egypt, Saudi Arabia — [Medias24](https://medias24.com/2025/05/30/la-marque-de-suv-electriques-smart-debarque-au-maroc/)

### Inferences
- OEM APIs depend on vehicles being registered in OEM connected services in supported countries; most Tunisian fleet (older, many grey imports, Asian budget brands) is unlikely to be covered. They could serve EU-expansion later.

### Gaps
- No official Smartcar/High Mobility country list naming Tunisia found; confirm with vendors' compatibility endpoints.
