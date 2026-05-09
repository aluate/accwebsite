import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { NewDoorSpecButton } from "@/components/NewDoorSpecButton";

type JobRow      = { id: string; client_name: string };
type DoorSpecRow = { id: string; name: string; status: string; updated_at: string };

export default async function DoorsIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job] = await sql`SELECT id, client_name FROM jobs WHERE id = ${id}` as JobRow[];
  if (!job) notFound();

  const specs = await sql`
    SELECT id, name, status, updated_at FROM door_specs WHERE job_id = ${id} ORDER BY created_at
  ` as DoorSpecRow[];

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href={`/jobs/${id}`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← Job Overview
      </Link>

      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Doors</h1>
          <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mt-1">
            {id} — {job.client_name}
          </p>
        </div>
        <NewDoorSpecButton jobId={id} />
      </div>

      {specs.length === 0 ? (
        <p className="text-white/40 font-condensed uppercase tracking-widest text-sm">
          No door specs yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {specs.map((s) => (
            <li key={s.id}>
              <Link
                href={`/jobs/${id}/doors/${s.id}`}
                className="flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded px-5 py-4 transition-colors group"
              >
                <div>
                  <span className="font-condensed uppercase tracking-widest text-white group-hover:text-[#f08122] transition-colors">
                    {s.name}
                  </span>
                  <span className="ml-4 text-xs text-white/30 font-condensed uppercase tracking-widest">
                    {s.status}
                  </span>
                </div>
                <span className="text-white/30 text-xs font-condensed">
                  {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
