import { useEffect, useMemo, useRef, useState } from "react";

import type { CandidateState } from "../types";

interface Viewer {
  clear: () => void;
  addModel: (data: string, format: string) => void;
  setStyle: (sel: Record<string, unknown>, style: Record<string, unknown>) => void;
  zoomTo: () => void;
  spin: (v: boolean) => void;
  render: () => void;
  resize: () => void;
}

type CreateViewer = (element: HTMLElement, config: Record<string, unknown>) => Viewer;

function parseAtomNames(pdb: string): Set<string> {
  const names = new Set<string>();
  for (const line of pdb.split("\n")) {
    if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;
    const atomName = line.slice(12, 16).trim();
    if (atomName) names.add(atomName);
  }
  return names;
}

export function ProteinPanel({ candidate }: { candidate: CandidateState | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const createViewerRef = useRef<CreateViewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const info = useMemo(() => {
    if (!candidate) return "Waiting for candidate selection";
    if (!candidate.pdbData) return `Candidate #${candidate.id}: awaiting structure prediction`;
    const conf = candidate.confidence === null ? "--" : candidate.confidence.toFixed(3);
    const lineCount = candidate.pdbData.split("\n").filter((l) => l.startsWith("ATOM")).length;
    return `Candidate #${candidate.id} | pLDDT proxy ${conf} | ${lineCount} atoms`;
  }, [candidate]);

  // Load 3dmol once on mount
  useEffect(() => {
    let cancelled = false;

    async function load3Dmol(): Promise<void> {
      try {
        const mod = await import("3dmol");
        if (cancelled) return;

        // Handle CJS-to-ESM interop: createViewer may be on .default or the module itself
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lib = (mod as any).default || mod;
        const fn: CreateViewer | undefined = lib.createViewer ?? lib.$3Dmol?.createViewer;

        if (typeof fn !== "function") {
          throw new Error("3dmol loaded but createViewer not found");
        }

        createViewerRef.current = fn;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(String(err));
        setStatus("error");
      }
    }

    void load3Dmol();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render PDB when data or viewer readiness changes
  useEffect(() => {
    const pdb = candidate?.pdbData;
    if (!pdb || status !== "ready" || !containerRef.current || !createViewerRef.current) return;

    try {
      // Create viewer if it doesn't exist yet
      if (!viewerRef.current) {
        viewerRef.current = createViewerRef.current(containerRef.current, {
          backgroundColor: "#060b14",
          antialias: true,
        });
      }

      const viewer = viewerRef.current;
      viewer.clear();
      viewer.addModel(pdb, "pdb");

      // Prefer real chain rendering when a protein backbone is present.
      const atomNames = parseAtomNames(pdb);
      const hasBackbone = ["N", "CA", "C", "O"].every((atom) => atomNames.has(atom));
      if (hasBackbone) {
        viewer.setStyle(
          {},
          {
            cartoon: {
              colorscheme: {
                prop: "b",
                gradient: "rwb",
                min: 50,
                max: 100
              },
              opacity: 0.95
            },
            stick: { radius: 0.12, colorscheme: "whiteCarbon" }
          }
        );
      } else {
        viewer.setStyle({}, { stick: { colorscheme: "greenCarbon" }, sphere: { scale: 0.3 } });
      }

      viewer.zoomTo();
      viewer.spin(true);
      viewer.render();
    } catch (err) {
      setErrorMsg(`Render failed: ${String(err)}`);
    }
  }, [candidate?.pdbData, candidate?.id, status]);

  // Resize viewer when container dimensions change
  useEffect(() => {
    if (!viewerRef.current) return;
    const observer = new ResizeObserver(() => {
      viewerRef.current?.resize();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div className="protein-wrap">
      <div className="protein-info">{info}</div>
      {status === "error" && (
        <div className="protein-fallback">
          3D renderer failed to load: {errorMsg}
        </div>
      )}
      {status === "loading" && <div className="protein-fallback">Loading 3D viewer...</div>}
      <div ref={containerRef} className="protein-viewer" />
    </div>
  );
}
