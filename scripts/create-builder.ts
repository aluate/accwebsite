/**
 * Create a builder account from the terminal.
 *
 * Usage:
 *   npx tsx scripts/create-builder.ts \
 *     --username jsmith \
 *     --name "John Smith" \
 *     --password temp1234 \
 *     [--company "Smith Builders LLC"] \
 *     [--email john@smithbuilders.com] \
 *     [--phone "(208) 555-0100"]
 *
 * The script prints the credentials so you can hand them to the builder.
 */

import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

// ── Parse args ────────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const username = arg("--username");
const name     = arg("--name");
const password = arg("--password");
const company  = arg("--company") ?? null;
const email    = arg("--email")   ?? null;
const phone    = arg("--phone")   ?? null;

if (!username || !name || !password) {
  console.error(
    "\n❌  Missing required flags.\n\n" +
    "Usage:\n" +
    "  npx tsx scripts/create-builder.ts \\\n" +
    "    --username jsmith \\\n" +
    '    --name "John Smith" \\\n' +
    "    --password temp1234 \\\n" +
    '    [--company "Smith Builders LLC"] \\\n' +
    "    [--email john@example.com] \\\n" +
    "    [--phone '(208) 555-0100']\n"
  );
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Verify DB exists ───────────────────────────────────────────────────────
  const DB_PATH = path.join(process.cwd(), "data/acc-jobs.db");

  if (!fs.existsSync(DB_PATH)) {
    console.error(
      "\n❌  Database not found at data/acc-jobs.db\n" +
      "    Start the dev server at least once first so the DB is created.\n"
    );
    process.exit(1);
  }

  // ── Import db (runs CREATE TABLE IF NOT EXISTS for every table) ────────────
  const { default: db } = await import("../lib/db");

  // ── Check for duplicate ────────────────────────────────────────────────────
  const clean = username!.trim().toLowerCase();
  const existing = db
    .prepare("SELECT id FROM builder_accounts WHERE username = ?")
    .get(clean);

  if (existing) {
    console.error(`\n❌  Username "${clean}" is already taken.\n`);
    process.exit(1);
  }

  // ── Create account ─────────────────────────────────────────────────────────
  const hash = bcrypt.hashSync(password!, 12);
  const id   = Math.random().toString(36).slice(2, 10);
  const now  = new Date().toISOString();

  db.prepare(`
    INSERT INTO builder_accounts
      (id, username, password_hash, name, company, email, phone, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, clean, hash, name!.trim(), company, email, phone, now);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`
✅  Builder account created.

   Username : ${clean}
   Password : ${password}
   Name     : ${name!.trim()}${company ? `\n   Company  : ${company}` : ""}${email ? `\n   Email    : ${email}` : ""}${phone ? `\n   Phone    : ${phone}` : ""}

Hand these credentials to the builder. They can log in at:
   /express/login

You can manage all accounts (reset passwords, deactivate) at:
   /admin/builders
`);
}

main().catch((err) => {
  console.error("\n❌  Unexpected error:", err);
  process.exit(1);
});
