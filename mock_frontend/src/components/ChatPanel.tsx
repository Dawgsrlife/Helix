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
  const explanation = useMemo(() => {
    if (!activeCandidate) return "Waiting for explanation stream...";
    return explanationByCandidate[activeCandidate.id] || "Waiting for explanation stream...";
  }, [activeCandidate, explanationByCandidate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    await onSubmitFollowup(trimmed);
    setMessage("");
  }

  return (
    <section className="chat-panel">
      <h3>Iteration Loop</h3>
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
