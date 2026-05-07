import type { Metadata } from "next";
import { SITE } from "@/data/site";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Advanced Cabinets in Coeur d'Alene, Idaho. Reach our project managers for residential or commercial cabinet inquiries.",
};

export default function ContactPage() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-2 gap-16">
      {/* Info */}
      <div>
        <h1 className="font-heading text-4xl uppercase tracking-wide text-white mb-8">Contact</h1>

        <div className="space-y-6 text-sm mb-10">
          <div>
            <p className="font-condensed uppercase tracking-widest text-xs text-white/40 mb-1">Phone</p>
            <a href={`tel:${SITE.phone.replace(/\./g, "")}`} className="text-white hover:text-[#f08122] transition-colors">
              {SITE.phone}
            </a>
          </div>
          <div>
            <p className="font-condensed uppercase tracking-widest text-xs text-white/40 mb-1">Fax</p>
            <p className="text-white/70">{SITE.fax}</p>
          </div>
          <div>
            <p className="font-condensed uppercase tracking-widest text-xs text-white/40 mb-1">Address</p>
            <p className="text-white/70">{SITE.address}</p>
          </div>
          <div>
            <p className="font-condensed uppercase tracking-widest text-xs text-white/40 mb-1">Careers</p>
            <a href={`mailto:${SITE.careers}`} className="text-[#f08122] hover:underline">{SITE.careers}</a>
          </div>
        </div>

        <div className="space-y-3">
          <p className="font-condensed uppercase tracking-widest text-xs text-white/40">Staff Contacts</p>
          {[...SITE.staff.commercial, ...SITE.staff.residential].map((s) => (
            <div key={s.email} className="bg-[#2d2d2d] rounded p-4">
              <p className="text-white text-sm font-medium">{s.name}</p>
              <p className="text-white/40 text-xs">{s.title}</p>
              <a href={`mailto:${s.email}`} className="text-[#f08122] text-xs hover:underline">{s.email}</a>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div>
        <h2 className="font-heading text-2xl uppercase tracking-wide text-white mb-8">Send a Message</h2>
        <ContactForm showPhone />
      </div>
    </section>
  );
}
