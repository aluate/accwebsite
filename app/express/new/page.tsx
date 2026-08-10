export const dynamic = "force-dynamic";

import { requireBuilder } from "@/lib/auth";
import { getCatalogs } from "@/lib/catalogs";
import { ExpressWizard } from "@/components/ExpressWizard";

// express_colors.json used to be read here with its own inline readFileSync,
// which meant the express wizard could not be edited from /admin/libraries even
// once every other catalog could. It goes through the loader now.
export default async function ExpressNewPage() {
  const builder = await requireBuilder();
  const catalogs = await getCatalogs();

  const catalogData = {
    expressColors:   catalogs.expressColors(),
    doorStyles:      catalogs.doorStyles(),
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
