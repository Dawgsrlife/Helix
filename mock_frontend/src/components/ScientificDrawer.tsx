import type { PipelineState } from "../types";

export function ScientificDrawer({
  open,
  onToggle,
  state
}: {
  open: boolean;
  onToggle: () => void;
  state: Pick<PipelineState, "intentSpec" | "retrieval" | "eventLog">;
}) {
  return (
    <section className={`drawer ${open ? "open" : ""}`}>
      <button className="drawer-toggle" onClick={onToggle} type="button">
        {open ? "Hide Scientific Details" : "Show Scientific Details"}
      </button>
      {open ? (
        <div className="drawer-grid">
          <div className="drawer-card">
            <h3>Intent Spec</h3>
            <pre>{JSON.stringify(state.intentSpec, null, 2)}</pre>
          </div>
          <div className="drawer-card">
            <h3>Retrieval</h3>
            <pre>{JSON.stringify(state.retrieval, null, 2)}</pre>
          </div>
          <div className="drawer-card">
            <h3>Event Log</h3>
            <div className="event-list">
              {state.eventLog.slice(0, 25).map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
