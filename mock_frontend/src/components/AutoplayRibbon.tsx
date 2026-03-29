export function AutoplayRibbon({
  pipelineStatus,
  summary
}: {
  pipelineStatus: "idle" | "running" | "complete" | "error";
  summary: string;
}) {
  return (
    <section className="autoplay-ribbon">
      <div className={`pill ${pipelineStatus}`}>Mode: Silent Autoplay</div>
      <p>{summary}</p>
    </section>
  );
}
