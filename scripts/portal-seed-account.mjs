/**
 * Seed a builder portal account.
 *
 *   npm run portal-seed-account -- --company "Atlas Builders" --user atlas --display "Atlas PM" --pw temp123!
 *
 * Optional flags:
 *   --enable-jobs   flip builder_portal_enabled=true for every job matching this company
 *   --email         contact email
 *   --force         overwrite existing account
 */
import { sql } from "./_db.mjs";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.findIndex((a) => a === `--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  return null;
}
function has(name) { return args.includes(`--${name}`); }

const company = flag("company");
const username = (flag("user") || "").toLowerCase().trim();
const display = flag("display") || username;
const pw = flag("pw") || flag("password");
const email = flag("email");
const enableJobs = has("enable-jobs");
const force = has("force");

if (!company || !username || !pw) {
  console.error('Usage: npm run portal-seed-account -- --company "<company>" --user <username> --display "<name>" --pw <password> [--email <email>] [--enable-jobs] [--force]');
  process.exit(1);
}
if (pw.length < 8) { console.error("Password must be 8+ characters."); process.exit(1); }

const hash = bcrypt.hashSync(pw, 12);
const now = new Date().toISOString();

const [existing] = await sql`SELECT id FROM builder_portal_accounts WHERE username = ${username}`;
if (existing && !force) {
  console.error(`Account ${username} already exists. Re-run with --force to overwrite.`);
  await sql.end();
  process.exit(1);
}

const id = existing?.id || randomBytes(4).toString("hex");

if (existing) {
  await sql`
    UPDATE builder_portal_accounts
    SET password_hash = ${hash}, display_name = ${display}, builder_company = ${company},
        contact_email = ${email ?? null}, must_change_pw = true, active = true
    WHERE id = ${id}
  `;
  console.log(`Reset existing account ${username}`);
} else {
  await sql`
    INSERT INTO builder_portal_accounts (id, username, password_hash, display_name, builder_company, contact_email, active, created_at, must_change_pw)
    VALUES (${id}, ${username}, ${hash}, ${display}, ${company}, ${email ?? null}, true, ${now}, true)
  `;
  console.log(`Created account ${username}`);
}

if (enableJobs) {
  const r = await sql`
    UPDATE jobs SET builder_portal_enabled = true
    WHERE LOWER(TRIM(builder_company)) = LOWER(TRIM(${company}))
  `;
  console.log(`Enabled portal on ${r.count} job(s) for "${company}"`);
}

console.log("\n=== HAND THESE TO THE BUILDER ===");
console.log(`URL:      https://advancedcabinets.org/portal/login`);
console.log(`Username: ${username}`);
console.log(`Password: ${pw}     (they must change on first login)`);
console.log(`Company:  ${company}`);
console.log("=================================");

await sql.end();
