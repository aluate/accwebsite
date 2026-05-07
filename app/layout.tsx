import type { Metadata } from "next";
import { Inter, Abel, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SITE } from "@/data/site";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const abel = Abel({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-condensed",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description:
    "Advanced Custom Cabinets is a locally owned custom cabinet and millwork company based in Coeur d'Alene, Idaho. Serving residential and commercial clients across the Northwest since 1998.",
  keywords: ["custom cabinets", "millwork", "cabinetry", "Coeur d'Alene", "Idaho", "commercial millwork", "residential cabinets"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${abel.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-screen flex flex-col bg-[#3d3d3d] text-white antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
