import { requireBuilder } from "@/lib/auth";
import { sql } from "@/lib/db";
import Link from "next/link";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  client_name: string;
  site_address: string;
  city: string | null;
  delivery_date: string | null;
  mod_residential: boolean;
  mod_trim: boolean;
  mod_doors: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  intake:     "text-white/40 bg-white/10",
  active:     "text-blue-300 bg-blue-900/30",
  production: "text-yellow-300 bg-yellow-900/30",
  complete:   "text-green-300 bg-green-900/30",
  on_hold:    "text-orange-300 bg-orange-900/30",
};

const STATUS_LABEL: Record<string, string> = {
  intake:     "Received",
  active:     "Active",
  production: "In Production",
  complete:   "Complete",
  on_hold:    "On Hold",
};

export default async function ExpressOrdersPage() {
  const builder = await requireBuilder();

  const orders = await sql`
    SELECT id, created_at, status, client_name, site_address, city,
           delivery_date, mod_residential, mod_trim, mod_doors
    FROM jobs
    WHERE builder_id = ${builder.id}
    ORDER BY created_at DESC
  ` as OrderRow[];

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
        <form action="/api/express/logout" method="POST">
          <button
            type="submit"
            className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs transition-colors"
          >
            Sign Out
          </button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-white font-condensed uppercase tracking-widest text-lg">
              Your Orders
            </h1>
            <p className="text-white/30 font-condensed uppercase tracking-widest text-xs mt-1">
              {orders.length} submitted
            </p>
          </div>
          <Link
            href="/express/new"
            className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-5 rounded transition-colors"
          >
            + New Order
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-white/20 font-condensed uppercase tracking-widest text-sm mb-6">
              No orders yet.
            </p>
            <Link
              href="/express/new"
              className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2.5 px-8 rounded transition-colors"
            >
              Start Your First Order
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const modules = [
                order.mod_residential ? "Cabinets" : null,
                order.mod_trim        ? "Trim"     : null,
                order.mod_doors       ? "Doors"    : null,
              ].filter(Boolean);

              const dateStr = new Date(order.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              });

              return (
                <div
                  key={order.id}
                  className="flex items-center gap-4 bg-white/3 border border-white/8 rounded px-5 py-4"
                >
                  {/* Job ID */}
                  <span className="font-condensed text-[#f08122] text-sm w-36 shrink-0">
                    {order.id}
                  </span>

                  {/* Client + address */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{order.client_name}</p>
                    <p className="text-white/40 text-xs truncate">
                      {order.site_address}{order.city ? `, ${order.city}` : ""}
                    </p>
                  </div>

                  {/* Modules */}
                  <div className="hidden sm:flex gap-1 shrink-0">
                    {modules.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-condensed uppercase tracking-wider text-white/40 bg-white/8 rounded px-1.5 py-0.5"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  {/* Delivery */}
                  {order.delivery_date && (
                    <span className="text-white/30 text-xs hidden md:block shrink-0">
                      Del: {order.delivery_date}
                    </span>
                  )}

                  {/* Status */}
                  <span
                    className={`text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 shrink-0 ${STATUS_COLOR[order.status] ?? STATUS_COLOR.intake}`}
                  >
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>

                  {/* Date */}
                  <span className="text-white/20 text-xs hidden lg:block w-24 shrink-0 text-right">
                    {dateStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
