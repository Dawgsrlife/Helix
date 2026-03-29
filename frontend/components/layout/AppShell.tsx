"use client";

import Link from "next/link";

interface AppShellProps {
  children: React.ReactNode;
  sequenceName?: string;
}

export default function AppShell({ children, sequenceName }: AppShellProps) {
  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: "var(--surface-void)" }}
    >
      {/* Top bar: tonal shift, no border */}
      <header
        className="h-11 flex items-center justify-between px-5 shrink-0"
        style={{ background: "var(--surface-base)" }}
      >
        {/* Left: wordmark + breadcrumb */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-[12px] font-bold tracking-[-0.04em] uppercase transition-opacity hover:opacity-80"
            style={{ color: "var(--text-primary)" }}
          >
            Helix
          </Link>

          {sequenceName && (
            <>
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
                {sequenceName}
              </span>
            </>
          )}
        </div>

        {/* Right: model status */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--text-faint)" }}
          >
            Evo 2 40B
          </span>
          <div
            className="w-[6px] h-[6px] rounded-full animate-pulse-soft"
            style={{ background: "var(--accent)" }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">{children}</main>
    </div>
  );
}
