# db-push-prod.ps1 — runs db-push against Supabase production (not localhost)
# Run from the acc-website folder: .\scripts\db-push-prod.ps1

$env:DATABASE_URL = 'postgresql://postgres.kuqmhgjrlfawsnzmempl:2Cnz5KQ9Q%248%40hQu@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
node scripts/db-push.mjs
Remove-Item Env:\DATABASE_URL
