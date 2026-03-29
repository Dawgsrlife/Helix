import { FormEvent, useMemo, useState } from "react";

import type { CandidateState, PipelineState } from "../types";

export function ChatPanel({
  activeCandidate,
  chat,
  explanationByCandidate,
  onSubmitFollowup,
  isSubmitting
}: {
  activeCandidate: CandidateState | null;
  chat: PipelineState["chat"];
  explanationByCandidate: PipelineState["explanationByCandidate"];
  onSubmitFollowup: (message: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [message, setMessage] = useState("Make expression more tissue-specific in hippocampal neurons.");
  const quickActions = [
    "Improve tissue specificity while preserving functional score.",
    "Generate 3 safer variants and explain each trade-off.",
    "Propose CRISPR edits to reduce off-target activity.",
    "Identify druggable motifs in this candidate."
  ];
  const explanation = useMemo(() => {
    if (!activeCandidate) return "Waiting for explanation stream...";
    return explanationByCandidate[activeCandidate.id] || "Waiting for explanation stream...";
  }, [activeCandidate, explanationByCandidate]);
  const candidateSummary = useMemo(() => {
    if (!activeCandidate?.scores) return "Select a scored candidate to start an agentic refinement loop.";
    const score = activeCandidate.scores;
    return `Candidate #${activeCandidate.id} | function ${score.functional.toFixed(3)} | tissue ${score.tissue_specificity.toFixed(
      3
    )} | safety ${(1 - score.off_target).toFixed(3)} | novelty ${score.novelty.toFixed(3)}`;
  }, [activeCandidate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    await onSubmitFollowup(trimmed);
    setMessage("");
  }

  return (
    <section className="chat-panel">
      <div className="agent-head">
        <h3>Agentic Copilot</h3>
        <div className="agent-tabs">
          <span className="active">Chat</span>
          <span>Protocols</span>
        </div>
      </div>
      <p className="agent-context">{candidateSummary}</p>
      <div className="quick-actions">
        {quickActions.map((action) => (
          <button key={action} type="button" className="quick-action-btn" onClick={() => void onSubmitFollowup(action)}>
            {action}
          </button>
        ))}
      </div>
      <div className="chat-history">
        {chat.slice(-8).map((entry, index) => (
          <div key={`${entry.at}-${index}`} className={`chat-item ${entry.role}`}>
            <span>{entry.role}</span>
            <p>{entry.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="chat-form">
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask Helix to refine this candidate" />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send"}
        </button>
      </form>
      <div className="explanation-stream">{explanation}</div>
    </section>
  );
}
