"use client";

import { useState, useRef, useEffect } from "react";
import { useHelixStore } from "@/lib/store";
import { X, Send, Sparkles } from "lucide-react";

const SCREEN_PROMPTS: Record<string, string[]> = {
  analyze: [
    "What do these scores mean?",
    "Rescore the sequence",
    "Suggest an edit to improve function",
  ],
  leaderboard: [
    "Compare candidate #1 and #2",
    "Which candidate is safest?",
    "What can you do?",
  ],
  explorer: [
    "What is this base's annotation?",
    "Mutate position 12 to C",
    "Why is the likelihood low here?",
  ],
  ide: [
    "Mutate position 20 to G",
    "Rescore the sequence",
    "Refold the protein",
  ],
  compare: [
    "Why does Candidate A outperform B?",
    "What can you do?",
    "Suggest an improvement",
  ],
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ChatPanel() {
  const chatMessages = useHelixStore((s) => s.chatMessages);
  const addChatMessage = useHelixStore((s) => s.addChatMessage);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const viewMode = useHelixStore((s) => s.viewMode);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, isTyping]);

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

  const handleSend = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || isTyping) return;
    addChatMessage({ role: "user", content: msg });
    setInput("");
    setIsTyping(true);

    const context = buildContext();
    const systemPrompt = `You are Helio, the AI assistant for Helix — a genomic design IDE. You help users understand their DNA sequence analysis results, protein structures, and scoring metrics.

Current analysis context:
${context}

Rules:
- Be concise (2-4 sentences max unless asked for detail)
- Explain scientific terms in plain English when first used
- Reference specific numbers from the context when relevant
- If asked about mutations, explain the delta log-likelihood (negative = potentially harmful, near zero = neutral)
- pLDDT scores: >90 very confident, 70-90 confident, 50-70 uncertain, <50 unreliable
- Scoring dimensions: functional (does it make a working protein), tissue (targets right cells), off-target (unintended effects, lower=safer), novelty (how unique)`;

    const s = useHelixStore.getState();
    const lc = msg.toLowerCase();

    // ── LOCAL ACTIONS: handle these directly, never send to backend agent ──

    // RESCORE: just re-analyze, no mutations
    if (/\brescore\b|\bre-score\b|\bre-analyze\b|\bscore.+again\b/i.test(lc)) {
      if (s.rawSequence) {
        try {
          const { analyzeSequence } = await import("@/lib/api");
          const result = await analyzeSequence(s.rawSequence);
          useHelixStore.getState().setAnalysisResult(result);
          addChatMessage({ role: "assistant", content: `Rescored ${result.perPositionScores.length} positions. ${result.predictedProteins.length} protein(s) predicted. Check the Overview for updated results.` });
        } catch {
          addChatMessage({ role: "assistant", content: "Couldn't rescore — backend may be unavailable." });
        }
      } else {
        addChatMessage({ role: "assistant", content: "No sequence loaded. Submit a sequence first." });
      }
      setIsTyping(false);
      return;
    }

    // REFOLD: just re-predict structure, no mutations
    if (/\brefold\b|\bre-fold\b|\bpredict structure\b|\bfold again\b/i.test(lc)) {
      if (s.rawSequence) {
        try {
          const { fetchStructure } = await import("@/lib/api");
          const pdb = await fetchStructure(0, s.rawSequence.length, s.rawSequence);
          useHelixStore.getState().setActivePdb(pdb);
          addChatMessage({ role: "assistant", content: "Structure re-folded with ESMFold. Check the 3D Structure view." });
        } catch {
          addChatMessage({ role: "assistant", content: "Structure prediction failed." });
        }
      } else {
        addChatMessage({ role: "assistant", content: "No sequence to fold." });
      }
      setIsTyping(false);
      return;
    }

    // MUTATE: parse "mutate position X to Y" locally
    const mutateMatch = lc.match(/(?:mutate|change|edit|swap)\s+(?:position\s+)?(\d+)\s+(?:to\s+)?([atcg])/i);
    if (mutateMatch && s.rawSequence) {
      const pos = parseInt(mutateMatch[1]);
      const base = mutateMatch[2].toUpperCase();
      if (pos >= 0 && pos < s.rawSequence.length) {
        const oldBase = s.rawSequence[pos];
        const mutated = s.rawSequence.slice(0, pos) + base + s.rawSequence.slice(pos + 1);
        s.setSequence(mutated);
        const { parseSequence } = await import("@/lib/sequenceUtils");
        const newBases = parseSequence(mutated, s.regions).map((b: any, i: number) => ({ ...b, likelihoodScore: s.scores[i]?.score })) as typeof s.bases;
        useHelixStore.setState({ bases: newBases });
        s.addEditEntry({ position: pos, from: oldBase, to: base, delta: 0 });

        let response = `Changed position ${pos}: ${oldBase} → ${base}.`;
        try {
          const { predictMutation } = await import("@/lib/api");
          const effect = await predictMutation(s.rawSequence, pos, base);
          s.setMutationEffect(effect);
          response += ` ΔLL: ${effect.deltaLikelihood.toFixed(4)} (${effect.predictedImpact}).`;
        } catch { /* scoring optional */ }
        try {
          const { fetchStructure } = await import("@/lib/api");
          const pdb = await fetchStructure(0, mutated.length, mutated);
          useHelixStore.getState().setActivePdb(pdb);
          response += " Structure re-folded.";
        } catch { /* folding optional */ }

        addChatMessage({ role: "assistant", content: response });
      } else {
        addChatMessage({ role: "assistant", content: `Position ${pos} is out of range (0-${s.rawSequence.length - 1}).` });
      }
      setIsTyping(false);
      return;
    }

    // ── INFORMATIONAL: try backend agent chat (read-only, never apply mutations) ──

    try {
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
        // Only show the message — never apply candidate_update for informational queries
        addChatMessage({ role: "assistant", content: data.assistant_message ?? "I couldn't process that." });
        setIsTyping(false);
        return;
      }
    } catch {
      // Backend unavailable
    }

    // Fallback: informational responses only (actions already handled above)
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
      response = "Try: \"mutate position 12 to C\" — I'll apply the edit, score it, and re-fold the protein. Say \"rescore\" to re-analyze or \"refold\" to re-predict the structure.";
    } else if (/help|what can you/i.test(lc)) {
      response = "I can: mutate bases (\"mutate position 15 to G\"), rescore the sequence (\"rescore\"), refold the protein (\"refold\"), or explain any metric (ask about pLDDT, functional, off-target, etc).";
    } else if (/compare|difference|candidate/i.test(lc)) {
      const c1 = st.candidates[0], c2 = st.candidates[1];
      response = c1 && c2
        ? `#1: ${c1.overall.toFixed(1)} vs #2: ${c2.overall.toFixed(1)}. Main gap: functional (${(c1.scores.functional*100).toFixed(0)}% vs ${(c2.scores.functional*100).toFixed(0)}%).`
        : "Need at least 2 candidates to compare.";
    } else if (/likelihood|log.?lik/i.test(lc)) {
      response = "Log-likelihood measures how 'natural' each DNA position looks to Evo 2. Values closer to 0 = more expected. Very negative = unusual (could be functionally important or an error).";
    } else {
      response = st.rawSequence
        ? `Sequence: ${st.rawSequence.length} bp, ${st.candidates.length} candidates. Top score: ${st.candidates[0]?.overall.toFixed(1) ?? "N/A"}. Ask me to explain metrics, mutate bases, rescore, or refold.`
        : "No sequence loaded yet. Submit a sequence from the Home page to get started.";
    }

    addChatMessage({ role: "assistant", content: response });
    setIsTyping(false);
  };

  return (
    <div className="w-[340px] shrink-0 flex flex-col h-full"
      style={{ background: "var(--surface-raised)", borderLeft: "1px solid var(--ghost-border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--ghost-border)" }}>
        <div className="flex items-center gap-2.5">
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Helio</span>
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
              I can mutate bases, rescore sequences, refold proteins, and explain any metric. Try it.
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
        {isTyping && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Helio</div>
            <div className="flex gap-1.5 py-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid var(--ghost-border)" }}>
        <div className="flex gap-2 items-center rounded-lg px-3 py-2.5" style={{ background: "var(--surface-base)" }}>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Helio anything..."
            className="flex-1 text-[13px] outline-none bg-transparent"
            style={{ color: "var(--text-primary)" }} />
          <button onClick={() => handleSend()} disabled={!input.trim() || isTyping}
            className="p-1.5 rounded transition-colors hover:bg-white/5 disabled:opacity-30"
            style={{ color: input.trim() ? "var(--accent)" : "var(--text-faint)" }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
