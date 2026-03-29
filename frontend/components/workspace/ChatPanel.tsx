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

export default function ChatPanel() {
  const chatMessages = useHelixStore((s) => s.chatMessages);
  const addChatMessage = useHelixStore((s) => s.addChatMessage);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const viewMode = useHelixStore((s) => s.viewMode);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const selectedPosition = useHelixStore((s) => s.selectedPosition);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length, isTyping]);

  const prompts = SCREEN_PROMPTS[viewMode] ?? SCREEN_PROMPTS.analyze;

  const handleSend = (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg) return;
    addChatMessage({ role: "user", content: msg });
    setInput("");
    setIsTyping(true);

    // Context-aware mock responses
    setTimeout(() => {
      const store = useHelixStore.getState();
      let response: string;

      if (msg.toLowerCase().includes("why") && msg.toLowerCase().includes("rank")) {
        response = `Candidate ${activeCandidateId ?? 0} ranks highest with an overall score of ${store.candidates[0]?.overall.toFixed(1) ?? "N/A"}. The key driver is functional plausibility at ${((store.candidates[0]?.scores.functional ?? 0) * 100).toFixed(0)}%, combined with a very low off-target risk of ${((store.candidates[0]?.scores.offTarget ?? 0) * 100).toFixed(1)}%. The regulatory region at positions 40-120 shows conserved motifs consistent with the target promoter elements.`;
      } else if (msg.toLowerCase().includes("suggest") || msg.toLowerCase().includes("mutation")) {
        response = `Based on the current scoring profile, I recommend editing position ${selectedPosition ?? 67} (${store.rawSequence[selectedPosition ?? 67] ?? "T"} to G). The model predicts this will increase tissue specificity by approximately 3% while maintaining functional plausibility above 90%. Open in Design Studio to apply this edit.`;
      } else if (msg.toLowerCase().includes("compare") || msg.toLowerCase().includes("difference")) {
        response = `Candidate #1 outperforms #2 primarily in functional plausibility (${((store.candidates[0]?.scores.functional ?? 0) * 100).toFixed(0)}% vs ${((store.candidates[1]?.scores.functional ?? 0) * 100).toFixed(0)}%). The sequence differences at positions in coding regions contribute most to this gap. However, Candidate #2 shows higher novelty (${((store.candidates[1]?.scores.novelty ?? 0) * 100).toFixed(0)}%), which may be valuable for patentability.`;
      } else if (msg.toLowerCase().includes("off-target") || msg.toLowerCase().includes("risk")) {
        response = `Off-target risk is evaluated by comparing the candidate sequence against known pathogenic variants in ClinVar. The top candidate shows 0.04% similarity to pathogenic sequences, which is well below the 1% threshold typically used in regulatory submissions. No known splice-site disruptions or premature stop codons were detected.`;
      } else {
        response = `Your analysis covers ${store.rawSequence.length} bp with ${store.regions.length} annotated regions. The pipeline identified ${store.candidates.length} candidates scored across four dimensions: functional plausibility, tissue specificity, off-target risk, and novelty. The top candidate achieved an overall score of ${store.candidates[0]?.overall.toFixed(1) ?? "N/A"}. Would you like me to explain a specific dimension or suggest next steps?`;
      }

      addChatMessage({ role: "assistant", content: response });
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="w-[340px] shrink-0 flex flex-col h-full"
      style={{ background: "#1c1c1f", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: "#5bb5a2" }} />
          <span className="text-sm font-medium" style={{ color: "#F0EFED" }}>Copilot</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: "rgba(91,181,162,0.1)", color: "#5bb5a2" }}>
            {viewMode === "ide" ? "Studio" : viewMode === "explorer" ? "Explorer" : viewMode === "compare" ? "Compare" : "Analysis"}
          </span>
        </div>
        <button onClick={toggleChat} className="p-1 rounded hover:bg-white/5 transition-colors">
          <X size={16} style={{ color: "#888" }} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="py-4">
            <p className="text-[13px] mb-4 leading-relaxed" style={{ color: "#D1D0CC" }}>
              Ask about your analysis, candidates, or get mutation suggestions.
            </p>
            <div className="space-y-2">
              {prompts.map((q) => (
                <button key={q} onClick={() => handleSend(q)}
                  className="block w-full text-left text-[12px] px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.04]"
                  style={{ color: "#D1D0CC", border: "1px solid rgba(255,255,255,0.04)" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i}>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5"
              style={{ color: msg.role === "user" ? "#888" : "#5bb5a2" }}>
              {msg.role === "user" ? "You" : "Copilot"}
            </div>
            <div className={`text-[13px] leading-relaxed ${msg.role === "user" ? "pl-3" : ""}`}
              style={{
                color: "#F0EFED",
                borderLeft: msg.role === "user" ? "2px solid rgba(255,255,255,0.08)" : "none",
              }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "#5bb5a2" }}>Copilot</div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#5bb5a2", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex gap-2 items-center rounded-lg px-3 py-2" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.06)" }}>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={viewMode === "ide" ? "Ask about your edits..." : "Ask about this analysis..."}
            className="flex-1 text-[13px] outline-none bg-transparent"
            style={{ color: "#F0EFED" }} />
          <button onClick={() => handleSend()} disabled={!input.trim()}
            className="p-1.5 rounded transition-colors hover:bg-white/5 disabled:opacity-30"
            style={{ color: input.trim() ? "#5bb5a2" : "#555" }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
