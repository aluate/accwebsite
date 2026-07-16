import Link from "next/link";
import { requireRole } from "@/lib/auth";

const ADMIN_LINKS = [
  { href: "/admin/pipeline",          label: "Pipeline",          desc: "Active jobs — value, box count, shop hours, install hours, capacity" },
  { href: "/admin/leads",             label: "Leads",             desc: "Intake and respond to new inquiries from the contact form or cold calls" },
  { href: "/admin/estimating",        label: "Estimating",        desc: "Build bids, room-by-room cabinet entry, cost summary" },
  { href: "/admin/builders",          label: "User Accounts",     desc: "Manage internal builder accounts and roles" },
  { href: "/admin/libraries",         label: "Libraries",         desc: "Edit catalog CSVs — door styles, hardware, materials" },
  { href: "/admin/accessories",       label: "Accessory catalog", desc: "Toggle accessories active/inactive in the spec picker" },
  { href: "/admin/portal-accounts",   label: "Portal Accounts",   desc: "Builder portal access and credentials" },
  { href: "/admin/builder-companies", label: "Builder Companies", desc: "Manage builder company records" },
  { href: "/admin/schedule",          label: "Schedule Admin",    desc: "Crew management, change requests, on-deck queue" },
  { href: "/admin/billing",           label: "Billing",           desc: "Past-due invoices, payment status, outstanding balances" },
  { href: "/admin/documents",         label: "Document Library",  desc: "Upload boilerplate docs — warranty, disclosure, payment terms — auto-attached to client emails" },
];

export default async function AdminIndexPage() {
  await requireRole("admin");  // karl role also passes
  return (
    <div className="min-h-screen bg-[#0d0e0f] text-white px-6 py-10 max-w-3xl mx-auto">
      <div className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-2">Admin</div>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-[#f08122] mb-8">Admin Panel</h1>
      <div className="grid gap-3">
        {ADMIN_LINKS.map(({ href, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="block bg-[#1a1b1c] border border-white/10 hover:border-[#f08122]/40 hover:bg-[#1a1b1c]/80 rounded-xl px-5 py-4 transition-colors group"
          >
            <div className="font-medium text-white group-hover:text-[#f08122] transition-colors mb-0.5">
              {label}
            </div>
            <div className="text-sm text-white/40">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
