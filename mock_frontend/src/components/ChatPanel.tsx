import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import type { CandidateState, PipelineState } from "../types";

function scoreBand(value: number): string {
  if (value >= 0.75) return "Strong";
  if (value >= 0.55) return "Promising";
  if (value >= 0.4) return "Weak";
  return "Low";
}

interface VisibleStep {
  tool: string;
  status: string;
  summary: string;
  at: string;
}

export function ChatPanel({
  activeCandidate,
  chat,
  explanationByCandidate,
  agentToolTrail,
  candidateComparison,
  onSubmitAgent,
  isSubmitting,
  agentIterations,
  reasoningSteps
}: {
  activeCandidate: CandidateState | null;
  chat: PipelineState["chat"];
  explanationByCandidate: PipelineState["explanationByCandidate"];
  agentToolTrail: PipelineState["agentToolTrail"];
  candidateComparison: PipelineState["candidateComparison"];
  onSubmitAgent: (message: string) => Promise<void>;
  isSubmitting: boolean;
  agentIterations?: number;
  reasoningSteps?: string[];
}) {
  const [message, setMessage] = useState("");
  const [visibleSteps, setVisibleSteps] = useState<VisibleStep[]>([]);
  const [displayedResponse, setDisplayedResponse] = useState("");
  const [responseComplete, setResponseComplete] = useState(true);
  const prevTrailLenRef = useRef(agentToolTrail.length);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const quickActions = [
    "Compare all candidates and tell me which one to prioritize.",
    "Improve tissue specificity while preserving functional score.",
    "Make this safer by reducing off-target risk.",
    "Change base position 42 to G and explain the impact."
  ];

  const candidateSummary = useMemo(() => {
    if (!activeCandidate?.scores) return "Select a scored candidate to start an agentic refinement loop.";
    const score = activeCandidate.scores;
    const combined =
      typeof score.combined === "number"
        ? score.combined
        : score.functional * 0.45 + score.tissue_specificity * 0.25 + (1 - score.off_target) * 0.2 + score.novelty * 0.1;
    const safety = 1 - score.off_target;
    return (
      `#${activeCandidate.id} | combined ${combined.toFixed(3)} (${scoreBand(combined)}) | ` +
      `functional ${score.functional.toFixed(3)} | ` +
      `tissue ${score.tissue_specificity.toFixed(3)} | ` +
      `safety ${safety.toFixed(3)}`
    );
  }, [activeCandidate]);

  // Animate new tool calls appearing one by one
  useEffect(() => {
    const prevLen = prevTrailLenRef.current;
    const newLen = agentToolTrail.length;
    if (newLen > prevLen) {
      const newEntries = agentToolTrail.slice(0, newLen - prevLen).reverse();
      let delay = 0;
      for (const entry of newEntries) {
        const captured = { ...entry };
        setTimeout(() => {
          setVisibleSteps((prev) => [...prev, captured]);
        }, delay);
        delay += 400;
      }
    }
    prevTrailLenRef.current = newLen;
  }, [agentToolTrail.length]);

  // Typewriter effect for last assistant message
  useEffect(() => {
    const lastAssistant = [...chat].reverse().find((c) => c.role === "assistant");
    if (!lastAssistant) return;
    const fullText = lastAssistant.text;
    if (displayedResponse === fullText) return;

    setResponseComplete(false);
    setDisplayedResponse("");
    let idx = 0;
    const interval = setInterval(() => {
      idx += 1;
      if (idx >= fullText.length) {
        setDisplayedResponse(fullText);
        setResponseComplete(true);
        clearInterval(interval);
      } else {
        setDisplayedResponse(fullText.slice(0, idx));
      }
    }, 12);
    return () => clearInterval(interval);
  }, [chat.filter((c) => c.role === "assistant").length]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleSteps, displayedResponse, isSubmitting]);

  // Clear steps when a new submission starts
  useEffect(() => {
    if (isSubmitting) {
      setVisibleSteps([]);
      setDisplayedResponse("");
      setResponseComplete(true);
    }
  }, [isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    await onSubmitAgent(trimmed);
    setMessage("");
  }

  const latestAssistantMsg = [...chat].reverse().find((c) => c.role === "assistant")?.text ?? "";
  const iterationCount = agentToolTrail.length;

  return (
    <section className="chat-panel">
      <div className="agent-head">
        <h3>Helix Agent</h3>
        <div className="agent-tabs">
          <span className="active">Agent</span>
          <span>Protocols</span>
        </div>
        {iterationCount > 0 && (
          <span className="agent-iteration-badge">
            {iterationCount} tool calls
          </span>
        )}
      </div>

      <p className="agent-context">{candidateSummary}</p>

      <div className="quick-actions">
        {quickActions.map((action) => (
          <button
            key={action}
            type="button"
            className="quick-action-btn"
            onClick={() => {
              setMessage(action);
              void onSubmitAgent(action);
            }}
            disabled={isSubmitting}
          >
            {action}
          </button>
        ))}
      </div>

      <div className="chat-history">
        {chat.slice(-10).map((entry, index) => (
          <div key={`${entry.at}-${index}`} className={`chat-item ${entry.role}`}>
            <span>{entry.role === "assistant" ? "Helix Agent" : entry.role}</span>
            {entry.role === "assistant" && index === chat.slice(-10).length - 1 ? (
              <p className={`agent-response ${responseComplete ? "done" : ""}`}>
                {displayedResponse || entry.text}
              </p>
            ) : (
              <p>{entry.text}</p>
            )}
          </div>
        ))}

        <AnimatePresence>
          {isSubmitting && (
            <motion.div
              className="agent-thinking"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <div className="thinking-dots">
                <span />
                <span />
                <span />
              </div>
              <span>Helix is reasoning over your genome...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {isSubmitting && (
          <div className="agent-progress">
            <div className="agent-progress-fill" style={{ width: "65%" }} />
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask the agent to refine, compare, or explain..."
          disabled={isSubmitting}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Running..." : "Send"}
        </button>
      </form>

      <div className="tool-trail">
        <h4>Agent Tool Trace</h4>
        {visibleSteps.length === 0 && !isSubmitting ? (
          <p>Send a prompt and watch the agent plan, execute tools, and reflect.</p>
        ) : (
          <AnimatePresence>
            {visibleSteps.slice(-8).map((entry, index) => (
              <motion.div
                key={`${entry.at}-${entry.tool}-${index}`}
                className="agent-step"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`agent-step-icon ${entry.status === "ok" ? "done" : entry.status === "failed" ? "failed" : "done"}`}>
                  {entry.status === "ok" ? "✓" : entry.status === "failed" ? "✕" : "✓"}
                </div>
                <div className="agent-step-body">
                  <div className="agent-step-label">{entry.tool}</div>
                  <div className="agent-step-detail">{entry.summary}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {isSubmitting && (
          <motion.div
            className="agent-step"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="agent-step-icon running" />
            <div className="agent-step-body">
              <div className="agent-step-label">executing...</div>
              <div className="agent-step-detail">Agent is selecting and running tools</div>
            </div>
          </motion.div>
        )}
      </div>

      {reasoningSteps && reasoningSteps.length > 0 && (
        <div className="tool-trail">
          <h4>Agent Reasoning Trace</h4>
          {reasoningSteps.slice(-6).map((step, i) => (
            <motion.div
              key={`reason-${i}`}
              className="agent-step"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="agent-step-icon done">
                {i + 1}
              </div>
              <div className="agent-step-body">
                <div className="agent-step-detail">{step}</div>
              </div>
            </motion.div>
          ))}
          {agentIterations && agentIterations > 1 && (
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <span className="agent-iteration-badge">
                {agentIterations} iterations completed
              </span>
            </div>
          )}
        </div>
      )}

      {candidateComparison.length > 0 && (
        <div className="comparison-box">
          <h4>Candidate Ranking</h4>
          {candidateComparison.slice(0, 5).map((row, i) => (
            <div key={`cmp-${row.candidate_id}`} className="cmp-row">
              <span style={{ color: i === 0 ? "var(--accent)" : "var(--muted)" }}>#{row.candidate_id}</span>
              <span>{row.combined.toFixed(3)}</span>
              <span>tissue {row.tissue_specificity.toFixed(3)}</span>
              <span>safety {(1 - row.off_target).toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
