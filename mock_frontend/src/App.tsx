import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { postDesign, connectPipelineSocket, postBaseEdit, postFollowup } from "./lib/api";
import { usePipelineStore } from "./store/usePipelineStore";
import { AutoplayRibbon } from "./components/AutoplayRibbon";
import { StageFlow } from "./components/StageFlow";
import { GenomeLanes } from "./components/GenomeLanes";
import { Leaderboard } from "./components/Leaderboard";
import { ProteinPanel } from "./components/ProteinPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ScientificDrawer } from "./components/ScientificDrawer";

const DEFAULT_GOAL =
  "Design a regulatory element that drives BDNF expression in hippocampal neurons for Alzheimer's therapy.";

function makeSessionId(): string {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export default function App() {
  const state = usePipelineStore();
  const dispatch = usePipelineStore((s) => s.dispatch);
  const [apiBase, setApiBase] = useState(state.apiBase);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [candidateCount, setCandidateCount] = useState(5);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const activeCandidate = useMemo(() => {
    if (state.activeCandidateId === null) return null;
    return state.candidates[state.activeCandidateId] ?? null;
  }, [state.activeCandidateId, state.candidates]);

  const completedCount = useMemo(
    () => Object.values(state.candidates).filter((candidate) => candidate.status === "structured").length,
    [state.candidates]
  );
  const failedCount = useMemo(
    () => Object.values(state.candidates).filter((candidate) => candidate.status === "failed").length,
    [state.candidates]
  );

  async function submitDesign(runProfile: "demo" | "live" = "demo"): Promise<void> {
    const requestedCandidates = Math.max(1, Math.min(8, candidateCount));
    dispatch({ type: "INIT_DESIGN_SUBMIT", apiBase, requestedCandidates });
    const sessionId = makeSessionId();

    try {
      const design = await postDesign({
        apiBase,
        goal,
        sessionId,
        numCandidates: requestedCandidates,
        runProfile
      });
      dispatch({
        type: "DESIGN_ACCEPTED",
        sessionId: design.session_id,
        wsUrl: design.ws_url,
        runProfile,
        goal
      });

      if (socketRef.current) socketRef.current.close();
      socketRef.current = connectPipelineSocket({
        wsUrl: design.ws_url,
        onStatus: (status) => dispatch({ type: "WS_STATUS", status }),
        onEvent: (payload) => dispatch({ type: "PIPELINE_EVENT", payload }),
        onError: (message) => dispatch({ type: "BASE_EDIT_ERROR", message })
      });
    } catch (error) {
      dispatch({ type: "BASE_EDIT_ERROR", message: String(error) });
    }
  }

  async function handleBaseEdit(newBase: string): Promise<void> {
    if (!activeCandidate || state.selectedPosition === null || !state.sessionId) return;
    const started = performance.now();
    try {
      const response = await postBaseEdit({
        apiBase,
        sessionId: state.sessionId,
        candidateId: activeCandidate.id,
        position: state.selectedPosition,
        newBase
      });
      dispatch({
        type: "BASE_EDIT_APPLIED",
        candidateId: activeCandidate.id,
        response,
        elapsedMs: performance.now() - started
      });
    } catch (error) {
      dispatch({ type: "BASE_EDIT_ERROR", message: String(error) });
    }
  }

  async function handleFollowup(message: string): Promise<void> {
    if (!state.sessionId || !activeCandidate) return;
    dispatch({ type: "FOLLOWUP_PENDING", message });
    try {
      const response = await postFollowup({
        apiBase,
        sessionId: state.sessionId,
        candidateId: activeCandidate.id,
        message
      });
      dispatch({
        type: "FOLLOWUP_ACCEPTED",
        message,
        steps: response.steps_rerunning
      });
    } catch (error) {
      dispatch({ type: "BASE_EDIT_ERROR", message: String(error) });
    }
  }

  useEffect(() => {
    if (state.autoplayStarted) return;
    dispatch({ type: "SET_AUTOPLAY_STARTED", value: true });
    const timer = window.setTimeout(() => {
      void submitDesign("demo");
    }, 750);
    return () => window.clearTimeout(timer);
  }, [dispatch, state.autoplayStarted]);

  useEffect(() => () => socketRef.current?.close(), []);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <h1>Helix Demo Mode</h1>
          <p>
            Design DNA candidates live, rank them in real time, and iterate by directly editing nucleotides.
          </p>
        </div>
        <div className="hero-controls">
          <label>
            API Base
            <input
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
            />
          </label>
          <div className={`ws-pill ${state.wsStatus}`}>WS: {state.wsStatus}</div>
        </div>
      </header>

      <AutoplayRibbon pipelineStatus={state.pipelineStatus} summary={state.laymanSummary} />

      <section className="command-bar">
        <textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
        <div className="command-actions">
          <label>
            Candidate Count
            <input
              type="number"
              min={1}
              max={8}
              value={candidateCount}
              onChange={(event) => setCandidateCount(Number(event.target.value || 5))}
            />
          </label>
          <button onClick={() => void submitDesign("demo")} disabled={state.isSubmittingDesign}>
            {state.isSubmittingDesign ? "Starting..." : "Run Silent Demo"}
          </button>
          <button onClick={() => void submitDesign("live")} className="secondary" disabled={state.isSubmittingDesign}>
            Run Live Mode
          </button>
        </div>
      </section>

      <section className="metrics">
        <div>Session: {state.sessionId || "--"}</div>
        <div>Requested: {state.requestedCandidates}</div>
        <div>Ready: {completedCount}</div>
        <div>Failed: {failedCount}</div>
      </section>

      <StageFlow stages={state.stages} />

      <section className="grid-two">
        <div className="card">
          <h2>Genome Lanes</h2>
          <GenomeLanes
            candidateOrder={state.candidateOrder}
            candidates={state.candidates}
            activeCandidateId={state.activeCandidateId}
            selectedPosition={state.selectedPosition}
            onSelectCandidate={(candidateId) => dispatch({ type: "SELECT_CANDIDATE", candidateId })}
            onSelectPosition={(position) => dispatch({ type: "SELECT_POSITION", position })}
          />
          <div className="edit-row">
            <span>{state.editFeedback || "Select a base to mutate and observe <2s rescoring."}</span>
            <div className="base-buttons">
              {["A", "T", "C", "G"].map((base) => (
                <button key={base} onClick={() => void handleBaseEdit(base)}>
                  {base}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <h2>Candidate Race</h2>
          <Leaderboard
            candidates={state.candidates}
            activeCandidateId={state.activeCandidateId}
            onSelect={(candidateId) => dispatch({ type: "SELECT_CANDIDATE", candidateId })}
          />
        </div>
      </section>

      <section className="grid-two">
        <div className="card">
          <h2>Protein View</h2>
          <ProteinPanel candidate={activeCandidate} />
        </div>
        <div className="card">
          <h2>Conversation</h2>
          <ChatPanel
            activeCandidate={activeCandidate}
            chat={state.chat}
            explanationByCandidate={state.explanationByCandidate}
            onSubmitFollowup={handleFollowup}
            isSubmitting={state.isSubmittingFollowup}
          />
        </div>
      </section>

      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <ScientificDrawer open={drawerOpen} onToggle={() => setDrawerOpen((current) => !current)} state={state} />
      </motion.section>
    </main>
  );
}
