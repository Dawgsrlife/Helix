import type {
  BaseEditResponse,
  DesignAcceptedResponse,
  FollowupAcceptedResponse,
  PipelineEvent
} from "../types";

export async function postDesign(args: {
  apiBase: string;
  goal: string;
  sessionId: string;
  numCandidates: number;
  runProfile: "demo" | "live";
}): Promise<DesignAcceptedResponse> {
  const response = await fetch(`${args.apiBase}/api/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: args.goal,
      session_id: args.sessionId,
      num_candidates: args.numCandidates,
      run_profile: args.runProfile
    })
  });

  if (!response.ok) {
    throw new Error(`Design request failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as DesignAcceptedResponse;
}

export async function postBaseEdit(args: {
  apiBase: string;
  sessionId: string;
  candidateId: number;
  position: number;
  newBase: string;
}): Promise<BaseEditResponse> {
  const response = await fetch(`${args.apiBase}/api/edit/base`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: args.sessionId,
      candidate_id: args.candidateId,
      position: args.position,
      new_base: args.newBase
    })
  });

  if (!response.ok) {
    throw new Error(`Base edit failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as BaseEditResponse;
}

export async function postFollowup(args: {
  apiBase: string;
  sessionId: string;
  candidateId: number;
  message: string;
}): Promise<FollowupAcceptedResponse> {
  const response = await fetch(`${args.apiBase}/api/edit/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: args.sessionId,
      candidate_id: args.candidateId,
      message: args.message
    })
  });

  if (!response.ok) {
    throw new Error(`Follow-up failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as FollowupAcceptedResponse;
}

export function connectPipelineSocket(args: {
  wsUrl: string;
  onStatus: (status: "connecting" | "connected" | "disconnected") => void;
  onEvent: (payload: PipelineEvent) => void;
  onError: (error: string) => void;
}): WebSocket {
  args.onStatus("connecting");
  const socket = new WebSocket(args.wsUrl);

  socket.onopen = () => args.onStatus("connected");
  socket.onclose = () => args.onStatus("disconnected");
  socket.onerror = () => args.onError("WebSocket error");
  socket.onmessage = (message) => {
    try {
      const payload = JSON.parse(message.data) as PipelineEvent;
      args.onEvent(payload);
    } catch (error) {
      args.onError(`Invalid WS payload: ${String(error)}`);
    }
  };

  return socket;
}
