"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

const SEQUENCE_FRAGMENT = "ATGGCTAGCATCGATCGATCGATCGTAGCTAGCTAGCTAGCATCGATCGATCGATCGTAG";

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!heroRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.fromTo(
      heroRef.current.querySelector("[data-wordmark]"),
      { opacity: 0, y: -8 },
      { opacity: 1, y: 0, duration: 0.5 }
    )
      .fromTo(
        heroRef.current.querySelector("[data-headline]"),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.2"
      )
      .fromTo(
        heroRef.current.querySelector("[data-subtext]"),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.3"
      )
      .fromTo(
        heroRef.current.querySelector("[data-cta]"),
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5 },
        "-=0.2"
      )
      .fromTo(
        heroRef.current.querySelector("[data-preview]"),
        { opacity: 0, y: 30, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.8 },
        "-=0.1"
      );

    return () => {
      tl.kill();
    };
  }, []);

  // Typewriter for sequence ticker
  useEffect(() => {
    if (!seqRef.current) return;
    const chars = seqRef.current.querySelectorAll("[data-base]");
    gsap.fromTo(
      chars,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.05,
        stagger: 0.04,
        ease: "none",
        repeat: -1,
        repeatDelay: 2,
      }
    );
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
        className="opacity-0 flex items-center justify-between px-8 py-5"
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
            className="text-[13px] transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            GitHub
          </a>
          <Link
            href="/analyze"
            className="text-[13px] px-4 py-1.5 rounded-md transition-all"
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
            className="opacity-0 text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-[1.1] tracking-[-0.02em] mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            Design DNA
            <br />
            the way you write
            <br />
            software.
          </h1>

          <p
            data-subtext
            className="opacity-0 text-[17px] leading-relaxed max-w-[480px] mb-10"
            style={{ color: "var(--text-secondary)" }}
          >
            Helix pairs Evo 2 with AlphaFold to give researchers a workspace
            for sequence design, annotation, and structural analysis.
          </p>

          <div data-cta className="opacity-0 flex items-center gap-4">
            <Link
              href="/analyze"
              className="px-6 py-2.5 rounded-md text-[14px] font-medium transition-all hover:opacity-90"
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
              className="px-6 py-2.5 rounded-md text-[14px] font-medium transition-colors"
              style={{
                color: "var(--text-muted)",
                border: "1px solid var(--ghost-border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--text-faint)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--ghost-border)";
              }}
            >
              GitHub
            </a>
          </div>
        </div>
      </main>

      {/* Product preview */}
      <section data-preview className="opacity-0 px-8 md:px-16 lg:px-24 pb-24">
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--surface-base)",
            border: "1px solid var(--ghost-border)",
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
              <span
                className="text-[11px]"
                style={{ color: "var(--text-faint)" }}
              >
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
                className="w-[6px] h-[6px] rounded-full animate-pulse-soft"
                style={{ background: "var(--accent)" }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Evo 2 ready
              </span>
            </div>
          </div>

          {/* Mock sequence content */}
          <div className="px-5 py-6">
            <div ref={seqRef} className="font-mono text-[13px] leading-[22px] mb-4">
              <div className="flex gap-4">
                <span
                  className="text-[11px] w-10 text-right shrink-0 tabular-nums select-none"
                  style={{ color: "var(--text-faint)" }}
                >
                  1
                </span>
                <span>
                  {SEQUENCE_FRAGMENT.split("").map((base, i) => (
                    <span
                      key={i}
                      data-base
                      className="opacity-0"
                      style={{
                        color:
                          base === "A"
                            ? "var(--base-a)"
                            : base === "T"
                              ? "var(--base-t)"
                              : base === "C"
                                ? "var(--base-c)"
                                : "var(--base-g)",
                      }}
                    >
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
              <div
                className="h-full"
                style={{ width: "25%", background: "var(--annotation-exon)", opacity: 0.5 }}
              />
              <div
                className="h-full"
                style={{ width: "15%", background: "var(--annotation-intron)", opacity: 0.5 }}
              />
              <div
                className="h-full"
                style={{ width: "35%", background: "var(--annotation-orf)", opacity: 0.4 }}
              />
              <div
                className="h-full"
                style={{ width: "25%", background: "var(--annotation-exon)", opacity: 0.5 }}
              />
            </div>

            {/* Likelihood bars */}
            <div className="flex items-end gap-[2px] h-16">
              {Array.from({ length: 60 }, (_, i) => {
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
