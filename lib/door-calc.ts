import type { DoorCatalog } from "@/lib/catalogs";

/**
 * Calculate unit price for a door line item from the catalog.
 * exterior_prehung and french_exterior have solid core baked in — core_adder is skipped.
 */
export function calcDoorPrice(
  catalog: DoorCatalog,
  door_type: string,
  size_nom: string,
  core: string,
  species: string,
  hardware: string,
): number {
  const sizes = catalog.sizes[door_type] ?? [];
  const entry = sizes.find((s) => s.nom === size_nom);
  if (!entry) return 0;

  const base = entry.base_price;

  // Exterior types have solid core priced in — don't double-add
  const skipCore = door_type === "exterior_prehung" || door_type === "french_exterior";
  const coreAdder = skipCore ? 0 : (catalog.core_adder[core] ?? 0);

  const speciesMult = catalog.species_mult[species] ?? 1.0;
  const hwAdder = catalog.hardware_adder[hardware] ?? 0;

  return Math.round((base + coreAdder) * speciesMult + hwAdder);
}
