import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyze",
};

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
