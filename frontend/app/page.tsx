"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight } from "lucide-react";
import HelixLogo from "@/components/brand/HelixLogo";

gsap.registerPlugin(ScrollTrigger);

export default function Home() {
  const main = useRef<HTMLDivElement>(null);

  // Force dark mode on landing page
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  useGSAP(() => {

    // ── HERO INTRO (on load, not scroll) ──
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .fromTo(".h-tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 })
      .fromTo(".h-line", { opacity: 0, y: 35 }, { opacity: 1, y: 0, stagger: 0.15, duration: 0.8 }, "-=0.2")
      .fromTo(".h-sub", { opacity: 0 }, { opacity: 1, duration: 0.5 }, "-=0.3")
      .fromTo(".h-actions > *", { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.4 }, "-=0.2");

    // ── HERO SCROLL: text fades, bg image scales and sharpens ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-hero", start: "top top", end: "+=1200", pin: true, scrub: 0.8 },
    })
      .to(".hero-text-layer", { opacity: 0, y: -60, duration: 0.4 }, 0)
      .to(".hero-bg-img", { scale: 1.12, filter: "blur(0px) brightness(0.6)", duration: 0.6 }, 0)
      .to(".hero-overlay", { opacity: 0.3, duration: 0.6 }, 0);

    // ── EDIT SCENE (HALVED) ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-edit", start: "top top", end: "+=1200", pin: true, scrub: 0.8 },
    })
      .fromTo(".edit-img", { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.5 })
      .fromTo(".edit-text > *", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.3 }, "-=0.2");

    // ── SCORING: label + image reveal ──
    const scoreTl = gsap.timeline({
      scrollTrigger: { trigger: ".scene-score", start: "top top", end: "+=1200", pin: true, scrub: 0.8 },
    });
    scoreTl.fromTo(".score-label", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.2 });
    scoreTl.fromTo(".score-hero", { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }, "+=0.05");

    // ── STRUCTURE (HALVED) ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-struct", start: "top top", end: "+=1100", pin: true, scrub: 0.8 },
    })
      .fromTo(".struct-img", { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 0.5 })
      .fromTo(".struct-text > *", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.3 }, "-=0.2");

    // ── IMPACT (HALVED) ──
    gsap.timeline({
      scrollTrigger: { trigger: ".scene-impact", start: "top top", end: "+=900", pin: true, scrub: 0.8 },
    })
      .fromTo(".impact-line", { opacity: 0, y: 40 }, { opacity: 1, y: 0, stagger: 0.15, duration: 0.4 });

    // ── CTA ──
    gsap.fromTo(".cta-inner",
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, scrollTrigger: { trigger: ".scene-cta", start: "top 70%", end: "top 45%", scrub: 0.8 } }
    );

  }, { scope: main });

  return (
    <div ref={main} className="overflow-x-hidden font-sans"
      style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>

      {/* Grain texture overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")" }} />

      {/* ── NAV ── */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-8 md:px-12 h-14"
        style={{ background: "rgba(15,15,15,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <HelixLogo size="sm" />
        <Link href="/analyze" className="text-[13px] font-medium px-5 py-2 rounded-full transition-colors"
          style={{ background: "var(--text-primary)", color: "var(--surface-base)" }}>
          Open IDE
        </Link>
      </nav>

      {/* ═══ SCENE 1: HERO ═══ */}
      <section className="scene-hero min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* Background image (full-bleed, blurred for contrast) */}
        <div className="absolute inset-0 z-0">
          <Image src="/assets/hero-editor.jpg" alt="" width={1920} height={1080} priority
            className="hero-bg-img w-full h-full object-cover"
            style={{ filter: "blur(8px) brightness(0.35)", transform: "scale(1.05)" }} />
          <div className="hero-overlay absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,10,12,0.7) 0%, rgba(10,10,12,0.85) 50%, rgba(10,10,12,0.95) 100%)" }} />
        </div>

        {/* Floating particles (subtle ATCG) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {["A", "T", "C", "G", "A", "T", "G", "C", "A", "G"].map((b, i) => (
            <span key={i} className="absolute font-mono text-xl select-none"
              style={{
                left: `${8 + i * 9}%`,
                color: b === "A" ? "var(--base-a)" : b === "T" ? "var(--base-t)" : b === "C" ? "var(--base-c)" : "var(--base-g)",
                opacity: 0.06 + (i % 3) * 0.03,
                animation: `float-particle ${18 + i * 2}s linear infinite`,
                animationDelay: `${i * 1.5}s`,
                top: "100%",
              }} />
          ))}
        </div>

        {/* Text layer (z-30, fades on scroll) */}
        <div className="hero-text-layer relative z-30 text-center max-w-4xl">
          <p className="h-tag opacity-0 text-[13px] font-medium tracking-widest uppercase mb-8"
            style={{ color: "var(--accent)" }}>
            Evo 2 / 40B parameters / 9T base pairs
          </p>
          <h1 className="text-[clamp(2.4rem,5.5vw,4.8rem)] font-bold tracking-tight leading-[1.06] mb-6">
            <span className="h-line block opacity-0">Co-design genomes with</span>
            <span className="h-line block opacity-0">an IDE that{" "}
              <em className="not-italic" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "var(--accent)" }}>
                thinks out loud
              </em>
            </span>
          </h1>
          <p className="h-sub opacity-0 text-[17px] max-w-xl mx-auto leading-relaxed mb-10"
            style={{ color: "var(--text-secondary)" }}>
            Paste a sequence. Watch Evo 2 annotate, score, and fold it in real time. Click any base for instant feedback.
          </p>
          <div className="h-actions flex gap-3 justify-center">
            <Link href="/analyze" className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium hover:scale-[1.02] transition-transform"
              style={{ background: "var(--text-primary)", color: "var(--surface-base)" }}>
              Get started <ArrowRight size={16} />
            </Link>
            <a href="https://github.com/Dawgsrlife/Helix" target="_blank" rel="noopener noreferrer"
              className="opacity-0 inline-flex items-center gap-2 px-7 py-3 rounded-full border text-sm transition-all hover:border-white/25"
              style={{ borderColor: "rgba(255,255,255,0.20)", color: "var(--text-secondary)" }}>
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ═══ SCENE 2: EDITABLE BIOLOGY ═══ */}
      <section className="scene-edit min-h-screen flex items-center px-6 md:px-16"
        style={{ background: "var(--surface-raised)" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="edit-img opacity-0">
            <Image src="/assets/edit-closeup.png" alt="Base pair editing" width={1280} height={720}
              className="w-full h-auto rounded-2xl"
              style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.06) inset" }} />
          </div>
          <div className="edit-text flex flex-col gap-5">
            <p className="opacity-0 text-sm font-medium tracking-widest uppercase" style={{ color: "var(--accent)" }}>Editable biology</p>
            <h2 className="opacity-0 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight leading-[1.12]">
              Click any base.{" "}
              <span style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "var(--text-secondary)" }}>
                See the consequence.
              </span>
            </h2>
            <p className="opacity-0 text-[16px] leading-relaxed max-w-md" style={{ color: "var(--text-secondary)" }}>
              Edit T to G at position 121,452,891. Affinity, stability, and variant impact re-score in under two seconds. Every edit is versioned.
            </p>
            <div className="opacity-0 flex flex-wrap gap-3">
              {["Realtime scoring", "Partial re-runs", "Version history"].map((t) => (
                <span key={t} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SCENE 3: SCORING CONSOLE ═══ */}
      <section className="scene-score min-h-screen flex items-center justify-center px-6 md:px-16"
        style={{ background: "var(--surface-base)" }}>
        <div className="max-w-5xl mx-auto w-full">
          <div className="score-label text-center mb-12">
            <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: "var(--accent)" }}>
              Multi-dimensional scoring
            </p>
            <p className="text-[15px] max-w-md mx-auto" style={{ color: "var(--text-faint)" }}>
              Every candidate evaluated across four orthogonal dimensions.
            </p>
          </div>
          <div className="score-hero">
            <Image
              src="/assets/scoring-preview.png"
              alt="Helix multi-dimensional scoring: functional, tissue, off-target, novelty"
              width={1920}
              height={1080}
              className="w-full h-auto rounded-2xl"
              style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.06) inset" }}
            />
          </div>
        </div>
      </section>

      {/* ═══ SCENE 4: STRUCTURE ═══ */}
      <section className="scene-struct min-h-screen flex items-center px-6 md:px-16"
        style={{ background: "var(--surface-raised)" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="struct-text flex flex-col gap-5 order-2 lg:order-1">
            <p className="opacity-0 text-sm font-medium tracking-widest uppercase" style={{ color: "var(--accent)" }}>Structure prediction</p>
            <h2 className="opacity-0 text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight leading-[1.12]">
              From sequence to{" "}
              <em className="not-italic" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "var(--text-secondary)" }}>structure</em>
            </h2>
            <p className="opacity-0 text-[16px] leading-relaxed max-w-md" style={{ color: "var(--text-secondary)" }}>
              AlphaFold 3 folds top candidates into 3D protein structures with per-residue confidence. Rendered in-browser. ColabFold local fallback when rate-limited.
            </p>
          </div>
          <div className="struct-img opacity-0 order-1 lg:order-2">
            <Image src="/assets/structure-fold.png" alt="Protein structure" width={1280} height={720}
              className="w-full h-auto rounded-2xl"
              style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.06) inset" }} />
          </div>
        </div>
      </section>

      {/* ═══ SCENE 5: IMPACT ═══ */}
      <section className="scene-impact min-h-screen flex items-center justify-center px-6"
        style={{ background: "var(--surface-base)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-tight leading-[1.06]">
            <span className="impact-line block opacity-0">From weeks of work</span>
            <span className="impact-line block opacity-0" style={{ fontFamily: "var(--font-display), serif", fontStyle: "italic", color: "var(--accent)" }}>to minutes.</span>
          </h2>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="scene-cta py-32 px-6" style={{ background: "var(--surface-raised)" }}>
        <div className="cta-inner opacity-0 max-w-2xl mx-auto text-center">
          <h2 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-bold tracking-tight leading-[1.15] mb-8">
            The interface layer genomic design has been missing.
          </h2>
          <Link href="/analyze" className="inline-flex items-center gap-2 px-9 py-3.5 rounded-full text-[15px] font-semibold transition-all hover:scale-[1.02]"
            style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
            Open Helix IDE <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 px-8" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-5xl mx-auto flex justify-between items-center text-sm" style={{ color: "var(--text-muted)" }}>
          <HelixLogo variant="wordmark" size="sm" className="text-[var(--text-primary)]" />
          <span>Genomic Design IDE</span>
        </div>
      </footer>

      {/* Particle animation keyframes */}
      <style>{`
        @keyframes float-particle {
          0% { transform: translateY(0); opacity: 0; }
          5% { opacity: 0.08; }
          95% { opacity: 0.08; }
          100% { transform: translateY(-110vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
