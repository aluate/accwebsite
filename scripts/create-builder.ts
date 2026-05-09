/**
 * DEPRECATED — this script used better-sqlite3 against the local SQLite DB.
 * The database is now Supabase Postgres; there is no local acc-jobs.db.
 *
 * To create a builder account:
 *   1. Go to /admin/builders in the app (admin login required).
 *   2. Use the "Create builder" form there — it writes to Supabase directly.
 *
 * To create ADMIN accounts, use:
 *   node scripts/seed-admin-accounts.mjs
 */
console.error("create-builder.ts is obsolete. The database is now Supabase Postgres.");
console.error("Create builder accounts at /admin/builders in the app (admin login required).");
process.exit(1);
