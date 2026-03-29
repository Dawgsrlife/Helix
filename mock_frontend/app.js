const RETRIEVAL_SOURCES = ["ncbi", "pubmed", "clinvar"];
const MAX_EVENT_LOG = 120;

const dom = {
  apiBaseInput: document.getElementById("apiBaseInput"),
  connectionBadge: document.getElementById("connectionBadge"),
  submitDesignBtn: document.getElementById("submitDesignBtn"),
  resetStateBtn: document.getElementById("resetStateBtn"),
  goalInput: document.getElementById("goalInput"),
  designMeta: document.getElementById("designMeta"),
  activeCandidateSelect: document.getElementById("activeCandidateSelect"),
  sequenceStats: document.getElementById("sequenceStats"),
  sequenceViewport: document.getElementById("sequenceViewport"),
  baseEditPanel: document.getElementById("baseEditPanel"),
  selectedBaseInfo: document.getElementById("selectedBaseInfo"),
  editResult: document.getElementById("editResult"),
  leaderboard: document.getElementById("leaderboard"),
  intentSpec: document.getElementById("intentSpec"),
  retrievalGrid: document.getElementById("retrievalGrid"),
  chatHistory: document.getElementById("chatHistory"),
  followupInput: document.getElementById("followupInput"),
  sendFollowupBtn: document.getElementById("sendFollowupBtn"),
  explanationText: document.getElementById("explanationText"),
  structureInfo: document.getElementById("structureInfo"),
  eventLog: document.getElementById("eventLog"),
};

let state = createInitialState();

function createInitialState() {
  return {
    apiBase: dom.apiBaseInput.value.trim().replace(/\/$/, ""),
    ws: null,
    wsStatus: "disconnected",
    wsUrl: "",
    sessionId: "",
    pipelineStatus: "idle",
    intentSpec: {},
    retrieval: RETRIEVAL_SOURCES.reduce((acc, source) => {
      acc[source] = { status: "pending", result: null };
      return acc;
    }, {}),
    candidates: {},
    activeCandidateId: null,
    selectedPosition: null,
    lastTouchedCandidateId: null,
    chatHistory: [],
    explanationByCandidate: {},
    eventLog: [],
    editFeedback: "",
    isSubmittingDesign: false,
    isSubmittingFollowup: false,
    isEditingBase: false,
  };
}

function resetPipelineState() {
  if (state.ws) {
    state.ws.close();
  }
  state.ws = null;
  state.wsStatus = "disconnected";
  state.wsUrl = "";
  state.sessionId = "";
  state.pipelineStatus = "idle";
  state.intentSpec = {};
  state.retrieval = RETRIEVAL_SOURCES.reduce((acc, source) => {
    acc[source] = { status: "pending", result: null };
    return acc;
  }, {});
  state.candidates = {};
  state.activeCandidateId = null;
  state.selectedPosition = null;
  state.lastTouchedCandidateId = null;
  state.explanationByCandidate = {};
  state.eventLog = [];
  state.editFeedback = "";
}

function ensureCandidate(candidateId) {
  if (!state.candidates[candidateId]) {
    state.candidates[candidateId] = {
      id: candidateId,
      sequence: "",
      scores: null,
      confidence: null,
      pdbData: "",
      baseHeat: {},
      streamedAt: {},
      animateIn: false,
      hasScored: false,
      updatedAt: Date.now(),
    };
  }

  return state.candidates[candidateId];
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(3);
}

function nowTag() {
  return new Date().toLocaleTimeString();
}

function addEventLog(message) {
  state.eventLog.unshift(`[${nowTag()}] ${message}`);
  if (state.eventLog.length > MAX_EVENT_LOG) {
    state.eventLog.length = MAX_EVENT_LOG;
  }
}

function addChat(role, text) {
  state.chatHistory.push({ role, text, at: nowTag() });
}

function appendAssistantChunk(text) {
  const last = state.chatHistory[state.chatHistory.length - 1];
  if (last && last.role === "assistant_stream") {
    last.text += text;
    return;
  }
  state.chatHistory.push({ role: "assistant_stream", text, at: nowTag() });
}

function finalizeAssistantStream() {
  const last = state.chatHistory[state.chatHistory.length - 1];
  if (last && last.role === "assistant_stream") {
    last.role = "assistant";
  }
}

function scoreRank(candidate) {
  if (!candidate || !candidate.scores) {
    return -Infinity;
  }
  if (candidate.scores.combined !== undefined && candidate.scores.combined !== null) {
    return Number(candidate.scores.combined);
  }
  return Number(candidate.scores.functional ?? 0);
}

function getActiveCandidate() {
  if (state.activeCandidateId === null) {
    return null;
  }
  return state.candidates[state.activeCandidateId] ?? null;
}

function normalizeScores(scores) {
  if (!scores || typeof scores !== "object") {
    return null;
  }

  return {
    functional: Number(scores.functional ?? 0),
    tissue_specificity: Number(scores.tissue_specificity ?? 0),
    off_target: Number(scores.off_target ?? 0),
    novelty: Number(scores.novelty ?? 0),
    combined:
      scores.combined === undefined || scores.combined === null
        ? null
        : Number(scores.combined),
  };
}

function applyGenerationToken(candidate, token, position) {
  const seq = candidate.sequence;
  if (position === seq.length) {
    candidate.sequence += token;
  } else if (position < seq.length) {
    candidate.sequence = seq.slice(0, position) + token + seq.slice(position + 1);
  } else {
    candidate.sequence = seq + "N".repeat(position - seq.length) + token;
  }
  candidate.streamedAt[position] = Date.now();
  candidate.updatedAt = Date.now();
}

function reducePipelineEvent(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const { event, data } = payload;

  switch (event) {
    case "intent_parsed": {
      state.pipelineStatus = "running";
      state.intentSpec = data?.spec ?? {};
      addEventLog("intent_parsed received");
      break;
    }

    case "retrieval_progress": {
      const source = data?.source;
      if (RETRIEVAL_SOURCES.includes(source)) {
        state.retrieval[source] = {
          status: data?.status ?? "unknown",
          result: data?.result ?? null,
        };
        addEventLog(`retrieval_progress ${source}: ${data?.status ?? "unknown"}`);
      }
      break;
    }

    case "generation_token": {
      const candidateId = Number(data?.candidate_id ?? 0);
      const token = String(data?.token ?? "");
      const position = Number(data?.position ?? 0);
      const candidate = ensureCandidate(candidateId);
      applyGenerationToken(candidate, token, position);
      state.lastTouchedCandidateId = candidateId;
      if (state.activeCandidateId === null) {
        state.activeCandidateId = candidateId;
      }
      break;
    }

    case "candidate_scored": {
      const candidateId = Number(data?.candidate_id ?? 0);
      const candidate = ensureCandidate(candidateId);
      candidate.scores = normalizeScores(data?.scores);
      if (!candidate.hasScored) {
        candidate.animateIn = true;
        candidate.hasScored = true;
      }
      candidate.updatedAt = Date.now();
      state.lastTouchedCandidateId = candidateId;
      addEventLog(`candidate_scored #${candidateId}`);
      break;
    }

    case "structure_ready": {
      const candidateId = Number(data?.candidate_id ?? 0);
      const candidate = ensureCandidate(candidateId);
      candidate.pdbData = String(data?.pdb_data ?? "");
      candidate.confidence =
        data?.confidence === undefined || data?.confidence === null
          ? null
          : Number(data.confidence);
      candidate.updatedAt = Date.now();
      state.lastTouchedCandidateId = candidateId;
      addEventLog(`structure_ready #${candidateId}`);
      break;
    }

    case "explanation_chunk": {
      const candidateId = state.lastTouchedCandidateId ?? state.activeCandidateId ?? 0;
      state.explanationByCandidate[candidateId] =
        (state.explanationByCandidate[candidateId] ?? "") + String(data?.text ?? "");
      appendAssistantChunk(String(data?.text ?? ""));
      addEventLog("explanation_chunk");
      break;
    }

    case "pipeline_complete": {
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      for (const item of candidates) {
        const candidateId = Number(item?.id ?? 0);
        const candidate = ensureCandidate(candidateId);
        if (typeof item?.sequence === "string") {
          candidate.sequence = item.sequence;
        }
        const mappedScores = normalizeScores(item?.scores);
        if (mappedScores) {
          candidate.scores = mappedScores;
          if (!candidate.hasScored) {
            candidate.animateIn = true;
            candidate.hasScored = true;
          }
        }
        if (typeof item?.pdb_data === "string") {
          candidate.pdbData = item.pdb_data;
        }
        candidate.updatedAt = Date.now();
      }
      finalizeAssistantStream();
      state.pipelineStatus = "complete";
      if (state.activeCandidateId === null && candidates.length > 0) {
        state.activeCandidateId = Number(candidates[0].id ?? 0);
      }
      addEventLog("pipeline_complete");
      break;
    }

    default:
      addEventLog(`Unknown event: ${String(event)}`);
  }
}

function renderConnectionBadge() {
  const badge = dom.connectionBadge;
  badge.classList.remove("connected", "connecting", "disconnected");
  badge.classList.add(state.wsStatus);
  badge.textContent = `WS: ${state.wsStatus}`;
}

function renderDesignMeta() {
  const items = [
    ["Session", state.sessionId || "--"],
    ["Pipeline", state.pipelineStatus],
    ["WS URL", state.wsUrl || "--"],
    ["Active Candidate", state.activeCandidateId === null ? "--" : String(state.activeCandidateId)],
  ];

  dom.designMeta.innerHTML = items
    .map(([label, value]) => `<div class="meta-item"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
    .join("");
}

function renderIntentSpec() {
  dom.intentSpec.textContent = JSON.stringify(state.intentSpec, null, 2);
}

function renderRetrieval() {
  dom.retrievalGrid.innerHTML = RETRIEVAL_SOURCES.map((source) => {
    const item = state.retrieval[source] ?? { status: "pending", result: null };
    return `
      <div class="retrieval-item ${escapeHtml(item.status)}">
        <div><strong>${escapeHtml(source.toUpperCase())}</strong></div>
        <div>Status: ${escapeHtml(item.status)}</div>
      </div>
    `;
  }).join("");
}

function renderCandidateSelect() {
  const candidateIds = Object.keys(state.candidates)
    .map((id) => Number(id))
    .sort((a, b) => a - b);

  if (candidateIds.length === 0) {
    dom.activeCandidateSelect.innerHTML = `<option value="">No candidates</option>`;
    return;
  }

  dom.activeCandidateSelect.innerHTML = candidateIds
    .map((id) => {
      const selected = state.activeCandidateId === id ? "selected" : "";
      return `<option value="${id}" ${selected}>Candidate #${id}</option>`;
    })
    .join("");
}

function renderSequence() {
  const candidate = getActiveCandidate();
  if (!candidate) {
    dom.sequenceViewport.innerHTML = `<div class="muted">No streamed sequence yet. Submit a design to begin.</div>`;
    dom.sequenceStats.textContent = "Length: 0";
    dom.baseEditPanel.classList.add("hidden");
    return;
  }

  const seq = candidate.sequence;
  dom.sequenceStats.textContent = `Length: ${seq.length}`;

  if (!seq) {
    dom.sequenceViewport.innerHTML = `<div class="muted">Waiting for generation_token events...</div>`;
    dom.baseEditPanel.classList.add("hidden");
    return;
  }

  const rowSize = 80;
  const now = Date.now();
  let html = "";

  for (let start = 0; start < seq.length; start += rowSize) {
    const row = seq.slice(start, start + rowSize);
    html += `<div class="sequence-row"><span class="row-index">${start}</span>`;

    for (let i = 0; i < row.length; i += 1) {
      const position = start + i;
      const base = row[i];
      const lower = base.toLowerCase();
      const selectedClass = state.selectedPosition === position ? "selected" : "";
      const heat = candidate.baseHeat[position];
      const heatClass =
        heat && Math.abs(Number(heat.deltaLikelihood)) >= 0.0001
          ? Number(heat.deltaLikelihood) >= 0
            ? "heat-up"
            : "heat-down"
          : "";
      const streamedClass = now - Number(candidate.streamedAt[position] ?? 0) < 240 ? "streamed" : "";

      html += `<button class="base ${lower} ${selectedClass} ${heatClass} ${streamedClass}" data-pos="${position}" title="Position ${position}">${escapeHtml(base)}</button>`;
    }

    html += "</div>";
  }

  dom.sequenceViewport.innerHTML = html;

  const selection = state.selectedPosition;
  if (selection === null || selection < 0 || selection >= seq.length) {
    dom.baseEditPanel.classList.add("hidden");
    return;
  }

  dom.baseEditPanel.classList.remove("hidden");
  const currentBase = seq[selection];
  const heat = candidate.baseHeat[selection];
  const deltaText = heat
    ? ` | last ΔLL: ${Number(heat.deltaLikelihood).toFixed(6)} (${heat.impact})`
    : "";
  dom.selectedBaseInfo.textContent = `Selected position ${selection} | base: ${currentBase}${deltaText}`;
  dom.editResult.textContent = state.editFeedback;
}

function renderLeaderboard() {
  const entries = Object.values(state.candidates).sort((a, b) => scoreRank(b) - scoreRank(a));
  if (entries.length === 0) {
    dom.leaderboard.innerHTML = `<div class="muted">No candidates scored yet.</div>`;
    return;
  }

  dom.leaderboard.innerHTML = entries
    .map((candidate) => {
      const activeClass = state.activeCandidateId === candidate.id ? "active" : "";
      const enterClass = candidate.animateIn ? "enter" : "";
      candidate.animateIn = false;

      const scores = candidate.scores ?? {
        functional: null,
        tissue_specificity: null,
        off_target: null,
        novelty: null,
        combined: null,
      };

      return `
        <div class="card ${activeClass} ${enterClass}" data-candidate-id="${candidate.id}">
          <div><strong>Candidate #${candidate.id}</strong></div>
          <div class="muted">Sequence length: ${candidate.sequence.length}</div>
          <div class="scores">
            <div class="score">Functional: <strong>${fmtScore(scores.functional)}</strong></div>
            <div class="score">Tissue: <strong>${fmtScore(scores.tissue_specificity)}</strong></div>
            <div class="score">Off-target: <strong>${fmtScore(scores.off_target)}</strong></div>
            <div class="score">Novelty: <strong>${fmtScore(scores.novelty)}</strong></div>
          </div>
          <div class="muted">Combined: ${fmtScore(scores.combined)}</div>
        </div>
      `;
    })
    .join("");
}

function renderChat() {
  if (state.chatHistory.length === 0) {
    dom.chatHistory.innerHTML = `<div class="muted">No messages yet.</div>`;
    return;
  }

  dom.chatHistory.innerHTML = state.chatHistory
    .map((msg) => {
      const roleClass = msg.role === "assistant_stream" ? "assistant" : msg.role;
      return `<div class="chat-msg ${escapeHtml(roleClass)}"><strong>${escapeHtml(msg.role)}:</strong> ${escapeHtml(msg.text)}</div>`;
    })
    .join("");
  dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
}

function renderExplanation() {
  const activeId = state.activeCandidateId;
  if (activeId === null) {
    dom.explanationText.textContent = "Waiting for explanation chunks...";
    return;
  }

  dom.explanationText.textContent = state.explanationByCandidate[activeId] || "Waiting for explanation chunks...";
}

function renderStructure() {
  const candidate = getActiveCandidate();
  if (!candidate || !candidate.pdbData) {
    dom.structureInfo.textContent = "No structure yet.";
    return;
  }

  const lineCount = candidate.pdbData.split("\n").length;
  const confidence = candidate.confidence === null ? "--" : Number(candidate.confidence).toFixed(3);
  dom.structureInfo.textContent = `Candidate #${candidate.id} | PDB lines: ${lineCount} | confidence: ${confidence}`;
}

function renderEventLog() {
  if (state.eventLog.length === 0) {
    dom.eventLog.innerHTML = `<div class="muted">No events yet.</div>`;
    return;
  }

  dom.eventLog.innerHTML = state.eventLog
    .map((entry) => `<div class="event-item">${escapeHtml(entry)}</div>`)
    .join("");
}

function render() {
  renderConnectionBadge();
  renderDesignMeta();
  renderIntentSpec();
  renderRetrieval();
  renderCandidateSelect();
  renderSequence();
  renderLeaderboard();
  renderChat();
  renderExplanation();
  renderStructure();
  renderEventLog();

  dom.submitDesignBtn.disabled = state.isSubmittingDesign;
  dom.sendFollowupBtn.disabled = state.isSubmittingFollowup;
}

function makeSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function toWebSocketUrl(apiBase, sessionId) {
  const wsBase = apiBase.replace(/^http/i, "ws").replace(/\/$/, "");
  return `${wsBase}/ws/pipeline/${sessionId}`;
}

function openPipelineSocket(wsUrl) {
  if (state.ws) {
    state.ws.close();
  }

  state.wsStatus = "connecting";
  state.wsUrl = wsUrl;
  render();

  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => {
    if (state.ws !== ws) {
      return;
    }
    state.wsStatus = "connected";
    addEventLog("WebSocket connected");
    render();
  };

  ws.onmessage = (messageEvent) => {
    try {
      const payload = JSON.parse(messageEvent.data);
      reducePipelineEvent(payload);
      render();
    } catch (error) {
      addEventLog(`Invalid WebSocket message: ${String(error)}`);
      render();
    }
  };

  ws.onerror = () => {
    addEventLog("WebSocket error");
    render();
  };

  ws.onclose = () => {
    if (state.ws === ws) {
      state.wsStatus = "disconnected";
      state.ws = null;
      addEventLog("WebSocket closed");
      render();
    }
  };
}

async function submitDesign() {
  const goal = dom.goalInput.value.trim();
  if (!goal) {
    alert("Enter a design goal first.");
    return;
  }

  const apiBase = dom.apiBaseInput.value.trim().replace(/\/$/, "");
  state.apiBase = apiBase;
  state.isSubmittingDesign = true;
  resetPipelineState();
  state.pipelineStatus = "submitting";
  render();

  const sessionId = makeSessionId();

  try {
    const response = await fetch(`${apiBase}/api/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, session_id: sessionId }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Design request failed (${response.status}): ${detail}`);
    }

    const body = await response.json();
    state.sessionId = body.session_id || sessionId;
    state.pipelineStatus = "running";
    addChat("user", goal);
    addChat("system", `Design run started for session ${state.sessionId}`);
    addEventLog(`POST /api/design accepted (${state.sessionId})`);

    const wsUrl = body.ws_url || toWebSocketUrl(apiBase, state.sessionId);
    openPipelineSocket(wsUrl);
  } catch (error) {
    const message = String(error);
    addChat("system", message);
    addEventLog(message);
    state.pipelineStatus = "error";
  } finally {
    state.isSubmittingDesign = false;
    render();
  }
}

async function submitBaseEdit(newBase) {
  const candidate = getActiveCandidate();
  if (!candidate) {
    return;
  }

  if (!state.sessionId) {
    dom.editResult.textContent = "Start a design run first.";
    return;
  }

  const position = state.selectedPosition;
  if (position === null || position < 0 || position >= candidate.sequence.length) {
    dom.editResult.textContent = "Select a valid base first.";
    return;
  }

  state.isEditingBase = true;
  dom.editResult.textContent = "Editing base...";

  const startedAt = performance.now();

  try {
    const response = await fetch(`${state.apiBase}/api/edit/base`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        candidate_id: candidate.id,
        position,
        new_base: newBase,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Base edit failed (${response.status}): ${detail}`);
    }

    const body = await response.json();
    const updated = ensureCandidate(candidate.id);
    updated.sequence =
      updated.sequence.slice(0, position) + body.new_base + updated.sequence.slice(position + 1);
    updated.scores = normalizeScores(body.updated_scores);
    updated.baseHeat[position] = {
      deltaLikelihood: Number(body.delta_likelihood),
      impact: String(body.predicted_impact),
      updatedAt: Date.now(),
    };

    const latencyMs = performance.now() - startedAt;
    state.editFeedback = `Updated position ${position} to ${body.new_base}. ΔLL ${Number(
      body.delta_likelihood
    ).toFixed(6)} (${body.predicted_impact}) in ${latencyMs.toFixed(0)} ms.`;
    addEventLog(`POST /api/edit/base success in ${latencyMs.toFixed(0)} ms`);
  } catch (error) {
    state.editFeedback = String(error);
    addEventLog(state.editFeedback);
  } finally {
    state.isEditingBase = false;
    render();
  }
}

async function submitFollowup() {
  const message = dom.followupInput.value.trim();
  if (!message) {
    return;
  }

  if (!state.sessionId) {
    alert("Run a design first.");
    return;
  }

  state.isSubmittingFollowup = true;
  state.pipelineStatus = "running";
  addChat("user", message);
  render();

  try {
    const response = await fetch(`${state.apiBase}/api/edit/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        message,
        candidate_id: state.activeCandidateId ?? 0,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Follow-up failed (${response.status}): ${detail}`);
    }

    const body = await response.json();
    addChat("system", `Follow-up accepted: ${JSON.stringify(body.steps_rerunning)}`);
    addEventLog(`POST /api/edit/followup accepted (${(body.steps_rerunning || []).join(", ")})`);
    dom.followupInput.value = "";
  } catch (error) {
    addChat("system", String(error));
    addEventLog(String(error));
    state.pipelineStatus = "error";
  } finally {
    state.isSubmittingFollowup = false;
    render();
  }
}

function bindEvents() {
  dom.submitDesignBtn.addEventListener("click", submitDesign);

  dom.resetStateBtn.addEventListener("click", () => {
    resetPipelineState();
    state.chatHistory = [];
    state.editFeedback = "";
    addEventLog("Local UI state reset");
    render();
  });

  dom.apiBaseInput.addEventListener("change", () => {
    state.apiBase = dom.apiBaseInput.value.trim().replace(/\/$/, "");
    render();
  });

  dom.activeCandidateSelect.addEventListener("change", (event) => {
    const value = Number(event.target.value);
    if (!Number.isNaN(value)) {
      state.activeCandidateId = value;
      state.selectedPosition = null;
      state.editFeedback = "";
      render();
    }
  });

  dom.sequenceViewport.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.classList.contains("base")) {
      return;
    }

    const pos = Number(target.dataset.pos);
    if (Number.isNaN(pos)) {
      return;
    }

    state.selectedPosition = pos;
    state.editFeedback = "";
    render();
  });

  dom.baseEditPanel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!target.classList.contains("base-btn")) {
      return;
    }

    const base = String(target.dataset.base || "").toUpperCase();
    if (!["A", "T", "C", "G"].includes(base)) {
      return;
    }
    submitBaseEdit(base);
  });

  dom.leaderboard.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const card = target.closest("[data-candidate-id]");
    if (!(card instanceof HTMLElement)) {
      return;
    }
    const id = Number(card.dataset.candidateId);
    if (Number.isNaN(id)) {
      return;
    }
    state.activeCandidateId = id;
    state.selectedPosition = null;
    state.editFeedback = "";
    render();
  });

  dom.sendFollowupBtn.addEventListener("click", submitFollowup);
  dom.followupInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitFollowup();
    }
  });
}

bindEvents();
render();
