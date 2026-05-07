import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import projects from "@/data/projects.json";

export async function generateStaticParams() {
  return projects.projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.projects.find((p) => p.slug === slug);
  if (!project) return {};
  return { title: `${project.title} — ${project.location}` };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.projects.find((p) => p.slug === slug);
  if (!project) notFound();

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <Link
        href="/"
        className="font-condensed uppercase tracking-widest text-xs text-white/40 hover:text-[#f08122] transition-colors mb-8 block"
      >
        ← Return To Projects
      </Link>

      <h1 className="font-heading text-4xl md:text-5xl uppercase tracking-wide text-white mb-1">
        {project.title}
      </h1>
      <p className="font-condensed uppercase tracking-widest text-sm text-[#f08122] mb-10">
        {project.location}
      </p>

      {project.scope && (
        <div className="mb-12 max-w-2xl">
          <p className="font-condensed uppercase tracking-widest text-xs text-white/40 mb-3">Project Scope —</p>
          <p className="text-white/70 leading-relaxed">{project.scope}</p>
        </div>
      )}

      {/* Photo grid — populate project.images with paths when photos are available */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {project.images.length > 0
          ? project.images.map((src, i) => (
              <div key={i} className="bg-[#2d2d2d] aspect-square rounded overflow-hidden">
                {/* <Image src={src} alt={`${project.title} ${i + 1}`} fill className="object-cover" /> */}
              </div>
            ))
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#2d2d2d] aspect-square rounded flex items-center justify-center text-white/20 text-xs">
                Photo {i + 1}
              </div>
            ))}
      </div>
    </section>
  );
}
