"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const SEQ = "ATGGCTAGCATCGATCGATCGTAGCTAGCTAGCATCGATCGATCGATCGTAGCATCG";
const BC: Record<string, string> = { A: "#6bbd7a", T: "#d47a7a", C: "#6b9fd4", G: "#c9a855" };

export default function Home() {
  const main = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Hero intro
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .fromTo(".h-badge", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 })
      .fromTo(".h-title span", { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.15, duration: 0.8 }, "-=0.3")
      .fromTo(".h-sub", { opacity: 0 }, { opacity: 1, duration: 0.6 }, "-=0.3")
      .fromTo(".h-cta > *", { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 }, "-=0.2")
      .fromTo(".frame", { opacity: 0, scale: 0.9, y: 40 }, { opacity: 1, scale: 0.9, y: 0, duration: 0.8 }, "-=0.4");

    // ═══ MASTER SCENE: Hero -> Zoom into product ═══
    // The frame scales from 0.9 to 1, text fades out, frame fills the view
    const zoomTl = gsap.timeline({
      scrollTrigger: { trigger: ".scene-zoom", start: "top top", end: "+=2000", pin: true, scrub: 1 },
    });
    zoomTl
      .to(".h-title", { opacity: 0, y: -40, duration: 0.3 })
      .to(".h-sub", { opacity: 0, duration: 0.2 }, "<")
      .to(".h-cta", { opacity: 0, y: -20, duration: 0.2 }, "<")
      .to(".h-badge", { opacity: 0, duration: 0.2 }, "<")
      .to(".frame", { scale: 1, y: -60, duration: 0.8 }, "<0.1")
      // Sequence characters appear inside the frame
      .fromTo(".seq-char", { opacity: 0 }, { opacity: 1, stagger: 0.01, duration: 0.02 }, "-=0.3")
      .fromTo(".frame-annotation", { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.4, transformOrigin: "left center" }, "-=0.2")
      .fromTo(".frame-bars > div", { scaleY: 0 }, { scaleY: 1, stagger: 0.005, duration: 0.02, transformOrigin: "bottom" }, "-=0.3")
      .fromTo(".zoom-caption", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, "-=0.1");

    // ═══ SCENE: Scoring emerges from the product ═══
    const scoreTl = gsap.timeline({
      scrollTrigger: { trigger: ".scene-score", start: "top top", end: "+=2500", pin: true, scrub: 1 },
    });
    scoreTl
      // Frame shifts left
      .to(".score-frame", { x: "-18%", duration: 0.5 })
      .fromTo(".score-caption", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, "-=0.2")
      // Metrics emerge one at a time from the right edge
      .fromTo(".metric-0", { opacity: 0, x: 60, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 })
      .fromTo(".metric-1", { opacity: 0, x: 60, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 })
      .fromTo(".metric-2", { opacity: 0, x: 60, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 })
      .fromTo(".metric-3", { opacity: 0, x: 60, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 });

    // ═══ SCENE: Editable base ═══
    const editTl = gsap.timeline({
      scrollTrigger: { trigger: ".scene-edit", start: "top top", end: "+=1800", pin: true, scrub: 1 },
    });
    editTl
      .fromTo(".edit-focus", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5 })
      .fromTo(".edit-highlight", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4 }, "-=0.2")
      .fromTo(".edit-delta", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.4 })
      .fromTo(".edit-text", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 });

    // ═══ SCENE: Impact pull-back ═══
    const impactTl = gsap.timeline({
      scrollTrigger: { trigger: ".scene-impact", start: "top top", end: "+=1500", pin: true, scrub: 1 },
    });
    impactTl
      .fromTo(".impact-title span", { opacity: 0, y: 50 }, { opacity: 1, y: 0, stagger: 0.2, duration: 0.6 })
      .fromTo(".impact-stats > div", { opacity: 0, y: 30, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, stagger: 0.15, duration: 0.4 }, "-=0.2");

    // ═══ CTA fade in ═══
    gsap.fromTo(".scene-cta-inner",
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, scrollTrigger: { trigger: ".scene-cta", start: "top 60%", end: "top 30%", scrub: 1 } }
    );

  }, { scope: main });

  const metrics = [
    { label: "Functional", value: "94%", color: "#5bb5a2" },
    { label: "Tissue specificity", value: "82%", color: "#6b9fd4" },
    { label: "Off-target risk", value: "0.04%", color: "#d47a7a" },
    { label: "Novelty", value: "67%", color: "#c9a855" },
  ];

  return (
    <div ref={main} className="bg-[#08080a] text-[#e8e8e6] font-sans overflow-x-hidden">
      {/* NAV */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 md:px-12 h-14 bg-[#08080a]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <span className="text-lg font-semibold tracking-tight">Helix</span>
        <Link href="/analyze" className="text-sm font-medium px-5 py-2 rounded-full bg-white text-[#08080a] hover:bg-[#ddd] transition-colors">
          Open IDE
        </Link>
      </nav>

      {/* ═══ SCENE 1+2: HERO → ZOOM INTO PRODUCT ═══ */}
      <section className="scene-zoom min-h-screen flex flex-col items-center justify-center px-6 pt-14 relative">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full bg-[#5bb5a2]/[0.03] blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center">
          {/* Text layer (fades out on scroll) */}
          <div className="h-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 text-[13px] text-[#888] mb-8">
            <span className="w-2 h-2 rounded-full bg-[#5bb5a2] animate-pulse" /> Powered by Evo 2
          </div>
          <h1 className="h-title text-center text-[clamp(2.2rem,5.5vw,4.5rem)] font-bold tracking-tight leading-[1.08] mb-6">
            <span className="block opacity-0">Co-design genomes with</span>
            <span className="block opacity-0">an IDE that <span className="text-[#5bb5a2]">thinks out loud</span></span>
          </h1>
          <p className="h-sub opacity-0 text-center text-lg text-[#777] max-w-xl mb-8 leading-relaxed">
            Paste a sequence. Watch Evo 2 annotate, score, and fold in real time. Click any base for instant feedback.
          </p>
          <div className="h-cta flex gap-3 mb-12">
            <Link href="/analyze" className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-white text-[#08080a] text-sm font-medium hover:scale-[1.03] transition-transform">
              Get started <ArrowRight size={16} />
            </Link>
            <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
              className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full border border-white/15 text-sm text-[#888] hover:text-white hover:border-white/25 transition-all">
              GitHub
            </a>
          </div>

          {/* THE PROTAGONIST: Product frame */}
          <div className="frame opacity-0 w-full rounded-2xl overflow-hidden border border-white/[0.08] bg-[#111114] shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
            {/* Chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/50" />
              </div>
              <span className="flex-1 text-center text-[11px] text-[#444] font-mono">helix / BRCA1_analysis.seq</span>
            </div>
            {/* Sequence content (revealed on scroll) */}
            <div className="p-6 min-h-[200px]">
              <div className="font-mono text-[14px] leading-7 mb-4 flex gap-4">
                <span className="text-[11px] text-[#333] w-6 text-right select-none tabular-nums">1</span>
                <span className="flex flex-wrap">
                  {SEQ.split("").map((b, i) => (
                    <span key={i} className="seq-char opacity-0" style={{ color: BC[b] }}>{b}</span>
                  ))}
                </span>
              </div>
              {/* Annotation bar */}
              <div className="frame-annotation opacity-0 flex gap-[2px] h-3 rounded-md overflow-hidden mb-4 origin-left">
                <div className="flex-[25] bg-[#7c6bc4]/50 rounded-l" />
                <div className="flex-[15] bg-[#444]/40" />
                <div className="flex-[35] bg-[#5bb5a2]/40" />
                <div className="flex-[25] bg-[#7c6bc4]/50 rounded-r" />
              </div>
              {/* Likelihood bars */}
              <div className="frame-bars flex items-end gap-[2px] h-14">
                {Array.from({ length: 56 }, (_, i) => {
                  const h = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.7) * 0.3);
                  return <div key={i} className="flex-1 rounded-t bg-[#5bb5a2] origin-bottom" style={{ height: `${Math.max(h * 100, 8)}%`, opacity: 0.2 + h * 0.5, transform: "scaleY(0)" }} />;
                })}
              </div>
              {/* Caption that appears after zoom */}
              <p className="zoom-caption opacity-0 text-center text-sm text-[#666] mt-6">
                Evo 2 generates candidate sequences token by token, streamed live to your browser
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SCENE 3: SCORING EMERGES FROM PRODUCT ═══ */}
      <section className="scene-score min-h-screen flex items-center px-6 md:px-12">
        <div className="w-full max-w-6xl mx-auto flex items-start gap-8">
          {/* Product frame (shifted left) */}
          <div className="score-frame flex-1 min-w-0">
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#111114]">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/50" />
                </div>
                <span className="flex-1 text-center text-[11px] text-[#444] font-mono">Candidate BDNF_reg_v4</span>
              </div>
              <div className="p-6">
                <div className="font-mono text-[13px] leading-6 text-[#666]">
                  {SEQ.slice(0, 40).split("").map((b, i) => (
                    <span key={i} style={{ color: BC[b], opacity: 0.7 }}>{b}</span>
                  ))}
                </div>
                <div className="flex gap-[2px] h-2 rounded overflow-hidden mt-3">
                  <div className="flex-[30] bg-[#5bb5a2]/40" />
                  <div className="flex-[20] bg-[#444]/30" />
                  <div className="flex-[50] bg-[#7c6bc4]/40" />
                </div>
              </div>
            </div>
          </div>

          {/* Scoring metrics (emerge from right) */}
          <div className="w-[280px] shrink-0 flex flex-col gap-3 pt-4">
            <p className="score-caption opacity-0 text-sm text-[#5bb5a2] font-medium tracking-wide uppercase mb-2">Scoring</p>
            {metrics.map((m, i) => (
              <div key={m.label} className={`metric-${i} opacity-0 p-5 rounded-xl bg-[#111114] border border-white/[0.06]`}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs text-[#888]">{m.label}</span>
                  <span className="text-2xl font-bold tracking-tight" style={{ color: m.color }}>{m.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a1d] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: m.value, background: m.color, opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 4: EDITABLE BASE ═══ */}
      <section className="scene-edit min-h-screen flex items-center justify-center px-6 bg-[#0a0a0d]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="edit-focus opacity-0">
            {/* Zoomed-in sequence row */}
            <div className="inline-flex items-center gap-1 font-mono text-[clamp(1.5rem,4vw,3rem)] leading-none mb-8 tracking-wider">
              {"ATCGAAT".split("").map((b, i) => (
                <span key={i} className={i === 3 ? "edit-highlight opacity-0" : ""} style={{
                  color: i === 3 ? "#08080a" : BC[b],
                  background: i === 3 ? "#5bb5a2" : "transparent",
                  padding: i === 3 ? "4px 8px" : "4px 2px",
                  borderRadius: i === 3 ? "8px" : "0",
                  fontWeight: i === 3 ? 700 : 400,
                }}>{b}</span>
              ))}
              <span className="edit-delta opacity-0 ml-6 text-lg font-semibold text-[#d47a7a]">-4.82</span>
            </div>
          </div>
          <p className="edit-text opacity-0 text-2xl md:text-3xl font-semibold leading-snug max-w-lg mx-auto">
            Click any base. Change it.<br />
            <span className="text-[#777]">The model re-scores in under two seconds.</span>
          </p>
        </div>
      </section>

      {/* ═══ SCENE 5: IMPACT ═══ */}
      <section className="scene-impact min-h-screen flex items-center justify-center px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="impact-title text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-tight leading-[1.08] mb-16">
            <span className="block opacity-0">From weeks of work</span>
            <span className="block opacity-0 text-[#5bb5a2]">to minutes of exploration.</span>
          </h2>
          <div className="impact-stats grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Visible decisions", desc: "Every step the model takes is exposed, explained, and editable." },
              { title: "Editable AI", desc: "Click, adjust, re-score. The researcher stays in control." },
              { title: "Real-time collaboration", desc: "A live workspace. Not a pipeline with a pretty frontend." },
            ].map(({ title, desc }) => (
              <div key={title} className="opacity-0 p-8 rounded-2xl bg-[#111114] border border-white/[0.06] text-left">
                <h4 className="text-lg font-semibold mb-3">{title}</h4>
                <p className="text-[15px] text-[#888] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 6: CTA ═══ */}
      <section className="scene-cta py-40 px-6 bg-[#0a0a0d]">
        <div className="scene-cta-inner opacity-0 max-w-3xl mx-auto text-center">
          <p className="text-lg text-[#5bb5a2] font-medium mb-6">Built at YHack 2026</p>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-tight leading-[1.1] mb-10">
            The interface layer genomic design has been missing.
          </h2>
          <Link href="/analyze"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-[#5bb5a2] text-[#08080a] text-base font-semibold hover:bg-[#6dc4b2] transition-all hover:scale-[1.03]">
            Open Helix IDE <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 px-8 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-sm text-[#555]">
          <span className="font-semibold text-[#e8e8e6]">Helix</span>
          <span>Alex / Vishnu / Henry</span>
        </div>
      </footer>
    </div>
  );
}
