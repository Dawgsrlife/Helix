"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000";

interface ToolCallEntry {
  tool: string;
  status: string;
  summary: string;
}

interface GuidedPrompt {
  label: string;
  prompt: string;
  why: string;
}

export default function ChatPanel() {
  const chatMessages = useHelixStore((s) => s.chatMessages);
  const addChatMessage = useHelixStore((s) => s.addChatMessage);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const viewMode = useHelixStore((s) => s.viewMode);
  const candidates = useHelixStore((s) => s.candidates);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const selectedPosition = useHelixStore((s) => s.selectedPosition);
  const editHistoryLength = useHelixStore((s) => s.editHistory.length);
  const chatDraft = useHelixStore((s) => s.chatDraft);
  const setChatDraft = useHelixStore((s) => s.setChatDraft);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentPhase, setAgentPhase] = useState<"idle" | "thinking" | "executing" | "reflecting">("idle");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallEntry[]>([]);
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([]);
  const [iterations, setIterations] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, isTyping, activeToolCalls.length, agentPhase]);

  useEffect(() => {
    if (!chatDraft) return;
    setInput(chatDraft);
    inputRef.current?.focus();
    setChatDraft(null);
  }, [chatDraft, setChatDraft]);

  const prompts = SCREEN_PROMPTS[viewMode] ?? SCREEN_PROMPTS.analyze;
  const guidedPrompts = useMemo(() => {
    const active =
      candidates.find((c) => c.id === (activeCandidateId ?? -1)) ??
      candidates[0];
    const items: GuidedPrompt[] = [];

    if (active) {
      items.push({
        label: "Explain Like I’m New",
        prompt: "Explain this candidate in plain English for a beginner. What does each score mean and what should I do next?",
        why: "Fast orientation for first-time users",
      });
      if (active.scores.offTarget > 0.02) {
        items.push({
          label: "Make It Safer",
          prompt: "Make this safer by reducing off-target risk, apply the best edit, and explain the tradeoff simply.",
          why: "Reduces unwanted effects",
        });
      }
      if (active.scores.tissue < 0.6) {
        items.push({
          label: "Improve Tissue Fit",
          prompt: "Optimize this candidate for tissue specificity and explain what changed.",
          why: "Better targeting for intended tissue",
        });
      }
      if (active.scores.functional < 0.68) {
        items.push({
          label: "Boost Likely-To-Work",
          prompt: "Optimize for functional plausibility and show me the before/after scores.",
          why: "Raises success probability",
        });
      }
    }

    if (selectedPosition !== null) {
      items.push({
        label: "Inspect Selected Base",
        prompt: `Explain what base position ${selectedPosition} might influence and suggest one beneficial mutation.`,
        why: "Connects sequence edits to outcomes",
      });
    }
    if (editHistoryLength > 0) {
      items.push({
        label: "Undo Last Edit",
        prompt: "Undo the last edit and explain how the scores changed.",
        why: "Safe rollback when experimenting",
      });
    }
    if (candidates.length > 1) {
      items.push({
        label: "Compare Top 3",
        prompt: "Compare the top 3 candidates for a layman and recommend one with a simple reason.",
        why: "Decision support without jargon",
      });
    }

    // Ensure stable, compact list.
    const deduped: GuidedPrompt[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.label)) continue;
      seen.add(item.label);
      deduped.push(item);
      if (deduped.length >= 6) break;
    }
    return deduped;
  }, [activeCandidateId, candidates, editHistoryLength, selectedPosition, viewMode]);

  const streamAssistantText = async (text: string) => {
    setStreamingText("");
    const clean = (text || "").trim();
    if (!clean) return;
    const step = clean.length > 280 ? 6 : clean.length > 140 ? 4 : 2;
    for (let i = 0; i < clean.length; i += step) {
      setStreamingText(clean.slice(0, i + step));
      await new Promise((r) => setTimeout(r, 14));
    }
  };

  /** Apply candidate_update from the backend agent to the store */
  const applyAgentUpdate = async (update: Record<string, any>) => {
    const s = useHelixStore.getState();
    const candidateId = update.candidate_id ?? s.activeCandidateId ?? 0;
    if (update.sequence && typeof update.sequence === "string") {
      s.setSequence(update.sequence);
      try {
        const { parseSequence } = await import("@/lib/sequenceUtils");
        const newBases = parseSequence(update.sequence, s.regions).map((b: any, i: number) => ({
          ...b,
          likelihoodScore: update.per_position_scores?.[i]?.score ?? s.scores[i]?.score,
        }));
        useHelixStore.setState({
          bases: newBases,
          scores: Array.isArray(update.per_position_scores)
            ? update.per_position_scores.map((row: any) => ({
                position: Number(row.position ?? 0),
                score: Number(row.score ?? 0),
              }))
            : s.scores,
        });
      } catch { /* parsing optional */ }
    }
    if (update.scores) {
      const scores = update.scores;
      const candidates = [...s.candidates];
      const idx = candidates.findIndex(c => c.id === candidateId);
      const nextCandidate = {
        id: candidateId,
        sequence: update.sequence ?? (idx >= 0 ? candidates[idx].sequence : s.rawSequence),
        scores: {
          functional: Number(scores.functional ?? (idx >= 0 ? candidates[idx].scores.functional : 0)),
          tissue: Number(scores.tissue_specificity ?? (idx >= 0 ? candidates[idx].scores.tissue : 0)),
          offTarget: Number(scores.off_target ?? (idx >= 0 ? candidates[idx].scores.offTarget : 0)),
          novelty: Number(scores.novelty ?? (idx >= 0 ? candidates[idx].scores.novelty : 0)),
        },
        overall: 0,
        status: "scored",
      };
      nextCandidate.overall = (
        nextCandidate.scores.functional * 0.35 +
        nextCandidate.scores.tissue * 0.30 +
        (1 - nextCandidate.scores.offTarget) * 0.20 +
        nextCandidate.scores.novelty * 0.15
      ) * 100;
      if (idx >= 0) {
        candidates[idx] = nextCandidate;
      } else {
        candidates.push(nextCandidate);
      }
      candidates.sort((a, b) => b.overall - a.overall);
      useHelixStore.getState().setCandidates(candidates);
      useHelixStore.getState().setActiveCandidateId(candidateId);
    }
    if (update.pdb_data && typeof update.pdb_data === "string" && update.pdb_data.length > 10) {
      useHelixStore.getState().setActivePdb(update.pdb_data);
    } else if (update.sequence) {
      // Backend didn't return PDB — trigger a refold on the new sequence
      try {
        const { fetchStructure } = await import("@/lib/api");
        const pdb = await fetchStructure(0, update.sequence.length, update.sequence);
        useHelixStore.getState().setActivePdb(pdb);
      } catch { /* structure optional */ }
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
      const historyPayload = useHelixStore
        .getState()
        .chatMessages
        .slice(-64)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: s.sessionId ?? "local",
          candidate_id: s.activeCandidateId ?? 0,
          message: msg,
          history: historyPayload,
          sequence: s.rawSequence || undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Agent request failed (${res.status}): ${errText || "unknown error"}`);
      }

      const data = await res.json();
      if (data.tool_calls && Array.isArray(data.tool_calls)) {
        setAgentPhase("executing");
        for (let i = 0; i < data.tool_calls.length; i++) {
          const tc = data.tool_calls[i];
          await new Promise((r) => setTimeout(r, 220));
          setActiveToolCalls((prev) => [...prev, { tool: tc.tool, status: tc.status, summary: tc.summary }]);
        }
      }

      if (data.reasoning_steps && Array.isArray(data.reasoning_steps)) {
        setReasoningSteps(data.reasoning_steps);
      }
      if (typeof data.iterations === "number") {
        setIterations(data.iterations);
      }

      if (data.candidate_update) {
        setAgentPhase("reflecting");
        useHelixStore.getState().saveVersion();
        await applyAgentUpdate(data.candidate_update);
      }

      if (data.comparison && Array.isArray(data.comparison)) {
        setActiveToolCalls((prev) => [
          ...prev,
          { tool: "compare", status: "ok", summary: `Ranked ${data.comparison.length} candidates` },
        ]);
      }

      const assistantText = data.assistant_message ?? "I couldn't process that.";
      await streamAssistantText(assistantText);
      addChatMessage({ role: "assistant", content: assistantText });
      setStreamingText("");
    } catch (err) {
      addChatMessage({
        role: "assistant",
        content:
          err instanceof Error
            ? `Agent backend error: ${err.message}`
            : "Agent backend error: request failed.",
      });
      setStreamingText("");
    } finally {
      setIsTyping(false);
      setAgentPhase("idle");
    }
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
        {guidedPrompts.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Guided Experiments
            </div>
            {guidedPrompts.map((item) => (
              <button
                key={item.label}
                onClick={() => handleSend(item.prompt)}
                disabled={isTyping}
                className="w-full text-left px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                style={{ background: "var(--surface-base)" }}
              >
                <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.label}</div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.why}</div>
              </button>
            ))}
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
            {streamingText && (
              <div
                className="mt-2 text-[13px] leading-relaxed px-3 py-2 rounded-lg"
                style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}
              >
                {streamingText}
                <span className="ml-1 inline-block w-2 h-4 align-middle animate-pulse" style={{ background: "var(--accent)" }} />
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
