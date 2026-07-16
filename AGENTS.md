<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ACC Website — Agent Operating Rules

**Read this file first, every session. Then read `PROGRESS_LOG.md` to find where you are. Then read `ARCHITECTURE.md` when you need system detail. Then work.**

This app is **live and used in the field on phones every day** (`www.advancedcabinets.org`). A bad change doesn't inconvenience one person in an office — it can take down the tool a crew is standing in a kitchen trying to use. The rules below exist so you can move fast without ever touching the live site by accident.

---

## 1. The one branch rule — READ THIS TWICE

**You work on `staging`. Only `staging`. Never `main`.**

- `main` = production = live at www.advancedcabinets.org. **Protected by GitHub branch rules — direct pushes are blocked.** You cannot push there; only Karl merges staging → main via Pull Request.
- `staging` = where all your work goes. It deploys to the Vercel preview URL. Breaking staging breaks nothing real.

**Start of every session (MANDATORY):**
```bash
cd /tmp/acc-repo    # or git clone if not present
git checkout staging
git pull origin staging
```
If the repo isn't cloned yet:
```bash
git clone https://x-access-token:$(cat /path/to/secrets.txt | grep ghp_ | head -1)@github.com/aluate/accwebsite.git /tmp/acc-repo
cd /tmp/acc-repo && git checkout staging
```

**To ship your work (this is the ONLY push you ever run):**
```bash
cd /tmp/acc-repo
git add -A
git commit -m "feat/fix/chore: clear description"
git push origin staging
```
Karl opens a PR on GitHub (staging → main) to review and merge to production.

**Forbidden, no exceptions:**
- `git push origin main`  ← blocked by branch protection anyway
- `git checkout main && git commit` ← don't even switch to main
- Editing files via the Edit/Write tools directly on the NTFS repo mount (C:\dev\repos\acc-website) — NTFS truncation bug silently corrupts files. Always write via bash to /tmp/acc-repo, then push.

**NTFS write constraint (permanent):**
All writes must go through bash at `/tmp/acc-repo` — never use the Edit or Write tool on the mounted NTFS repo at C:\dev\repos\acc-website. The NTFS mount silently truncates files.
- merging anything into master
- force-pushing any branch

If you ever find yourself on `master`, stop and run `git checkout staging` before doing anything else.

---

## 2. The database rule

- The staging branch points at the **staging Supabase project** via its own env vars. You may read, write, seed, migrate, or wipe the staging database freely — it holds no real field data.
- You may **never** point at, write to, or migrate the **production** Supabase project. Production data = real jobs, real schedules, real field activity.
- Migrations (`npm run migrate`, `npm run db:push`, anything that changes schema) run against **staging only**. Applying a migration to production happens as part of Karl's promote step — not yours.

---

## 3. The only two gates

Everything else runs without asking. You stop and hand back to Karl for exactly two things:

1. **Promote to production** (`staging` → `master`). Always Karl. You never do this.
2. **A production database migration.** Flag it, describe it, stop. Karl runs it as part of promote.

You do **not** stop for: writing code, installing packages, running tests, committing/pushing to staging, seeding or migrating the staging DB, refactoring within the current list. Just do it.

---

## 4. The list and the log

- **The current work list** lives at the top of `PROGRESS_LOG.md` under "CURRENT LIST." Work it **top to bottom.** The gate is the **end of the list** — when the list is done, push staging, write the summary, and stop for Karl's review.
- **Update `PROGRESS_LOG.md` after every working session.** Newest entry at top. Log: what you built, what you tested, what you deferred, any blockers, and exactly where to resume. If you don't log it, the next session starts blind. The log is also Karl's audit trail — it's how he proves to others that this works and is under control. Treat it as a deliverable, not a chore.

**Blocker protocol (don't stall a long run):**
```
**BLOCKER [date] — [short title]**
- Question: [exactly what you need to know]
- Interim assumption: [what you'll build on until answered]
- Impact if wrong: [what changes if the assumption is incorrect]
- Status: OPEN
```
Log it, state your assumption, **keep building.** Karl answers in the log; on "continue" you re-read the log, pick up resolved blockers, and resume. Never invent answers to business questions (pricing, builder defaults, finish rules) — flag those and keep going on everything else.

---

## 5. Mobile is non-negotiable

Every change must preserve **phone / field accessibility.** Before you push:
- Test at mobile width (≈390px), not just desktop.
- If a change makes a screen unusable on a phone, it is not done, regardless of how it looks on desktop.

---

## 6. Test before you hand off

1. `npm run selftest` — must pass (catalog FKs, DB shape, lifecycle, approvals, `tsc --noEmit`).
2. `node scripts/smoke.mjs <staging-url>` — hits the deployed staging build and checks the critical field paths (home, login, key APIs, mobile meta). This is what catches "only breaks on deploy" bugs **before** they reach production.
3. Record both results in `PROGRESS_LOG.md`.

Do not declare an item done with a failing selftest or smoke check.

---

## 7. Don't break what already works

The auth, jobs, schedule, spec form, portal, punch, warranty, and search features are live and working. Do not refactor or "improve" anything that isn't on the current list. If you believe something off-list is broken, log it as a candidate item — don't fix it silently mid-run.

---

## 8. Secrets

Never commit `.env*`. Never print tokens, passwords, or connection strings in logs or commit messages. Never hardcode credentials. If you spot a leaked secret (e.g. a token in a git remote URL), flag it in the log — do not echo it.

---

## 9. Karl's two thinking tools — use both

**Devil's Advocate Check (DAC) — run EARLY, while planning a list or a feature.** Actively try to *kill* the idea, don't just poke at it. Assume real constraints (money, time, labor, vendor reliability, field messiness). Hunt for hidden dependencies, bottlenecks, and assumptions doing too much work. Probes: "What would have to be true for this to fail?" / "Where does it break under pressure?" / "What only works in a clean spreadsheet, not in the field?" Output a concrete **list of failure modes + fixes.**

**Tahiti Test (TT) — run LATE, before declaring anything done.** "Does this survive without Karl?" Check the failure surface, not the happy path: messy inputs, someone else running it, graceful failure vs cascade, behavior under volume. Probes: "If Karl disappears for 2 weeks, what breaks?" / "Where does this require Karl specifically?" / "What depends on context that isn't written down?" Output a **list of fragility points + what to automate or document.**

DAC kills bad ideas before they're built. TT catches fragile systems before they ship. Run DAC at the top of a list, TT at the bottom.
