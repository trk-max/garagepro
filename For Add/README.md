# For Add — everything needed to run the GaragePro prompts

Everything prepared to evolve GaragePro, in one folder.

**Easiest: open the [send/](send) folder** — one ready file per message, numbered in the order to send ([send/00-READ-ME-FIRST.md](send/00-READ-ME-FIRST.md)). Details: [ORDER.md](ORDER.md) (what to send, session by session). **Start with [GUIDE.md](GUIDE.md)**: what you need (tools, accounts, keys, people) and how to run each prompt.

## prompts/ — ready-to-paste prompts for Claude Code
| File | Content |
|---|---|
| [00-AGENT.md](prompts/00-AGENT.md) | **Agent prompt**: lets an AI agent pick and do the next prompt, one per session |
| [00-PREAMBLE.md](prompts/00-PREAMBLE.md) | **Common preamble**: paste it first in every new session |
| [PROMPTS.md](prompts/PROMPTS.md) | **Common preamble** (paste first, always) + A1–A7 reliability, B1–B8 staff, C1–C6 clients, D1–D7 management |
| [PROMPTS-2.md](prompts/PROMPTS-2.md) | T1–T6 Tunisia must-haves, G1–G4 general core, V1–V8 garage types, X1–X3 growth |
| [PROMPTS-WASH.md](prompts/PROMPTS-WASH.md) | W0–W16 car wash and small workshop |
| [PROMPTS-3.md](prompts/PROMPTS-3.md) | S1–S7 ready to sell: setup wizard, accessibility, usage stats, backup per garage, load/cost test, status page, security audit |
| [PROMPT-MULTI-GARAGE.md](prompts/PROMPT-MULTI-GARAGE.md) | Multi-garage SaaS with subscriptions (proposal first, then phases) |

How to use: new Claude Code session → paste `prompts/00-PREAMBLE.md` → paste **one** prompt. One prompt per session; merge before the next.

## Other
- [IDEAS.md](IDEAS.md) — more ideas to discuss after the pilot
- Backup of the code before any prompt: branch `backup/avant-prompts-2026-11-01` on GitHub

## plans/ — product and business plans
| File | Content |
|---|---|
| [PLAN-SAAS.md](plans/PLAN-SAAS.md) | Selling by subscription: plans, add-ons, billing, costs, legal, sales, order of work |
| [PLAN-LAVAGE-ATELIER.md](plans/PLAN-LAVAGE-ATELIER.md) | Car wash + small workshop product: offers, wash types, screens, data, hardware, phases |

## research/ — research behind the recommendations
| File | Content |
|---|---|
| [OBD dongle with SIM for GaragePro.md](<research/reports/OBD dongle with SIM for GaragePro.md>) | Decision report: SIM OBD dongles (device, architecture, pricing, Tunisian rules, 10-car pilot) |
| [GaragePro global expansion features.md](<research/GaragePro global expansion features.md>) | Prioritised report: making GaragePro fit all garage types, in Tunisia and globally |
| [notes/](research/notes) | Source notes: competitors, garage types, compliance, integrations, EV/ADAS, regional markets |

## Order of work (summary)
1. `prompts/PROMPTS.md` A1–A7 — reliability
2. `prompts/PROMPT-MULTI-GARAGE.md` — phase 0 proposal, then phases
3. `prompts/PROMPTS-WASH.md` W0 — modules = subscription plans
4. Subscriptions (multi-garage phase 8), then W1–W4 + W14 → pilot with real customers
5. `prompts/PROMPTS-2.md` T1, T2, T6 — e-invoicing, cash/instalments, WhatsApp
6. The rest according to pilot feedback (details in `plans/PLAN-SAAS.md` § 8)

## Files the prompts use that stay where they are
These are part of the application and must not be moved (the code and tests read them):
- `CLAUDE.md` — project rules (graphify), read by every session
- `docs/AUDIT-V16.md`, `docs/RAPPORT-V16.md`, `tests/audit-v16/` — open audit problems (prompts A5–A7)
- `.env.example` — where new keys (payments, WhatsApp, TTN…) are documented
- `prisma/schema.prisma`, `prisma/migrations/` — database, extended by the prompts
- `README.md` — each prompt adds its "Nouveautés" section there

## Progress (mark ✅ + date when a prompt is merged)
Order of work. The agent prompt (00-AGENT.md) takes the first line that is not ✅.

1. Reliability: [ ] A1 [ ] A2 [ ] A3 [ ] A4 [ ] A5 [ ] A6 [ ] A7
2. Multi-garage: [ ] phase 0 proposal (approved by me)
3. Modules: [ ] W0
4. Multi-garage: [ ] phase 1 [ ] phase 2 [ ] phase 3 [ ] phase 4 [ ] phase 5 [ ] phase 6 [ ] phase 7 [ ] phase 8 (subscriptions)
5. Car wash + small workshop MVP: [ ] W1 [ ] W2 [ ] W3 [ ] W4 [ ] W14
5b. Ready to sell: [ ] S1 [ ] S2 [ ] S3 [ ] S4 [ ] S5 [ ] S6 [ ] S7 → **pilot with real customers**
6. Tunisia: [ ] T1 [ ] T2 [ ] T6 [ ] T3 [ ] T4 [ ] T5
7. Daily use: [ ] B1 [ ] B2 [ ] B3 [ ] B4 [ ] B5 [ ] C1 [ ] C2 [ ] C3 [ ] C4 [ ] C6
8. Car wash extras: [ ] W5 [ ] W6 [ ] W7 [ ] W8 [ ] W9 [ ] W10
9. General core: [ ] G1 [ ] G2 [ ] G3 [ ] G4
10. Garage types: [ ] V1 [ ] V2 [ ] V3 [ ] V4 [ ] V5 [ ] V6 [ ] V7 [ ] V8 [ ] B6 [ ] B7
11. Other wash types and smart: [ ] W11 [ ] W12 [ ] W13 [ ] W15 [ ] W16
12. Management: [ ] B8 [ ] C5 [ ] D2 [ ] D3 [ ] D4 [ ] D6 [ ] D7 [ ] multi-garage phase 9 (hub per branch)
13. Growth: [ ] X1 [ ] X2 [ ] X3
14. Optional: [ ] P1 connected-car pilot (OBD dongle with SIM)

Note: PROMPTS.md D1 (e-invoicing) and D5 (multi-garage) are replaced by T1 and PROMPT-MULTI-GARAGE.md.
The order after step 5 can change according to pilot feedback.
