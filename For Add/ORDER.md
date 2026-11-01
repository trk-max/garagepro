# Order to send — doing it yourself with the AI

> **Shortcut:** the folder `send/` already contains each message ready to paste (preamble + prompt), numbered 01 → 74 in this exact order. Open `send/00-READ-ME-FIRST.md`.

**One line = one new Claude Code session.** In each session send, in this order:
1. the text of `prompts/00-PREAMBLE.md` (the block between the ``` lines),
2. the prompt named in the line (copy only its block between the ``` lines),
3. for W prompts, also the extra line at the top of `prompts/PROMPTS-WASH.md`.

Then: read the plan → answer "OK" → let it work → test → merge → `npm run db:cloud` if the database changed → tick ✅
in `README.md` → next line.

Before session 1: merge the branch `docs/prompts-ameliorations` into `main` (so the "For Add" folder is on `main`).

---

## Step 1 — Reliability (file: prompts/PROMPTS.md)
| # | Send |
|---|---|
| 1 | PREAMBLE + **A1** Offline sync |
| 2 | PREAMBLE + **A2** Security headers |
| 3 | PREAMBLE + **A3** Error monitoring |
| 4 | PREAMBLE + **A4** End-to-end tests |
| 5 | PREAMBLE + **A5** Mechanics must not see prices |
| 6 | PREAMBLE + **A6** No duplicate order / check-in |
| 7 | PREAMBLE + **A7** Access after role change |

## Step 2 — Multi-garage proposal (file: prompts/PROMPT-MULTI-GARAGE.md)
| # | Send |
|---|---|
| 8 | PREAMBLE + the **whole prompt** of PROMPT-MULTI-GARAGE.md → it writes `docs/MULTI-GARAGE.md` and stops. Read it, answer its questions, approve. |

## Step 3 — Modules (file: prompts/PROMPTS-WASH.md)
| # | Send |
|---|---|
| 9 | PREAMBLE + W extra line + **W0** Module switches and simple mode |

## Step 4 — Multi-garage phases (file: prompts/PROMPT-MULTI-GARAGE.md)
For each phase send: PREAMBLE + the whole PROMPT-MULTI-GARAGE.md prompt + this sentence:
`The proposal docs/MULTI-GARAGE.md is approved. Do only phase N now.`
| # | Phase |
|---|---|
| 10 | phase 1 — tenant tables + my garage becomes garage #1 |
| 11 | phase 2 — every query scoped + isolation tests |
| 12 | phase 3 — branches, numbering per branch |
| 13 | phase 4 — shared clients / vehicles / settings |
| 14 | phase 5 — stock transfers |
| 15 | phase 6 — combined reports |
| 16 | phase 7 — subdomains + branding |
| 17 | phase 8 — sign-up, plans, subscriptions, super-admin |

## Step 5 — Car wash + small workshop MVP (file: prompts/PROMPTS-WASH.md)
| # | Send |
|---|---|
| 18 | PREAMBLE + W extra line + **W1** Wash catalogue |
| 19 | PREAMBLE + W extra line + **W2** Quick check-in and ticket |
| 20 | PREAMBLE + W extra line + **W3** Lanes board and "car ready" |
| 21 | PREAMBLE + W extra line + **W4** Receipt and cash drawer |
| 22 | PREAMBLE + W extra line + **W14** Small workshop quick order |

➡ **Start the pilot** with 5–10 real garages / car washes.

## Step 6 — Tunisia (file: prompts/PROMPTS-2.md)
| # | Send |
|---|---|
| 23 | PREAMBLE + **T1** TTN El Fatoora |
| 24 | PREAMBLE + **T2** Cash, instalments, bills of exchange |
| 25 | PREAMBLE + **T6** WhatsApp first |
| 26 | PREAMBLE + **T3** Insurance + e-Constat |
| 27 | PREAMBLE + **T4** Technical inspection |
| 28 | PREAMBLE + **T5** Part origin |

## Step 7 — Daily use (file: prompts/PROMPTS.md)
| # | Send |
|---|---|
| 29 | PREAMBLE + **B1** Search bar |
| 30 | PREAMBLE + **B2** Menus by role |
| 31 | PREAMBLE + **B3** Work order in tabs |
| 32 | PREAMBLE + **B4** Labour-time catalogue |
| 33 | PREAMBLE + **B5** Plate / VIN from photo |
| 34 | PREAMBLE + **C1** Online payment |
| 35 | PREAMBLE + **C2** Client language + WhatsApp templates |
| 36 | PREAMBLE + **C3** Client account |
| 37 | PREAMBLE + **C4** Google reviews |
| 38 | PREAMBLE + **C6** Video on quote |

## Step 8 — Car wash extras (file: prompts/PROMPTS-WASH.md)
| # | Send |
|---|---|
| 39 | PREAMBLE + W extra line + **W5** Damage photos |
| 40 | PREAMBLE + W extra line + **W6** Washer commission |
| 41 | PREAMBLE + W extra line + **W7** Tips |
| 42 | PREAMBLE + W extra line + **W8** Loyalty and subscriptions |
| 43 | PREAMBLE + W extra line + **W9** Company contracts |
| 44 | PREAMBLE + W extra line + **W10** Product consumption |

## Step 9 — General core (file: prompts/PROMPTS-2.md)
| # | Send |
|---|---|
| 45 | PREAMBLE + **G1** Vehicle → asset |
| 46 | PREAMBLE + **G2** More line types |
| 47 | PREAMBLE + **G3** Workshop profiles |
| 48 | PREAMBLE + **G4** Country packs |

## Step 10 — Garage types (files: prompts/PROMPTS-2.md, then PROMPTS.md)
| # | Send |
|---|---|
| 49 | PREAMBLE + **V1** Body and paint |
| 50 | PREAMBLE + **V2** Quick service lane |
| 51 | PREAMBLE + **V3** Fleet workshop |
| 52 | PREAMBLE + **V4** Mobile mechanics and towing |
| 53 | PREAMBLE + **V5** Tyre data |
| 54 | PREAMBLE + **V6** EV safety |
| 55 | PREAMBLE + **V7** Detailing and car wash |
| 56 | PREAMBLE + **V8** Repair data and parts sourcing |
| 57 | PREAMBLE + **B6** Tyre storage (PROMPTS.md) |
| 58 | PREAMBLE + **B7** Loaner cars (PROMPTS.md) |

## Step 11 — Other wash types (file: prompts/PROMPTS-WASH.md)
| # | Send |
|---|---|
| 59 | PREAMBLE + W extra line + **W11** Tunnel / rollover |
| 60 | PREAMBLE + W extra line + **W12** Detailing / ceramic |
| 61 | PREAMBLE + W extra line + **W13** Mobile washing |
| 62 | PREAMBLE + W extra line + **W15** Wash dashboard |
| 63 | PREAMBLE + W extra line + **W16** Wash + workshop together, plate camera |

## Step 12 — Management (file: prompts/PROMPTS.md, then PROMPT-MULTI-GARAGE.md)
| # | Send |
|---|---|
| 64 | PREAMBLE + **B8** Accounting export |
| 65 | PREAMBLE + **C5** Loyalty for the workshop / maintenance plans |
| 66 | PREAMBLE + **D2** Insurance claim file (if T3 did not cover everything) |
| 67 | PREAMBLE + **D3** Parts catalogue and supplier prices |
| 68 | PREAMBLE + **D4** Satisfaction dashboard |
| 69 | PREAMBLE + **D6** Instant updates |
| 70 | PREAMBLE + **D7** macOS/Linux install, single login |
| 71 | PREAMBLE + PROMPT-MULTI-GARAGE.md + `Do only phase 9 now.` (hub per branch) |

## Step 13 — Growth (file: prompts/PROMPTS-2.md)
| # | Send |
|---|---|
| 72 | PREAMBLE + **X1** AI receptionist |
| 73 | PREAMBLE + **X2** International e-invoicing |
| 74 | PREAMBLE + **X3** Regional payments |

---

**Do not send:** PROMPTS.md **D1** (replaced by T1) and **D5** (replaced by PROMPT-MULTI-GARAGE.md).
**Read but do not send:** `GUIDE.md`, `plans/`, `research/` — they are background; the prompts already point to them.
After step 5 you can change the order according to what pilot customers ask for.
