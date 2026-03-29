import { FormEvent, useMemo, useState } from "react";

import type { CandidateState, PipelineState } from "../types";

export function ChatPanel({
  activeCandidate,
  chat,
  explanationByCandidate,
  agentToolTrail,
  candidateComparison,
  onSubmitAgent,
  isSubmitting
}: {
  activeCandidate: CandidateState | null;
  chat: PipelineState["chat"];
  explanationByCandidate: PipelineState["explanationByCandidate"];
  agentToolTrail: PipelineState["agentToolTrail"];
  candidateComparison: PipelineState["candidateComparison"];
  onSubmitAgent: (message: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [message, setMessage] = useState("Make expression more tissue-specific in hippocampal neurons.");
  const quickActions = [
    "Compare all candidates and tell me which one to prioritize.",
    "Improve tissue specificity while preserving functional score.",
    "Make this safer by reducing off-target risk.",
    "Change base position 42 to G and explain the impact."
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
    await onSubmitAgent(trimmed);
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
          <button key={action} type="button" className="quick-action-btn" onClick={() => void onSubmitAgent(action)}>
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
      <div className="tool-trail">
        <h4>Tool Execution</h4>
        {agentToolTrail.length === 0 ? (
          <p>No tool calls yet.</p>
        ) : (
          agentToolTrail.slice(0, 6).map((entry, index) => (
            <div key={`${entry.at}-${entry.tool}-${index}`} className={`tool-row ${entry.status}`}>
              <strong>{entry.tool}</strong>
              <span>{entry.summary}</span>
            </div>
          ))
        )}
      </div>
      {candidateComparison.length > 0 ? (
        <div className="comparison-box">
          <h4>Candidate Comparison</h4>
          {candidateComparison.slice(0, 3).map((row) => (
            <div key={`cmp-${row.candidate_id}`} className="cmp-row">
              <span>#{row.candidate_id}</span>
              <span>{row.combined.toFixed(3)}</span>
              <span>tissue {row.tissue_specificity.toFixed(3)}</span>
              <span>safety {(1 - row.off_target).toFixed(3)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="explanation-stream">{explanation}</div>
    </section>
  );
}
