"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 2C12 2 8 6 8 12s4 10 4 10" />
              <path d="M12 2C12 2 16 6 16 12s-4 10-4 10" />
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            Helix
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <motion.span
            className="text-xs text-[var(--text-muted)] font-mono"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Evo 2 · 40B
          </motion.span>
          <div className="w-2 h-2 rounded-full bg-[var(--accent-emerald)] animate-pulse" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">{children}</main>
    </div>
  );
}
