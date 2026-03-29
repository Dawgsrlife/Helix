"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Dna, FlaskConical, BarChart3, Search, Home, Sun, Moon, LogOut,
  ChevronRight, Pencil, ArrowRight, Sparkles, Target,
  Box, Maximize2, Minimize2, HelpCircle, RotateCcw,
} from "lucide-react";
import { useHelixStore } from "@/lib/store";
import { useSequenceAnalysis } from "@/hooks/useSequenceAnalysis";
import { useDesignPipeline } from "@/hooks/useDesignPipeline";
import { useMutationSim } from "@/hooks/useMutationSim";
import HelixLogo from "@/components/brand/HelixLogo";
import SequenceInput from "@/components/sequence/SequenceInput";
import SequenceViewer from "@/components/sequence/SequenceViewer";
import AnnotationTrack from "@/components/annotation/AnnotationTrack";
import AnnotationLegend from "@/components/annotation/AnnotationLegend";
import LikelihoodGraph from "@/components/annotation/LikelihoodGraph";
import MutationPanel from "@/components/mutation/MutationPanel";
import CandidateLeaderboard from "@/components/workspace/CandidateLeaderboard";
import ChatPanel from "@/components/workspace/ChatPanel";
import PipelineStatus from "@/components/workspace/PipelineStatus";
import CompareView from "@/components/workspace/CompareView";
import MutationDiff from "@/components/mutation/MutationDiff";

import { ScienceTooltip, ScienceInfo } from "@/components/ui/ScienceTooltip";
import TutorialOverlay, { isTutorialCompleted } from "@/components/ui/TutorialOverlay";

const ProteinViewer = dynamic(() => import("@/components/structure/ProteinViewer"), { ssr: false });

/* ─── Constants ──────────────────────────────────────────────────────── */

const SIDEBAR_ITEMS = [
  { icon: Dna, label: "Sequencing", viewMode: "analyze" as const },
  { icon: Box, label: "Structure", viewMode: "structure" as const },
  { icon: Search, label: "Proteomics", viewMode: "explorer" as const },
  { icon: FlaskConical, label: "Synthesis", viewMode: "ide" as const },
  { icon: BarChart3, label: "Analysis", viewMode: "leaderboard" as const },
];

const VIEW_LABELS = {
  input: "New Analysis", pipeline: "Running", analyze: "Overview",
  structure: "3D Structure", leaderboard: "Candidates",
  explorer: "Explorer", ide: "Design Studio", compare: "Compare",
} as const;

const VALID_VIEWS = ["input", "pipeline", "analyze", "structure", "leaderboard", "explorer", "ide", "compare"];

/* ─── Motion presets ─────────────────────────────────────────────────── */

const springTransition = { type: "spring" as const, stiffness: 300, damping: 28, mass: 0.8 };
const smoothTransition = { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

const fadeSlide = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: smoothTransition,
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: springTransition,
};

const slideInRight = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  transition: springTransition,
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  transition: springTransition,
};

/* ─── Score bar that animates width on mount ─────────────────────────── */

function AnimatedScoreBar({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: color, opacity: 0.8 }}
      />
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="h-screen" style={{ background: "var(--surface-base)" }} />}>
      <AnalyzePageInner />
    </Suspense>
  );
}

function AnalyzePageInner() {
  const viewMode = useHelixStore((s) => s.viewMode);
  const rawSequence = useHelixStore((s) => s.rawSequence);
  const bases = useHelixStore((s) => s.bases);
  const regions = useHelixStore((s) => s.regions);
  const scores = useHelixStore((s) => s.scores);
  const analysisResult = useHelixStore((s) => s.analysisResult);
  const selectedPosition = useHelixStore((s) => s.selectedPosition);
  const activePdb = useHelixStore((s) => s.activePdb);
  const highlightResidues = useHelixStore((s) => s.highlightResidues);
  const mutationEffect = useHelixStore((s) => s.mutationEffect);
  const mutationLoading = useHelixStore((s) => s.mutationLoading);
  const editHistory = useHelixStore((s) => s.editHistory);
  const setViewMode = useHelixStore((s) => s.setViewMode);
  const setSelectedPosition = useHelixStore((s) => s.setSelectedPosition);
  const setActivePdb = useHelixStore((s) => s.setActivePdb);
  const setHighlightResidues = useHelixStore((s) => s.setHighlightResidues);
  const addEditEntry = useHelixStore((s) => s.addEditEntry);
  const saveVersion = useHelixStore((s) => s.saveVersion);
  const revertVersion = useHelixStore((s) => s.revertVersion);
  const user = useHelixStore((s) => s.user);
  const signIn = useHelixStore((s) => s.signIn);
  const signOut = useHelixStore((s) => s.signOut);
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const chatOpen = useHelixStore((s) => s.chatOpen);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const theme = useHelixStore((s) => s.theme);
  const wsStatus = useHelixStore((s) => s.wsStatus);
  const toggleTheme = useHelixStore((s) => s.toggleTheme);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Tutorial state
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (!isTutorialCompleted()) {
      const timer = setTimeout(() => setShowTutorial(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Structure fullscreen state
  const [structureFullscreen, setStructureFullscreen] = useState(false);

  // Sync viewMode with URL search params
  useEffect(() => {
    const urlView = searchParams.get("view");
    if (urlView && urlView !== viewMode && VALID_VIEWS.includes(urlView)) {
      setViewMode(urlView as typeof viewMode);
    }
  }, [searchParams]);

  // Push viewMode changes to URL
  useEffect(() => {
    const current = searchParams.get("view");
    if (viewMode !== "input" && viewMode !== current) {
      router.replace(`/analyze?view=${viewMode}`, { scroll: false });
    } else if (viewMode === "input" && current) {
      router.replace("/analyze", { scroll: false });
    }
  }, [viewMode]);

  const { isLoading, error, analyze } = useSequenceAnalysis();
  const { startDesign } = useDesignPipeline();
  const { simulate } = useMutationSim();

  // Auto sign-in for demo
  useEffect(() => { if (!user) signIn(); }, []);

  useEffect(() => {
    if (analysisResult?.predictedProteins?.[0]?.pdbData && !activePdb) {
      setActivePdb(analysisResult.predictedProteins[0].pdbData);
    }
  }, [analysisResult, activePdb, setActivePdb]);

  const handleSequenceSubmit = useCallback((seq: string) => { analyze(seq); }, [analyze]);
  const handleDesignSubmit = useCallback((goal: string) => { startDesign(goal); }, [startDesign]);
  const handleBaseClick = useCallback((pos: number) => { setSelectedPosition(pos); }, [setSelectedPosition]);
  const handleMutationSubmit = useCallback((pos: number, alt: string) => {
    if (rawSequence) {
      simulate(rawSequence, pos, alt);
      addEditEntry({ position: pos, from: rawSequence[pos], to: alt, delta: 0 });
    }
  }, [rawSequence, simulate, addEditEntry]);

  // Rescore: re-analyze the current sequence with the backend
  const [rescoring, setRescoring] = useState(false);
  const handleRescore = useCallback(async () => {
    if (!rawSequence || rescoring) return;
    setRescoring(true);
    try {
      const result = await import("@/lib/api").then(m => m.analyzeSequence(rawSequence));
      useHelixStore.getState().setAnalysisResult(result);
    } catch { /* keep current data */ }
    setRescoring(false);
  }, [rawSequence, rescoring]);

  // 3D ↔ sequence linking: clicking residue in 3D highlights in sequence
  const handleResidueClick = useCallback((residueSeq: number) => {
    // Map residue index to approximate base position (3 bases per residue)
    const basePos = (residueSeq - 1) * 3;
    if (basePos >= 0 && basePos < (bases.length || rawSequence.length)) {
      setSelectedPosition(basePos);
    }
    setHighlightResidues([residueSeq]);
  }, [bases.length, rawSequence.length, setSelectedPosition, setHighlightResidues]);

  const handleResidueHover = useCallback((residueSeq: number | null) => {
    // Subtle highlight on hover, don't change selected position
    if (residueSeq !== null) {
      setHighlightResidues([residueSeq]);
    }
  }, [setHighlightResidues]);

  // Sidebar hover state for spring animation
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  return (
    <div className="grain h-screen flex overflow-hidden" style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>

      {/* ── TUTORIAL OVERLAY ── */}
      <TutorialOverlay
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        onViewChange={(view) => setViewMode(view as typeof viewMode)}
        currentView={viewMode}
      />

      {/* ── SIDEBAR ── */}
      <motion.aside
        className="w-[220px] shrink-0 flex flex-col h-full"
        style={{ background: "var(--surface-void)" }}
        initial={{ x: -220, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...springTransition, delay: 0.1 }}
      >
        {/* Wordmark */}
        <div className="px-6 h-14 flex items-center">
          <span className="wordmark text-sm" style={{ color: "var(--accent-bright)" }}>Helix</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 mt-2">
          <motion.button
            onClick={() => setViewMode("input")}
            onMouseEnter={() => setHoveredNav("input")}
            onMouseLeave={() => setHoveredNav(null)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springTransition}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left transition-colors ${
              viewMode === "input" || viewMode === "pipeline" ? "nav-active" : "hover:bg-white/[0.03]"
            }`}>
            <Home size={16} style={{ color: viewMode === "input" || viewMode === "pipeline" ? "var(--accent-bright)" : "var(--text-faint)" }} />
            <span className="label-caps" style={{ color: viewMode === "input" || viewMode === "pipeline" ? "var(--accent-bright)" : "var(--text-muted)" }}>Home</span>
          </motion.button>
          {SIDEBAR_ITEMS.map(({ icon: Icon, label, viewMode: target }) => {
            const isActive = viewMode === target || (target === "ide" && viewMode === "compare");
            return (
              <motion.button key={target}
                onClick={() => (analysisResult || target === "structure") ? setViewMode(target) : setViewMode("input")}
                onMouseEnter={() => setHoveredNav(target)}
                onMouseLeave={() => setHoveredNav(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springTransition}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left transition-colors ${
                  isActive ? "nav-active" : "hover:bg-white/[0.03]"
                }`}>
                <Icon size={16} style={{ color: isActive ? "var(--accent-bright)" : "var(--text-faint)" }} />
                <span className="label-caps" style={{ color: isActive ? "var(--accent-bright)" : "var(--text-muted)" }}>{label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-3">
          {user ? (
            <div className="flex items-center gap-2.5 px-3 py-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                style={{ background: "var(--surface-elevated)", color: "var(--text-secondary)" }}>
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium block truncate" style={{ color: "var(--text-primary)" }}>{user.name}</span>
                <span className="text-[10px] block truncate" style={{ color: "var(--text-faint)" }}>{user.email}</span>
              </div>
            </div>
          ) : (
            <button onClick={signIn}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md transition-all hover:bg-white/[0.04]">
              <span className="label-caps" style={{ fontSize: "9px", color: "var(--accent)" }}>Sign in</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 space-y-2">
          <button onClick={() => setShowTutorial(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md transition-all hover:bg-white/[0.04]"
            title="Restart tutorial">
            <HelpCircle size={14} style={{ color: "var(--text-muted)" }} />
            <span className="label-caps" style={{ fontSize: "9px" }}>Tutorial</span>
          </button>
          <button onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md transition-all hover:bg-white/[0.04]"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={14} style={{ color: "var(--text-muted)" }} /> : <Moon size={14} style={{ color: "var(--text-muted)" }} />}
            <span className="label-caps" style={{ fontSize: "9px" }}>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <Link href="/"
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md transition-all hover:bg-white/[0.04]">
            <LogOut size={14} style={{ color: "var(--text-muted)" }} />
            <span className="label-caps" style={{ fontSize: "9px" }}>Exit to landing</span>
          </Link>
          <div className="flex items-center gap-2.5 px-3 pt-2">
            <div className="status-pulse" />
            <span className="label-caps" style={{ fontSize: "9px" }}>Evo 2 · Ready</span>
          </div>
          {wsStatus !== "disconnected" && (
            <div className="flex items-center gap-2.5 px-3 pt-1">
              <div className="w-2 h-2 rounded-full" style={{
                background: wsStatus === "connected" ? "var(--accent)" : "var(--base-g)",
                boxShadow: wsStatus === "connected" ? "0 0 6px oklch(0.72 0.12 175 / 0.4)" : "none",
              }} />
              <span className="label-caps" style={{ fontSize: "9px" }}>
                WS · {wsStatus === "connected" ? "Connected" : "Connecting..."}
              </span>
            </div>
          )}
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── HEADER (glassmorphic) ── */}
        <motion.header
          className="h-14 shrink-0 flex items-center justify-between px-6"
          style={{ background: "color-mix(in oklch, var(--surface-base), transparent 40%)", backdropFilter: "blur(20px) saturate(1.8)", borderBottom: "0.5px solid var(--ghost-border)" }}
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...smoothTransition, delay: 0.15 }}
        >
          <div className="flex items-center gap-3">
            {viewMode !== "input" && viewMode !== "pipeline" && (
              <motion.span className="text-[13px]" style={{ color: "var(--text-secondary)" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {VIEW_LABELS[viewMode]}
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {viewMode !== "input" && viewMode !== "pipeline" && (
              <>
                <div className="flex gap-1">
                  {(["analyze", "structure", "leaderboard", "explorer", "ide", "compare"] as const).map((m) => (
                    <motion.button key={m} onClick={() => setViewMode(m)}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="px-3 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider transition-colors font-label"
                      style={{
                        background: viewMode === m ? "color-mix(in oklch, var(--accent), transparent 90%)" : "transparent",
                        color: viewMode === m ? "var(--accent-bright)" : "var(--text-faint)",
                      }}>
                      {VIEW_LABELS[m]}
                    </motion.button>
                  ))}
                </div>
                <button onClick={toggleChat}
                  className="px-3 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider transition-all font-label"
                  style={{ color: chatOpen ? "var(--accent-bright)" : "var(--text-faint)" }}>
                  Helio
                </button>
              </>
            )}
          </div>
        </motion.header>

        <AnimatePresence mode="wait">
          {/* ═══ INPUT ═══ */}
          {viewMode === "input" && (
            <motion.div key="input" className="flex-1 flex overflow-hidden" data-tutorial="sequence-input"
              {...fadeSlide}>
              <SequenceInput onSubmit={handleSequenceSubmit} onDesign={handleDesignSubmit} isLoading={isLoading} error={error} />
            </motion.div>
          )}

          {/* ═══ PIPELINE: running ═══ */}
          {viewMode === "pipeline" && (
            <motion.div key="pipeline" className="flex-1"
              {...fadeSlide}>
              <PipelineStatus />
            </motion.div>
          )}

          {/* ═══ ANALYZE: understand ═══ */}
          {viewMode === "analyze" && analysisResult && (() => {
            const topRegion = regions.reduce((best, r) => (r.score && (!best.score || Math.abs(r.score) < Math.abs(best.score))) ? r : best, regions[0]);
            const codingRegions = regions.filter(r => r.type === "exon" || r.type === "orf");
            const avgScore = scores.length > 0 ? (scores.reduce((a, s) => a + Math.abs(s.score), 0) / scores.length) : 0;
            return (
            <motion.div key="analyze" className="flex-1 overflow-auto"
              {...fadeSlide}>

              {/* Summary strip */}
              <div className="px-8 py-6" style={{ background: "var(--surface-raised)" }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <motion.div {...staggerItem}>
                    <h2 className="text-xl font-semibold tracking-tight mb-1">Analysis Complete</h2>
                    <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      <ScienceTooltip term="base-pair">{rawSequence.length} bp</ScienceTooltip> scored with {scores.length} per-position likelihoods.
                      {regions.length > 0 && <> {codingRegions.length} <ScienceTooltip term="exon">coding region{codingRegions.length !== 1 ? "s" : ""}</ScienceTooltip> identified.</>}
                      {analysisResult.predictedProteins.length > 0 && <> {analysisResult.predictedProteins.length} protein structure{analysisResult.predictedProteins.length !== 1 ? "s" : ""} predicted.</>}
                    </p>
                  </motion.div>
                  <div className="flex gap-2">
                    <motion.button onClick={() => setViewMode("structure")}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ background: "var(--surface-elevated)", color: "var(--text-primary)" }}>
                      <Box size={15} /> View Structure
                    </motion.button>
                    <motion.button onClick={() => setViewMode("explorer")}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                      Open Explorer <ArrowRight size={15} />
                    </motion.button>
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 max-w-6xl mx-auto">
                {/* Annotation track full-width */}
                <motion.div className="mb-6" {...scaleIn}>
                  <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                  <AnnotationLegend regions={regions} />
                </motion.div>

                {/* Three-column: structure preview + regions + insights */}
                <motion.div className="grid grid-cols-1 lg:grid-cols-4 gap-6" variants={staggerContainer} initial="initial" animate="animate">
                  {/* Left: Structure preview card */}
                  <motion.div className="lg:col-span-1" variants={staggerItem}>
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-elevated)" }}>
                      <div className="p-4 pb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Box size={14} style={{ color: "var(--accent)" }} />
                          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                            <ScienceTooltip term="protein-structure">Protein Structure</ScienceTooltip>
                          </span>
                        </div>
                      </div>
                      <div className="h-[220px] cursor-pointer flex items-center justify-center" onClick={() => setViewMode("structure")}
                        style={{ background: "var(--surface-base)" }}>
                        <div className="text-center">
                          <Box size={40} style={{ color: "var(--accent)", margin: "0 auto 8px", opacity: 0.5 }} />
                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Click to view 3D structure</span>
                        </div>
                      </div>
                      <div className="p-3">
                        <button onClick={() => setViewMode("structure")}
                          className="w-full text-xs font-medium flex items-center justify-center gap-1 py-2 rounded-lg transition-colors hover:bg-white/[0.04]"
                          style={{ color: "var(--accent)" }}>
                          Explore in 3D <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>

                  {/* Middle 2/4: Region list */}
                  <motion.div className="lg:col-span-2" variants={staggerItem}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Identified regions</h3>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{regions.length} total</span>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-elevated)" }}>
                      <div className="flex items-center gap-4 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}>
                        <span className="w-6">#</span>
                        <span className="flex-1">Region</span>
                        <span className="w-20 text-right">Type</span>
                        <span className="w-24 text-right">Position</span>
                        <span className="w-16 text-right"><ScienceTooltip term="base-pair">Length</ScienceTooltip></span>
                        <span className="w-16 text-right"><ScienceTooltip term="log-likelihood">Score</ScienceTooltip></span>
                        <span className="w-8" />
                      </div>
                      {regions.slice(0, 10).map((r, i) => (
                        <motion.button key={i}
                          onClick={() => { setSelectedPosition(r.start); setViewMode("explorer"); }}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.04, ...springTransition }}
                          className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                          style={{ borderBottom: i < Math.min(regions.length, 10) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <span className="text-xs font-mono w-6" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                          <span className="text-[13px] font-medium flex-1" style={{ color: "var(--text-primary)" }}>{r.label ?? `${r.type} ${i + 1}`}</span>
                          <span className="text-[11px] font-mono w-20 text-right px-1.5 py-0.5 rounded"
                            style={{
                              color: r.type === "exon" || r.type === "orf" ? "var(--accent)" : "var(--text-muted)",
                              background: r.type === "exon" || r.type === "orf" ? "color-mix(in oklch, var(--accent), transparent 92%)" : "transparent",
                            }}>
                            <ScienceTooltip term={r.type}>{r.type}</ScienceTooltip>
                          </span>
                          <span className="text-xs font-mono w-24 text-right" style={{ color: "var(--text-secondary)" }}>{r.start}-{r.end}</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: "var(--text-muted)" }}>{r.end - r.start} bp</span>
                          <span className="text-xs font-mono w-16 text-right" style={{ color: r.score && Math.abs(r.score) < 2 ? "var(--accent)" : "var(--base-t)" }}>
                            {r.score?.toFixed(1) ?? "-"}
                          </span>
                          <ChevronRight size={14} className="w-8 shrink-0" style={{ color: "var(--text-faint)" }} />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Right 1/4: Insights */}
                  <motion.div className="space-y-4" variants={staggerItem}>
                    {topRegion && (
                      <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)" }}>
                        <div className="flex items-center gap-2 mb-3">
                          <Target size={14} style={{ color: "var(--accent)" }} />
                          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>Top region</span>
                        </div>
                        <div className="text-base font-semibold mb-1">{topRegion.label ?? topRegion.type}</div>
                        <div className="text-xs font-mono mb-3" style={{ color: "var(--text-secondary)" }}>{topRegion.start}-{topRegion.end} ({topRegion.end - topRegion.start} bp)</div>
                        <button onClick={() => { setSelectedPosition(topRegion.start); setViewMode("explorer"); }}
                          className="text-xs font-medium flex items-center gap-1 transition-colors hover:text-white"
                          style={{ color: "var(--accent)" }}>
                          Inspect this region <ArrowRight size={12} />
                        </button>
                      </div>
                    )}

                    <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Summary</span>
                      <div className="mt-3 space-y-3">
                        {[
                          { label: "Coding regions", value: String(codingRegions.length), color: "var(--accent)", term: "exon" },
                          { label: "Mean confidence", value: avgScore.toFixed(2), color: "var(--base-c)", term: "log-likelihood" },
                          { label: "Proteins predicted", value: String(analysisResult.predictedProteins.length), color: "var(--base-g)", term: "protein-structure" },
                          { label: "Sequence length", value: `${rawSequence.length} bp`, color: "var(--text-secondary)", term: "base-pair" },
                        ].map(({ label, value, color, term }, i) => (
                          <motion.div key={label} className="flex items-center justify-between"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 + i * 0.08 }}>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              <ScienceTooltip term={term}>{label}</ScienceTooltip>
                            </span>
                            <span className="text-sm font-semibold font-mono" style={{ color }}>{value}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 rounded-xl" style={{ background: "var(--surface-elevated)" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Model</span>
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        Scored by <ScienceTooltip term="evo2">Evo 2</ScienceTooltip> (40B parameters, 9T base pairs). Per-position <ScienceTooltip term="log-likelihood">log-likelihood</ScienceTooltip> indicates functional constraint.
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
            );
          })()}

          {/* ═══ STRUCTURE: 3D protein centerpiece ═══ */}
          {viewMode === "structure" && (
            <motion.div key="structure" className="flex-1 flex overflow-hidden"
              {...fadeSlide}>
              {/* Main 3D viewer area */}
              <div className={`flex-1 flex flex-col overflow-hidden ${structureFullscreen ? "" : ""}`}>
                {/* Toolbar */}
                <motion.div className="shrink-0 flex items-center justify-between px-6 py-3"
                  style={{ background: "var(--surface-raised)" }}
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, ...springTransition }}>
                  <div className="flex items-center gap-3">
                    <Box size={14} style={{ color: "var(--accent)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      <ScienceTooltip term="protein-structure">3D Protein Structure</ScienceTooltip> — hover residues for details, click to inspect
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => setStructureFullscreen(!structureFullscreen)}
                      className="px-3 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider transition-all font-label flex items-center gap-1.5"
                      style={{ color: "var(--text-muted)" }}>
                      {structureFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                      {structureFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => setHighlightResidues([])}
                      className="px-3 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider transition-all font-label flex items-center gap-1.5"
                      style={{ color: "var(--text-muted)" }}>
                      <RotateCcw size={12} /> Reset
                    </motion.button>
                    <motion.button onClick={() => setViewMode("explorer")}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider font-label transition-all"
                      style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                      <Search size={12} /> Explore Sequence
                    </motion.button>
                  </div>
                </motion.div>

                {/* Viewer */}
                <motion.div
                  className="flex-1 relative"
                  style={{ background: theme === "dark" ? "var(--surface-void)" : "var(--surface-base)" }}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15, ...springTransition }}
                >
                  <ProteinViewer
                    pdbData={activePdb || undefined}
                    highlightResidues={highlightResidues}
                    onResidueClick={handleResidueClick}
                    onResidueHover={handleResidueHover}
                    isFullscreen={structureFullscreen}
                    theme={theme}
                  />

                  {/* pLDDT legend overlay */}
                  <motion.div
                    className="absolute bottom-4 left-4 flex items-center gap-4 px-4 py-2.5 rounded-lg"
                    style={{
                      background: "color-mix(in oklch, var(--surface-elevated), transparent 20%)",
                      backdropFilter: "blur(12px)",
                      border: "0.5px solid var(--ghost-border)",
                    }}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, ...springTransition }}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      <ScienceTooltip term="plddt">pLDDT</ScienceTooltip>
                    </span>
                    {[
                      { color: "#5bb5a2", label: "≥90 Very high" },
                      { color: "#6b9fd4", label: "≥70 Confident" },
                      { color: "#c9a855", label: "≥50 Low" },
                      { color: "#d47a7a", label: "<50 Very low" },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
              </div>

              {/* Side panel (hidden in fullscreen) */}
              {!structureFullscreen && (
                <motion.div className="w-[320px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "var(--surface-elevated)" }}
                  {...slideInRight}>

                  {/* Selected residue info */}
                  <div className="p-5 pb-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--accent)" }}>
                      <ScienceTooltip term="residue">Residue Inspector</ScienceTooltip>
                    </span>
                    {highlightResidues.length > 0 ? (
                      <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Residue</span>
                          <div className="text-lg font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
                            #{highlightResidues[0]}
                          </div>
                        </div>
                        {selectedPosition !== null && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Linked base position</span>
                            <div className="text-sm font-mono" style={{ color: "var(--accent)" }}>{selectedPosition}</div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Hover or click a <ScienceTooltip term="residue">residue</ScienceTooltip> in the 3D view to inspect it.
                      </p>
                    )}
                  </div>

                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />

                  {/* Sequence context (only when analysis has run) */}
                  {bases.length > 0 && (
                    <>
                      <div className="p-5">
                        <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                          Sequence Preview
                        </span>
                        <div className="h-[180px] overflow-auto rounded-lg" style={{ background: "var(--surface-base)" }}>
                          <div className="p-2">
                            <SequenceViewer bases={bases.slice(0, 300)} regions={regions}
                              highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                          </div>
                        </div>
                      </div>
                      <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                    </>
                  )}

                  {/* Quick scores */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                      <ScienceTooltip term="overall-viability">Candidate Scores</ScienceTooltip>
                    </span>
                    {candidates.length > 0 && (() => {
                      const c = candidates.find(c => c.id === (activeCandidateId ?? 0)) ?? candidates[0];
                      return (
                        <div className="space-y-2.5">
                          {[
                            { label: "Functional", val: c.scores.functional, color: "var(--accent)", term: "functional-plausibility" },
                            { label: "Tissue", val: c.scores.tissue, color: "var(--base-c)", term: "tissue-specificity" },
                            { label: "Off-target", val: c.scores.offTarget, color: "var(--base-t)", term: "off-target-risk" },
                            { label: "Novelty", val: c.scores.novelty, color: "var(--base-g)", term: "novelty" },
                          ].map(({ label, val, color, term }, i) => (
                            <div key={label} className="flex items-center gap-3">
                              <span className="text-[11px] w-16" style={{ color: "var(--text-muted)" }}>
                                <ScienceTooltip term={term}>{label}</ScienceTooltip>
                              </span>
                              <AnimatedScoreBar value={val} color={color} delay={0.15 + i * 0.08} />
                              <span className="text-[11px] font-mono w-10 text-right" style={{ color }}>{(val * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />

                  {/* Confidence summary */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>
                      About this view
                    </span>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      This 3D structure was predicted by <ScienceTooltip term="esmfold">ESMFold</ScienceTooltip> from the amino acid sequence encoded in your DNA.
                      Each sphere is one <ScienceTooltip term="residue">amino acid residue</ScienceTooltip>. Colors indicate the AI&apos;s confidence (<ScienceTooltip term="plddt">pLDDT score</ScienceTooltip>).
                    </p>
                  </div>

                  <div className="flex-1" />
                </motion.div>
              )}

              {chatOpen && <ChatPanel />}
            </motion.div>
          )}

          {/* ═══ LEADERBOARD: rank/triage ═══ */}
          {viewMode === "leaderboard" && analysisResult && (
            <motion.div key="leaderboard" className="flex-1 flex overflow-hidden"
              {...fadeSlide}>
              <CandidateLeaderboard />
              {chatOpen && <ChatPanel />}
            </motion.div>
          )}

          {/* ═══ COMPARE: diff ═══ */}
          {viewMode === "compare" && analysisResult && (
            <motion.div key="compare" className="flex-1 flex overflow-hidden"
              {...fadeSlide}>
              <CompareView />
              {chatOpen && <ChatPanel />}
            </motion.div>
          )}

          {/* ═══ EXPLORER: inspect (read-only, navigational) ═══ */}
          {viewMode === "explorer" && analysisResult && (
            <motion.div key="explorer" className="flex-1 flex flex-col overflow-hidden"
              {...fadeSlide}>
              {/* Action bar */}
              <motion.div className="shrink-0 flex items-center justify-between px-6 py-3"
                style={{ background: "var(--surface-raised)" }}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
                <div className="flex items-center gap-3">
                  <Search size={14} style={{ color: "var(--accent)" }} />
                  <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    Click any <ScienceTooltip term="adenine">base</ScienceTooltip> to inspect. This is a read-only view — edit in Design Studio.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button onClick={() => setViewMode("structure")}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium font-label tracking-wider uppercase transition-all"
                    style={{ background: "var(--surface-elevated)", color: "var(--text-muted)" }}>
                    <Box size={13} /> Structure
                  </motion.button>
                  <motion.button onClick={() => setViewMode("ide")}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium font-label tracking-wider uppercase transition-all"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                    <Pencil size={13} /> Open Studio <ArrowRight size={13} />
                  </motion.button>
                </div>
              </motion.div>
              {/* Annotation track */}
              <div className="px-5 py-3 shrink-0" style={{ background: "var(--surface-raised)" }}>
                <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                <AnnotationLegend regions={regions} />
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Sequence view (read-only focus) */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 overflow-auto px-5 py-4">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <motion.div className="h-40 shrink-0 px-5 py-3" style={{ background: "var(--surface-raised)" }}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, ...springTransition }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </motion.div>
                </div>
                {/* Inspector panel */}
                <motion.div className="w-[320px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "var(--surface-elevated)" }}
                  {...slideInRight}>
                  <div className="p-5 pb-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-4" style={{ color: "var(--accent)" }}>Inspector</span>
                    {selectedPosition !== null ? (
                      <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={selectedPosition}>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Position</span>
                          <div className="text-lg font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{selectedPosition}</div>
                        </div>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                            <ScienceTooltip term={
                              bases[selectedPosition]?.nucleotide === "A" ? "adenine" :
                              bases[selectedPosition]?.nucleotide === "T" ? "thymine" :
                              bases[selectedPosition]?.nucleotide === "C" ? "cytosine" : "guanine"
                            }>Base</ScienceTooltip>
                          </span>
                          <div className="text-lg font-semibold font-mono" style={{ color: bases[selectedPosition]?.nucleotide === "A" ? "var(--base-a)" : bases[selectedPosition]?.nucleotide === "T" ? "var(--base-t)" : bases[selectedPosition]?.nucleotide === "C" ? "var(--base-c)" : "var(--base-g)" }}>
                            {bases[selectedPosition]?.nucleotide ?? "N"}
                          </div>
                        </div>
                        {bases[selectedPosition]?.annotationType && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Region</span>
                            <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              <ScienceTooltip term={bases[selectedPosition]?.annotationType ?? ""}>{bases[selectedPosition]?.annotationType}</ScienceTooltip>
                            </div>
                          </div>
                        )}
                        {bases[selectedPosition]?.likelihoodScore !== undefined && (
                          <div>
                            <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                              <ScienceTooltip term="log-likelihood">Likelihood</ScienceTooltip>
                            </span>
                            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>{bases[selectedPosition]?.likelihoodScore?.toFixed(3)}</div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Click a base in the sequence to inspect its position, <ScienceTooltip term="exon">annotation</ScienceTooltip>, and <ScienceTooltip term="log-likelihood">likelihood score</ScienceTooltip>.
                      </p>
                    )}
                  </div>
                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                  {/* Region summary */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>Regions ({regions.length})</span>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {regions.slice(0, 6).map((r, i) => (
                        <button key={i} onClick={() => setSelectedPosition(r.start)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/[0.04]"
                          style={{ fontSize: "12px" }}>
                          <span style={{ color: "var(--text-muted)" }}>
                            <ScienceTooltip term={r.type}>{r.type}</ScienceTooltip>
                          </span>
                          <span className="flex-1" />
                          <span className="font-mono" style={{ color: "var(--text-faint)" }}>{r.start}-{r.end}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                  {/* Structure preview */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        <ScienceTooltip term="protein-structure">Structure</ScienceTooltip>
                      </span>
                      <button onClick={() => setViewMode("structure")} className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                        Expand <Maximize2 size={10} className="inline ml-0.5" />
                      </button>
                    </div>
                    <div className="rounded-lg overflow-hidden h-[100px] cursor-pointer flex items-center justify-center" style={{ background: "var(--surface-base)" }}
                      onClick={() => setViewMode("structure")}>
                      <div className="text-center">
                        <Box size={28} style={{ color: "var(--accent)", margin: "0 auto 4px", opacity: 0.4 }} />
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>View 3D</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1" />
                </motion.div>
                {chatOpen && <ChatPanel />}
              </div>
            </motion.div>
          )}

          {/* ═══ IDE / DESIGN STUDIO: manipulate ═══ */}
          {viewMode === "ide" && analysisResult && (
            <motion.div key="ide" className="flex-1 flex flex-col overflow-hidden"
              {...fadeSlide}>
              {/* IDE toolbar */}
              <motion.div className="h-10 shrink-0 flex items-center justify-between px-5"
                style={{ background: "var(--surface-raised)" }}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "color-mix(in oklch, var(--accent), transparent 90%)", color: "var(--accent)" }}>LIVE EDITING</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    <ScienceTooltip term="base-pair">{rawSequence.length} bp</ScienceTooltip> | {editHistory.length} <ScienceTooltip term="mutation">edit{editHistory.length !== 1 ? "s" : ""}</ScienceTooltip>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveVersion} className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)" }}>Save version</button>
                  <button onClick={revertVersion} className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)" }}>Revert</button>
                  <button onClick={() => setViewMode("compare")}
                    className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors hover:bg-white/[0.04]"
                    style={{ color: "var(--text-muted)" }}>Compare</button>
                  <button onClick={handleRescore} disabled={rescoring}
                    className="text-[10px] px-2.5 py-1 rounded font-medium transition-colors disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}>
                    {rescoring ? "Rescoring..." : "Rescore"}
                  </button>
                </div>
              </motion.div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Editable workspace */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="px-5 py-2 shrink-0" style={{ background: "var(--surface-raised)" }}>
                    <AnnotationTrack regions={regions} sequenceLength={rawSequence.length} />
                  </div>
                  <div className="flex-1 overflow-auto px-5 py-3">
                    <SequenceViewer bases={bases} regions={regions}
                      highlightedPosition={selectedPosition ?? undefined} onBaseClick={handleBaseClick} />
                  </div>
                  <motion.div className="h-36 shrink-0 px-5 py-3" style={{ background: "var(--surface-raised)" }}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, ...springTransition }}>
                    <LikelihoodGraph scores={scores}
                      highlightedPosition={selectedPosition ?? undefined} onPositionHover={setSelectedPosition} />
                  </motion.div>
                </div>
                {/* IDE right panel */}
                <motion.div className="w-[380px] shrink-0 flex flex-col overflow-y-auto"
                  style={{ background: "var(--surface-elevated)" }}
                  {...slideInRight}>
                  {/* Mutation editor */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--accent)" }}>
                      <ScienceTooltip term="mutation">Mutation Editor</ScienceTooltip>
                    </span>
                    <MutationPanel sequence={rawSequence} onMutationSubmit={handleMutationSubmit}
                      mutationEffect={mutationEffect ?? undefined} isLoading={mutationLoading} />
                    {mutationEffect && (
                      <motion.div className="mt-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <MutationDiff effect={mutationEffect} />
                      </motion.div>
                    )}
                  </div>
                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                  {/* Scoring summary */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-muted)" }}>
                      <ScienceTooltip term="overall-viability">Candidate scores</ScienceTooltip>
                    </span>
                    {candidates.length > 0 && (() => {
                      const c = candidates.find(c => c.id === (activeCandidateId ?? 0)) ?? candidates[0];
                      return (
                        <div className="space-y-2.5">
                          {[
                            { label: "Functional", val: c.scores.functional, color: "var(--accent)", term: "functional-plausibility" },
                            { label: "Tissue", val: c.scores.tissue, color: "var(--base-c)", term: "tissue-specificity" },
                            { label: "Off-target", val: c.scores.offTarget, color: "var(--base-t)", term: "off-target-risk" },
                            { label: "Novelty", val: c.scores.novelty, color: "var(--base-g)", term: "novelty" },
                          ].map(({ label, val, color, term }, i) => (
                            <div key={label} className="flex items-center gap-3">
                              <span className="text-[11px] w-16" style={{ color: "var(--text-muted)" }}>
                                <ScienceTooltip term={term}>{label}</ScienceTooltip>
                              </span>
                              <AnimatedScoreBar value={val} color={color} delay={i * 0.06} />
                              <span className="text-[11px] font-mono w-10 text-right" style={{ color }}>{(val * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                  {/* Structure */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        <ScienceTooltip term="protein-structure">Structure</ScienceTooltip>
                      </span>
                      <button onClick={() => setViewMode("structure")} className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                        Expand <Maximize2 size={10} className="inline ml-0.5" />
                      </button>
                    </div>
                    <div className="rounded-lg overflow-hidden h-[100px] cursor-pointer flex items-center justify-center" style={{ background: "var(--surface-base)" }}
                      onClick={() => setViewMode("structure")}>
                      <div className="text-center">
                        <Box size={28} style={{ color: "var(--accent)", margin: "0 auto 4px", opacity: 0.4 }} />
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>View 3D</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-px mx-5" style={{ background: "var(--ghost-border)" }} />
                  {/* Edit history */}
                  <div className="p-5">
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Edit history ({editHistory.length})
                    </span>
                    {editHistory.length === 0 ? (
                      <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>
                        Click a base, select a target, and run <ScienceTooltip term="mutation">simulation</ScienceTooltip> to begin editing.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {editHistory.slice(-8).reverse().map((e, i) => (
                          <motion.div key={i}
                            className="flex items-center gap-2 text-xs font-mono py-1"
                            style={{ color: "var(--text-secondary)" }}
                            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}>
                            <span style={{ color: "var(--text-faint)" }}>pos {e.position}</span>
                            <span style={{ color: "var(--base-t)" }}>{e.from}</span>
                            <span style={{ color: "var(--text-faint)" }}>&rarr;</span>
                            <span style={{ color: "var(--accent)" }}>{e.to}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
                {chatOpen && <ChatPanel />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Helio button */}
      {!chatOpen && viewMode !== "input" && viewMode !== "pipeline" && analysisResult && (
        <motion.button onClick={toggleChat}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
          style={{
            background: "var(--accent)",
            color: "var(--surface-base)",
            boxShadow: "0 8px 32px oklch(0.72 0.12 175 / 0.3)",
          }}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          transition={springTransition}
        >
          <Sparkles size={16} /> Ask Helio
        </motion.button>
      )}
    </div>
  );
}
