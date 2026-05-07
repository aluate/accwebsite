import type { Metadata } from "next";
import { SubNav } from "@/components/SubNav";

export const metadata: Metadata = {
  title: "About",
  description: "Advanced Custom Cabinets is a locally owned custom cabinet and millwork company in Coeur d'Alene, Idaho, serving the Northwest since 1998.",
};

export default function AboutPage() {
  return (
    <>
      <SubNav current="/about" />
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-heading text-4xl md:text-5xl uppercase tracking-wide text-white mb-8">
          Advanced Cabinets is a custom cabinet and finishing company founded in 1998 in Hayden, Idaho
        </h1>
        <div className="space-y-5 text-white/70 leading-relaxed max-w-3xl">
          <p>
            Advanced Custom Cabinets is a locally owned company that has been doing business in the
            Inland Northwest for more than 19 years. We currently employ 50+ quality oriented team
            members. We are an active and participating member of the Architectural Woodwork
            Institute. We currently service Idaho, Montana, Utah, Colorado, Oregon, Wyoming, Alaska,
            Washington State, and California.
          </p>
          <p>
            We enjoy an outstanding working relationship with our contractors and customers. We
            commonly work with General Contractors in commercial applications such as Health Care
            Facilities, Universities, K-12 Schools, Banks, Retail locations and Hospital facilities.
            We also supply only casework and millwork to interior finish contractors.
          </p>
          <p>
            Advanced Custom Cabinets has successfully completed a wide range of projects from
            Executive Millwork and Casework, large scale high-end condominium projects, multi-million
            dollar homes, hospital and medical facilities, universities and complex architectural
            millwork projects. We have built many projects with complex teller lines, nurses&apos;
            stations, veneer paneling projects, solid surface, radiuses, ellipses and many other
            challenging and complex wood work pieces.
          </p>
          <p>
            Advanced Custom Cabinets is located in Coeur d&apos;Alene, Idaho. It houses about 36,500
            square feet of manufacturing space. Our shop is equipped with the most modern machinery
            in the industry, including state of the art CNC machining centers for all cut out and
            machining, material handling systems, a full millwork shop for providing standing and
            running trim and a pre finishing shop.
          </p>
          <p>
            Whether you&apos;re constructing your dream home, building a new office, renovating your
            kitchen or adding wall units you can count on Advanced Cabinets to meet your needs with
            on-time, quality products, and service.
          </p>
        </div>
      </section>
    </>
  );
}
