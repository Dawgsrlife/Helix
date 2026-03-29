"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ExternalLink } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const SEQUENCE = "ATGGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCG";
const BASE_COLORS: Record<string, string> = {
  A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855",
};

const PIPELINE_STEPS = [
  { num: "01", title: "Design Goal", desc: "Type what you need in plain English. Helix parses your intent into a structured biological specification." },
  { num: "02", title: "Evo 2 Generation", desc: "40 billion parameters. 9 trillion base pairs of training. Candidates stream live, base by base." },
  { num: "03", title: "Multi-dimensional Scoring", desc: "Functional plausibility, tissue specificity, off-target risk, and novelty. Scored in real time." },
  { num: "04", title: "AlphaFold Folding", desc: "Top candidates fold into 3D protein structures with per-residue confidence scoring." },
];

const STATS = [
  { value: "40B", label: "Parameters" },
  { value: "9T", label: "Base pairs trained" },
  { value: "1M", label: "Token context window" },
  { value: "<2s", label: "Re-score latency" },
];

export default function Home() {
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero intro timeline
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
      heroTl
        .fromTo("[data-hero-badge]", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 })
        .fromTo("[data-hero-title] span", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.15 }, "-=0.3")
        .fromTo("[data-hero-desc]", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, "-=0.4")
        .fromTo("[data-hero-cta]", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.3");

      // Section reveals on scroll
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: 60 },
          {
            opacity: 1, y: 0, duration: 0.8, ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%", end: "top 50%", toggleActions: "play none none none" },
          }
        );
      });

      // Pipeline cards stagger
      gsap.fromTo("[data-pipeline-card]",
        { opacity: 0, y: 40, scale: 0.97 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.12, ease: "power3.out",
          scrollTrigger: { trigger: "[data-pipeline]", start: "top 75%", toggleActions: "play none none none" },
        }
      );

      // Stats counter animation
      gsap.fromTo("[data-stat]",
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out",
          scrollTrigger: { trigger: "[data-stats]", start: "top 80%", toggleActions: "play none none none" },
        }
      );

      // Product preview parallax
      gsap.fromTo("[data-preview]",
        { y: 60 },
        {
          y: -30,
          scrollTrigger: { trigger: "[data-preview]", start: "top bottom", end: "bottom top", scrub: 1 },
        }
      );

    }, mainRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={mainRef} className="bg-[#08080a] text-[#e8e8e6] font-sans overflow-x-hidden">

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 md:px-12 h-16 bg-[#08080a]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <span className="text-lg font-semibold tracking-tight">Helix</span>
        <div className="flex items-center gap-6">
          <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-[#777] hover:text-white transition-colors">
            <ExternalLink size={14} /> GitHub
          </a>
          <Link href="/analyze"
            className="text-sm font-medium px-5 py-2 rounded-full bg-white text-[#08080a] hover:bg-[#ddd] transition-colors">
            Open IDE
          </Link>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 pt-16 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full bg-[#5bb5a2]/[0.04] blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-4xl text-center">
          <div data-hero-badge className="opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 text-[13px] text-[#999] mb-10">
            <span className="w-2 h-2 rounded-full bg-[#5bb5a2] animate-pulse" />
            Powered by Evo 2
          </div>

          <h1 data-hero-title className="text-[clamp(2.5rem,6vw,5.5rem)] font-bold tracking-tight leading-[1.05] mb-8">
            <span className="block opacity-0">Co-design genomes</span>
            <span className="block opacity-0">with an IDE that</span>
            <span className="block opacity-0 text-[#5bb5a2]">thinks out loud.</span>
          </h1>

          <p data-hero-desc className="opacity-0 text-lg md:text-xl text-[#777] max-w-2xl mx-auto mb-10 leading-relaxed">
            Paste a sequence. Watch Evo 2 annotate, score, and fold it in real time.
            Click any base pair and get instant feedback. This is what genomic design should feel like.
          </p>

          <div data-hero-cta className="opacity-0 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/analyze"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white text-[#08080a] text-[15px] font-medium hover:bg-[#ddd] transition-all hover:scale-[1.02]">
              Get started <ArrowRight size={18} />
            </Link>
            <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full border border-white/15 text-[15px] font-medium text-[#999] hover:text-white hover:border-white/30 transition-all">
              View source
            </a>
          </div>
        </div>
      </section>

      {/* ═══ PRODUCT PREVIEW ═══ */}
      <section className="px-8 md:px-16 pb-40 -mt-10">
        <div data-preview className="max-w-5xl mx-auto">
          <div className="rounded-3xl overflow-hidden border border-white/[0.08] bg-[#111114] shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]/60" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]/60" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]/60" />
              </div>
              <span className="flex-1 text-center text-xs text-[#555] font-mono">helix / BRCA1_analysis.seq</span>
            </div>
            <div className="p-8">
              <div className="font-mono text-[15px] leading-7 mb-6">
                <div className="flex gap-5">
                  <span className="text-sm text-[#333] w-8 text-right select-none tabular-nums">1</span>
                  <span>{SEQUENCE.split("").map((b, i) => <span key={i} style={{ color: BASE_COLORS[b] }}>{b}</span>)}</span>
                </div>
              </div>
              <div className="flex gap-[2px] h-4 rounded-lg overflow-hidden mb-6">
                <div className="flex-[25] bg-[#7c6bc4]/50 rounded-l-md" />
                <div className="flex-[15] bg-[#444]/50" />
                <div className="flex-[35] bg-[#5bb5a2]/40" />
                <div className="flex-[25] bg-[#7c6bc4]/50 rounded-r-md" />
              </div>
              <div className="flex items-end gap-[2px] h-16">
                {Array.from({ length: 45 }, (_, i) => {
                  const h = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.7) * 0.3);
                  return <div key={i} className="flex-1 rounded-t bg-[#5bb5a2]" style={{ height: `${Math.max(h * 100, 10)}%`, opacity: 0.25 + h * 0.5 }} />;
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PROBLEM ═══ */}
      <section className="py-32 px-8 md:px-16 bg-[#0c0c0f]">
        <div data-reveal className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
          <div>
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1] mb-8">
              Sequencing isn't the bottleneck anymore.
              <span className="text-[#5bb5a2]"> Design is.</span>
            </h2>
          </div>
          <div className="space-y-6 text-[#999] text-lg leading-relaxed pt-2">
            <p>Drug discovery costs $2.6 billion and takes 5 to 10 years. The sequence design phase alone takes weeks of command-line scripts and manual validation.</p>
            <p>Whole genome sequencing costs under $200 today. It will cost under $50 within three years. The bottleneck has shifted from reading DNA to writing it intelligently.</p>
            <p className="text-white font-medium">Helix is the interface layer genomic design has been missing.</p>
          </div>
        </div>
      </section>

      {/* ═══ PIPELINE ═══ */}
      <section className="py-32 px-8 md:px-16" data-pipeline>
        <div className="max-w-5xl mx-auto">
          <div data-reveal className="mb-16">
            <p className="text-sm text-[#5bb5a2] font-medium tracking-wide uppercase mb-4">How it works</p>
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1]">
              A pipeline that thinks out loud.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PIPELINE_STEPS.map(({ num, title, desc }) => (
              <div key={num} data-pipeline-card
                className="opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 group">
                <span className="text-xs text-[#5bb5a2] font-mono font-medium">{num}</span>
                <h3 className="text-xl font-semibold mt-3 mb-3 group-hover:text-[#5bb5a2] transition-colors">{title}</h3>
                <p className="text-[15px] text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ INTERACTION ═══ */}
      <section className="py-32 px-8 md:px-16 bg-[#0c0c0f]">
        <div className="max-w-5xl mx-auto">
          <div data-reveal className="max-w-2xl mb-16">
            <p className="text-sm text-[#5bb5a2] font-medium tracking-wide uppercase mb-4">Not a black box</p>
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1] mb-6">
              Click any base. Get instant feedback.
            </h2>
            <p className="text-lg text-[#888] leading-relaxed">
              Edit a base pair and the model re-scores in under two seconds. Type a follow-up in natural language and only the affected pipeline steps re-run. Every edit, score, and fold is versioned.
            </p>
          </div>
          <div data-reveal className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Instant re-scoring", desc: "Change one base. See the functional impact immediately. No full pipeline re-run." },
              { title: "Natural language iteration", desc: "\"Make this more tissue-specific.\" The model adjusts only what needs to change." },
              { title: "Versioned experiments", desc: "Every edit is saved. Compare any two versions side by side with a diff view." },
            ].map(({ title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-[#111114] border border-white/[0.06]">
                <h4 className="text-base font-semibold mb-2">{title}</h4>
                <p className="text-sm text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="py-32 px-8 md:px-16" data-stats>
        <div className="max-w-5xl mx-auto text-center">
          <div data-reveal className="mb-16">
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight">Built on Evo 2.</h2>
            <p className="text-lg text-[#888] mt-4 max-w-lg mx-auto">The most capable genomic foundation model ever trained. Published in Nature, March 2026.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(({ value, label }) => (
              <div key={label} data-stat className="opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06]">
                <div className="text-4xl md:text-5xl font-bold tracking-tight text-[#5bb5a2] mb-2">{value}</div>
                <div className="text-sm text-[#888]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-40 px-8 md:px-16 bg-[#0c0c0f]">
        <div data-reveal className="max-w-4xl mx-auto text-center">
          <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold tracking-tight leading-[1.1] mb-8">
            From weeks of manual work to minutes of interactive exploration.
          </h2>
          <p className="text-xl text-[#888] mb-12 max-w-xl mx-auto">
            Open the IDE and paste your first sequence.
          </p>
          <Link href="/analyze"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-[#5bb5a2] text-[#08080a] text-base font-semibold hover:bg-[#6dc4b2] transition-all hover:scale-[1.02]">
            Open Helix IDE <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-12 px-8 md:px-12 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold">Helix</span>
            <span className="text-xs text-[#555]">YHack 2026</span>
          </div>
          <div className="flex gap-8 text-sm text-[#666]">
            <Link href="/analyze" className="hover:text-white transition-colors">IDE</Link>
            <a href="https://github.com/Dawgsrlife/Helix" className="hover:text-white transition-colors">GitHub</a>
            <span>Alex / Vishnu / Henry</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
