"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Floating DNA bases background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {["A", "T", "C", "G", "A", "T", "G", "C"].map((base, i) => (
          <motion.span
            key={i}
            className="absolute text-6xl font-bold opacity-[0.03] select-none"
            style={{
              left: `${10 + i * 12}%`,
              top: `${20 + (i % 3) * 25}%`,
              color:
                base === "A"
                  ? "var(--base-a)"
                  : base === "T"
                    ? "var(--base-t)"
                    : base === "C"
                      ? "var(--base-c)"
                      : "var(--base-g)",
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.03, 0.06, 0.03],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {base}
          </motion.span>
        ))}
      </div>

      <motion.div
        className="relative z-10 text-center px-6 max-w-3xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {/* Logo mark */}
        <motion.div
          className="mb-8 inline-flex items-center gap-3"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 2C12 2 8 6 8 12s4 10 4 10" />
              <path d="M12 2C12 2 16 6 16 12s-4 10-4 10" />
              <line x1="6" y1="7" x2="18" y2="7" />
              <line x1="5" y1="12" x2="19" y2="12" />
              <line x1="6" y1="17" x2="18" y2="17" />
            </svg>
          </div>
          <span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Helix
          </span>
        </motion.div>

        <motion.h1
          className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <span className="bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-blue)] to-[var(--accent-violet)] bg-clip-text text-transparent">
            Debug DNA
          </span>
          <br />
          <span className="text-[var(--text-primary)]">like you debug code.</span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-[var(--text-secondary)] mb-10 max-w-xl mx-auto font-[Inter] leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          A genomic IDE powered by{" "}
          <span className="text-[var(--accent-cyan)] font-medium">Evo 2</span> and{" "}
          <span className="text-[var(--accent-violet)] font-medium">AlphaFold</span>.
          Annotate, mutate, and visualize sequences with single-nucleotide precision.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          <Link
            href="/analyze"
            className="px-8 py-3.5 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-blue)] text-white font-medium text-lg hover:opacity-90 transition-opacity"
          >
            Open IDE
          </Link>
          <a
            href="https://github.com/Dawgsrlife/Helix"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium text-lg hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            View Source
          </a>
        </motion.div>

        {/* Tech badges */}
        <motion.div
          className="mt-16 flex flex-wrap gap-3 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {[
            "Evo 2 · 40B params",
            "AlphaFold",
            "9T base pairs",
            "1M token context",
          ].map((label) => (
            <span
              key={label}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
            >
              {label}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
