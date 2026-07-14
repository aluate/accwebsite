export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/** PATCH /api/estimates/[id]/snapshot
 *  Debounced write from the estimate editor — stores computed cost snapshot
 *  so the pipeline report can read it without re-running the engine.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole("admin");
  const { id } = await params;
  const body = await req.json() as {
    sell_price_snapshot: number;
    shop_labor_hrs_snapshot: number;
    install_labor_hrs_snapshot: number;
  };

  await sql`
    UPDATE estimates SET
      sell_price_snapshot         = ${body.sell_price_snapshot},
      shop_labor_hrs_snapshot     = ${body.shop_labor_hrs_snapshot},
      install_labor_hrs_snapshot  = ${body.install_labor_hrs_snapshot}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}
