export const dynamic = "force-dynamic";

/**
 * /signoff/[token] — public client approval page.
 *
 * No auth required — the token IS the auth.
 * Shows job summary + signature canvas.
 */
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { SignoffCanvas } from "./SignoffCanvas";

type Signoff = {
  id: string;
  job_id: string;
  status: string;
  token_expires_at: string;
  pm_note: string | null;
  signer_name: string | null;
  signed_at: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
};

export default async function SignoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let signoff: Signoff | null = null;
  try {
    const [row] = await sql`
      SELECT cs.id, cs.job_id, cs.status, cs.token_expires_at,
             cs.pm_note, cs.signer_name, cs.signed_at,
             j.client_name, j.site_address, j.city
      FROM client_signoffs cs
      JOIN jobs j ON j.id = cs.job_id
      WHERE cs.token = ${token}
    ` as Signoff[];
    signoff = row ?? null;
  } catch {
    // Table may not exist yet
    notFound();
  }

  if (!signoff) notFound();

  const expired = new Date(signoff.token_expires_at) < new Date();
  const alreadySigned = signoff.status === "signed";
  const jobLabel = [signoff.site_address, signoff.city].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-[#111] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        {/* Logo text */}
        <div>
          <p className="font-heading text-lg uppercase tracking-widest text-[#f08122]">
            Advanced Custom Cabinets
          </p>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest">
            Client Specification Approval
          </p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10">

        {/* Expired */}
        {expired && !alreadySigned && (
          <div className="text-center py-16 space-y-4">
            <div className="text-4xl">⏰</div>
            <h1 className="text-2xl font-heading uppercase tracking-wide">Link Expired</h1>
            <p className="text-white/50 text-sm">
              This approval link has expired. Please contact your project manager
              to request a new link.
            </p>
          </div>
        )}

        {/* Already signed */}
        {alreadySigned && (
          <div className="text-center py-16 space-y-4">
            <div className="text-4xl">✅</div>
            <h1 className="text-2xl font-heading uppercase tracking-wide">Already Signed</h1>
            <p className="text-white/50 text-sm">
              This approval was already submitted
              {signoff.signer_name ? ` by ${signoff.signer_name}` : ""}
              {signoff.signed_at
                ? ` on ${new Date(signoff.signed_at).toLocaleDateString("en-US", {
                    timeZone: "UTC", year: "numeric", month: "long", day: "numeric"
                  })}`
                : ""}.
            </p>
          </div>
        )}

        {/* Active — show signature form */}
        {!expired && !alreadySigned && (
          <>
            <h1 className="font-heading text-2xl uppercase tracking-wide text-white mb-2">
              Specification Approval
            </h1>
            <p className="text-white/40 text-sm mb-6">
              Please review and sign below to approve the cabinet specifications
              for your project.
            </p>

            {signoff.pm_note && (
              <div className="bg-[#f08122]/10 border border-[#f08122]/20 rounded-lg px-4 py-3 mb-6">
                <p className="text-[10px] font-condensed uppercase tracking-widest text-[#f08122]/60 mb-1">
                  Note from your project manager
                </p>
                <p className="text-white/70 text-sm">{signoff.pm_note}</p>
              </div>
            )}

            <SignoffCanvas token={token} jobLabel={jobLabel} />
          </>
        )}
      </main>

      <footer className="border-t border-white/5 px-6 py-6 mt-10 text-center">
        <p className="text-white/20 text-xs font-condensed">
          Advanced Custom Cabinets · 250 W Anton Ave, Coeur d'Alene, ID 83815 · 208.772.2377
        </p>
      </footer>
    </div>
  );
}
