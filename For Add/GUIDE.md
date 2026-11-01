# How to run all the prompts — yourself or with an AI agent

There are **81 prompts** in `prompts/`. Together they are several months of work. They are written so that an AI
coding agent (Claude Code) does the coding, while **you** decide, test and approve. Do them **one at a time**.

---

## 1. Can I give the whole folder to an AI agent?

**Yes, but not as one big job.** Give the folder to the agent and let it work **one prompt per session**, stopping after
each one for your check. Reasons:
- Each prompt changes the database and the code; doing 60 at once would make errors impossible to find.
- Many prompts **need you**: approve a plan, choose a price, sign a contract (TTN, Konnect, WhatsApp), give API keys,
  test on a phone, try it in your garage.
- Some prompts must be done **before** others (see the order in `README.md`).

Use the **agent prompt** in `prompts/00-AGENT.md`: it tells the agent to take the next prompt in order, do only that
one, and stop for your review.

---

## 2. What you need on your computer

| Tool | Why | Where |
|---|---|---|
| **Claude Code** (desktop app, terminal, or claude.ai/code in the browser) | the AI agent that runs the prompts | claude.ai/code |
| **Git** + your **GitHub** account with access to `trk-max/garagepro` | save and review each change | git-scm.com, github.com |
| **Node.js 22** | run GaragePro, tests and scripts | nodejs.org (or `setup.cmd` on Windows) |
| **PostgreSQL** for tests (local, Docker, or a free test server — **never** the real Supabase database) | `npm run test:db`, `npm run test:hub` need a throw-away database | postgresql.org |
| A code editor (VS Code) | read the changes | code.visualstudio.com |
| A phone (Android/iPhone) and if possible a tablet | test the mobile screens, signatures, camera | — |

Check everything with `npm run doctor`.

---

## 3. Accounts and keys (only when the prompt needs them)

Keys go in `.env` (never in Git). `.env.example` lists them.

| Needed for | What to get | Prompts |
|---|---|---|
| Hosting (already used) | Supabase project, Vercel project | all |
| Error alerts (optional) | Sentry account → `SENTRY_DSN` | A3 |
| Online payment Tunisia | **Konnect** merchant account (and/or **Flouci**) — needs your company papers | C1, T2, W8, SaaS |
| WhatsApp automatic messages | **Meta WhatsApp Business** account (Cloud API), a verified business, a phone number, approved templates | C2, T6, W3, X1 |
| SMS (optional) | contract with Orange / Ooredoo / Tunisie Telecom, or an aggregator; sender name approved by INT | T6 |
| E-invoicing | **TTN El Fatoora** registration, electronic signature certificate, test access | T1 |
| Already configured | e-mail (Resend or Gmail), AI keys (Gemini, Groq…), push (VAPID) | — |
| Multi-garage subdomains | domain `garagepro.tn` (or your brand) + wildcard DNS `*.garagepro.tn` on Vercel | multi-garage phase 7 |
| Repair data (later) | partner agreement with HaynesPro, TecAlliance (TecDoc) | V8 |
| Other countries (later) | partners for ZATCA, UAE, Paymob, Stripe… | X2, X3 |

Hardware to test the car wash version: 80 mm thermal receipt printer, cash drawer, TV with a browser (W2–W4).

---

## 4. People you will need

| Who | For what |
|---|---|
| **Accountant** (Tunisia) | VAT on garage work and on the subscription, stamp duty, withholding tax, accounting export format (B8, T1, T2) |
| **Lawyer** | subscription contract (CGV/CGU), data protection (INPDP, hosting abroad), trademark "GaragePro" (INNORPI) |
| **5–10 pilot customers** | garages and car washes who test for free and give feedback before you sell |
| Optional: a developer you trust | to review the agent's changes on money, security and sync prompts |

---

## 5. How to run ONE prompt (repeat for each)

1. **Start fresh**: in Claude Code, open the GaragePro repository on the latest `main`.
2. **Paste** `prompts/00-PREAMBLE.md`, then the prompt (for W prompts, also the extra line at the top of
   `PROMPTS-WASH.md`).
3. **Read the plan** the agent gives you. Answer its questions. Say "OK" only when it is clear.
4. Let it work. It must finish with `npm run check` green (and `npm run test:db` when the database changed).
5. **Test it yourself**: `npm run dev`, open the pages it lists, on a computer and a phone, in French and Arabic.
6. Ask the agent to **open a pull request**; read the summary; merge it on GitHub.
7. If the prompt added a database migration: run `npm run db:cloud` (online database) after the merge, and restart the
   hub on the garage PC.
8. Note in `README.md` of this folder which prompt is done (e.g. ✅ A1).

**Never** run two prompts in the same session, and never start a prompt before the previous one is merged.

---

## 6. Order (short version)

1. A1–A7 reliability → 2. multi-garage phase 0 (proposal) → 3. W0 modules → 4. multi-garage phases 1–8
→ 5. W1–W4, W14 → **pilot** → 6. T1, T2, T6 → 7. the rest by pilot feedback.
Details: `README.md` and `plans/PLAN-SAAS.md` § 8.

---

## 7. If something goes wrong

- The app breaks after a merge: on GitHub, "Revert" the pull request; then ask the agent to fix it in a new session.
- The database migration failed: do not run it again by hand; give the error to the agent. Backups: `npm run backup`,
  `npm run backup:restore` (see `docs/SAUVEGARDES.md`).
- The agent is stuck or goes in circles: stop the session, start a new one with the same prompt and add what went wrong.
- Before any prompt touching money, stock, sync or security: make a backup (`npm run backup`).
