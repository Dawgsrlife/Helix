import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { postDesign, connectPipelineSocket, postAgentChat, postBaseEdit, postFollowup } from "./lib/api";
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
    if (!state.sessionId) {
      dispatch({ type: "BASE_EDIT_ERROR", message: "No active session. Run a design first." });
      return;
    }
    if (!activeCandidate) {
      dispatch({ type: "BASE_EDIT_ERROR", message: "Select a candidate lane first." });
      return;
    }
    if (activeCandidate.status === "queued" || activeCandidate.status === "running") {
      dispatch({ type: "BASE_EDIT_ERROR", message: "Candidate is still generating. Wait for it to finish." });
      return;
    }
    if (state.selectedPosition === null) {
      dispatch({ type: "BASE_EDIT_ERROR", message: "Click a base in the sequence first, then press A/T/C/G." });
      return;
    }
    const started = performance.now();
    const position = state.selectedPosition + (activeCandidate.streamOffset ?? 0);
    dispatch({ type: "BASE_EDIT_ERROR", message: `Editing position ${position} → ${newBase}...` });
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
      dispatch({ type: "BASE_EDIT_ERROR", message: `Edit failed: ${String(error)}` });
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

  async function handleAgentMessage(message: string): Promise<void> {
    if (!state.sessionId || !activeCandidate) {
      dispatch({ type: "BASE_EDIT_ERROR", message: "Run a design and select a candidate first." });
      return;
    }
    dispatch({ type: "AGENT_PENDING", message });
    try {
      const response = await postAgentChat({
        apiBase,
        sessionId: state.sessionId,
        candidateId: activeCandidate.id,
        message,
        history: state.chat.slice(-10).map((entry) => ({ role: entry.role, text: entry.text }))
      });
      dispatch({ type: "AGENT_RESPONSE", response });

      // If user asks for reruns/variants, keep existing follow-up pipeline behavior too.
      const lowered = message.toLowerCase();
      if (
        lowered.includes("rerun")
        || lowered.includes("regenerate")
        || lowered.includes("variants")
        || lowered.includes("generate")
      ) {
        await handleFollowup(message);
      }
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
          </div>
        </motion.section>
      </main>
    );
  }

  function renderIde(): JSX.Element {
    const retrievalSources: Array<keyof typeof state.retrieval> = ["ncbi", "pubmed", "clinvar"];

    return (
      <main className="cursor-shell">
        <aside className="tool-rail">
          <div className="rail-brand">Helix</div>
          <button type="button" className="rail-item active">Workspace</button>
          <button type="button" className="rail-item">Candidates</button>
          <button type="button" className="rail-item">Structures</button>
          <button type="button" className="rail-item">Protocols</button>
          <div className="rail-spacer" />
          <div className={`ws-pill ${state.wsStatus}`}>WS: {state.wsStatus}</div>
        </aside>

        <section className="workspace-shell">
          <header className="workspace-topbar">
            <div>
              <h1>Helix // Cursor For Genomic Design</h1>
              <p>Start from language, iterate at nucleotide-level, and refine with an agent in one living lab IDE.</p>
            </div>
            <div className="hero-controls">
              <label>
                API Base
                <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
              </label>
            </div>
          </header>

          <section className="prompt-strip">
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
            <div className="prompt-actions">
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
            </div>
          </section>

          <AutoplayRibbon pipelineStatus={state.pipelineStatus} summary={state.laymanSummary} />

          <section className="workspace-meta">
            <div>Session: {state.sessionId || "--"}</div>
            <div>Requested: {state.requestedCandidates}</div>
            <div>Ready: {completedCount}</div>
            <div>Failed: {failedCount}</div>
          </section>

          <section className="workspace-grid">
            <div className="workspace-left">
              <div className="card">
                <h2>Genome Editor + Heatmap</h2>
                <GenomeLanes
                  candidateOrder={state.candidateOrder}
                  candidates={state.candidates}
                  activeCandidateId={state.activeCandidateId}
                  selectedPosition={state.selectedPosition}
                  onSelectCandidate={(candidateId) => dispatch({ type: "SELECT_CANDIDATE", candidateId })}
                  onSelectPosition={(position) => dispatch({ type: "SELECT_POSITION", position })}
                />
                <div className="edit-row">
                  <span>{state.editFeedback || (state.selectedPosition !== null
                    ? `Position ${state.selectedPosition} selected — click A/T/C/G to mutate`
                    : "Click a base in any lane to select it for editing")}</span>
                  <div className="base-buttons">
                    {["A", "T", "C", "G"].map((base) => (
                      <button
                        key={base}
                        className={`edit-base edit-base-${base.toLowerCase()}`}
                        onClick={() => void handleBaseEdit(base)}
                      >
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
            </div>

            <div className="workspace-center">
              <div className="card protein-stage-card">
                <h2>Folded Protein Studio</h2>
                <ProteinPanel candidate={activeCandidate} />
              </div>

              <div className="card">
                <h2>Pipeline Graph</h2>
                <StageFlow stages={state.stages} />
                <div className="retrieval-row">
                  {retrievalSources.map((source) => (
                    <div key={source} className={`retrieval-pill ${state.retrieval[source].status}`}>
                      <strong>{source.toUpperCase()}</strong>
                      <span>{state.retrieval[source].status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <ScientificDrawer open={drawerOpen} onToggle={() => setDrawerOpen((current) => !current)} state={state} />
            </div>

            <aside className="workspace-right">
              <div className="card agent-card">
                <h2>Helix Side Agent</h2>
                <ChatPanel
                  activeCandidate={activeCandidate}
                  chat={state.chat}
                  explanationByCandidate={state.explanationByCandidate}
                  agentToolTrail={state.agentToolTrail}
                  candidateComparison={state.candidateComparison}
                  onSubmitAgent={handleAgentMessage}
                  isSubmitting={state.isSubmittingAgent || state.isSubmittingFollowup}
                />
              </div>
            </aside>
          </section>
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
