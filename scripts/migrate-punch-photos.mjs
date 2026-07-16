/**
 * scripts/migrate-punch-photos.mjs
 *
 * Adds the punch_item_photos table and scheduled/wont_fix status support.
 * Run once against the live DB:
 *
 *   DATABASE_URL="<your-pooler-url>" node scripts/migrate-punch-photos.mjs
 *
 * The old before_photo_path / after_photo_path columns are kept (not dropped)
 * so existing punch items still show their photos via the legacy path while
 * new items use the punch_item_photos table.
 */

import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: DATABASE_URL env var is required.");
  console.error("  Run: DATABASE_URL=\"<pooler-url>\" node scripts/migrate-punch-photos.mjs");
  process.exit(1);
}

const sql = postgres(DB_URL, { ssl: "require", prepare: false });

async function main() {
  console.log("Running punch photo migration...\n");

  // 1. punch_item_photos — one row per photo/video attached to a punch item
  await sql`
    CREATE TABLE IF NOT EXISTS punch_item_photos (
      id            TEXT PRIMARY KEY,
      punch_item_id TEXT NOT NULL REFERENCES punch_list_items(id) ON DELETE CASCADE,
      storage_path  TEXT NOT NULL,
      media_type    TEXT NOT NULL DEFAULT 'photo',  -- 'photo' | 'video'
      label         TEXT,                            -- 'before' | 'after' | null (general)
      uploaded_by   TEXT NOT NULL,
      uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
      sort_order    INTEGER NOT NULL DEFAULT 0
    )
  `;
  console.log("✓ punch_item_photos table ready");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_punch_item_photos_item
      ON punch_item_photos(punch_item_id)
  `;
  console.log("✓ index on punch_item_photos(punch_item_id)");

  // 2. Migrate existing before/after photo paths into punch_item_photos
  //    so legacy items don't lose their photos.
  const legacy = await sql`
    SELECT id, job_id, before_photo_path, after_photo_path
    FROM punch_list_items
    WHERE (before_photo_path IS NOT NULL OR after_photo_path IS NOT NULL)
  `;

  let migrated = 0;
  for (const item of legacy) {
    // Check if already migrated (idempotent)
    const [exists] = await sql`
      SELECT 1 FROM punch_item_photos WHERE punch_item_id = ${item.id} LIMIT 1
    `;
    if (exists) continue;

    const rows = [];
    if (item.before_photo_path) {
      rows.push({ path: item.before_photo_path, label: "before", order: 0 });
    }
    if (item.after_photo_path) {
      rows.push({ path: item.after_photo_path, label: "after", order: 1 });
    }

    for (const r of rows) {
      const id = crypto.randomUUID().replace(/-/g, "");
      await sql`
        INSERT INTO punch_item_photos
          (id, punch_item_id, storage_path, media_type, label, uploaded_by, sort_order)
        VALUES
          (${id}, ${item.id}, ${r.path}, 'photo', ${r.label}, 'migrated', ${r.order})
        ON CONFLICT DO NOTHING
      `;
    }
    migrated++;
  }
  console.log(`✓ Migrated ${migrated} legacy punch items to photo table`);

  console.log("\nMigration complete.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
