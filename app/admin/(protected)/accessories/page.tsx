export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import Link from "next/link";
import { AccessoryCatalogAdmin, type CatalogItem } from "@/components/AccessoryCatalogAdmin";

type DBRow = {
  id: string; name: string; brand: string; series: string | null;
  category: string; width_options: string | null; finish_opts: string | null;
  hand: string | null; image_url: string | null; price_slp: number | null;
  price_date: string | null; notes: string | null; active: boolean;
};

export default async function AccessoriesAdminPage() {
  await requireRole("admin");

  const rows = await sql<DBRow[]>`
    SELECT * FROM accessories_catalog ORDER BY category, name
  `;

  const items: CatalogItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    series: r.series ?? "",
    category: r.category,
    width_options_in: r.width_options ?? "",
    finish_options: r.finish_opts ?? "",
    hand: r.hand ?? "",
    image_url: r.image_url ?? "",
    price_slp: r.price_slp != null ? String(r.price_slp) : "",
    price_date: r.price_date ?? "",
    notes: r.notes ?? "",
    active: r.active,
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
        Toggle active/inactive or click the pencil icon to edit series codes, prices, and notes — no CSV or deploy needed.
      </p>
      <AccessoryCatalogAdmin initialItems={items} />
    </section>
  );
}
