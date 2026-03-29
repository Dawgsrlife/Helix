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

    const store = useHelixStore.getState();
    try {
      // Try calling the backend's agentic chat endpoint
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: store.sessionId ?? "local",
          candidate_id: store.activeCandidateId ?? 0,
          message: msg,
          history: chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addChatMessage({ role: "assistant", content: data.assistant_message ?? "I couldn't process that." });

        // Only apply candidate updates if the user asked for an action
        const actionWords = /mutate|change|edit|swap|optimize|improve|rescore|refold|fold|fix|modify|update|make/i;
        const userRequestedAction = actionWords.test(msg);
        const update = userRequestedAction ? data.candidate_update : null;
        if (update) {
          const s = useHelixStore.getState();

          // Update sequence if the agent mutated it
          if (update.sequence && update.sequence !== s.rawSequence) {
            s.setSequence(update.sequence);
            const { parseSequence } = await import("@/lib/sequenceUtils");
            const newBases = parseSequence(update.sequence, s.regions).map((b: any, i: number) => ({
              ...b, likelihoodScore: s.scores[i]?.score,
            })) as typeof s.bases;
            useHelixStore.setState({ bases: newBases });
          }

          // Update scores
          if (update.scores) {
            const scores = update.scores;
            const updated = s.candidates.map(c =>
              c.id === (s.activeCandidateId ?? 0)
                ? { ...c, scores: { functional: scores.functional, tissue: scores.tissue_specificity, offTarget: scores.off_target, novelty: scores.novelty }, overall: (scores.combined ?? 0) * 100 }
                : c
            );
            useHelixStore.getState().setCandidates(updated);
          }

          // Update 3D structure if agent re-folded it
          if (update.pdb_data) {
            useHelixStore.getState().setActivePdb(update.pdb_data);
          }

          // Log mutation if one was applied
          if (update.mutation) {
            const m = update.mutation;
            useHelixStore.getState().addEditEntry({
              position: m.position ?? 0,
              from: m.original_base ?? "?",
              to: m.new_base ?? "?",
              delta: 0,
            });
          }
        }

        setIsTyping(false);
        return;
      }
    } catch (err) {
      console.debug("[Helio] Backend agent chat unavailable, using local responses:", err);
    }

    // Fallback: local responses with action capability
    const doFallback = async () => {
      const s = useHelixStore.getState();
      const lc = msg.toLowerCase();
      let response: string;

      // ACTION: Mutate a specific position
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

          // Try to predict mutation effect
          try {
            const { predictMutation } = await import("@/lib/api");
            const effect = await predictMutation(s.rawSequence, pos, base);
            s.setMutationEffect(effect);
            response = `Done. Changed position ${pos} from ${oldBase} to ${base}. Delta log-likelihood: ${effect.deltaLikelihood.toFixed(4)} (${effect.predictedImpact}). The sequence is updated — check the viewer.`;
          } catch {
            response = `Done. Changed position ${pos} from ${oldBase} to ${base}. Sequence updated. I couldn't score the impact — try running Rescore in Design Studio.`;
          }

          // Re-fold in background
          try {
            const { fetchStructure } = await import("@/lib/api");
            const pdb = await fetchStructure(0, mutated.length, mutated);
            useHelixStore.getState().setActivePdb(pdb);
            response += " The 3D structure has been re-folded with the new sequence.";
          } catch { /* keep old structure */ }

          addChatMessage({ role: "assistant", content: response });
          setIsTyping(false);
          return;
        }
      }

      // ACTION: Rescore the sequence
      if (lc.includes("rescore") || lc.includes("re-score") || lc.includes("re-analyze") || (lc.includes("score") && lc.includes("again"))) {
        if (s.rawSequence) {
          try {
            const { analyzeSequence } = await import("@/lib/api");
            const result = await analyzeSequence(s.rawSequence);
            useHelixStore.getState().setAnalysisResult(result);
            response = `Rescored. The sequence now has ${result.perPositionScores.length} per-position scores. ${result.predictedProteins.length} protein(s) predicted. Check the Overview for updated results.`;
          } catch {
            response = "I couldn't rescore — the backend might be unavailable. Try the Rescore button in Design Studio.";
          }
        } else {
          response = "No sequence loaded to rescore. Submit a sequence first.";
        }
        addChatMessage({ role: "assistant", content: response });
        setIsTyping(false);
        return;
      }

      // ACTION: Re-fold structure
      if (lc.includes("refold") || lc.includes("re-fold") || lc.includes("predict structure") || lc.includes("fold again")) {
        if (s.rawSequence) {
          try {
            const { fetchStructure } = await import("@/lib/api");
            const pdb = await fetchStructure(0, s.rawSequence.length, s.rawSequence);
            useHelixStore.getState().setActivePdb(pdb);
            response = "Structure re-folded with ESMFold. Check the 3D Structure view for the updated protein.";
          } catch {
            response = "Structure prediction failed — ESMFold may be unavailable.";
          }
        } else {
          response = "No sequence to fold. Submit a sequence first.";
        }
        addChatMessage({ role: "assistant", content: response });
        setIsTyping(false);
        return;
      }

      // INFORMATIONAL responses
      if (lc.includes("what") && (lc.includes("plddt") || lc.includes("confidence"))) {
        response = "pLDDT is the AI's confidence score (0-100) for each part of a protein structure prediction. Above 90 = very reliable. 70-90 = confident. Below 50 = uncertain shape.";
      } else if (lc.includes("off-target") || lc.includes("risk") || lc.includes("safety")) {
        response = `Off-target risk: ${((s.candidates[0]?.scores.offTarget ?? 0) * 100).toFixed(1)}%. ${(s.candidates[0]?.scores.offTarget ?? 0) < 0.03 ? "Excellent — well below safety threshold." : "Moderate — consider reviewing."}`;
      } else if (lc.includes("suggest") || lc.includes("recommend")) {
        response = "Try: \"mutate position 12 to C\" or \"mutate position 30 to G\". I'll apply the edit, score it, and re-fold the protein. You can also say \"rescore\" or \"refold\" anytime.";
      } else if (lc.includes("help") || lc.includes("what can you do")) {
        response = "I can: (1) mutate bases — say \"mutate position 15 to G\", (2) rescore — say \"rescore\", (3) refold — say \"refold\", (4) explain any metric — ask about pLDDT, functional, off-target, etc.";
      } else {
        response = `Sequence: ${s.rawSequence.length} bp, ${s.candidates.length} candidates. Top score: ${s.candidates[0]?.overall.toFixed(1) ?? "N/A"}. I can mutate bases, rescore, refold, or explain metrics — just ask.`;
      }

      addChatMessage({ role: "assistant", content: response });
      setIsTyping(false);
    };
    doFallback();
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
