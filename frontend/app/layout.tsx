import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Serif, Space_Grotesk } from "next/font/google";
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

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-headline",
  display: "swap",
  style: ["normal", "italic"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-label",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Helix",
  description:
    "Design DNA the way you write software. A genomic workspace powered by Evo 2 and AlphaFold.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        inter.variable,
        jetbrainsMono.variable,
        notoSerif.variable,
        spaceGrotesk.variable
      )}
    >
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
