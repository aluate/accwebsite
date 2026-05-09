import type { Metadata } from "next";
import { SubNav } from "@/components/SubNav";
import { SITE } from "@/data/site";

export const metadata: Metadata = {
  title: "Team",
  description: "Meet the Advanced Cabinets team — founder, project managers, residential sales, and estimating.",
};

export default function TeamPage() {
  return (
    <>
      <SubNav current="/team" />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-14">

        {/* Founder */}
        <div>
          <h2 className="font-heading text-xs uppercase tracking-[0.3em] text-[#f08122] mb-6">Founder</h2>
          <div className="max-w-xl">
            <p className="font-heading text-2xl text-white mb-3">Joe McCormick</p>
            <p className="text-white/60 leading-relaxed text-sm">
              Joe has been in the cabinet business for over 20 years and has worked with hundreds of
              local customers and contractors from designing high end dream kitchens to outfitting
              schools with highly functional, economical storage and organization solutions. Joe has
              been an Idaho resident for over 25 years and enjoys hunting, fishing, and camping.
            </p>
          </div>
        </div>

        {/* Commercial PMs */}
        <div>
          <h2 className="font-heading text-xs uppercase tracking-[0.3em] text-[#f08122] mb-6">
            Commercial Project Managers
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {SITE.staff.commercial.map((p) => (
              <div key={p.name} className="bg-[#2d2d2d] rounded p-5">
                <p className="font-condensed text-white text-base">{p.name}</p>
                <p className="text-white/40 text-xs mt-0.5">{p.title}</p>
                <a href={`mailto:${p.email}`} className="text-[#f08122] text-xs hover:underline mt-1 block">
                  {p.email}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Residential */}
        <div>
          <h2 className="font-heading text-xs uppercase tracking-[0.3em] text-[#f08122] mb-6">
            Residential Sales and Design
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {SITE.staff.residential.map((p) => (
              <div key={p.name} className="bg-[#2d2d2d] rounded p-5">
                <p className="font-condensed text-white text-base">{p.name}</p>
                <p className="text-white/40 text-xs mt-0.5">{p.title}</p>
                <a href={`mailto:${p.email}`} className="text-[#f08122] text-xs hover:underline mt-1 block">
                  {p.email}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Estimating */}
        <div>
          <h2 className="font-heading text-xs uppercase tracking-[0.3em] text-[#f08122] mb-6">
            Estimating Department
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {SITE.staff.estimating.map((p) => (
              <div key={p.name} className="bg-[#2d2d2d] rounded p-5">
                <p className="font-condensed text-white text-base">{p.name}</p>
                <p className="text-white/40 text-xs mt-0.5">{p.title}</p>
              </div>
            ))}
          </div>
        </div>

      </section>
    </>
  );
}
