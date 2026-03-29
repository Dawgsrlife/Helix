"use client";

import { useState, useRef, useEffect } from "react";
import { useHelixStore } from "@/lib/store";
import { X, Send, Sparkles } from "lucide-react";

const SCREEN_PROMPTS: Record<string, string[]> = {
  analyze: [
    "Why is the top candidate ranked highest?",
    "Which region has the most functional significance?",
    "Summarize the off-target risk across candidates",
  ],
  leaderboard: [
    "Compare candidate #1 and #2 scoring",
    "Which candidate has the best tissue specificity?",
    "What makes novelty scores vary between candidates?",
  ],
  explorer: [
    "What annotation is at my selected position?",
    "Suggest a mutation to improve this region",
    "Why is the likelihood low at positions 40-60?",
  ],
  ide: [
    "Will this edit improve functional plausibility?",
    "Suggest the next best mutation to try",
    "Compare current version against the original",
  ],
  compare: [
    "Why does Candidate A outperform B overall?",
    "Which sequence differences drive the score delta?",
    "Is the off-target risk acceptable for Candidate B?",
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
        // If the agent updated candidate scores, refresh them
        if (data.candidate_update?.scores) {
          const scores = data.candidate_update.scores;
          const updated = store.candidates.map(c =>
            c.id === (store.activeCandidateId ?? 0)
              ? { ...c, scores: { functional: scores.functional, tissue: scores.tissue_specificity, offTarget: scores.off_target, novelty: scores.novelty }, overall: (scores.combined ?? c.overall) * 100 }
              : c
          );
          useHelixStore.getState().setCandidates(updated);
        }
        setIsTyping(false);
        return;
      }
    } catch {
      // Backend chat endpoint not available — use local smart responses
    }

    // Fallback: context-aware local responses
    setTimeout(() => {
      const store = useHelixStore.getState();
      let response: string;

      const lc = msg.toLowerCase();
      if (lc.includes("what") && (lc.includes("plddt") || lc.includes("confidence"))) {
        response = "pLDDT (predicted Local Distance Difference Test) is the AI's confidence score for each part of a protein structure prediction, from 0-100. Scores above 90 mean the shape prediction is very reliable. Between 70-90 is confident. Below 50 means that region's shape is uncertain — it might be a flexible loop or disordered region.";
      } else if (lc.includes("what") && (lc.includes("functional") || lc.includes("plausibility"))) {
        response = `Functional plausibility measures how likely this DNA sequence produces a working protein. It's based on the Evo 2 model's log-likelihood scores — sequences that look like real, working genes score higher. Your top candidate scores ${((store.candidates[0]?.scores.functional ?? 0) * 100).toFixed(0)}%, which is strong.`;
      } else if (lc.includes("off-target") || lc.includes("risk") || lc.includes("safety")) {
        response = `Off-target risk measures the chance your sequence could accidentally affect unintended genes. Lower is better. Your top candidate shows ${((store.candidates[0]?.scores.offTarget ?? 0) * 100).toFixed(1)}% off-target risk, which is ${(store.candidates[0]?.scores.offTarget ?? 0) < 0.03 ? "excellent — well below the safety threshold" : "moderate — consider reviewing for pathogenic similarities"}.`;
      } else if (lc.includes("suggest") || lc.includes("mutation") || lc.includes("edit")) {
        response = `Based on the likelihood graph, positions with the most negative log-likelihood scores are most evolutionarily constrained — editing those is riskier. I'd suggest trying conservative edits (e.g., synonymous substitutions within coding regions) first. Go to Design Studio, pick a position, change the base, and the simulation will show you the predicted impact instantly.`;
      } else if (lc.includes("why") && lc.includes("rank")) {
        response = `Candidates are ranked by a weighted composite: functional (40%), tissue specificity (25%), safety (20% inverted off-target), and novelty (15%). Your top candidate at ${store.candidates[0]?.overall.toFixed(1) ?? "N/A"} leads because it combines high function with low off-target risk.`;
      } else if (lc.includes("compare") || lc.includes("difference")) {
        const c1 = store.candidates[0], c2 = store.candidates[1];
        if (c1 && c2) {
          response = `Candidate #1 scores ${c1.overall.toFixed(1)} vs #2 at ${c2.overall.toFixed(1)}. The main gap is in functional plausibility (${(c1.scores.functional*100).toFixed(0)}% vs ${(c2.scores.functional*100).toFixed(0)}%). Candidate #2 has higher novelty (${(c2.scores.novelty*100).toFixed(0)}%), which could be valuable if you need a more unique design.`;
        } else {
          response = "Run the analysis to generate multiple candidates, then I can compare their scoring profiles for you.";
        }
      } else if (lc.includes("likelihood") || lc.includes("log-lik") || lc.includes("score")) {
        response = `Log-likelihood is how "natural" the Evo 2 model thinks each position looks. Values closer to 0 are more expected (the model says "yes, this looks like real DNA"). Very negative values mean that position is unusual — it could be functionally important or an error. The graph at the bottom of Explorer shows this for every position.`;
      } else {
        response = `Your analysis covers ${store.rawSequence.length} bp with ${store.candidates.length} candidates scored on function, tissue targeting, safety, and novelty. The top candidate scored ${store.candidates[0]?.overall.toFixed(1) ?? "N/A"} overall. What would you like to know more about?`;
      }

      addChatMessage({ role: "assistant", content: response });
      setIsTyping(false);
    }, 600);
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
              I can help you understand your analysis, explain scores, or suggest edits.
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
