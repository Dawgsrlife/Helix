"use client";

import { useState, useRef, useEffect } from "react";
import { useHelixStore } from "@/lib/store";
import { X, Send } from "lucide-react";

export default function ChatPanel() {
  const chatMessages = useHelixStore((s) => s.chatMessages);
  const addChatMessage = useHelixStore((s) => s.addChatMessage);
  const toggleChat = useHelixStore((s) => s.toggleChat);
  const activeCandidateId = useHelixStore((s) => s.activeCandidateId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [chatMessages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    addChatMessage({ role: "user", content: input.trim() });
    const question = input.trim();
    setInput("");

    // Mock assistant response
    setTimeout(() => {
      addChatMessage({
        role: "assistant",
        content: question.toLowerCase().includes("why")
          ? `Candidate ${activeCandidateId ?? 0} ranks highest due to strong functional plausibility (94%) and low off-target risk (0.04%). The regulatory region at positions 40-120 shows conserved motifs consistent with BDNF promoter elements.`
          : question.toLowerCase().includes("edit") || question.toLowerCase().includes("suggest")
            ? `Based on the current scoring profile, I'd recommend editing position 67 (T→G) which the model predicts will increase tissue specificity by approximately 3% while maintaining functional plausibility above 90%.`
            : `The current analysis shows ${useHelixStore.getState().regions.length} annotated regions across ${useHelixStore.getState().rawSequence.length} bp. The top candidate maintains strong scores across all four dimensions. Would you like me to explain a specific metric or suggest mutations?`,
      });
    }, 800);
  };

  return (
    <div className="w-[340px] shrink-0 flex flex-col h-full"
      style={{ background: "#1A1917", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "#F0EFED" }}>Helix Copilot</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#5bb5a2] animate-pulse" />
        </div>
        <button onClick={toggleChat} className="p-1 rounded hover:bg-white/5 transition-colors">
          <X size={16} style={{ color: "#888" }} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm mb-2" style={{ color: "#888" }}>Ask about the current analysis</p>
            <div className="space-y-2">
              {["Why is this candidate ranked #1?", "Suggest a mutation to improve specificity", "Explain the scoring dimensions"].map((q) => (
                <button key={q} onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.03]"
                  style={{ color: "#D1D0CC", border: "1px solid rgba(255,255,255,0.04)" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`${msg.role === "user" ? "ml-8" : "mr-4"}`}>
            <div className="text-[11px] font-medium uppercase tracking-wider mb-1"
              style={{ color: msg.role === "user" ? "#888" : "#5bb5a2" }}>
              {msg.role === "user" ? "You" : "Copilot"}
            </div>
            <div className="text-[13px] leading-relaxed rounded-lg px-3 py-2.5"
              style={{
                color: "#F0EFED",
                background: msg.role === "user" ? "rgba(255,255,255,0.04)" : "transparent",
              }}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about this analysis..."
            className="flex-1 text-[13px] px-3 py-2 rounded-lg outline-none"
            style={{ background: "#131311", color: "#F0EFED", border: "1px solid rgba(255,255,255,0.06)" }} />
          <button onClick={handleSend}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: input.trim() ? "#5bb5a2" : "#555" }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
