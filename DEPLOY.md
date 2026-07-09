# ACC Website — Deploy SOP

Maintained in the **deploy thread** in Cowork. All deploys and version entries happen there.
Claude handles the deploy loop autonomously — push, watch build via Vercel dashboard (Chrome), fix, repeat.

---

## How deploys work

1. Code is pushed to the `main` branch on GitHub
2. Vercel auto-detects the push and starts a build
3. Build runs: `npm run db:push && npm run build`
   - `db:push` applies the full schema to Supabase (idempotent — safe to run every time)
   - `next build` compiles the app
4. On success, Vercel promotes to production automatically
5. CHANGELOG.md is updated with a new version entry

**Deploy notifications:** Vercel emails `karlv@advancedcabinets.net` on build failure.

---

## Pre-deploy checklist

Before pushing:
- [ ] `npm run build` passes locally (catches TypeScript errors before they hit Vercel)
- [ ] New env vars added to Vercel project settings (Settings → Environment Variables) if any were added to `.env.local`
- [ ] New DB tables/columns are handled in `db-push.mjs` with `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`

---

## Environment variables

Stored in `.env.local` (gitignored). Must also be set in Vercel project settings.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase pooler URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct URL (port 5432, for migrations if needed) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SESSION_SECRET` | Cookie signing secret |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of admin password |
| `GMAIL_USER` | SMTP sender address |
| `GMAIL_APP_PASSWORD` | Gmail app password for SMTP |
| `DOCUSIGN_*` | DocuSign integration keys (see secrets.txt) |

**Secrets file:** `secrets.txt` in repo root — gitignored, never committed.

---

## Rollback

Vercel keeps every previous deployment. To roll back:
1. Go to vercel.com → accwebsite project → Deployments
2. Find the last known-good deploy
3. Click the three-dot menu → **Promote to Production**

No code changes needed. Instant.

If the rollback also rolls back a DB schema change that broke things, that's a manual Supabase fix — drop the bad column/table via the Supabase SQL Editor.

---

## Known gotchas

**`prepare: false` is required.**
PgBouncer transaction mode (port 6543) does not support prepared statements. The `postgres` npm package must be initialized with `{ prepare: false }`. This is already set in `lib/db.ts`. If you ever see `prepared statement does not exist` errors on Vercel, this is why.

**Lazy-init DB and DocuSign clients.**
`lib/db.ts` and `lib/docusign.ts` must not initialize at module load time — env vars aren't available during `next build`. Both use lazy initialization. Don't change this pattern.

**`force-dynamic` on all API routes.**
All API routes and pages that touch the DB have `export const dynamic = 'force-dynamic'`. Without this, Next.js tries to statically render them at build time, which fails because there's no DB at build time.

**`proxy.ts` not `middleware.ts`.**
Auth middleware lives in `proxy.ts` (Next 16 convention). Having both `proxy.ts` and `middleware.ts` is fatal — Next will throw. Don't create `middleware.ts`.

**Booleans crash SQLite bindings** (legacy note — we're on Postgres now, but kept for reference).
Use `1`/`0` integers, not `true`/`false`, anywhere SQLite-era code still exists.

---

## Version tagging

After every successful deploy, tag the commit:

```bash
git tag 26.05.26.001   # YY.MM.DD.sequence
git push origin --tags
```

Sequence resets to 001 each day. If two deploys happen on the same day, second one is 002, etc.

Then add an entry to CHANGELOG.md and commit it (this commit doesn't need its own tag — it's just bookkeeping).

---

## GitHub remote

Repo: `https://github.com/aluate/accwebsite`
Branch: `main` (production). The `master` branch on GitHub is a stale preview branch — Vercel builds it as Preview only, never Production. Never push to `master`.
Auth: PAT embedded in remote URL (no expiration set). If push auth ever fails, check `secrets.txt` for the current token and update the remote:
```bash
git remote set-url origin https://TOKEN@github.com/aluate/accwebsite.git
```

---

## How Claude pushes (the NTFS workaround)

The repo is mounted at `C:\dev\repos\acc-website` on NTFS. The Linux sandbox cannot write to `.git/` on that mount (permissions error on lock files), so Claude **never pushes directly from the mount**. Instead, a clean clone is made to `/tmp/` at the start of each deploy session.

**Session setup (run once per new session that needs to push):**
```bash
TOKEN=$(grep -o 'ghp_[A-Za-z0-9]*' /sessions/*/mnt/repos/acc-website/.git/config | head -1)
git clone "https://${TOKEN}@github.com/aluate/accwebsite.git" /tmp/acc-repo
cd /tmp/acc-repo && git checkout main
git config --global user.email "karlv@advancedcabinets.net"
git config --global user.name "Karl V"
```

**If `/tmp/acc-repo` already exists in the same session, skip the clone:**
```bash
cd /tmp/acc-repo && git branch --show-current   # should say "main"
```

**Push script — copies changed files from the mount into the clean clone and pushes:**
```bash
cat > /tmp/push.sh << 'SCRIPT'
#!/bin/bash
# Usage: bash /tmp/push.sh "commit message" path/to/file1 path/to/file2 ...
MSG="$1"; shift
MOUNT="/sessions/$(ls /sessions)/mnt/repos/acc-website"
REPO="/tmp/acc-repo"
cd "$REPO"
git fetch origin -q
git reset --hard origin/main -q
for f in "$@"; do
  mkdir -p "$(dirname "$REPO/$f")"
  cp "$MOUNT/$f" "$REPO/$f"
  git add "$f"
done
git diff --cached --quiet && echo "Nothing to commit." && exit 0
git commit -m "$MSG" -q && git push origin main 2>&1 | tail -3
SCRIPT
chmod +x /tmp/push.sh
```

**Push changed files:**
```bash
bash /tmp/push.sh "feat: description of change" app/api/some/route.ts lib/some-file.ts
```

**Note:** `/tmp/` is wiped between sandbox sessions. Re-run the setup block at the start of each new Cowork session that needs to push.
