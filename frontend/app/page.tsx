"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, ExternalLink } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const SEQUENCE = "ATGGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCG";
const BASE_COLORS: Record<string, string> = { A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855" };

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // ── HERO INTRO ──
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTl
      .fromTo(".hero-badge", { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.8 })
      .fromTo(".hero-line", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.2 }, "-=0.4")
      .fromTo(".hero-desc", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.4")
      .fromTo(".hero-cta", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 }, "-=0.3");

    // ── PRODUCT PREVIEW: scale up from small to full as you scroll ──
    gsap.fromTo(".preview-card",
      { scale: 0.85, opacity: 0.5, y: 80 },
      {
        scale: 1, opacity: 1, y: 0,
        scrollTrigger: { trigger: ".preview-section", start: "top 80%", end: "top 20%", scrub: 1 },
      }
    );

    // ── PROBLEM SECTION: pinned, text slides in from sides ──
    const problemTl = gsap.timeline({
      scrollTrigger: {
        trigger: ".problem-section",
        start: "top top",
        end: "+=1500",
        pin: true,
        scrub: 1,
      },
    });
    problemTl
      .fromTo(".problem-stat", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 1 })
      .fromTo(".problem-text-1", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 1 }, "-=0.5")
      .fromTo(".problem-text-2", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 1 }, "-=0.5")
      .fromTo(".problem-text-3", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1 }, "-=0.3")
      .to(".problem-stat", { scale: 1.05, duration: 0.5 })
      .to(".problem-stat", { scale: 1, duration: 0.5 });

    // ── PIPELINE: pinned horizontal scroll ──
    const cards = gsap.utils.toArray<HTMLElement>(".pipeline-card");
    const pipelineTl = gsap.timeline({
      scrollTrigger: {
        trigger: ".pipeline-section",
        start: "top top",
        end: `+=${cards.length * 600}`,
        pin: true,
        scrub: 1,
      },
    });
    cards.forEach((card, i) => {
      pipelineTl.fromTo(card,
        { opacity: 0, y: 80, rotateX: -10 },
        { opacity: 1, y: 0, rotateX: 0, duration: 1 },
        i * 0.8
      );
    });

    // ── INTERACTION: items fly in ──
    gsap.fromTo(".interact-card",
      { opacity: 0, y: 50, scale: 0.95 },
      {
        opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.15,
        scrollTrigger: { trigger: ".interact-section", start: "top 70%", toggleActions: "play none none none" },
      }
    );

    // ── STATS: pinned with numbers scaling in ──
    const statsTl = gsap.timeline({
      scrollTrigger: {
        trigger: ".stats-section",
        start: "top top",
        end: "+=1000",
        pin: true,
        scrub: 1,
      },
    });
    statsTl
      .fromTo(".stats-title", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1 })
      .fromTo(".stat-item",
        { opacity: 0, scale: 0.5, y: 30 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.2 },
        "-=0.5"
      );

    // ── CTA: scale up from tiny ──
    gsap.fromTo(".cta-content",
      { opacity: 0, scale: 0.9, y: 60 },
      {
        opacity: 1, scale: 1, y: 0,
        scrollTrigger: { trigger: ".cta-section", start: "top 70%", end: "top 30%", scrub: 1 },
      }
    );

  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="bg-[#08080a] text-[#e8e8e6] font-sans">

      {/* NAV */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 md:px-12 h-16 bg-[#08080a]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <span className="text-lg font-semibold tracking-tight">Helix</span>
        <div className="flex items-center gap-6">
          <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-[#777] hover:text-white transition-colors">
            <ExternalLink size={14} /> GitHub
          </a>
          <Link href="/analyze" className="text-sm font-medium px-5 py-2 rounded-full bg-white text-[#08080a] hover:bg-[#ddd] transition-colors">
            Open IDE
          </Link>
        </div>
      </nav>

      {/* ═══ SCENE 1: HERO ═══ */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 pt-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-[#5bb5a2]/[0.04] blur-[150px]" />
        </div>
        <div className="relative z-10 max-w-4xl text-center">
          <div className="hero-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 text-[13px] text-[#999] mb-10">
            <span className="w-2 h-2 rounded-full bg-[#5bb5a2] animate-pulse" /> Powered by Evo 2
          </div>
          <h1 className="text-[clamp(2.5rem,6vw,5.5rem)] font-bold tracking-tight leading-[1.05] mb-8">
            <span className="hero-line block opacity-0">Co-design genomes</span>
            <span className="hero-line block opacity-0">with an IDE that</span>
            <span className="hero-line block opacity-0 text-[#5bb5a2]">thinks out loud.</span>
          </h1>
          <p className="hero-desc opacity-0 text-lg md:text-xl text-[#777] max-w-2xl mx-auto mb-10 leading-relaxed">
            Paste a sequence. Watch Evo 2 annotate, score, and fold it in real time.
            Click any base pair and get instant feedback.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/analyze" className="hero-cta opacity-0 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white text-[#08080a] text-[15px] font-medium hover:scale-[1.03] transition-transform">
              Get started <ArrowRight size={18} />
            </Link>
            <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
              className="hero-cta opacity-0 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full border border-white/15 text-[15px] text-[#999] hover:text-white hover:border-white/30 transition-all">
              View source
            </a>
          </div>
        </div>
      </section>

      {/* ═══ SCENE 2: PRODUCT PREVIEW (scales up on scroll) ═══ */}
      <section className="preview-section px-8 md:px-16 pb-40">
        <div className="max-w-5xl mx-auto">
          <div className="preview-card rounded-3xl overflow-hidden border border-white/[0.08] bg-[#111114] shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
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

      {/* ═══ SCENE 3: PROBLEM (pinned, elements slide in from sides) ═══ */}
      <section className="problem-section min-h-screen flex items-center justify-center px-8 md:px-16 bg-[#0c0c0f]">
        <div className="max-w-5xl mx-auto text-center">
          <div className="problem-stat opacity-0 mb-12">
            <span className="text-[clamp(4rem,10vw,8rem)] font-bold tracking-tighter text-[#5bb5a2]">$2.6B</span>
            <p className="text-lg text-[#666] mt-2">Average cost to bring one drug to market</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-left">
            <div className="problem-text-1 opacity-0">
              <h3 className="text-2xl font-bold mb-4">5-10 years of development</h3>
              <p className="text-[#888] text-lg leading-relaxed">The sequence design phase alone takes weeks of command-line scripts, database queries, and manual validation before a single experiment runs.</p>
            </div>
            <div className="problem-text-2 opacity-0">
              <h3 className="text-2xl font-bold mb-4">Sequencing costs are plummeting</h3>
              <p className="text-[#888] text-lg leading-relaxed">Whole genome sequencing costs under $200 today. It will cost under $50 within three years. The bottleneck has shifted from reading DNA to writing it.</p>
            </div>
          </div>
          <p className="problem-text-3 opacity-0 text-2xl font-semibold mt-16 text-white">Helix is the interface layer genomic design has been missing.</p>
        </div>
      </section>

      {/* ═══ SCENE 4: PIPELINE (pinned, cards appear one by one) ═══ */}
      <section className="pipeline-section min-h-screen flex items-center px-8 md:px-16 py-20">
        <div className="max-w-5xl mx-auto w-full">
          <p className="text-sm text-[#5bb5a2] font-medium tracking-wide uppercase mb-4">How it works</p>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1] mb-16">A pipeline that thinks out loud.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ perspective: "1000px" }}>
            {[
              { num: "01", title: "Design Goal", desc: "Type what you need in plain English. Helix parses your intent into a structured biological specification.", tag: "Intent Parser" },
              { num: "02", title: "Evo 2 Generation", desc: "40 billion parameters trained on 9 trillion base pairs. Candidates stream live, base by base.", tag: "40B params" },
              { num: "03", title: "Multi-dimensional Scoring", desc: "Functional plausibility, tissue specificity, off-target risk, and novelty scored in real time.", tag: "4D scoring" },
              { num: "04", title: "AlphaFold Folding", desc: "Top candidates fold into 3D protein structures with per-residue confidence coloring.", tag: "AlphaFold 3" },
            ].map(({ num, title, desc, tag }) => (
              <div key={num} className="pipeline-card opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06] hover:border-[#5bb5a2]/30 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-[#5bb5a2] font-mono font-semibold">{num}</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#5bb5a2]/10 text-[#5bb5a2] font-medium">{tag}</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">{title}</h3>
                <p className="text-[15px] text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 5: INTERACTION ═══ */}
      <section className="interact-section py-32 px-8 md:px-16 bg-[#0c0c0f]">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-[#5bb5a2] font-medium tracking-wide uppercase mb-4">Not a black box</p>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1] mb-6 max-w-2xl">Click any base. Get instant feedback.</h2>
          <p className="text-lg text-[#888] leading-relaxed mb-16 max-w-xl">Every decision the model makes is visible, explainable, and editable. This is what separates an IDE from a pipeline.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Instant re-scoring", desc: "Change one base. See the functional impact in under two seconds. No full pipeline re-run needed." },
              { title: "Natural language iteration", desc: "\"Make this more tissue-specific.\" Only the affected pipeline steps re-run." },
              { title: "Versioned experiments", desc: "Every edit is saved. Compare any two versions side by side with a full diff view." },
            ].map(({ title, desc }) => (
              <div key={title} className="interact-card opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06] hover:border-white/[0.12] transition-colors">
                <h4 className="text-lg font-semibold mb-3">{title}</h4>
                <p className="text-[15px] text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 6: STATS (pinned, numbers scale in) ═══ */}
      <section className="stats-section min-h-screen flex items-center justify-center px-8 md:px-16">
        <div className="max-w-5xl mx-auto text-center w-full">
          <div className="stats-title opacity-0 mb-16">
            <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight">Built on Evo 2.</h2>
            <p className="text-lg text-[#888] mt-4 max-w-lg mx-auto">The most capable genomic foundation model. Published in Nature, March 2026.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "40B", label: "Parameters" },
              { value: "9T", label: "Base pairs trained" },
              { value: "1M", label: "Token context" },
              { value: "<2s", label: "Re-score latency" },
            ].map(({ value, label }) => (
              <div key={label} className="stat-item opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06]">
                <div className="text-4xl md:text-5xl font-bold tracking-tight text-[#5bb5a2] mb-2">{value}</div>
                <div className="text-sm text-[#888]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 7: CTA ═══ */}
      <section className="cta-section py-40 px-8 md:px-16 bg-[#0c0c0f]">
        <div className="cta-content opacity-0 max-w-4xl mx-auto text-center">
          <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold tracking-tight leading-[1.1] mb-8">
            From weeks of manual work to minutes of interactive exploration.
          </h2>
          <p className="text-xl text-[#888] mb-12 max-w-xl mx-auto">Open the IDE and paste your first sequence.</p>
          <Link href="/analyze" className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-[#5bb5a2] text-[#08080a] text-base font-semibold hover:bg-[#6dc4b2] transition-all hover:scale-[1.03]">
            Open Helix IDE <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
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
