import type { Metadata } from "next";
import { SubNav } from "@/components/SubNav";

export const metadata: Metadata = {
  title: "Tour",
  description: "Take a look inside the Advanced Cabinets custom cabinet shop in Coeur d'Alene, Idaho.",
};

const SHOP_PHOTOS = Array.from({ length: 11 }, (_, i) => i + 1);

export default function TourPage() {
  return (
    <>
      <SubNav current="/tour" />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-heading text-4xl md:text-5xl uppercase tracking-wide text-white mb-10">
          Take a look into our custom cabinet shop
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {SHOP_PHOTOS.map((n) => (
            <div
              key={n}
              className="bg-[#2d2d2d] aspect-square rounded flex items-center justify-center text-white/20 text-xs"
            >
              {/* Replace with <Image> when shop photos are available */}
              Shop photo {n}
            </div>
          ))}
        </div>
        <div className="mt-10">
          <a
            href="#header"
            className="font-condensed uppercase tracking-widest text-sm text-[#f08122] hover:text-white transition-colors"
          >
            Back to Top
          </a>
        </div>
      </section>
    </>
  );
}
