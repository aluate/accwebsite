# Workflow Setup — Karl's Steps

I've written the control docs and tooling. These remaining steps need your terminal and your dashboard logins, so they're yours. Do them once and the "spec a list → agent runs on staging → you test on a preview URL → you promote" loop is live. Do them in order.

> You currently have uncommitted changes on `master`. Decide what to do with them first (commit them on master, or stash them) before creating the staging branch, so they land where you intend.

---

## 1. Rotate the leaked GitHub token (do this first)

Your `origin` remote URL has a GitHub personal access token baked into it in plaintext. Anyone who sees that repo config has push access.

- GitHub → Settings → Developer settings → Personal access tokens → revoke the current token, create a new one.
- Re-point the remote without embedding the token (use a credential manager instead):
  ```bash
  git remote set-url origin https://github.com/aluate/accwebsite.git
  ```
  Git will prompt for credentials and cache them via the OS credential manager.

---

## 2. Create and push the `staging` branch

```bash
git checkout -b staging master
git push -u origin staging
```
From now on, agents (and you, for hand edits) commit to `staging`. `master` is only ever updated by your promote step (Step 5).

---

## 3. Confirm the staging preview URL on Vercel

- Vercel auto-builds a deployment for every branch. After Step 2, open your project → Deployments and find the `staging` deployment.
- Note its URL (something like `accwebsite-git-staging-<account>.vercel.app`). **Bookmark it on your phone.** That's the URL you test on.
- In Project → Settings → Git, confirm **Production Branch = `master`** (so only master promotes to `www.advancedcabinets.org`) and that preview deployments are enabled.

---

## 4. Create the staging Supabase project

- Supabase dashboard → New project (free tier is fine). Name it e.g. `acc-website-staging`.
- Copy its connection string / keys.
- In Vercel → Project → Settings → Environment Variables, set the Supabase vars **for the Preview environment** (and specifically the `staging` branch) to the new staging project. Leave **Production** pointing at your real database.
  - This is the wall: `staging` branch + Preview env → staging DB; `master` + Production env → real DB. Agents only ever run against staging.
- Run the schema setup against staging once so it matches production:
  ```bash
  # with staging env vars loaded locally:
  npm run db:push
  npm run migrate
  # optional: seed some fake data to test against
  npm run seed-schedule
  ```

---

## 5. How you promote (your job, the only gate)

When you've tested a finished list on the staging URL and you're happy:
```bash
git checkout master
git merge staging
git push origin master      # this deploys to the live field app
git checkout staging        # go back to staging so the next run starts clean
```
Then run a quick smoke check against production and click through on your phone:
```bash
npm run smoke -- https://www.advancedcabinets.org
```

---

## 6. Commit the new workflow files

These were just created on disk. Commit them to `staging`:
```bash
git checkout staging
git add AGENTS.md PROGRESS_LOG.md SETUP_CHECKLIST.md TODO.md package.json scripts/smoke.mjs
git commit -m "chore: install agent workflow guardrails (staging branch, gates, log, smoke test)"
git push origin staging
```

---

## After setup — how every future run works

1. You write the next batch into `PROGRESS_LOG.md` → CURRENT LIST (or just tell me and I'll write it).
2. The agent reads `AGENTS.md` → `PROGRESS_LOG.md`, works the list top to bottom on `staging`, runs `npm run selftest` and `npm run smoke`, logs results, pushes `staging`.
3. You test the staging URL on your phone. Bugs → next list.
4. When happy, you promote (Step 5). That's the only time anything reaches the field.
