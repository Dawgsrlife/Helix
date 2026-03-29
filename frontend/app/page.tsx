"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

export default function Home() {
  const main = useRef<HTMLDivElement>(null);

  useGSAP(() => {

    // ── HERO INTRO ──
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .fromTo(".h-tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 })
      .fromTo(".h-line", { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.18, duration: 0.9 }, "-=0.2")
      .fromTo(".h-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, "-=0.3")
      .fromTo(".h-actions > *", { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.5 }, "-=0.2");

    // ── SCENE: HERO IMAGE ZOOM ──
    // Product image scales up and becomes immersive
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-hero", start: "top top", end: "+=2400", pin: true, scrub: 1.2 },
    })
      .to(".hero-text-layer", { opacity: 0, y: -50, duration: 0.3 })
      .to(".hero-img", { scale: 1.15, y: -30, duration: 0.8 }, "<0.1")
      .fromTo(".hero-caption", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3 });

    // ── SCENE: EDIT CLOSE-UP ──
    // Asymmetric: image left, text right. Image slides in from left.
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-edit", start: "top top", end: "+=2000", pin: true, scrub: 1 },
    })
      .fromTo(".edit-img", { opacity: 0, x: -80, scale: 0.95 }, { opacity: 1, x: 0, scale: 1, duration: 0.6 })
      .fromTo(".edit-text > *", { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.15, duration: 0.4 }, "-=0.2");

    // ── SCENE: SCORING CONSOLE ──
    // One monolithic panel, rows highlight one at a time
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-score", start: "top top", end: "+=2200", pin: true, scrub: 1 },
    })
      .fromTo(".score-label", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 })
      .fromTo(".score-console", { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.5 })
      .to(".score-row-0", { backgroundColor: "rgba(91,181,162,0.08)", duration: 0.3 })
      .to(".score-row-0", { backgroundColor: "transparent", duration: 0.2 })
      .to(".score-row-1", { backgroundColor: "rgba(107,159,212,0.08)", duration: 0.3 })
      .to(".score-row-1", { backgroundColor: "transparent", duration: 0.2 })
      .to(".score-row-2", { backgroundColor: "rgba(212,122,122,0.08)", duration: 0.3 })
      .to(".score-row-2", { backgroundColor: "transparent", duration: 0.2 })
      .to(".score-row-3", { backgroundColor: "rgba(201,168,85,0.08)", duration: 0.3 });

    // ── SCENE: STRUCTURE ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-struct", start: "top top", end: "+=1800", pin: true, scrub: 1 },
    })
      .fromTo(".struct-img", { opacity: 0, scale: 0.92, rotateY: -5 }, { opacity: 1, scale: 1, rotateY: 0, duration: 0.7 })
      .fromTo(".struct-text > *", { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 }, "-=0.3");

    // ── SCENE: IMPACT ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-impact", start: "top top", end: "+=1400", pin: true, scrub: 1 },
    })
      .fromTo(".impact-line", { opacity: 0, y: 50 }, { opacity: 1, y: 0, stagger: 0.2, duration: 0.6 })
      .fromTo(".impact-cards > div", { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.4 });

    // ── CTA ──
    gsap.fromTo(".cta-inner",
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, scrollTrigger: { trigger: ".scene-cta", start: "top 65%", end: "top 35%", scrub: 1 } }
    );

  }, { scope: main });

  return (
    <div ref={main} className="bg-[#06060a] text-[#E8E6E3] font-sans overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 md:px-12 h-14 bg-[#06060a]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <span className="text-lg font-semibold tracking-tight">Helix</span>
        <Link href="/analyze" className="text-[13px] font-medium px-5 py-2 rounded-full bg-[#E8E6E3] text-[#06060a] hover:bg-white transition-colors">
          Open IDE
        </Link>
      </nav>

      {/* ═══ SCENE 1: HERO + PRODUCT IMAGE ZOOM ═══ */}
      <section className="scene-hero min-h-screen flex flex-col items-center justify-start pt-28 px-6 relative">
        {/* Text layer */}
        <div className="hero-text-layer relative z-10 text-center max-w-4xl mb-12">
          <p className="h-tag opacity-0 text-[13px] text-[#5bb5a2] font-medium tracking-widest uppercase mb-8">Evo 2 / 40 billion parameters / 9 trillion base pairs</p>
          <h1 className="text-[clamp(2.4rem,5.5vw,4.8rem)] font-bold tracking-tight leading-[1.06] mb-6">
            <span className="h-line block opacity-0">Co-design genomes with</span>
            <span className="h-line block opacity-0">an IDE that <em className="not-italic" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "#5bb5a2" }}>thinks out loud</em></span>
          </h1>
          <p className="h-sub opacity-0 text-[17px] text-[#8a8a8a] max-w-xl mx-auto leading-relaxed mb-8">
            Paste a sequence. Watch Evo 2 annotate, score, and fold it in real time. Click any base for instant feedback.
          </p>
          <div className="h-actions flex gap-3 justify-center">
            <Link href="/analyze" className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#E8E6E3] text-[#06060a] text-sm font-medium hover:bg-white hover:scale-[1.02] transition-all">
              Get started <ArrowRight size={16} />
            </Link>
            <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
              className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full border border-white/12 text-sm text-[#8a8a8a] hover:text-[#E8E6E3] hover:border-white/25 transition-all">
              GitHub
            </a>
          </div>
        </div>

        {/* Product image: the protagonist */}
        <div className="hero-img relative z-10 w-full max-w-4xl mx-auto" style={{ transformOrigin: "center top" }}>
          <Image src="/assets/hero-editor.png" alt="Helix Sequence Editor" width={1920} height={1080}
            className="w-full h-auto rounded-2xl shadow-[0_30px_100px_rgba(0,0,0,0.6)]" priority />
        </div>

        {/* Caption that appears after zoom */}
        <p className="hero-caption opacity-0 absolute bottom-16 text-center text-sm text-[#666] z-20 max-w-md">
          Evo 2 generates candidate sequences token by token, streamed live to the genome browser
        </p>
      </section>

      {/* ═══ SCENE 2: EDITABLE BIOLOGY (asymmetric: image left, text right) ═══ */}
      <section className="scene-edit min-h-screen flex items-center px-6 md:px-16 bg-[#09090d]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="edit-img opacity-0" style={{ perspective: "800px" }}>
            <Image src="/assets/edit-closeup.png" alt="Helix base pair editing" width={1280} height={720}
              className="w-full h-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
          </div>
          <div className="edit-text flex flex-col gap-6">
            <p className="opacity-0 text-sm text-[#5bb5a2] font-medium tracking-widest uppercase">Editable biology</p>
            <h2 className="opacity-0 text-[clamp(1.8rem,3.5vw,3rem)] font-bold tracking-tight leading-[1.1]">
              Click any base.<br />
              <span style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "#8a8a8a" }}>See the consequence instantly.</span>
            </h2>
            <p className="opacity-0 text-[16px] text-[#8a8a8a] leading-relaxed max-w-md">
              Edit T to G at position 121,452,891. The model re-scores affinity, stability, and variant impact in under two seconds. Every edit is versioned.
            </p>
            <div className="opacity-0 flex gap-4 text-sm text-[#666]">
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">Realtime scoring</span>
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">Partial re-runs</span>
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">Version history</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SCENE 3: SCORING CONSOLE (not cards, one monolithic panel) ═══ */}
      <section className="scene-score min-h-screen flex items-center justify-center px-6 md:px-16">
        <div className="max-w-4xl mx-auto w-full">
          <p className="score-label opacity-0 text-sm text-[#5bb5a2] font-medium tracking-widest uppercase mb-6 text-center">Multi-dimensional scoring</p>
          <div className="score-console opacity-0 rounded-2xl border border-white/[0.06] bg-[#0c0c10] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
            {/* Console header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <div>
                <span className="text-[15px] font-semibold">BDNF_reg_v4</span>
                <span className="text-xs text-[#555] ml-3 font-mono">Candidate #001</span>
              </div>
              <span className="text-xs font-mono text-[#5bb5a2]">Overall: 94.2</span>
            </div>
            {/* Scoring rows */}
            {[
              { cls: "score-row-0", name: "Functional plausibility", val: "94%", delta: "+2.1", color: "#5bb5a2", conf: "High", width: "94%" },
              { cls: "score-row-1", name: "Tissue specificity", val: "82%", delta: "+0.8", color: "#6b9fd4", conf: "Moderate", width: "82%" },
              { cls: "score-row-2", name: "Off-target risk", val: "0.04%", delta: "-0.01", color: "#d47a7a", conf: "Low risk", width: "4%" },
              { cls: "score-row-3", name: "Novelty index", val: "67%", delta: "+5.2", color: "#c9a855", conf: "Acceptable", width: "67%" },
            ].map((row) => (
              <div key={row.name} className={`${row.cls} flex items-center gap-6 px-6 py-5 border-b border-white/[0.03] transition-colors duration-300`}>
                <span className="text-sm text-[#888] w-44 shrink-0">{row.name}</span>
                <div className="flex-1">
                  <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: row.width, background: row.color, opacity: 0.6 }} />
                  </div>
                </div>
                <span className="text-lg font-semibold font-mono w-16 text-right" style={{ color: row.color }}>{row.val}</span>
                <span className="text-xs font-mono w-14 text-right" style={{ color: row.delta.startsWith("-") ? "#d47a7a" : "#5bb5a2" }}>{row.delta}</span>
                <span className="text-xs text-[#555] w-20 text-right">{row.conf}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-[#555] mt-6">Each dimension highlights as the model evaluates. Scroll to inspect.</p>
        </div>
      </section>

      {/* ═══ SCENE 4: STRUCTURE / FOLDING (image-led, spatial) ═══ */}
      <section className="scene-struct min-h-screen flex items-center px-6 md:px-16 bg-[#09090d]" style={{ perspective: "1000px" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="struct-text flex flex-col gap-6 order-2 lg:order-1">
            <p className="opacity-0 text-sm text-[#5bb5a2] font-medium tracking-widest uppercase">Structure prediction</p>
            <h2 className="opacity-0 text-[clamp(1.8rem,3.5vw,3rem)] font-bold tracking-tight leading-[1.1]">
              From sequence to <em className="not-italic" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "#8a8a8a" }}>structure</em>
            </h2>
            <p className="opacity-0 text-[16px] text-[#8a8a8a] leading-relaxed max-w-md">
              AlphaFold 3 folds top candidates into 3D protein structures with per-residue confidence scoring.
              Rendered in-browser with pLDDT coloring. ColabFold local fallback when API is rate-limited.
            </p>
          </div>
          <div className="struct-img opacity-0 order-1 lg:order-2">
            <Image src="/assets/structure-fold.png" alt="Helix protein structure prediction" width={1280} height={720}
              className="w-full h-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
          </div>
        </div>
      </section>

      {/* ═══ SCENE 5: IMPACT ═══ */}
      <section className="scene-impact min-h-screen flex items-center justify-center px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-tight leading-[1.06] mb-16">
            <span className="impact-line block opacity-0">From weeks of work</span>
            <span className="impact-line block opacity-0" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "#5bb5a2" }}>to minutes.</span>
          </h2>
          <div className="impact-cards grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
            {[
              { title: "Visible decisions", desc: "Every step the model takes is exposed, explained, and auditable by the researcher." },
              { title: "Editable AI", desc: "Click a base, type a follow-up. The model adjusts only what needs to change." },
              { title: "Designed for collaboration", desc: "A live workspace, not a batch pipeline. Real-time. Versioned. Replayable." },
            ].map(({ title, desc }) => (
              <div key={title} className="opacity-0 p-7 rounded-2xl bg-[#0c0c10] border border-white/[0.06]">
                <h4 className="text-[15px] font-semibold mb-2">{title}</h4>
                <p className="text-[14px] text-[#8a8a8a] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SCENE 6: CTA ═══ */}
      <section className="scene-cta py-40 px-6 bg-[#09090d]">
        <div className="cta-inner opacity-0 max-w-3xl mx-auto text-center">
          <p className="text-sm text-[#5bb5a2] font-medium tracking-widest uppercase mb-6">YHack 2026</p>
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-bold tracking-tight leading-[1.15] mb-10">
            The interface layer genomic design has been missing.
          </h2>
          <Link href="/analyze" className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-[#5bb5a2] text-[#06060a] text-[15px] font-semibold hover:bg-[#6dc4b2] transition-all hover:scale-[1.02]">
            Open Helix IDE <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-8 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-sm text-[#555]">
          <span className="font-semibold text-[#E8E6E3]">Helix</span>
          <span>Alex / Vishnu / Henry</span>
        </div>
      </footer>
    </div>
  );
}
