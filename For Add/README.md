# For Add — everything needed to run the GaragePro prompts

Everything prepared to evolve GaragePro, in one folder.

## prompts/ — ready-to-paste prompts for Claude Code
| File | Content |
|---|---|
| [00-PREAMBLE.md](prompts/00-PREAMBLE.md) | **Common preamble**: paste it first in every new session |
| [PROMPTS.md](prompts/PROMPTS.md) | **Common preamble** (paste first, always) + A1–A7 reliability, B1–B8 staff, C1–C6 clients, D1–D7 management |
| [PROMPTS-2.md](prompts/PROMPTS-2.md) | T1–T6 Tunisia must-haves, G1–G4 general core, V1–V8 garage types, X1–X3 growth |
| [PROMPTS-WASH.md](prompts/PROMPTS-WASH.md) | W0–W16 car wash and small workshop |
| [PROMPT-MULTI-GARAGE.md](prompts/PROMPT-MULTI-GARAGE.md) | Multi-garage SaaS with subscriptions (proposal first, then phases) |

How to use: new Claude Code session → paste `prompts/00-PREAMBLE.md` → paste **one** prompt. One prompt per session; merge before the next.

## plans/ — product and business plans
| File | Content |
|---|---|
| [PLAN-SAAS.md](plans/PLAN-SAAS.md) | Selling by subscription: plans, add-ons, billing, costs, legal, sales, order of work |
| [PLAN-LAVAGE-ATELIER.md](plans/PLAN-LAVAGE-ATELIER.md) | Car wash + small workshop product: offers, wash types, screens, data, hardware, phases |

## research/ — research behind the recommendations
| File | Content |
|---|---|
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
