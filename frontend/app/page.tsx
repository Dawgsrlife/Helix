"use client";

import Link from "next/link";
import { Dna, FlaskConical, Search, BarChart3, ArrowRight, ExternalLink } from "lucide-react";

const SEQUENCE_LINE = "ATGGCTAGCATCGATCGATCGATCGTAGCTAGCTAGCTAGCATCGATCG";

const BASE_COLORS: Record<string, string> = {
  A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855",
};

const FEATURES = [
  { icon: Dna, title: "Sequencing", desc: "Paste any DNA sequence and get instant Evo 2 annotation with per-position likelihood scores." },
  { icon: Search, title: "Mutation Analysis", desc: "Click any base, change it, and see the predicted functional impact in under 2 seconds." },
  { icon: FlaskConical, title: "Structure Prediction", desc: "AlphaFold-powered 3D protein structure rendering with pLDDT confidence coloring." },
  { icon: BarChart3, title: "Variant Scoring", desc: "Four-dimensional candidate scoring: functional plausibility, tissue specificity, off-target risk, novelty." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#e8e8e6]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-10 h-14 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-white/[0.06]">
        <span className="text-base font-semibold tracking-tight">Helix</span>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/Dawgsrlife/Helix"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#ccc] transition-colors"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link
            href="/analyze"
            className="text-sm font-medium px-4 py-1.5 rounded-md bg-[#e8e8e6] text-[#0a0a0c] hover:bg-white transition-colors"
          >
            Open IDE
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-14 px-6 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#5bb5a2]/[0.06] blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5bb5a2]/10 border border-[#5bb5a2]/20 text-[#5bb5a2] text-xs font-medium mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5bb5a2] animate-pulse" />
            Powered by Evo 2 · 40B parameters
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6">
            The IDE for
            <br />
            <span className="text-[#5bb5a2]">genomic design</span>
          </h1>

          <p className="text-lg text-[#888] max-w-xl mx-auto mb-10 leading-relaxed">
            Helix gives researchers a workspace to design, annotate, and analyze DNA sequences.
            Paste a sequence, get instant AI-powered insights, and iterate in real time.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/analyze"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#e8e8e6] text-[#0a0a0c] text-sm font-medium hover:bg-white transition-colors"
            >
              Get started
              <ArrowRight size={16} />
            </Link>
            <a
              href="https://github.com/Dawgsrlife/Helix"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-sm font-medium text-[#888] hover:text-[#ccc] hover:border-white/20 transition-colors"
            >
              <ExternalLink size={15} />
              View source
            </a>
          </div>
        </div>
      </section>

      {/* Product Preview */}
      <section className="px-6 md:px-10 pb-32 -mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#111113] shadow-2xl shadow-black/50">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-[#555] font-mono">helix / BRCA1_analysis.seq</span>
              </div>
            </div>
            {/* Content */}
            <div className="p-6">
              <div className="font-mono text-sm leading-6 mb-4">
                <div className="flex gap-4">
                  <span className="text-xs text-[#333] w-8 text-right select-none tabular-nums">1</span>
                  <span>
                    {SEQUENCE_LINE.split("").map((base, i) => (
                      <span key={i} style={{ color: BASE_COLORS[base] }}>{base}</span>
                    ))}
                  </span>
                </div>
              </div>
              <div className="flex gap-px h-3 rounded overflow-hidden mb-4">
                <div className="flex-[25] bg-[#7c6bc4]/40" />
                <div className="flex-[15] bg-[#3a3a3c]/40" />
                <div className="flex-[35] bg-[#5bb5a2]/30" />
                <div className="flex-[25] bg-[#7c6bc4]/40" />
              </div>
              <div className="flex items-end gap-[1px] h-12">
                {Array.from({ length: 48 }, (_, i) => {
                  const h = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.7) * 0.3);
                  return (
                    <div key={i} className="flex-1 rounded-t-sm bg-[#5bb5a2]" style={{ height: `${Math.max(h * 100, 8)}%`, opacity: 0.3 + h * 0.5 }} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-10 pb-32">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold tracking-tight mb-3">Built for researchers</h2>
          <p className="text-[#888] text-base mb-12 max-w-lg">
            Every feature is designed to reduce the time from genomic insight to therapeutic candidate.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-xl bg-[#111113] border border-white/[0.06] hover:border-white/[0.12] transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#5bb5a2]/10 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-[#5bb5a2]" />
                </div>
                <h3 className="text-base font-medium mb-2">{title}</h3>
                <p className="text-sm text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 pb-32">
        <div className="max-w-5xl mx-auto text-center">
          <div className="relative py-20 px-8 rounded-xl bg-[#111113] border border-white/[0.06] overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[400px] h-[400px] rounded-full bg-[#5bb5a2]/[0.06] blur-[80px]" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl font-semibold tracking-tight mb-4">
                Start designing sequences
              </h2>
              <p className="text-[#888] mb-8 max-w-md mx-auto">
                Compress weeks of manual sequence design into minutes.
                Open the IDE and paste your first sequence.
              </p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#5bb5a2] text-[#0a0a0c] text-sm font-medium hover:bg-[#6dc4b2] transition-colors"
              >
                Open Helix IDE
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-10 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-start gap-8">
          <div>
            <span className="text-base font-semibold">Helix</span>
            <p className="text-xs text-[#555] mt-1">Genomic IDE · YHack 2026</p>
          </div>
          <div className="flex gap-10">
            <div className="flex flex-col gap-2">
              <span className="text-xs text-[#555] font-medium uppercase tracking-wider">Product</span>
              <Link href="/analyze" className="text-sm text-[#888] hover:text-[#ccc] transition-colors">IDE</Link>
              <a href="https://github.com/Dawgsrlife/Helix" className="text-sm text-[#888] hover:text-[#ccc] transition-colors">GitHub</a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-[#555] font-medium uppercase tracking-wider">Team</span>
              <span className="text-sm text-[#555]">Alex · Vishnu · Henry</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
