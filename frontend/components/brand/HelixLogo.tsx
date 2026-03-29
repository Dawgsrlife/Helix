"use client";

/**
 * Helix Brand Mark + Wordmark
 *
 * The mark is a single-stroke arc: a smooth curve from thick to thin,
 * suggesting a helix turn and a precision measurement instrument.
 * Not a literal DNA double helix. An interface glyph.
 *
 * Usage:
 *   <HelixLogo />                    — mark + wordmark (nav default)
 *   <HelixLogo variant="mark" />     — mark only (favicon, app icon, collapsed nav)
 *   <HelixLogo variant="wordmark" /> — wordmark only (footer, docs)
 *   <HelixLogo size="lg" />          — larger (hero, splash)
 *
 * Color: uses currentColor. Set the parent's text color.
 * On dark: use text-[#F0EFED] or text-[#5bb5a2]
 * On light: use text-[#0F0F0F]
 */

interface HelixLogoProps {
  variant?: "full" | "mark" | "wordmark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { mark: 18, text: "text-[14px]", gap: "gap-1.5" },
  md: { mark: 22, text: "text-[17px]", gap: "gap-2" },
  lg: { mark: 32, text: "text-[26px]", gap: "gap-3" },
};

function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* The arc: a single smooth curve, thick to thin, suggesting a helix turn */}
      <path
        d="M6 26C6 26 8 8 16 8C24 8 26 20 16 20C10 20 10 14 16 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Small dot at the end: the edit cursor / active position */}
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-semibold tracking-[-0.03em] select-none ${className ?? ""}`}
      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
    >
      Helix
    </span>
  );
}

export default function HelixLogo({
  variant = "full",
  size = "md",
  className = "",
}: HelixLogoProps) {
  const s = SIZES[size];

  if (variant === "mark") {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Mark size={s.mark} />
      </span>
    );
  }

  if (variant === "wordmark") {
    return <Wordmark className={`${s.text} ${className}`} />;
  }

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <Mark size={s.mark} />
      <Wordmark className={s.text} />
    </span>
  );
}
