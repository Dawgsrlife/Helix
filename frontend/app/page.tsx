"use client";

import Link from "next/link";
import { Dna, FlaskConical, Search, BarChart3 } from "lucide-react";

const SEQUENCE_LINE = "ATGGCTAGCATCGATCGATCGATCGTAGCTAGCTAGCTAGCATCGATCG";

const BASE_COLORS: Record<string, string> = {
  A: "#6bbd7a",
  T: "#d47a7a",
  C: "#6b9fd4",
  G: "#c9a855",
};

const FEATURES = [
  { icon: Dna, label: "Module 01", title: "Sequencing" },
  { icon: Search, label: "Module 02", title: "Proteomics" },
  { icon: FlaskConical, label: "Module 03", title: "Synthesis" },
  { icon: BarChart3, label: "Module 04", title: "Analysis" },
];

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: "#0e0e10", color: "#fffbfe" }}>
      {/* Fixed Nav */}
      <nav
        className="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16"
        style={{
          background: "rgba(14, 14, 16, 0.8)",
          backdropFilter: "blur(20px)",
          borderBottom: "0.5px solid rgba(255,255,255,0.1)",
        }}
      >
        <span
          className="text-xl tracking-tighter italic"
          style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif", color: "#93edd9" }}
        >
          Helix
        </span>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/Dawgsrlife/Helix"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-[#93edd9] transition-colors duration-300 uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px" }}
          >
            GitHub
          </a>
          <Link
            href="/analyze"
            className="px-5 py-2 uppercase tracking-widest hover:bg-[#93edd9] hover:text-[#0e0e10] transition-all duration-300"
            style={{
              fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
              fontSize: "10px",
              border: "0.5px solid rgba(255,255,255,0.2)",
              color: "#fffbfe",
            }}
          >
            Open IDE
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-6 overflow-hidden">
        {/* DNA Helix background */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {/* Central glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(147,237,217,0.12) 0%, rgba(147,237,217,0.03) 40%, transparent 70%)" }}
          />
          {/* DNA strand visualization */}
          <svg
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20"
            width="600"
            height="800"
            viewBox="0 0 600 800"
            fill="none"
          >
            {Array.from({ length: 20 }, (_, i) => {
              const y = i * 40 + 20;
              const x1 = 300 + Math.sin(i * 0.6) * 120;
              const x2 = 300 - Math.sin(i * 0.6) * 120;
              return (
                <g key={i}>
                  <circle cx={x1} cy={y} r={4} fill="#93edd9" opacity={0.6 + Math.sin(i * 0.3) * 0.3} />
                  <circle cx={x2} cy={y} r={4} fill="#93edd9" opacity={0.6 - Math.sin(i * 0.3) * 0.3} />
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="#93edd9" strokeWidth={0.5} opacity={0.15} />
                  {i < 19 && (
                    <>
                      <line
                        x1={x1} y1={y}
                        x2={300 + Math.sin((i + 1) * 0.6) * 120} y2={y + 40}
                        stroke="#93edd9" strokeWidth={1} opacity={0.2}
                      />
                      <line
                        x1={x2} y1={y}
                        x2={300 - Math.sin((i + 1) * 0.6) * 120} y2={y + 40}
                        stroke="#93edd9" strokeWidth={1} opacity={0.2}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Edge fade */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, #0e0e10 5%, transparent 25%, transparent 75%, #0e0e10 95%)" }} />
        </div>

        <div className="relative z-10 text-center max-w-5xl animate-[fade-in-up_0.8s_ease-out_both]">
          <p
            className="uppercase tracking-[0.4em] mb-8"
            style={{
              fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
              fontSize: "10px",
              color: "#93edd9",
              animation: "pulse 3s ease-in-out infinite",
            }}
          >
            Powered by Evo 2
          </p>
          <h1
            className="italic text-6xl md:text-9xl tracking-tighter mb-12 leading-tight"
            style={{
              fontFamily: "var(--font-headline), 'Noto Serif', serif",
              background: "linear-gradient(to bottom, #fffbfe, #93edd9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Design DNA.
          </h1>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link
              href="/analyze"
              className="px-10 py-4 uppercase tracking-widest text-xs hover:bg-[#93edd9] transition-all duration-500 shadow-2xl"
              style={{
                fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
                background: "#fffbfe",
                color: "#000000",
              }}
            >
              Get started
            </Link>
            <a
              href="https://github.com/Dawgsrlife/Helix"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 uppercase tracking-widest text-xs hover:border-[#93edd9] transition-all duration-500"
              style={{
                fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
                border: "0.5px solid rgba(255,255,255,0.2)",
                color: "#fffbfe",
              }}
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-40">
          <span
            className="uppercase tracking-[0.3em]"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "9px" }}
          >
            Scroll to explore
          </span>
          <div className="w-[1px] h-12" style={{ background: "linear-gradient(to bottom, #93edd9, transparent)" }} />
        </div>
      </section>

      {/* Workspace Showcase */}
      <section className="relative py-40 px-6 md:px-20" style={{ background: "#0e0e10" }}>
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end mb-24">
            <div className="lg:col-span-8">
              <h2
                className="italic text-5xl md:text-7xl leading-[1.1] mb-8"
                style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif" }}
              >
                A clinical canvas for <br />
                <span style={{ color: "rgba(147, 237, 217, 0.6)" }}>biological precision.</span>
              </h2>
            </div>
            <div className="lg:col-span-4 lg:pb-4">
              <p className="text-sm leading-relaxed max-w-sm" style={{ color: "#adaaad" }}>
                Helix introduces a frictionless interface for genomic sequencing,
                allowing researchers to manipulate molecular strands with atomic detail.
              </p>
            </div>
          </div>

          {/* Mock IDE Preview */}
          <div className="relative group">
            <div
              className="absolute -inset-1 opacity-30 group-hover:opacity-50 transition-opacity duration-700"
              style={{ background: "linear-gradient(to right, rgba(147,237,217,0.2), transparent)", filter: "blur(48px)" }}
            />
            <div
              className="relative overflow-hidden"
              style={{
                backdropFilter: "blur(40px)",
                background: "rgba(31, 31, 34, 0.6)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                boxShadow: "0 20px 80px rgba(0,0,0,0.4)",
              }}
            >
              {/* Window chrome */}
              <div className="h-10 flex items-center px-4 gap-2" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.1)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: "rgba(239,68,68,0.4)" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: "rgba(234,179,8,0.4)" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: "rgba(34,197,94,0.4)" }} />
              </div>

              {/* Mock content */}
              <div className="px-5 py-6">
                <div className="font-mono text-[13px] leading-[22px] mb-4" style={{ fontFamily: "var(--font-mono), monospace" }}>
                  <div className="flex gap-4">
                    <span className="text-[11px] w-10 text-right shrink-0 tabular-nums select-none" style={{ color: "#48474a" }}>1</span>
                    <span>
                      {SEQUENCE_LINE.split("").map((base, i) => (
                        <span key={i} style={{ color: BASE_COLORS[base] }}>{base}</span>
                      ))}
                    </span>
                  </div>
                </div>
                {/* Annotation bar */}
                <div className="h-4 flex overflow-hidden mb-4" style={{ background: "#19191c" }}>
                  <div style={{ width: "25%", background: "#7c6bc4", opacity: 0.5 }} />
                  <div style={{ width: "15%", background: "#3a3a3c", opacity: 0.5 }} />
                  <div style={{ width: "35%", background: "#5bb5a2", opacity: 0.4 }} />
                  <div style={{ width: "25%", background: "#7c6bc4", opacity: 0.5 }} />
                </div>
                {/* Likelihood bars */}
                <div className="flex items-end gap-[2px] h-16">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.7) * 0.3);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{ height: `${Math.max(h * 100, 8)}%`, background: "#93edd9", opacity: 0.4 + h * 0.4 }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Synthesize Life - Features */}
      <section className="relative py-40 overflow-hidden" style={{ background: "#000000" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row gap-32 items-start">
            <div className="w-full md:w-1/2">
              <div className="md:sticky md:top-40">
                <span
                  className="uppercase tracking-[0.3em]"
                  style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "9px", color: "#93edd9" }}
                >
                  The Vision
                </span>
                <h3
                  className="italic text-6xl mt-8 mb-12"
                  style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif" }}
                >
                  Synthesize Life.
                </h3>
                <p className="text-lg leading-relaxed mb-12 max-w-md" style={{ color: "#adaaad" }}>
                  We aren't just reading data. We are writing the future. From CRISPR
                  optimization to synthetic protein folding, Helix provides the modular
                  architecture required for the next century of medicine.
                </p>
                <Link
                  href="/analyze"
                  className="flex items-center gap-4 group"
                >
                  <span
                    className="h-[1px] w-12 group-hover:w-20 transition-all duration-500"
                    style={{ background: "#93edd9" }}
                  />
                  <span
                    className="uppercase tracking-widest text-xs"
                    style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", color: "#93edd9" }}
                  >
                    Start designing
                  </span>
                </Link>
              </div>
            </div>

            {/* Bento grid */}
            <div
              className="w-full md:w-1/2 grid grid-cols-2 gap-px"
              style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}
            >
              {FEATURES.map(({ icon: Icon, label, title }) => (
                <div
                  key={title}
                  className="p-12 flex flex-col gap-8 aspect-square justify-between"
                  style={{ background: "#0e0e10" }}
                >
                  <Icon size={36} style={{ color: "#93edd9" }} strokeWidth={1.2} />
                  <div>
                    <p
                      className="uppercase tracking-widest mb-4 opacity-50"
                      style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px" }}
                    >
                      {label}
                    </p>
                    <h4
                      className="text-2xl"
                      style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif" }}
                    >
                      {title}
                    </h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-60 px-6 text-center relative" style={{ background: "#0e0e10" }}>
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div
            className="w-[600px] h-[600px] rounded-full"
            style={{ background: "rgba(147, 237, 217, 0.1)", filter: "blur(120px)" }}
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <h2
            className="italic text-5xl md:text-8xl mb-16 tracking-tighter"
            style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif" }}
          >
            The future is <br /> being written.
          </h2>
          <Link
            href="/analyze"
            className="inline-block px-12 py-5 uppercase tracking-[0.2em] text-sm hover:scale-105 transition-all duration-300 shadow-2xl"
            style={{
              fontFamily: "var(--font-label), 'Space Grotesk', sans-serif",
              background: "#93edd9",
              color: "#002821",
            }}
          >
            Initialize Sequence
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-8" style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", background: "#000000" }}>
        <div className="flex flex-col md:flex-row justify-between items-start gap-12">
          <div>
            <div
              className="text-3xl italic tracking-tighter mb-4"
              style={{ fontFamily: "var(--font-headline), 'Noto Serif', serif", color: "#93edd9" }}
            >
              Helix
            </div>
            <p
              className="uppercase tracking-widest"
              style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#adaaad" }}
            >
              Genomic Design IDE - YHack 2026
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-20">
            {[
              { title: "Product", links: ["Sequencing", "Synthesis", "Analysis"] },
              { title: "Resources", links: ["Documentation", "GitHub", "Evo 2 Paper"] },
              { title: "Team", links: ["Alex (Frontend)", "Vishnu (Backend)", "Henry (Demo)"] },
            ].map(({ title, links }) => (
              <div key={title} className="flex flex-col gap-4">
                <span
                  className="uppercase tracking-widest mb-2"
                  style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "10px", color: "#93edd9" }}
                >
                  {title}
                </span>
                {links.map((link) => (
                  <span key={link} className="text-xs transition-colors cursor-default" style={{ color: "#adaaad" }}>
                    {link}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div
          className="mt-20 pt-10 flex justify-between items-center opacity-40"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}
        >
          <p
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-label), 'Space Grotesk', sans-serif", fontSize: "9px" }}
          >
            &copy; 2026 Project Helix. Built at YHack.
          </p>
        </div>
      </footer>
    </div>
  );
}
