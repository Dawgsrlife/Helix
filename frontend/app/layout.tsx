import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Helix", template: "%s — Helix" },
  description:
    "The genomic IDE. Design, annotate, and analyze DNA sequences with Evo 2 and AlphaFold.",
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL("https://helix.bio"),
  openGraph: {
    title: "Helix — Genomic Design IDE",
    description: "Co-design genomes with an IDE that thinks out loud. Powered by Evo 2 and AlphaFold.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark", inter.variable, jetbrainsMono.variable, instrumentSerif.variable)}>
      <body className="antialiased min-h-screen font-sans">{children}</body>
    </html>
  );
}
