/**
 * scripts/_tree.mjs — which checkout a script reads its data from, and whether that
 * checkout is the one that is deployed.
 *
 * WHY THIS EXISTS. Karl's working tree sits permanently on a feature branch, so it is
 * routinely behind main. Any script that reads data/catalogs from its own tree and
 * writes it to the production database is therefore one command away from replacing
 * live data with an older copy.
 *
 * That nearly happened: seed-catalog-libraries.mjs was about to write the OLD 205-row
 * melamine catalog into catalog_libraries an hour after the new 366-colour one
 * deployed. The database wins over the file, so production would have reverted to a
 * catalog whose ids resolve to no photography at all, silently.
 *
 * migrate-melamine-ids.mjs has a nastier version of the same problem. Run from a stale
 * tree it builds its "new catalog" from the OLD file, decides every existing spec
 * already points at a valid id, and reports a clean no-op — leaving every melamine
 * spec pointing at ids the deployed catalog does not contain, while telling you there
 * was nothing to do.
 *
 * So: any script that reads catalog data and writes to a database imports this.
 *
 *   import { resolveTree, assertTreeIsCurrent } from "./_tree.mjs";
 *   const TREE = resolveTree(import.meta.url);
 *   assertTreeIsCurrent(TREE, import.meta.url);
 *
 * Credentials still come from the script's own tree — that is where .env.local is.
 * Only the DATA moves.
 */
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

/**
 * The directory to read data/catalogs and lib from. `--data-from=<dir>` overrides;
 * otherwise it is the repo the script lives in.
 */
export function resolveTree(moduleUrl) {
  const from = (process.argv.find((a) => a.startsWith("--data-from=")) ?? "")
    .replace("--data-from=", "")
    .trim();
  if (from) return resolve(from);
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

/** True when the caller passed the override flag. */
export const ALLOW_STALE = process.argv.includes("--i-know-this-tree-is-stale");

/**
 * Exit unless `tree` looks like what is deployed.
 *
 * Two signals:
 *   1. The loader's own files are present. If they are not, this tree predates the
 *      code that reads these catalogs, so its data cannot be trusted to match.
 *   2. HEAD is not an ancestor of origin/main — which is the precise definition of
 *      "behind". A branch that has diverged with its own commits warns instead of
 *      blocking: that is a legitimate state, and the file check still applies.
 *
 * Not a git checkout (an extracted archive, say) is fine — the file check stands.
 */
export function assertTreeIsCurrent(tree, moduleUrl) {
  if (ALLOW_STALE) {
    console.warn("\n  ! --i-know-this-tree-is-stale: skipping the tree check.\n");
    return;
  }

  const script = moduleUrl ? fileURLToPath(moduleUrl).split(/[\\/]/).pop() : "this script";
  const problems = [];

  for (const f of ["lib/catalog-resolve.ts", "lib/catalogs.ts"]) {
    if (!existsSync(resolve(tree, f))) problems.push(`${f} is missing`);
  }

  try {
    const git = (...args) =>
      execFileSync("git", ["-C", tree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const head = git("rev-parse", "HEAD");
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");
    try {
      const main = git("rev-parse", "origin/main");
      if (head !== main) {
        try {
          execFileSync("git", ["-C", tree, "merge-base", "--is-ancestor", "HEAD", "origin/main"], { stdio: "ignore" });
          const count = git("rev-list", "--count", "HEAD..origin/main");
          problems.push(`${branch} (${head.slice(0, 7)}) is ${count} commit(s) behind origin/main`);
        } catch {
          console.warn(`  ! ${branch} (${head.slice(0, 7)}) has diverged from origin/main — make sure its catalogs are the ones you want.\n`);
        }
      }
    } catch {
      console.warn("  ! no origin/main to compare against (run `git fetch origin main`) — skipping the staleness check.\n");
    }
  } catch {
    /* not a git checkout; the file check above stands */
  }

  if (problems.length === 0) return;

  console.error(`\nRefusing to run ${script}: the tree its data comes from is not what is deployed.\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\n  reading from: ${tree}`);
  console.error(`
  This matters more than it looks. These scripts write to the production database
  from files on disk, and the database is what the app reads. Running from an old
  checkout does not merely fail to help — it replaces what is live with something
  older, and nothing errors.

  Point it at a checkout of what is actually deployed:

    git fetch origin main
    git worktree add C:\\dev\\repos\\accseed origin/main --detach
    node scripts/${script} --data-from=C:\\dev\\repos\\accseed --dry-run
    node scripts/${script} --data-from=C:\\dev\\repos\\accseed
    git worktree remove C:\\dev\\repos\\accseed --force

  Your own working tree and branch are untouched by that.

  --i-know-this-tree-is-stale overrides this. There is very little reason to.
`);
  process.exit(1);
}
