/**
 * Cleanup orphan finish_groups (missing carcass/drawer/edgeband).
 *
 *   npm run cleanup-orphan-fgs                             # list only
 *   npm run cleanup-orphan-fgs -- --delete-fg=id1,id2     # delete specific finish_groups
 *   npm run cleanup-orphan-fgs -- --delete-all-orphans    # nuke all
 */
import { sql } from "./_db.mjs";

const args = process.argv.slice(2);
const deleteFgArg = args.find((a) => a.startsWith("--delete-fg="));
const deleteAll = args.includes("--delete-all-orphans");

const orphans = await sql`
  SELECT fg.id, fg.label, s.name AS spec_name, j.id AS job_id, j.client_name,
         (SELECT COUNT(*) FROM rooms WHERE finish_group_id = fg.id) AS room_count,
         (SELECT COUNT(*) FROM cabinet_line_items cli JOIN rooms r ON cli.room_id = r.id WHERE r.finish_group_id = fg.id) AS cabinet_count
  FROM finish_groups fg
  JOIN residential_specs s ON fg.spec_id = s.id
  JOIN jobs j ON s.job_id = j.id
  WHERE fg.carcass_id IS NULL OR fg.drawer_box_id IS NULL OR fg.edgeband_id IS NULL
  ORDER BY j.id, s.name, fg.sort_order
`;

if (orphans.length === 0) {
  console.log("No orphan finish_groups found.");
  await sql.end();
  process.exit(0);
}

console.log(`\n${orphans.length} orphan finish_group(s):\n`);
for (const o of orphans) {
  console.log(`  ${o.id}  ${o.label}  (spec: ${o.spec_name}, job: ${o.job_id} ${o.client_name}, rooms: ${o.room_count}, cabinets: ${o.cabinet_count})`);
}

if (deleteAll) {
  const ids = orphans.map((o) => o.id);
  await sql`DELETE FROM finish_groups WHERE id IN ${sql(ids)}`;
  console.log(`\nDeleted ${ids.length} orphan finish_group(s).`);
} else if (deleteFgArg) {
  const ids = deleteFgArg.replace("--delete-fg=", "").split(",").map((s) => s.trim()).filter(Boolean);
  await sql`DELETE FROM finish_groups WHERE id IN ${sql(ids)}`;
  console.log(`\nDeleted ${ids.length} finish_group(s): ${ids.join(", ")}`);
} else {
  console.log('\nDry-run. Pass --delete-fg=id1,id2 or --delete-all-orphans to delete.');
}

await sql.end();
