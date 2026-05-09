/**
 * Seed the two initial admin accounts.
 *
 * Usage:
 *   node scripts/seed-admin-accounts.mjs
 *
 * Idempotent — skips any account whose username already exists.
 * Passwords are printed on first run. Change them via /admin/users after launch.
 */
import { sql } from "./_db.mjs";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

function uid() {
  return randomBytes(5).toString("hex");
}

const ACCOUNTS = [
  {
    username: "residential@advancedcabinets.net",
    name:     "Residential PM",
    company:  "Advanced Custom Cabinets",
    role:     "admin",
    password: "Acc2026!",
  },
  {
    username: "joshl@advancedcabinets.net",
    name:     "Josh L",
    company:  "Advanced Custom Cabinets",
    role:     "admin",
    password: "Acc2026!",
  },
];

async function main() {
  console.log("\n🔑  Seeding admin accounts...\n");

  for (const acct of ACCOUNTS) {
    const [existing] = await sql`
      SELECT id FROM builder_accounts WHERE username = ${acct.username}
    `;

    if (existing) {
      console.log(`  ⏭  Skipped  ${acct.username}  (already exists)`);
      continue;
    }

    const hash = bcrypt.hashSync(acct.password, 12);
    const id   = uid();
    const now  = new Date().toISOString();

    await sql`
      INSERT INTO builder_accounts
        (id, username, password_hash, name, company, email, active, created_at, role)
      VALUES
        (${id}, ${acct.username}, ${hash}, ${acct.name}, ${acct.company},
         ${acct.username}, true, ${now}, ${acct.role})
    `;

    console.log(`  ✅  Created  ${acct.username}  /  ${acct.password}  (role: ${acct.role})`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Login at:  https://www.advancedcabinets.org/express/login
Admin UI:  https://www.advancedcabinets.org/admin/builders

⚠️  Change passwords after first login via /admin/builders → Reset PW.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await sql.end();
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message);
  process.exit(1);
});
