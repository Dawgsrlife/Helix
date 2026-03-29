import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
const DEFAULT_CANDIDATES = 10;

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
  const [candidateCount, setCandidateCount] = useState(DEFAULT_CANDIDATES);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enteredIde, setEnteredIde] = useState(false);
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
    const requestedCandidates = Math.max(1, Math.min(10, candidateCount));
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
      setEnteredIde(true);

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
    const position = state.selectedPosition + (activeCandidate.streamOffset ?? 0);
    try {
      const response = await postBaseEdit({
        apiBase,
        sessionId: state.sessionId,
        candidateId: activeCandidate.id,
        position,
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

  useEffect(() => () => socketRef.current?.close(), []);

  function renderLanding(): JSX.Element {
    return (
      <main className="landing-shell">
        <motion.section
          className="landing-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <h1>Helix</h1>
          <p className="landing-tagline">From one sentence to ten ranked DNA designs with live structure preview.</p>
          <label>
            What should Helix design?
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <div className="landing-controls">
            <label>
              API Base
              <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <label>
              Candidate Count
              <input
                type="number"
                min={1}
                max={10}
                value={candidateCount}
                onChange={(event) => setCandidateCount(Number(event.target.value || DEFAULT_CANDIDATES))}
              />
            </label>
          </div>
          <div className="landing-buttons">
            <button onClick={() => void submitDesign("demo")} disabled={state.isSubmittingDesign}>
              {state.isSubmittingDesign ? "Launching..." : "Launch Helix IDE"}
            </button>
            <button className="secondary" onClick={() => void submitDesign("live")} disabled={state.isSubmittingDesign}>
              Launch Live Mode
            </button>
          </div>
        </motion.section>
      </main>
    );
  }

  function renderIde(): JSX.Element {
    return (
      <main className="app-shell">
        <header className="hero">
          <div>
            <h1>Helix IDE</h1>
            <p>Prompt to candidates to folded proteins, with direct nucleotide editing in one workspace.</p>
          </div>
          <div className="hero-controls">
            <label>
              API Base
              <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <div className={`ws-pill ${state.wsStatus}`}>WS: {state.wsStatus}</div>
          </div>
        </header>

        <AutoplayRibbon pipelineStatus={state.pipelineStatus} summary={state.laymanSummary} />

        <section className="ide-hero-grid">
          <div className="card">
            <h2>Protein Focus</h2>
            <ProteinPanel candidate={activeCandidate} />
          </div>
          <div className="card">
            <h2>Live Pipeline</h2>
            <StageFlow stages={state.stages} />
          </div>
        </section>

        <section className="command-bar">
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
          <div className="command-actions">
            <label>
              Candidate Count
              <input
                type="number"
                min={1}
                max={10}
                value={candidateCount}
                onChange={(event) => setCandidateCount(Number(event.target.value || DEFAULT_CANDIDATES))}
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
            <h2>Refine by Prompt</h2>
            <ChatPanel
              activeCandidate={activeCandidate}
              chat={state.chat}
              explanationByCandidate={state.explanationByCandidate}
              onSubmitFollowup={handleFollowup}
              isSubmitting={state.isSubmittingFollowup}
            />
          </div>
          <div className="card">
            <h2>Scientific Details</h2>
            <ScientificDrawer open={drawerOpen} onToggle={() => setDrawerOpen((current) => !current)} state={state} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {enteredIde ? (
        <motion.div key="ide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {renderIde()}
        </motion.div>
      ) : (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {renderLanding()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
