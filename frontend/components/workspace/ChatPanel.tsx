"use client";

import { useState, useRef, useEffect } from "react";
import { useHelixStore } from "@/lib/store";
import { X, Send, Sparkles, Check, Loader2, AlertCircle } from "lucide-react";

const SCREEN_PROMPTS: Record<string, string[]> = {
  analyze: [
    "What do these scores mean?",
    "Rescore the sequence",
    "Change all A's to G's",
  ],
  leaderboard: [
    "Compare candidate #1 and #2",
    "Which candidate is safest?",
    "Optimize for tissue specificity",
  ],
  explorer: [
    "What is this base's annotation?",
    "Mutate position 12 to C",
    "Make this safer by reducing off-target risk",
  ],
  ide: [
    "Mutate position 20 to G",
    "Change all A's to T's",
    "Optimize for functional score",
  ],
  compare: [
    "Why does Candidate A outperform B?",
    "Compare all candidates",
    "Suggest an improvement",
  ],
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface ToolCallEntry {
  tool: string;
  status: string;
  summary: string;
}

export default function ChatPanel() {
  const chatMessages = useHelixStore((s) => s.chatMessages);
  const addChatMessage = useHelixStore((s) => s.addChatMessage);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const viewMode = useHelixStore((s) => s.viewMode);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentPhase, setAgentPhase] = useState<"idle" | "thinking" | "executing" | "reflecting">("idle");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallEntry[]>([]);
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([]);
  const [iterations, setIterations] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, isTyping, activeToolCalls.length, agentPhase]);

  const prompts = SCREEN_PROMPTS[viewMode] ?? SCREEN_PROMPTS.analyze;

  const buildContext = () => {
    const s = useHelixStore.getState();
    const parts: string[] = [];
    if (s.rawSequence) parts.push(`Sequence: ${s.rawSequence.length} bp`);
    if (s.regions.length) parts.push(`Regions: ${s.regions.map(r => `${r.type}(${r.start}-${r.end})`).join(", ")}`);
    if (s.candidates.length) {
      const top = s.candidates[0];
      parts.push(`Top candidate: functional=${(top.scores.functional*100).toFixed(0)}%, tissue=${(top.scores.tissue*100).toFixed(0)}%, off-target=${(top.scores.offTarget*100).toFixed(1)}%, novelty=${(top.scores.novelty*100).toFixed(0)}%, overall=${top.overall.toFixed(1)}`);
    }
    if (s.selectedPosition !== null) parts.push(`Selected position: ${s.selectedPosition}`);
    if (s.mutationEffect) parts.push(`Last mutation: ${s.mutationEffect.referenceBase}→${s.mutationEffect.alternateBase} at ${s.mutationEffect.position}, ΔLL=${s.mutationEffect.deltaLikelihood.toFixed(4)}, impact=${s.mutationEffect.predictedImpact}`);
    return parts.join("\n");
  };

  /** Apply candidate_update from the backend agent to the store */
  const applyAgentUpdate = async (update: Record<string, any>) => {
    const s = useHelixStore.getState();
    if (update.sequence && typeof update.sequence === "string") {
      s.setSequence(update.sequence);
      try {
        const { parseSequence } = await import("@/lib/sequenceUtils");
        const newBases = parseSequence(update.sequence, s.regions).map((b: any, i: number) => ({
          ...b,
          likelihoodScore: update.per_position_scores?.[i]?.score ?? s.scores[i]?.score,
        }));
        useHelixStore.setState({ bases: newBases });
      } catch { /* parsing optional */ }
    }
    if (update.scores) {
      const scores = update.scores;
      const candidates = [...s.candidates];
      const idx = candidates.findIndex(c => c.id === (update.candidate_id ?? 0));
      if (idx >= 0) {
        candidates[idx] = {
          ...candidates[idx],
          sequence: update.sequence ?? candidates[idx].sequence,
          scores: {
            functional: scores.functional ?? candidates[idx].scores.functional,
            tissue: scores.tissue_specificity ?? candidates[idx].scores.tissue,
            offTarget: scores.off_target ?? candidates[idx].scores.offTarget,
            novelty: scores.novelty ?? candidates[idx].scores.novelty,
          },
          overall: 0,
          status: "scored",
        };
        candidates[idx].overall = (
          candidates[idx].scores.functional * 0.35 +
          candidates[idx].scores.tissue * 0.30 +
          (1 - candidates[idx].scores.offTarget) * 0.20 +
          candidates[idx].scores.novelty * 0.15
        ) * 100;
        useHelixStore.getState().setCandidates(candidates);
      }
    }
    if (update.pdb_data && typeof update.pdb_data === "string" && update.pdb_data.length > 10) {
      useHelixStore.getState().setActivePdb(update.pdb_data);
    }
    if (update.mutation && typeof update.mutation.position === "number") {
      const mut = update.mutation;
      s.addEditEntry({
        position: mut.position,
        from: mut.reference_base ?? "?",
        to: mut.new_base ?? "?",
        delta: mut.delta_likelihood ?? 0,
      });
    }
  };

  const handleSend = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || isTyping) return;
    addChatMessage({ role: "user", content: msg });
    setInput("");
    setIsTyping(true);
    setAgentPhase("thinking");
    setActiveToolCalls([]);
    setReasoningSteps([]);
    setIterations(0);

    const s = useHelixStore.getState();
    const lc = msg.toLowerCase();

    // ── LOCAL ACTIONS: handle these directly, never send to backend agent ──

    // RESCORE: just re-analyze, no mutations
    if (/\brescore\b|\bre-score\b|\bre-analyze\b|\bscore.+again\b/i.test(lc)) {
      if (s.rawSequence) {
        setAgentPhase("executing");
        setActiveToolCalls([{ tool: "analyzeSequence", status: "running", summary: "Re-scoring..." }]);
        try {
          const { analyzeSequence } = await import("@/lib/api");
          const result = await analyzeSequence(s.rawSequence);
          useHelixStore.getState().setAnalysisResult(result);
          setActiveToolCalls([{ tool: "analyzeSequence", status: "ok", summary: `Rescored ${result.perPositionScores.length} positions` }]);
          addChatMessage({ role: "assistant", content: `Rescored ${result.perPositionScores.length} positions. ${result.predictedProteins.length} protein(s) predicted. Check the Overview for updated results.` });
        } catch {
          setActiveToolCalls([{ tool: "analyzeSequence", status: "failed", summary: "Backend unavailable" }]);
          addChatMessage({ role: "assistant", content: "Couldn't rescore — backend may be unavailable." });
        }
      } else {
        addChatMessage({ role: "assistant", content: "No sequence loaded. Submit a sequence first." });
      }
      setIsTyping(false);
      setAgentPhase("idle");
      return;
    }

    // REFOLD: just re-predict structure, no mutations
    if (/\brefold\b|\bre-fold\b|\bpredict structure\b|\bfold again\b/i.test(lc)) {
      if (s.rawSequence) {
        setAgentPhase("executing");
        setActiveToolCalls([{ tool: "fetchStructure", status: "running", summary: "Re-folding protein..." }]);
        try {
          const { fetchStructure } = await import("@/lib/api");
          const pdb = await fetchStructure(0, s.rawSequence.length, s.rawSequence);
          useHelixStore.getState().setActivePdb(pdb);
          setActiveToolCalls([{ tool: "fetchStructure", status: "ok", summary: "Structure re-folded" }]);
          addChatMessage({ role: "assistant", content: "Structure re-folded with ESMFold. Check the 3D Structure view." });
        } catch {
          setActiveToolCalls([{ tool: "fetchStructure", status: "failed", summary: "Prediction failed" }]);
          addChatMessage({ role: "assistant", content: "Structure prediction failed." });
        }
      } else {
        addChatMessage({ role: "assistant", content: "No sequence to fold." });
      }
      setIsTyping(false);
      setAgentPhase("idle");
      return;
    }

    // ── BACKEND AGENT: send everything else to the agentic copilot ──
    // This handles: mutations, optimizations, comparisons, transforms, explanations

    try {
      setAgentPhase("thinking");

      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: s.sessionId ?? "local",
          candidate_id: s.activeCandidateId ?? 0,
          message: msg,
          history: chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Show tool calls with animation
        if (data.tool_calls && Array.isArray(data.tool_calls)) {
          setAgentPhase("executing");
          for (let i = 0; i < data.tool_calls.length; i++) {
            const tc = data.tool_calls[i];
            await new Promise(r => setTimeout(r, 300)); // Stagger animation
            setActiveToolCalls(prev => [...prev, { tool: tc.tool, status: tc.status, summary: tc.summary }]);
          }
        }

        // Show reasoning steps
        if (data.reasoning_steps && Array.isArray(data.reasoning_steps)) {
          setReasoningSteps(data.reasoning_steps);
        }
        if (typeof data.iterations === "number") {
          setIterations(data.iterations);
        }

        // Apply candidate update to the store (this is the key fix!)
        if (data.candidate_update) {
          setAgentPhase("reflecting");
          await applyAgentUpdate(data.candidate_update);
        }

        // Apply comparison data
        if (data.comparison && Array.isArray(data.comparison)) {
          // Store comparison for display
          setActiveToolCalls(prev => [
            ...prev,
            { tool: "compare", status: "ok", summary: `Ranked ${data.comparison.length} candidates` }
          ]);
        }

        addChatMessage({
          role: "assistant",
          content: data.assistant_message ?? "I couldn't process that.",
        });
        setIsTyping(false);
        setAgentPhase("idle");
        return;
      }
    } catch {
      // Backend unavailable — fall through to hardcoded
    }

    setAgentPhase("idle");

    // Fallback: informational responses only
    const st = useHelixStore.getState();
    let response: string;

    if (/plddt|confidence/i.test(lc)) {
      response = "pLDDT is the AI's confidence score (0-100) for each part of a predicted protein structure. Above 90 = very reliable. 70-90 = confident. Below 50 = uncertain.";
    } else if (/off.?target|risk|safety/i.test(lc)) {
      response = `Off-target risk: ${((st.candidates[0]?.scores.offTarget ?? 0) * 100).toFixed(1)}%. ${(st.candidates[0]?.scores.offTarget ?? 0) < 0.03 ? "Excellent — well below safety threshold." : "Moderate — consider reviewing."}`;
    } else if (/functional|plausibility/i.test(lc)) {
      response = `Functional plausibility measures how likely this DNA produces a working protein. Your top candidate: ${((st.candidates[0]?.scores.functional ?? 0) * 100).toFixed(0)}%.`;
    } else if (/tissue/i.test(lc)) {
      response = `Tissue specificity measures how well the sequence targets a specific cell type. Score: ${((st.candidates[0]?.scores.tissue ?? 0) * 100).toFixed(0)}%.`;
    } else if (/novelty/i.test(lc)) {
      response = `Novelty measures how different this sequence is from known natural sequences. Score: ${((st.candidates[0]?.scores.novelty ?? 0) * 100).toFixed(0)}%.`;
    } else if (/score|mean|what.*do/i.test(lc)) {
      const c = st.candidates[0];
      response = c
        ? `Your top candidate: Functional ${(c.scores.functional*100).toFixed(0)}%, Tissue ${(c.scores.tissue*100).toFixed(0)}%, Off-target ${(c.scores.offTarget*100).toFixed(1)}%, Novelty ${(c.scores.novelty*100).toFixed(0)}%. Overall: ${c.overall.toFixed(1)}.`
        : "No candidates scored yet. Run an analysis first.";
    } else if (/suggest|recommend|what.*try/i.test(lc)) {
      response = "Try: \"change all A's to G's\" — the agent will transform the sequence and rescore. Or: \"optimize for tissue specificity\", \"mutate position 12 to C\", \"compare all candidates\".";
    } else if (/help|what can you/i.test(lc)) {
      response = "I can: transform sequences (\"change all A's to G's\"), mutate specific bases (\"mutate position 15 to G\"), optimize for any metric (\"optimize for safety\"), compare candidates, rescore, or refold. Everything runs through the agentic pipeline.";
    } else if (/compare|difference|candidate/i.test(lc)) {
      const c1 = st.candidates[0], c2 = st.candidates[1];
      response = c1 && c2
        ? `#1: ${c1.overall.toFixed(1)} vs #2: ${c2.overall.toFixed(1)}. Main gap: functional (${(c1.scores.functional*100).toFixed(0)}% vs ${(c2.scores.functional*100).toFixed(0)}%).`
        : "Need at least 2 candidates to compare.";
    } else if (/likelihood|log.?lik/i.test(lc)) {
      response = "Log-likelihood measures how 'natural' each DNA position looks to Evo 2. Values closer to 0 = more expected. Very negative = unusual (could be functionally important or an error).";
    } else {
      response = st.rawSequence
        ? `Sequence: ${st.rawSequence.length} bp, ${st.candidates.length} candidates. Top score: ${st.candidates[0]?.overall.toFixed(1) ?? "N/A"}. Ask me to explain metrics, transform sequences, optimize, or compare.`
        : "No sequence loaded yet. Submit a sequence from the Home page to get started.";
    }

    addChatMessage({ role: "assistant", content: response });
    setIsTyping(false);
  };

  return (
    <div className="w-[360px] shrink-0 flex flex-col h-full"
      style={{ background: "var(--surface-raised)", borderLeft: "1px solid var(--ghost-border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--ghost-border)" }}>
        <div className="flex items-center gap-2.5">
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Helio Agent</span>
          {iterations > 1 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(var(--accent-rgb, 9,212,156), 0.15)", color: "var(--accent)", border: "1px solid rgba(var(--accent-rgb, 9,212,156), 0.3)" }}>
              {iterations} iterations
            </span>
          )}
        </div>
        <button onClick={toggleChat} className="p-1.5 rounded-md hover:bg-white/5 transition-colors">
          <X size={14} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {chatMessages.length === 0 && (
          <div>
            <p className="text-[13px] mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              I can transform sequences, mutate bases, optimize scores, compare candidates, and explain any metric. Everything runs through the agentic pipeline.
            </p>
            <div className="space-y-1.5">
              {prompts.map((q) => (
                <button key={q} onClick={() => handleSend(q)}
                  className="block w-full text-left text-[12px] px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.04]"
                  style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i}>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1"
              style={{ color: msg.role === "user" ? "var(--text-faint)" : "var(--accent)" }}>
              {msg.role === "user" ? "You" : "Helio"}
            </div>
            <div className="text-[13px] leading-relaxed"
              style={{ color: "var(--text-primary)" }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Agent thinking/executing indicator */}
        {isTyping && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Helio</div>
            {agentPhase === "thinking" && (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-[12px]"
                style={{ background: "rgba(var(--accent-rgb, 9,212,156), 0.08)", border: "1px solid rgba(var(--accent-rgb, 9,212,156), 0.2)", color: "var(--accent)" }}>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
                <span>Planning actions...</span>
              </div>
            )}
            {agentPhase === "executing" && (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-[12px]"
                style={{ background: "rgba(246,193,77, 0.08)", border: "1px solid rgba(246,193,77, 0.2)", color: "#ffd990" }}>
                <Loader2 size={12} className="animate-spin" />
                <span>Executing tools...</span>
              </div>
            )}
            {agentPhase === "reflecting" && (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-[12px]"
                style={{ background: "rgba(114,182,255, 0.08)", border: "1px solid rgba(114,182,255, 0.2)", color: "#72b6ff" }}>
                <Sparkles size={12} />
                <span>Reflecting on results...</span>
              </div>
            )}
          </div>
        )}

        {/* Tool call trail */}
        {activeToolCalls.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}>
              Tool Execution
            </div>
            {activeToolCalls.map((tc, i) => (
              <div key={`tc-${i}`}
                className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] transition-all"
                style={{
                  background: "var(--surface-base)",
                  border: `1px solid ${tc.status === "ok" ? "rgba(var(--accent-rgb, 9,212,156), 0.3)" : tc.status === "failed" ? "rgba(255,90,111, 0.3)" : "rgba(246,193,77, 0.3)"}`,
                  animation: "fadeSlideIn 0.3s ease-out",
                }}>
                <div className="mt-0.5 shrink-0">
                  {tc.status === "ok" ? (
                    <Check size={12} style={{ color: "var(--accent)" }} />
                  ) : tc.status === "failed" ? (
                    <AlertCircle size={12} style={{ color: "#ff5a6f" }} />
                  ) : (
                    <Loader2 size={12} className="animate-spin" style={{ color: "#f6c14d" }} />
                  )}
                </div>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)", fontSize: "11px" }}>
                    {tc.tool}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>{tc.summary}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reasoning steps */}
        {reasoningSteps.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}>
              Agent Reasoning
            </div>
            {reasoningSteps.slice(-4).map((step, i) => (
              <div key={`rs-${i}`} className="text-[11px] px-3 py-1.5 rounded"
                style={{ color: "var(--text-muted)", background: "var(--surface-base)" }}>
                {step}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--ghost-border)" }}>
        <div className="flex gap-2 items-center rounded-lg px-3 py-2.5" style={{ background: "var(--surface-base)" }}>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Helio to edit, optimize, or explain..."
            className="flex-1 text-[13px] outline-none bg-transparent"
            style={{ color: "var(--text-primary)" }}
            disabled={isTyping} />
          <button onClick={() => handleSend()} disabled={!input.trim() || isTyping}
            className="p-1.5 rounded transition-colors hover:bg-white/5 disabled:opacity-30"
            style={{ color: input.trim() ? "var(--accent)" : "var(--text-faint)" }}>
            <Send size={14} />
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
