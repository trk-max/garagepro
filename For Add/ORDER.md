# Order to send — doing it yourself with the AI

**The order is the numbering of the files in [`send/`](send)** (01 → 81). The list with checkboxes is
[`send/00-READ-ME-FIRST.md`](send/00-READ-ME-FIRST.md).

Each file is one complete message (preamble + prompt, plus the car-wash line or the multi-garage phase sentence when
needed). For each file:
1. Open it → Ctrl+A, Ctrl+C.
2. New Claude Code conversation → paste → Enter.
3. Read the plan → answer its questions → "OK".
4. Let it work until `npm run check` is green; test the pages it lists (computer + phone, French + Arabic).
5. Ask it to push and open a pull request → merge on GitHub → `git pull origin main` on your PC.
6. If the database changed: `npm run db:cloud`. Before files touching money, stock, sync or security: `npm run backup`.
7. Tick the file in `send/00-READ-ME-FIRST.md` and in `README.md` → next file.

Groups (file numbers):
| Files | Content |
|---|---|
| 01–07 | A1–A7 reliability |
| 08 | Multi-garage phase 0 — proposal, stops for your approval |
| 09 | W0 modules |
| 10–17 | Multi-garage phases 1–8 (8 = subscriptions) |
| 18–22 | W1–W4, W14 car wash + small workshop MVP |
| 23–29 | S1–S7 ready to sell (wizard, accessibility, stats, backup per garage, load test, status page, security audit) → **pilot** |
| 30–35 | T1, T2, T6, T3, T4, T5 Tunisia |
| 36–45 | B1–B5, C1–C4, C6 daily use |
| 46–51 | W5–W10 car wash extras |
| 52–55 | G1–G4 general core |
| 56–65 | V1–V8, B6, B7 garage types |
| 66–70 | W11–W13, W15, W16 other wash types |
| 71–78 | B8, C5, D2, D3, D4, D6, D7, multi-garage phase 9 |
| 79–81 | X1–X3 growth |

Not sent: PROMPTS.md D1 (replaced by T1) and D5 (replaced by PROMPT-MULTI-GARAGE.md).
After the pilot you may change the order according to customer feedback. More ideas: `IDEAS.md`.
