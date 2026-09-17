export const dynamic = "force-dynamic";

import {
  CAPABILITIES, ADMIN_PAGE_CAPS, rolesWith, can,
  type Capability,
} from "@/lib/permissions";
import type { Role } from "@/lib/auth";

/*
  GENERATED FROM lib/permissions.ts. Do not hand-edit this table.

  What used to be here was 600 lines of hand-written rows under this instruction:
  "Update this page whenever a page gains or loses a role check." It was last
  honoured on 2026-07-16 and was wrong in at least six places by September — it
  still claimed PMs had full access to billing, leads and estimating, none of
  which they could reach, and it said every role including installer had full
  access to wipe-jobs.

  A document that is correct only while someone remembers to correct it is a
  document that is wrong. This renders from the same table the gates read, so it
  cannot disagree with enforcement. If a line here looks wrong, the fix is in
  lib/permissions.ts, and fixing it there changes what the app actually does.
*/

const ROLES: Role[] = ["karl", "admin", "pm", "engineer", "shop", "installer"];

const ROLE_LABEL: Record<Role, string> = {
  karl: "Karl", admin: "Admin", pm: "PM",
  engineer: "Engineer", shop: "Shop", installer: "Installer",
};

/** Admin pages that a capability opens, so each row says where it bites. */
function pagesFor(cap: Capability): string[] {
  return Object.entries(ADMIN_PAGE_CAPS)
    .filter(([, c]) => c === cap)
    .map(([seg]) => `/admin/${seg}`);
}

function groupOf(cap: Capability): string {
  const head = cap.split(".")[0];
  return ({
    jobs: "Jobs", specs: "Specs", engineering: "Specs",
    schedule: "Schedule", punch: "Punch & warranty", warranty: "Punch & warranty",
    files: "Files", client: "Client-facing", portal: "Client-facing",
    billing: "Money", estimating: "Money",
    catalog: "Reference data", documents: "Reference data",
    leads: "Front of house", bugs: "Front of house",
    users: "Running the system", notify: "Running the system",
    system: "Running the system",
  } as Record<string, string>)[head] ?? "Other";
}

export default async function PermissionsPage() {
  const caps = Object.keys(CAPABILITIES) as Capability[];
  const groups = [...new Set(caps.map(groupOf))];

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Who can do what</h1>
      <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
        Generated from lib/permissions.ts — this is what the app enforces, not a description of it
      </p>

      <p className="text-white/50 text-sm mt-6 max-w-2xl leading-relaxed">
        Capabilities are verbs, not screens. Every page and API route names the
        capability it needs; the table below is the only thing that decides who
        holds it. To change access, change that file — editing this page does
        nothing.
      </p>

      {groups.map((g) => (
        <div key={g} className="mt-8">
          <h2 className="text-[#f08122] font-condensed uppercase tracking-[0.2em] text-xs mb-2">{g}</h2>
          <div className="overflow-x-auto border border-white/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-3 py-2 text-white/40 font-condensed uppercase tracking-wider text-[10px] whitespace-nowrap">Capability</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-2 py-2 text-white/40 font-condensed uppercase tracking-wider text-[10px]">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {caps.filter((c) => groupOf(c) === g).map((cap) => {
                  const holders = rolesWith(cap);
                  const pages = pagesFor(cap);
                  return (
                    <tr key={cap} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-3 py-2">
                        <span className="text-white font-mono text-xs">{cap}</span>
                        <p className="text-white/40 text-xs mt-0.5">{CAPABILITIES[cap]}</p>
                        {pages.length > 0 && (
                          <p className="text-white/25 text-[10px] mt-0.5 font-mono">{pages.join("  ")}</p>
                        )}
                      </td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-2 py-2 text-center">
                          {can(r, cap)
                            ? <span className="text-green-400" title={`${ROLE_LABEL[r]} can ${cap}`}>✓</span>
                            : <span className="text-white/15">·</span>}
                        </td>
                      ))}
                      <td className="sr-only">{holders.join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-white/30 text-xs mt-10 max-w-2xl leading-relaxed">
        Karl holds every capability by rule rather than by listing, so a new one
        can never lock the owner out. Admin is a second-owner role that currently
        nobody holds.
      </p>
    </section>
  );
}
