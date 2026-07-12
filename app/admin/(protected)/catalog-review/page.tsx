export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";

type UnverifiedRow = {
  table_name: string;
  id: string;
  name: string;
  brand?: string | null;
  notes?: string | null;
};

export default async function CatalogReviewPage() {
  const unverified: UnverifiedRow[] = [];

  const queries: Array<[string, string]> = [
    ["catalog_paint_colors", "paint colors"],
    ["catalog_stain_colors", "stain colors"],
    ["catalog_melamine_colors", "melamine colors"],
    ["catalog_species", "species"],
    ["catalog_accessories", "accessories"],
  ];

  for (const [table] of queries) {
    try {
      const rows = await sql.unsafe(`SELECT id, name, brand, notes FROM ${table} WHERE verified = 0`) as UnverifiedRow[];
      for (const r of rows) unverified.push({ ...r, table_name: table });
    } catch {
      // Column may not exist yet — skip
    }
  }

  const byTable = new Map<string, UnverifiedRow[]>();
  for (const r of unverified) {
    const arr = byTable.get(r.table_name) ?? [];
    arr.push(r);
    byTable.set(r.table_name, arr);
  }

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Admin</p>
        <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Catalog Review Queue</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-2">
          Unverified entries written by PMs via &quot;Other&quot; picks. Verify or delete each one.
        </p>
      </div>

      {unverified.length === 0 ? (
        <div className="bg-[#2d2d2d] rounded p-8 text-center">
          <p className="text-green-400/70 text-sm font-condensed uppercase tracking-widest">Queue is empty — all catalog entries verified.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byTable.entries()).map(([table, rows]) => (
            <div key={table}>
              <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mb-3">
                {table.replace("catalog_", "").replace(/_/g, " ")} ({rows.length})
              </p>
              <div className="space-y-2">
                {rows.map(row => (
                  <div key={row.id} className="bg-[#2d2d2d] rounded p-4 border border-yellow-700/20 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-white text-sm font-condensed uppercase">{row.name}</p>
                      {row.brand && <p className="text-white/40 text-xs">{row.brand}</p>}
                      {row.notes && <p className="text-white/30 text-xs italic">{row.notes}</p>}
                      <p className="text-white/20 text-[10px] font-mono mt-0.5">{row.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <form method="POST" action="/api/admin/catalog-review">
                        <input type="hidden" name="table" value={table} />
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="action" value="verify" />
                        <button
                          type="submit"
                          className="bg-green-700/70 hover:bg-green-700 text-white font-condensed uppercase tracking-widest text-[10px] px-3 py-1.5 rounded transition-colors"
                        >
                          Verify
                        </button>
                      </form>
                      <form method="POST" action="/api/admin/catalog-review">
                        <input type="hidden" name="table" value={table} />
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="action" value="delete" />
                        <button
                          type="submit"
                          className="bg-red-900/40 hover:bg-red-900/70 text-red-300 font-condensed uppercase tracking-widest text-[10px] px-3 py-1.5 rounded transition-colors"
                          onClick={(e) => { if (!confirm("Delete this catalog entry?")) e.preventDefault(); }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
