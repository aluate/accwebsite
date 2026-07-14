import { sql } from "@/lib/db";
import type { RevaAccessory } from "@/lib/catalogs";

export type AccessoryCatalogRow = {
  id: string;
  name: string;
  brand: string;
  series: string | null;
  category: string;
  width_options: string | null;
  finish_opts: string | null;
  hand: string | null;
  image_url: string | null;
  price_slp: number | string | null;
  price_date: string | null;
  notes: string | null;
  active: boolean;
  updated_at: string;
};

/** All accessories including inactive — admin use only */
export async function getAllAccessories(): Promise<AccessoryCatalogRow[]> {
  return sql<AccessoryCatalogRow[]>`
    SELECT * FROM accessories_catalog ORDER BY category, name
  `;
}

/** Active accessories only — for spec form and PDF */
export async function getActiveAccessories(): Promise<RevaAccessory[]> {
  const rows = await sql<AccessoryCatalogRow[]>`
    SELECT * FROM accessories_catalog WHERE active = true ORDER BY category, name
  `;
  return rows.map(rowToRevaAccessory);
}

export function rowToRevaAccessory(r: AccessoryCatalogRow): RevaAccessory {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    series: r.series ?? "",
    category: r.category,
    width_options_in: r.width_options,
    finish_options: r.finish_opts,
    hand: r.hand,
    image_url: r.image_url ?? "",
    price_slp: r.price_slp != null ? String(r.price_slp) : "",
    price_date: r.price_date ?? "",
    notes: r.notes ?? "",
  };
}
