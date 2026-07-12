export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import Link from "next/link";

type Palette = {
  id: string; builder_company: string; palette_name: string;
  finish_type: string | null; default_carcass_id: string | null;
  default_drawer_box_id: string | null; default_pull_id: string | null;
  notes: string | null; created_at: string;
};
type PaletteFG = {
  id: string; palette_id: string; fg_label: string; finish_type: string | null;
  color_id: string | null; carcass_id: string | null; drawer_box_id: string | null;
  door_style_id: string | null; pull_id: string | null;
};

export default async function PalettesPage() {
  let palettes: Palette[] = [];
  let fgRows: PaletteFG[] = [];

  try {
    palettes = await sql`SELECT * FROM builder_palettes ORDER BY builder_company, palette_name` as Palette[];
    const pids = palettes.map(p => p.id);
    fgRows = pids.length
      ? await sql`SELECT * FROM builder_palette_finish_groups WHERE palette_id IN ${sql(pids)}` as PaletteFG[]
      : [];
  } catch {
    // Tables not yet created
  }

  const byCompany = new Map<string, Palette[]>();
  for (const p of palettes) {
    const arr = byCompany.get(p.builder_company) ?? [];
    arr.push(p);
    byCompany.set(p.builder_company, arr);
  }

  return (
    <section className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Admin</p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Builder Palettes</h1>
        </div>
        <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">POST to /api/admin/palettes to create</p>
      </div>

      {palettes.length === 0 ? (
        <div className="bg-[#2d2d2d] rounded p-8 text-center">
          <p className="text-white/40 text-sm font-condensed uppercase tracking-widest">No palettes yet.</p>
          <p className="text-white/25 text-xs mt-2">POST to /api/admin/palettes to create one.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byCompany.entries()).map(([company, cPalettes]) => (
            <div key={company}>
              <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mb-3">{company}</p>
              <div className="space-y-4">
                {cPalettes.map(pal => {
                  const palFGs = fgRows.filter(f => f.palette_id === pal.id);
                  return (
                    <div key={pal.id} className="bg-[#2d2d2d] rounded p-4 border border-white/10">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-white font-condensed uppercase tracking-wider text-sm">{pal.palette_name}</p>
                          {pal.finish_type && <p className="text-white/40 text-xs mt-0.5">Default type: {pal.finish_type}</p>}
                          {pal.notes && <p className="text-white/30 text-xs mt-0.5 italic">{pal.notes}</p>}
                          <p className="text-white/20 text-[10px] font-mono mt-1">{pal.id}</p>
                        </div>
                        <Link
                          href={`/api/admin/palettes/${pal.id}`}
                          className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-[10px] border border-white/10 hover:border-white/30 px-2 py-1 rounded transition-colors"
                        >
                          View JSON
                        </Link>
                      </div>
                      {palFGs.length > 0 && (
                        <div className="border-t border-white/5 pt-3">
                          <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-2">Finish Groups ({palFGs.length})</p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {palFGs.map(fg => (
                              <div key={fg.id} className="bg-[#1a1a1a] rounded px-3 py-2">
                                <p className="text-[#f08122]/80 text-xs font-condensed uppercase">{fg.fg_label}</p>
                                {fg.finish_type && <p className="text-white/40 text-[11px]">Type: {fg.finish_type}</p>}
                                {fg.carcass_id && <p className="text-white/30 text-[11px]">Carcass: {fg.carcass_id}</p>}
                                {fg.door_style_id && <p className="text-white/30 text-[11px]">Door: {fg.door_style_id}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
