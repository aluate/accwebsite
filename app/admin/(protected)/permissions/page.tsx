"use client";

// ─── Role Permissions Matrix ────────────────────────────────────────────────
// Read-only reference page. Reflects current code enforcement as of 2026-07-16.
// Update this page whenever a page gains or loses a role check.

type AccessLevel = "full" | "view" | "none" | "restricted";

interface Permission {
  level: AccessLevel;
  note?: string;
}

type RoleKey = "karl" | "admin" | "pm" | "engineer" | "shop" | "installer";

interface PageRow {
  section: string;
  page: string;
  path: string;
  permissions: Record<RoleKey, Permission>;
  enforced: boolean; // true = code actively blocks; false = convention only
}

const ROLES: RoleKey[] = ["karl", "admin", "pm", "engineer", "shop", "installer"];

const ROLE_LABELS: Record<RoleKey, string> = {
  karl: "Karl",
  admin: "Admin",
  pm: "PM",
  engineer: "Engineer",
  shop: "Shop",
  installer: "Installer",
};

const ROLE_COLORS: Record<RoleKey, string> = {
  karl: "bg-white text-black border border-gray-300",
  admin: "bg-orange-100 text-orange-800",
  pm: "bg-blue-100 text-blue-800",
  engineer: "bg-purple-100 text-purple-800",
  shop: "bg-green-100 text-green-800",
  installer: "bg-yellow-100 text-yellow-800",
};

// Shorthand constructors
const full = (note?: string): Permission => ({ level: "full", note });
const view = (note?: string): Permission => ({ level: "view", note });
const none = (note?: string): Permission => ({ level: "none", note });
const restricted = (note?: string): Permission => ({ level: "restricted", note });

const PAGES: PageRow[] = [
  // ─── Jobs & Pipeline ───────────────────────────────────────────────────────
  {
    section: "Jobs & Pipeline",
    page: "Jobs list",
    path: "/admin/jobs",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: full(), installer: full() },
    enforced: false,
  },
  {
    section: "Jobs & Pipeline",
    page: "Job detail / edit",
    path: "/admin/jobs/[id]",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: view("no edit"), installer: view("no edit") },
    enforced: false,
  },
  {
    section: "Jobs & Pipeline",
    page: "Pipeline board",
    path: "/admin/pipeline",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: full(), installer: full() },
    enforced: false,
  },
  {
    section: "Jobs & Pipeline",
    page: "Leads",
    path: "/admin/leads",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none("n/a"), shop: none("n/a"), installer: none("n/a") },
    enforced: false,
  },
  {
    section: "Jobs & Pipeline",
    page: "Billing",
    path: "/admin/billing",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none("n/a"), shop: none("n/a"), installer: none("n/a") },
    enforced: false,
  },
  // ─── Schedule ─────────────────────────────────────────────────────────────
  {
    section: "Schedule",
    page: "Schedule / calendar",
    path: "/admin/schedule",
    permissions: { karl: full(), admin: full(), pm: restricted("blocked by code"), engineer: restricted("blocked by code"), shop: restricted("blocked by code"), installer: restricted("blocked by code") },
    enforced: true,
  },
  // ─── Specs ────────────────────────────────────────────────────────────────
  {
    section: "Specs",
    page: "Residential spec",
    path: "/jobs/[id]/residential/[specId]",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: view("read-only intent"), installer: none("n/a") },
    enforced: false,
  },
  {
    section: "Specs",
    page: "Floor plans",
    path: "/admin/floor-plans",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: none("n/a"), installer: none("n/a") },
    enforced: false,
  },
  {
    section: "Specs",
    page: "Documents",
    path: "/admin/documents",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: view(), installer: none("n/a") },
    enforced: false,
  },
  // ─── Estimating ───────────────────────────────────────────────────────────
  {
    section: "Estimating",
    page: "Estimating list",
    path: "/admin/estimating",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none("n/a"), shop: none("n/a"), installer: none("n/a") },
    enforced: false,
  },
  {
    section: "Estimating",
    page: "Estimate detail / BOM / quote",
    path: "/admin/estimating/[id]",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none("n/a"), shop: none("n/a"), installer: none("n/a") },
    enforced: false,
  },
  {
    section: "Estimating",
    page: "Estimating settings / profiles",
    path: "/admin/estimating/settings",
    permissions: { karl: full(), admin: full(), pm: view("read"), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  // ─── Libraries ────────────────────────────────────────────────────────────
  {
    section: "Libraries",
    page: "Spec libraries",
    path: "/admin/libraries",
    permissions: { karl: full(), admin: full(), pm: view("read-only intent"), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "Libraries",
    page: "Palettes",
    path: "/admin/palettes",
    permissions: { karl: full(), admin: full(), pm: view(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "Libraries",
    page: "Accessories",
    path: "/admin/accessories",
    permissions: { karl: full(), admin: full(), pm: view(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "Libraries",
    page: "Edgeband matches",
    path: "/admin/edgeband-matches",
    permissions: { karl: full(), admin: full(), pm: view(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "Libraries",
    page: "Catalog review",
    path: "/admin/catalog-review",
    permissions: { karl: full(), admin: full(), pm: view(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  // ─── User Management ──────────────────────────────────────────────────────
  {
    section: "User Management",
    page: "Builder accounts",
    path: "/admin/builders",
    permissions: { karl: full("create / role change"), admin: full("create / role change"), pm: view("list only"), engineer: none(), shop: none(), installer: none() },
    enforced: true,
  },
  {
    section: "User Management",
    page: "Builder profiles",
    path: "/admin/builder-profiles",
    permissions: { karl: full(), admin: full(), pm: none(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "User Management",
    page: "Builder companies",
    path: "/admin/builder-companies",
    permissions: { karl: full(), admin: full(), pm: none(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  {
    section: "User Management",
    page: "Portal accounts (clients)",
    path: "/admin/portal-accounts",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
  // ─── System ───────────────────────────────────────────────────────────────
  {
    section: "System",
    page: "Bug reports",
    path: "/admin/bugs",
    permissions: { karl: full(), admin: full(), pm: restricted("blocked by code"), engineer: restricted("blocked by code"), shop: restricted("blocked by code"), installer: restricted("blocked by code") },
    enforced: true,
  },
  {
    section: "System",
    page: "Wipe jobs",
    path: "/admin/wipe-jobs",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: full(), shop: full(), installer: full() },
    enforced: false,
  },
  // ─── Portal Pages (separate auth) ─────────────────────────────────────────
  {
    section: "Portal (separate auth)",
    page: "Client portal",
    path: "/portal",
    permissions: { karl: none("client auth"), admin: none("client auth"), pm: none("client auth"), engineer: none("client auth"), shop: none("client auth"), installer: none("client auth") },
    enforced: true,
  },
  {
    section: "Portal (separate auth)",
    page: "Installer portal",
    path: "/installer",
    permissions: { karl: none("installer auth"), admin: none("installer auth"), pm: none("installer auth"), engineer: none("installer auth"), shop: none("installer auth"), installer: full("own auth system") },
    enforced: true,
  },
  {
    section: "Portal (separate auth)",
    page: "Engineer portal",
    path: "/engineer",
    permissions: { karl: none("eng auth"), admin: none("eng auth"), pm: none("eng auth"), engineer: full("own auth system"), shop: none("eng auth"), installer: none("eng auth") },
    enforced: true,
  },
  {
    section: "Portal (separate auth)",
    page: "Express orders",
    path: "/express",
    permissions: { karl: full(), admin: full(), pm: full(), engineer: none(), shop: none(), installer: none() },
    enforced: false,
  },
];

function AccessBadge({ perm }: { perm: Permission }) {
  const base = "inline-flex flex-col items-center px-2 py-0.5 rounded text-xs font-medium leading-tight";
  const styles: Record<AccessLevel, string> = {
    full: "bg-green-100 text-green-800",
    view: "bg-blue-100 text-blue-800",
    none: "bg-gray-100 text-gray-400",
    restricted: "bg-red-100 text-red-700",
  };
  const labels: Record<AccessLevel, string> = {
    full: "Full",
    view: "View",
    none: "—",
    restricted: "Blocked",
  };
  return (
    <span className={`${base} ${styles[perm.level]}`}>
      {labels[perm.level]}
      {perm.note && (
        <span className="text-[10px] opacity-70 font-normal whitespace-nowrap">{perm.note}</span>
      )}
    </span>
  );
}

export default function PermissionsPage() {
  const sections = [...new Set(PAGES.map((p) => p.section))];

  return (
    <div className="p-6 max-w-full">
      <h1 className="text-xl font-bold text-white mb-1">Role Permissions Matrix</h1>
      <p className="text-sm text-white/50 mb-4">
        As of 2026-07-16. <span className="text-yellow-400">Yellow = convention only (no code enforcement).</span>{" "}
        Update this page when role checks change.
      </p>

      {/* Legend */}
      <div className="flex gap-3 mb-6 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-800 font-medium">Full — full access</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium">View — read-only</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 font-medium">Blocked — actively enforced</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-400 font-medium">— — not applicable</span>
      </div>

      {/* Role headers */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="text-left px-3 py-2 text-white/60 font-medium w-32">Section</th>
              <th className="text-left px-3 py-2 text-white/60 font-medium">Page</th>
              <th className="text-left px-3 py-2 text-white/40 font-normal text-xs w-48">Path</th>
              {ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-center text-white/40 font-normal text-xs">Enforced</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = PAGES.filter((p) => p.section === section);
              return rows.map((row, ri) => (
                <tr
                  key={row.path}
                  className={`border-t border-white/5 ${!row.enforced ? "bg-yellow-900/5" : ""} hover:bg-white/5 transition-colors`}
                >
                  {ri === 0 && (
                    <td
                      rowSpan={rows.length}
                      className="px-3 py-2 text-white/70 font-medium text-xs align-top border-r border-white/10 whitespace-nowrap"
                    >
                      {section}
                    </td>
                  )}
                  <td className="px-3 py-2 text-white/90">{row.page}</td>
                  <td className="px-3 py-2 text-white/30 font-mono text-xs">{row.path}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-3 py-2 text-center">
                      <AccessBadge perm={row.permissions[role]} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    {row.enforced ? (
                      <span className="text-green-400 text-xs">✓ code</span>
                    ) : (
                      <span className="text-yellow-500/70 text-xs">convention</span>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/30 mt-4">
        Most admin pages gate on <code className="bg-white/10 px-1 rounded">getBuilderFromRequest()</code> (any authenticated
        builder) with no further role check. Only schedule, bugs, and builder role-management enforce role restrictions in
        code. All portal sections use separate authentication systems.
      </p>
    </div>
  );
}
