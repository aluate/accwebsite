export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";

type DoorItemPayload = {
  id: string;
  door_type: string;
  size_nom: string;
  core: string;
  species: string;
  swing: string;
  hardware: string;
  bore: boolean;
  hinge_prep: boolean;
  qty: number;
  unit_price: number;
  price_override: boolean;
  notes: string;
  sort_order: number;
};

// POST /api/door-specs/[id]/save
// Atomic wipe-and-replace of all line items + notes update.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { items, notes }: { items: DoorItemPayload[]; notes: string } = await req.json();
  const now = new Date().toISOString();

  await sql.begin(async (tx) => {
    await tx`DELETE FROM door_line_items WHERE spec_id = ${id}`;

    for (const item of items) {
      if (!item.door_type) continue;
      await tx`
        INSERT INTO door_line_items
          (id, spec_id, door_type, size_nom, core, species, swing, hardware,
           bore, hinge_prep, qty, unit_price, price_override, notes, sort_order)
        VALUES
          (${item.id || uid()}, ${id}, ${item.door_type}, ${item.size_nom}, ${item.core},
           ${item.species}, ${item.swing}, ${item.hardware},
           ${item.bore}, ${item.hinge_prep},
           ${item.qty}, ${item.unit_price}, ${item.price_override},
           ${item.notes || null}, ${item.sort_order})
      `;
    }

    await tx`UPDATE door_specs SET notes = ${notes || null}, updated_at = ${now} WHERE id = ${id}`;
  });

  return NextResponse.json({ ok: true });
}
