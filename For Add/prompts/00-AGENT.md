# Agent prompt — work through the "For Add" folder, one prompt at a time

Paste this into a new Claude Code session (instead of a single prompt) when you want the agent to pick the next prompt
itself. Use a new session for every prompt.

```
You are working on GaragePro. The folder "For Add/" contains the plan of work:
- "For Add/README.md" (index and order of work) and "For Add/GUIDE.md" (rules for running the prompts),
- "For Add/prompts/" (00-PREAMBLE.md + PROMPTS.md, PROMPTS-2.md, PROMPTS-WASH.md, PROMPT-MULTI-GARAGE.md),
- "For Add/plans/" and "For Add/research/" (background; read only what the current prompt needs).

Do this:
1. Read "For Add/README.md" and "For Add/GUIDE.md". Find the progress list in README.md (prompts marked ✅ are done)
   and choose the NEXT prompt in the order of work. If a prompt depends on another that is not done, say so.
2. Tell me which prompt you chose and why, then apply "For Add/prompts/00-PREAMBLE.md" and that prompt exactly.
3. Do ONLY that prompt. Do not start the next one, even if you have time.
4. Stop and ask me whenever the prompt or the preamble says to wait for my approval, when a decision is mine (prices,
   legal, which provider), or when a key/contract is missing (payments, WhatsApp, TTN…). Never invent keys, never
   pretend a message was sent or a payment was made.
5. When done: `npm run check` green (plus test:db / test:hub when needed), give me the list of pages to test by hand
   (computer + phone, French + Arabic), mark the prompt ✅ in "For Add/README.md" with the date, commit, push your
   branch, and ask me if I want a pull request.
```
