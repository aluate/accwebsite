export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catalogs } from "@/lib/catalogs";
import Link from "next/link";
import { AccessoryCatalogAdmin, type CatalogItem } from "@/components/AccessoryCatalogAdmin";

const CATALOG = "accessories_reva";

export default async function AccessoriesAdminPage() {
  await requireRole("admin");

  const allItems = catalogs.revaAccessories();

  const states = await sql<{ item_id: string; active: boolean }[]>`
    SELECT item_id, active FROM catalog_active_states WHERE catalog = ${CATALOG}
  `.catch(() => [] as { item_id: string; active: boolean }[]);

  const stateMap = new Map(states.map((s) => [s.item_id, s.active]));

  const items: CatalogItem[] = allItems.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    series: r.series,
    category: r.category,
    width_options_in: Array.isArray(r.width_options_in)
      ? r.width_options_in.join(";")
      : String(r.width_options_in ?? ""),
    finish_options: Array.isArray(r.finish_options)
      ? r.finish_options.join(";")
      : String(r.finish_options ?? ""),
    hand: r.hand ?? "",
    image_url: r.image_url ?? "",
    price_slp: r.price_slp ?? "",
    price_date: r.price_date ?? "",
    notes: r.notes ?? "",
    active: stateMap.has(r.id) ? (stateMap.get(r.id) ?? true) : true,
  }));

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href="/admin"
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← Admin
      </Link>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-1">
        Accessory catalog
      </h1>
      <p className="text-white/30 text-sm mb-8 max-w-2xl">
        Toggle items active or inactive. Inactive items are hidden from the PM spec picker but stay in the catalog.
        Add or edit items by updating{" "}
        <code className="text-white/50">data/catalogs/accessories_reva.csv</code>{" "}
        then running <code className="text-white/50">node scripts/sync-catalogs.mjs</code>.
      </p>
      <AccessoryCatalogAdmin initialItems={items} />
    </section>
  );
}
