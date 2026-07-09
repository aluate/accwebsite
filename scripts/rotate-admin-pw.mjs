/**
 * One-shot admin password rotation.
 *
 * Usage:
 *   node scripts/rotate-admin-pw.mjs <new-password>
 *   node scripts/rotate-admin-pw.mjs <new-password> someuser@email.com
 */
import { sql } from "./_db.mjs";
import bcrypt from "bcryptjs";

const newPassword = process.argv[2];
const username = process.argv[3] || "residential@advancedcabinets.net";

if (!newPassword) {
  console.error("Usage: node scripts/rotate-admin-pw.mjs <new-password> [username]");
  process.exit(1);
}
if (newPassword.length < 4) { console.error("Password too short."); process.exit(1); }

const [before] = await sql`SELECT id, username, role, active FROM builder_accounts WHERE username = ${username}`;
if (!before) { console.error(`No account found for: ${username}`); await sql.end(); process.exit(1); }
console.log("Before:", before);

const hash = bcrypt.hashSync(newPassword, 12);
await sql`UPDATE builder_accounts SET password_hash = ${hash} WHERE username = ${username}`;

const [row] = await sql`SELECT password_hash FROM builder_accounts WHERE username = ${username}`;
const ok = bcrypt.compareSync(newPassword, row.password_hash);
console.log("Verify:", ok ? "PASS" : "FAIL");
console.log(`Password for ${username} rotated successfully.`);

await sql.end();
