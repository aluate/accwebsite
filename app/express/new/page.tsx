import { requireBuilder } from "@/lib/auth";
import { catalogs } from "@/lib/catalogs";
import { ExpressWizard } from "@/components/ExpressWizard";
import path from "path";
import fs from "fs";

type ExpressColor = { id: string; name: string; hex?: string | null };
type ExpressColorBook = {
  paint: ExpressColor[];
  stain: ExpressColor[];
  melamine: ExpressColor[];
};

function loadExpressColors(): ExpressColorBook {
  const file = path.join(process.cwd(), "data/catalogs/express_colors.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ExpressColorBook;
}

export default async function ExpressNewPage() {
  const builder = await requireBuilder();

  const [doorStyles] = await Promise.all([
    catalogs.doorStyles(),
  ]);

  const catalogData = {
    expressColors:   loadExpressColors(),
    doorStyles,
    cabinetFamilies: catalogs.cabinetFamilies(),
    doorCatalog:     catalogs.doorCatalog(),
  };

  return (
    <div className="min-h-screen bg-[#111]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
            Advanced Custom Cabinets
          </p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            Express Order — {builder.name}
            {builder.company ? ` · ${builder.company}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="/express/orders"
            className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
          >
            My Orders
          </a>
          <form action="/api/express/logout" method="POST">
            <button
              type="submit"
              className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <ExpressWizard builder={builder} catalogs={catalogData} />
      </main>
    </div>
  );
}
