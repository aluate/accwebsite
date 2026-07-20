import path from "path";
import fs from "fs";
import Link from "next/link";
import { LibraryEditor } from "@/components/LibraryEditor";

const CATALOGS = path.join(process.cwd(), "data", "catalogs");

type LibraryFile = {
  name: string;
  rows: number;
  bytes: number;
  modified: string;
};

function listLibraries(): LibraryFile[] {
  if (!fs.existsSync(CATALOGS)) return [];
  return fs.readdirSync(CATALOGS)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => {
      const full = path.join(CATALOGS, f);
      const text = fs.readFileSync(full, "utf-8");
      const stat = fs.statSync(full);
      // Row count = non-empty lines minus header
      const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
      const rows = Math.max(0, lines.length - 1);
      return {
        name: f.replace(".csv", ""),
        rows,
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default async function LibrariesPage() {
  const libs = listLibraries();
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href="/admin"
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← Admin
      </Link>

      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-2">Libraries</h1>
      <div className="mb-4 rounded bg-yellow-400/10 border border-yellow-400/30 px-4 py-3 text-yellow-300 text-xs font-condensed">
        ⚠ Catalog editing is <strong>not available on Vercel</strong> — the filesystem is read-only in production.
        To update a catalog: edit the CSV locally in <code className="text-white/70">data/catalogs/</code>, run <code className="text-white/70">npm run sync-catalogs</code>, then commit and deploy.
      </div>
      <p className="text-white/40 text-sm mb-10 max-w-2xl">
        Edit catalog CSVs in-place. Changes save to <code className="text-white/60">data/catalogs/</code> and
        regenerate the matching JSON via <code className="text-white/60">sync-catalogs</code>.
        Restart the dev server if a schema column is added so types pick up.
      </p>

      <div className="grid gap-3">
        {libs.map((lib) => (
          <LibraryEditor key={lib.name} name={lib.name} initialRows={lib.rows} initialBytes={lib.bytes} initialModified={lib.modified} />
        ))}
      </div>

      {libs.length === 0 && (
        <p className="text-white/30 italic">No catalog CSVs found in data/catalogs/.</p>
      )}
    </section>
  );
}
