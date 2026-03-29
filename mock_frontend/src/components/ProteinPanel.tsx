import { useEffect, useMemo, useRef, useState } from "react";

import type { CandidateState } from "../types";

type MolModule = {
  createViewer: (element: HTMLElement, config: { backgroundColor: string }) => {
    clear: () => void;
    addModel: (pdb: string, type: string) => void;
    setStyle: (selection: Record<string, unknown>, style: Record<string, unknown>) => void;
    zoomTo: () => void;
    spin: (value: boolean) => void;
    render: () => void;
  };
};

export function ProteinPanel({ candidate }: { candidate: CandidateState | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ReturnType<MolModule["createViewer"]> | null>(null);
  const molModuleRef = useRef<MolModule | null>(null);
  const [rendererStatus, setRendererStatus] = useState<"loading" | "ready" | "error">("loading");

  const info = useMemo(() => {
    if (!candidate) return "Waiting for candidate";
    if (!candidate.pdbData) return `Candidate #${candidate.id}: awaiting structure`;
    const conf = candidate.confidence === null ? "--" : candidate.confidence.toFixed(3);
    return `Candidate #${candidate.id} | pLDDT proxy ${conf} | ${candidate.pdbData.split("\n").length} PDB lines`;
  }, [candidate]);

  useEffect(() => {
    let cancelled = false;
    async function bootRenderer(): Promise<void> {
      try {
        const mod = (await import("3dmol")) as unknown as MolModule;
        if (cancelled) return;
        molModuleRef.current = mod;
        setRendererStatus("ready");
      } catch (_error) {
        if (cancelled) return;
        setRendererStatus("error");
      }
    }
    void bootRenderer();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!candidate?.pdbData || !ref.current || !molModuleRef.current) return;
    if (!viewerRef.current) {
      viewerRef.current = molModuleRef.current.createViewer(ref.current, {
        backgroundColor: "#060b14"
      });
    }
    viewerRef.current.clear();
    viewerRef.current.addModel(candidate.pdbData, "pdb");
    viewerRef.current.setStyle({}, { cartoon: { color: "spectrum" } });
    viewerRef.current.zoomTo();
    viewerRef.current.spin(true);
    viewerRef.current.render();
  }, [candidate?.pdbData]);

  return (
    <div className="protein-wrap">
      <div className="protein-info">{info}</div>
      {rendererStatus === "error" ? <div className="protein-fallback">3D renderer failed to load.</div> : null}
      <div ref={ref} className="protein-viewer" />
    </div>
  );
}
