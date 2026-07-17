export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { EstimateQuoteClient } from "@/components/EstimateQuoteClient";

export default async function EstimateQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const [estimateRows, roomRows, itemRows, settingsRows] = await Promise.all([
    sql`
      SELECT e.*, j.client_name, j.site_address, j.job_number
      FROM estimates e
      LEFT JOIN jobs j ON j.id = e.job_id
      WHERE e.id = ${id}
    `,
    sql`SELECT * FROM estimate_rooms WHERE estimate_id = ${id} ORDER BY sort_order`,
    sql`
      SELECT eli.*
      FROM estimate_line_items eli
      JOIN estimate_rooms er ON er.id = eli.room_id
      WHERE er.estimate_id = ${id}
      ORDER BY eli.sort_order
    `,
    sql`SELECT * FROM estimate_settings WHERE id = 'singleton'`,
  ]);

  if (!estimateRows[0]) notFound();

  return (
    <EstimateQuoteClient
      estimate={estimateRows[0] as unknown as Parameters<typeof EstimateQuoteClient>[0]["estimate"]}
      rooms={roomRows as Parameters<typeof EstimateQuoteClient>[0]["rooms"]}
      items={itemRows as Parameters<typeof EstimateQuoteClient>[0]["items"]}
      settings={(settingsRows[0] ?? {}) as unknown as Parameters<typeof EstimateQuoteClient>[0]["settings"]}
    />
  );
}
