import postgres from "postgres";

const DB_URL = "postgresql://postgres.kuqmhgjrlfawsnzmempl:2Cnz5KQ9Q%248%40hQu@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

const sql = postgres(DB_URL, { ssl: "require", prepare: false });

async function main() {
  console.log("Running migration...");
  
  await sql`
    CREATE TABLE IF NOT EXISTS spec_pulls (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      make TEXT,
      model TEXT,
      size TEXT,
      room TEXT,
      notes TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("spec_pulls table created/verified");
  
  await sql`
    CREATE TABLE IF NOT EXISTS spec_accessories (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES residential_specs(id) ON DELETE CASCADE,
      part_number TEXT,
      description TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      handed TEXT NOT NULL DEFAULT 'N/A',
      room TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("spec_accessories table created/verified");
  
  // Verify
  const tables = await sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name IN ('spec_pulls','spec_accessories')
    ORDER BY table_name
  `;
  console.log("Tables confirmed:", tables.map(t => t.table_name));
  
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
