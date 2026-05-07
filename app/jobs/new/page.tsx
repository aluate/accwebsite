import type { Metadata } from "next";
import { IntakeForm } from "@/components/IntakeForm";

export const metadata: Metadata = { title: "New Job — ACC" };

export default function NewJobPage() {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-2">New Job</h1>
      <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mb-10">Intake Form</p>
      <IntakeForm />
    </section>
  );
}
