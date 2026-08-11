#!/usr/bin/env node
/**
 * check-role-vocab.mjs — every role literal in the code is one the code writes.
 *
 * Runs in prebuild. No database, no network.
 *
 * WHY. The door-front role vocabulary drifted and nothing noticed for months:
 *
 *   applied_ends   written by the UI, compared by nothing
 *   applied_end    compared by lib/pdf-spec.tsx, written by nobody
 *   drawer_front   compared by lib/pdf-spec.tsx, written by nobody
 *   upper          written, compared by nothing
 *
 * The table has no UNIQUE and no enum — deliberately, because Karl needs several
 * rows per role — so there is nothing in the database to catch a typo. The failure
 * mode is silent and specific: a comparison against a role no writer produces is
 * dead, and a filter that EXCLUDES such a role excludes nothing. That is how an
 * applied end came to be printed as a drawer front on the document the client signs.
 *
 * So this asserts the two directions that matter:
 *
 *   PHANTOM   a literal compared in code that is in no canonical list. Dead
 *             comparison, or worse, a dead exclusion.
 *   UNLABELLED  a canonical role with no display label — renders as a raw
 *             identifier on a customer-facing sheet.
 *
 * It reads lib/door-front-roles.ts as the source of truth and greps the readers.
 * Deliberately dumb: a regex over source text, so it cannot be satisfied by a
 * clever indirection that still leaves a bad literal in the file.
 *
 *   node scripts/check-role-vocab.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const read = (p) => (existsSync(resolve(root, p)) ? readFileSync(resolve(root, p), "utf8") : null);

let problems = 0;
const fail = (msg) => { problems++; console.log(`  PROBLEM  ${msg}`); };

// ── the canonical list, parsed from the file that defines it ─────────────────
const vocabSrc = read("lib/door-front-roles.ts");
if (!vocabSrc) {
  console.error("\nlib/door-front-roles.ts is missing. It is the single list of door-front");
  console.error("roles; without it the readers and writers have nothing to agree on.\n");
  process.exit(1);
}

const constOf = (name) => vocabSrc.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
const CANON = ["ROLE_BASE", "ROLE_UPPER", "ROLE_DRAWER_FRONT", "ROLE_APPLIED_END"]
  .map((n) => ({ name: n, value: constOf(n) }));

for (const c of CANON) if (!c.value) fail(`lib/door-front-roles.ts no longer exports ${c.name}`);
const canonValues = new Set(CANON.map((c) => c.value).filter(Boolean));

// Legacy aliases are legitimate literals to see in the vocabulary file itself.
const aliasBlock = vocabSrc.match(/LEGACY_ROLE_ALIAS[\s\S]*?\n\};/)?.[0] ?? "";
const aliasValues = new Set([...aliasBlock.matchAll(/^\s*([a-z_0-9]+):/gm)].map((m) => m[1]));

// Roles that exist on old rows, are not canonical, and are knowingly unhandled.
// Listed here so they do not read as drift every build. Each renders via the raw
// value as its own label, which is why leaving them alone is safe.
const KNOWN_LEGACY_UNMAPPED = new Set(["slab_df", "5pc_df"]);

console.log(`\n${canonValues.size} canonical door-front role(s): ${[...canonValues].join(", ")}`);
if (aliasValues.size) console.log(`${aliasValues.size} legacy alias(es) normalized on read: ${[...aliasValues].join(", ")}`);

// ── PHANTOM: a role literal compared in code that no list contains ──────────
//
// Only files that COMPARE roles are scanned. door-front-roles.ts itself defines the
// literals and would trivially match.
const READERS = [
  "lib/pdf-spec.tsx",
  "lib/pdf-coversheet.tsx",
  "lib/lifecycle.ts",
  "lib/spec-data.ts",
  "lib/engineering-autocheck.ts",
];

// `role === "x"`, `role !== "x"`, `role: "x"` — the shapes a role literal appears in.
const ROLE_LITERAL = /\brole\s*(?:===|!==|==|!=)\s*"([a-z_0-9]+)"/g;

// Roles belonging to OTHER tables, which legitimately appear beside door-front ones.
const OTHER_TABLE_ROLES = new Set([
  "cab_int", "cab_ext", "cab_int2", "cab_ext2",             // finish_group_materials
  "drawer_box", "rollout",                                   // finish_group_drawers
  "hinges", "drawer_slides", "rollout_slides", "door_pulls", // finish_group_hardware
  "drawer_pulls", "closet_rod", "trash_pullout", "base_pullout",
  "blind_corner", "shelf_clips", "misc", "aventos",
]);

let scanned = 0;
for (const f of READERS) {
  const src = read(f);
  if (!src) { fail(`${f} is listed as a role reader but does not exist — update this list`); continue; }
  scanned++;
  for (const m of src.matchAll(ROLE_LITERAL)) {
    const lit = m[1];
    if (canonValues.has(lit) || aliasValues.has(lit)) continue;
    if (OTHER_TABLE_ROLES.has(lit) || KNOWN_LEGACY_UNMAPPED.has(lit)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    fail(`${f}:${line} compares role against "${lit}", which is in no canonical or legacy list.\n` +
         `           If nothing writes it, this comparison is dead — and a dead EXCLUSION\n` +
         `           excludes nothing, which is how an applied end printed as a drawer front.`);
  }
}
console.log(`${scanned} reader file(s) scanned for role literals.`);

// ── UNLABELLED: a canonical role with no display label ──────────────────────
for (const c of CANON) {
  if (!c.value) continue;
  if (!new RegExp(`\\[${c.name}\\]\\s*:`).test(vocabSrc)) {
    fail(`${c.name} ("${c.value}") has no entry in DOOR_FRONT_ROLE_LABEL — it would print as a raw identifier`);
  }
}

// ── the canonical constants are actually used, not just declared ────────────
const allReaderSrc = READERS.map((f) => read(f) ?? "").join("\n");
for (const c of CANON) {
  if (!c.value) continue;
  const usedAsConst   = allReaderSrc.includes(c.name);
  const usedAsLiteral = new RegExp(`"${c.value}"`).test(allReaderSrc);
  if (usedAsLiteral && !usedAsConst) {
    fail(`${c.value} is compared as a bare string but ${c.name} is never imported — ` +
         `use the constant so a rename cannot leave a stale literal behind`);
  }
}

console.log();
if (problems) {
  console.log(`FAIL — ${problems} role vocabulary problem(s). See above.\n`);
  process.exit(1);
}
console.log(`PASS — every role literal in the readers is one the code actually writes.\n`);
