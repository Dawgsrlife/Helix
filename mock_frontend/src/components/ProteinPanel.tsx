import { useEffect, useMemo, useRef } from "react";

import type { CandidateState } from "../types";

type Viewer = {
  clear: () => void;
  addModel: (pdb: string, type: string) => void;
  setStyle: (selection: object, style: object) => void;
  zoomTo: () => void;
  spin: (value: boolean) => void;
  render: () => void;
};

declare global {
  interface Window {
    $3Dmol?: {
      createViewer: (element: HTMLElement, config: { backgroundColor: string }) => Viewer;
    };
  }
}

export function ProteinPanel({ candidate }: { candidate: CandidateState | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const info = useMemo(() => {
    if (!candidate) return "Waiting for candidate";
    if (!candidate.pdbData) return `Candidate #${candidate.id}: awaiting structure`;
    const conf = candidate.confidence === null ? "--" : candidate.confidence.toFixed(3);
    return `Candidate #${candidate.id} | pLDDT proxy ${conf} | ${candidate.pdbData.split("\n").length} PDB lines`;
  }, [candidate]);

  useEffect(() => {
    if (!candidate?.pdbData || !ref.current || !window.$3Dmol) return;
    if (!viewerRef.current) {
      viewerRef.current = window.$3Dmol.createViewer(ref.current, { backgroundColor: "#060b14" });
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
      <div ref={ref} className="protein-viewer" />
    </div>
  );
}
