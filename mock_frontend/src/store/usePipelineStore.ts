import { create } from "zustand";

import type { PipelineState } from "../types";
import type { PipelineAction } from "./pipelineReducer";
import { createInitialState, pipelineReducer } from "./pipelineReducer";

interface PipelineStore extends PipelineState {
  dispatch: (action: PipelineAction) => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  ...createInitialState(),
  dispatch: (action) =>
    set((state) => {
      const { dispatch, ...pipelineState } = state;
      return {
        ...pipelineReducer(pipelineState, action),
        dispatch
      };
    })
}));

export function resetPipelineStore(): void {
  usePipelineStore.setState({
    ...createInitialState(usePipelineStore.getState().apiBase),
    dispatch: usePipelineStore.getState().dispatch
  });
}
