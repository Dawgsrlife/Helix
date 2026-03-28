"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

const SEQUENCE_LINE = "ATGGCTAGCATCGATCGATCGATCGTAGCTAGCTAGCTAGCATCGATCG";

const BASE_COLORS: Record<string, string> = {
  A: "var(--base-a)",
  T: "var(--base-t)",
  C: "var(--base-c)",
  G: "var(--base-g)",
};

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!heroRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        "[data-wordmark]",
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.5 }
      )
        .fromTo(
          "[data-headline]",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.7 },
          "-=0.2"
        )
        .fromTo(
          "[data-subtext]",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.6 },
          "-=0.3"
        )
        .fromTo(
          "[data-cta]",
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5 },
          "-=0.2"
        )
        .fromTo(
          "[data-preview]",
          { opacity: 0, y: 24, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.8 },
          "-=0.1"
        );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={heroRef}
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-void)" }}
    >
      {/* Nav */}
      <nav
        data-wordmark
        style={{ opacity: 0 }}
        className="flex items-center justify-between px-8 py-5"
      >
        <span
          className="text-sm tracking-[-0.04em] font-bold uppercase"
          style={{ color: "var(--text-primary)" }}
        >
          Helix
        </span>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/Dawgsrlife/Helix"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] hover:opacity-80 transition-opacity"
            style={{ color: "var(--text-muted)" }}
          >
            GitHub
          </a>
          <Link
            href="/analyze"
            className="text-[13px] px-4 py-1.5 rounded-md transition-opacity hover:opacity-90"
            style={{
              background: "var(--text-primary)",
              color: "var(--surface-void)",
            }}
          >
            Open IDE
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-start justify-center px-8 md:px-16 lg:px-24 max-w-5xl">
        <div className="py-24 md:py-32">
          <h1
            data-headline
            style={{ opacity: 0, color: "var(--text-primary)" }}
            className="text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-6"
          >
            Design DNA
            <br />
            the way you write
            <br />
            software.
          </h1>

          <p
            data-subtext
            style={{ opacity: 0, color: "var(--text-secondary)" }}
            className="text-[17px] leading-relaxed max-w-[480px] mb-10"
          >
            Helix pairs Evo 2 with AlphaFold to give researchers a workspace
            for sequence design, annotation, and structural analysis.
          </p>

          <div data-cta style={{ opacity: 0 }} className="flex items-center gap-4">
            <Link
              href="/analyze"
              className="px-6 py-2.5 rounded-md text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{
                background: "var(--text-primary)",
                color: "var(--surface-void)",
              }}
            >
              Get started
            </Link>
            <a
              href="https://github.com/Dawgsrlife/Helix"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 rounded-md text-[14px] font-medium transition-opacity hover:opacity-80"
              style={{
                color: "var(--text-muted)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              GitHub
            </a>
          </div>
        </div>
      </main>

      {/* Product preview */}
      <section data-preview style={{ opacity: 0 }} className="px-8 md:px-16 lg:px-24 pb-24">
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--surface-base)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Mock IDE header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ background: "var(--surface-raised)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] font-bold tracking-[-0.04em] uppercase"
                style={{ color: "var(--text-primary)" }}
              >
                Helix
              </span>
              <span style={{ color: "var(--text-faint)" }} className="text-[11px]">
                /
              </span>
              <span
                className="text-[11px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                h_sapiens_BRCA1.seq
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-[6px] h-[6px] rounded-full"
                style={{ background: "var(--accent)", animation: "pulse-soft 2s ease-in-out infinite" }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Evo 2 ready
              </span>
            </div>
          </div>

          {/* Mock sequence content */}
          <div className="px-5 py-6">
            {/* Sequence line */}
            <div className="font-mono text-[13px] leading-[22px] mb-4">
              <div className="flex gap-4">
                <span
                  className="text-[11px] w-10 text-right shrink-0 tabular-nums select-none"
                  style={{ color: "var(--text-faint)" }}
                >
                  1
                </span>
                <span>
                  {SEQUENCE_LINE.split("").map((base, i) => (
                    <span key={i} style={{ color: BASE_COLORS[base] ?? "var(--text-muted)" }}>
                      {base}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Annotation bar */}
            <div
              className="h-4 rounded-sm flex overflow-hidden mb-4"
              style={{ background: "var(--surface-raised)" }}
            >
              <div style={{ width: "25%", background: "var(--annotation-exon)", opacity: 0.5 }} />
              <div style={{ width: "15%", background: "var(--annotation-intron)", opacity: 0.5 }} />
              <div style={{ width: "35%", background: "var(--annotation-orf)", opacity: 0.4 }} />
              <div style={{ width: "25%", background: "var(--annotation-exon)", opacity: 0.5 }} />
            </div>

            {/* Likelihood bars */}
            <div className="flex items-end gap-[2px] h-16">
              {Array.from({ length: 48 }, (_, i) => {
                const h = Math.abs(Math.sin(i * 0.3) * 0.7 + Math.sin(i * 0.7) * 0.3);
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(h * 100, 8)}%`,
                      background: "var(--accent)",
                      opacity: 0.4 + h * 0.4,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <p
          className="text-[12px] mt-6 text-center"
          style={{ color: "var(--text-faint)" }}
        >
          Evo 2 &middot; 40B parameters &middot; 9 trillion base pairs &middot; All domains of life
        </p>
      </section>
    </div>
  );
}
