import { useEffect, useMemo, useRef, useState } from "react";

import type { CandidateState } from "../types";

interface Viewer {
  clear: () => void;
  addModel: (data: string, format: string) => object;
  setStyle: (sel: Record<string, unknown>, style: Record<string, unknown>) => void;
  addSurface: (
    type: unknown,
    style: Record<string, unknown>,
    sel?: Record<string, unknown>,
  ) => void;
  zoomTo: () => void;
  spin: (v: boolean | string, speed?: number) => void;
  render: () => void;
  resize: () => void;
  setView: (view: number[]) => void;
  getView: () => number[];
  setSlab: (near: number, far: number) => void;
}

type CreateViewer = (element: HTMLElement, config: Record<string, unknown>) => Viewer;

type RenderMode = "cartoon" | "surface" | "cartoon+surface" | "stick";

function parseAtomNames(pdb: string): Set<string> {
  const names = new Set<string>();
  for (const line of pdb.split("\n")) {
    if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;
    const atomName = line.slice(12, 16).trim();
    if (atomName) names.add(atomName);
  }
  return names;
}

function parseMeanBFactor(pdb: string): number {
  let sum = 0;
  let count = 0;
  for (const line of pdb.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    const bStr = line.slice(60, 66).trim();
    const b = parseFloat(bStr);
    if (!isNaN(b)) {
      sum += b;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function ProteinPanel({ candidate }: { candidate: CandidateState | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const createViewerRef = useRef<CreateViewer | null>(null);
  const libRef = useRef<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [renderMode, setRenderMode] = useState<RenderMode>("cartoon+surface");

  const info = useMemo(() => {
    if (!candidate) return "Waiting for candidate selection";
    if (!candidate.pdbData) return `Candidate #${candidate.id}: awaiting structure prediction`;
    const conf = candidate.confidence === null ? "--" : (candidate.confidence * 100).toFixed(1);
    const lineCount = candidate.pdbData.split("\n").filter((l) => l.startsWith("ATOM")).length;
    return `Candidate #${candidate.id} | pLDDT ${conf} | ${lineCount.toLocaleString()} atoms`;
  }, [candidate]);

  const meanBFactor = useMemo(() => {
    if (!candidate?.pdbData) return 0;
    return parseMeanBFactor(candidate.pdbData);
  }, [candidate?.pdbData]);

  // Load 3dmol once on mount
  useEffect(() => {
    let cancelled = false;

    async function load3Dmol(): Promise<void> {
      try {
        const mod = await import("3dmol");
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lib = (mod as any).default || mod;
        const fn: CreateViewer | undefined = lib.createViewer ?? lib.$3Dmol?.createViewer;

        if (typeof fn !== "function") {
          throw new Error("3dmol loaded but createViewer not found");
        }

        createViewerRef.current = fn;
        libRef.current = lib;
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

  // Render PDB when data, render mode, or viewer readiness changes
  useEffect(() => {
    const pdb = candidate?.pdbData;
    if (!pdb || status !== "ready" || !containerRef.current || !createViewerRef.current) return;

    try {
      if (!viewerRef.current) {
        viewerRef.current = createViewerRef.current(containerRef.current, {
          backgroundColor: "#04070f",
          antialias: true,
        });
      }

      const viewer = viewerRef.current;
      viewer.clear();
      viewer.addModel(pdb, "pdb");

      const atomNames = parseAtomNames(pdb);
      const hasBackbone = ["N", "CA", "C", "O"].every((atom) => atomNames.has(atom));

      if (hasBackbone) {
        // Confidence-based coloring: spectral gradient mapped to B-factor (pLDDT proxy)
        const confidenceScheme = {
          prop: "b",
          gradient: new (libRef.current as any).$3Dmol.Gradient.Sinebow(50, 95),
          min: 50,
          max: 95,
        };

        // Fallback if Sinebow doesn't exist
        const safeScheme = (() => {
          try {
            return confidenceScheme;
          } catch {
            return { prop: "b", gradient: "rwb", min: 50, max: 95 };
          }
        })();

        switch (renderMode) {
          case "cartoon":
            viewer.setStyle({}, {
              cartoon: {
                colorscheme: safeScheme,
                opacity: 0.95,
                thickness: 0.4,
              },
            });
            break;

          case "surface":
            viewer.setStyle({}, {
              stick: { radius: 0.08, colorscheme: safeScheme, opacity: 0.3 },
            });
            try {
              viewer.addSurface(
                (libRef.current as any).$3Dmol?.SurfaceType?.VDW ?? 1,
                {
                  opacity: 0.78,
                  colorscheme: safeScheme,
                },
              );
            } catch {
              // Surface type fallback
              viewer.addSurface(1, {
                opacity: 0.78,
                colorscheme: { prop: "b", gradient: "rwb", min: 50, max: 95 },
              });
            }
            break;

          case "cartoon+surface":
            viewer.setStyle({}, {
              cartoon: {
                colorscheme: safeScheme,
                opacity: 0.95,
                thickness: 0.4,
              },
            });
            try {
              viewer.addSurface(
                (libRef.current as any).$3Dmol?.SurfaceType?.VDW ?? 1,
                {
                  opacity: 0.22,
                  colorscheme: safeScheme,
                },
              );
            } catch {
              viewer.addSurface(1, {
                opacity: 0.22,
                colorscheme: { prop: "b", gradient: "rwb", min: 50, max: 95 },
              });
            }
            break;

          case "stick":
            viewer.setStyle({}, {
              stick: { radius: 0.15, colorscheme: safeScheme },
              sphere: { scale: 0.2, colorscheme: safeScheme },
            });
            break;
        }
      } else {
        viewer.setStyle({}, {
          stick: { colorscheme: "greenCarbon", radius: 0.15 },
          sphere: { scale: 0.25 },
        });
      }

      viewer.zoomTo();
      viewer.spin("y", 0.6);
      viewer.render();
    } catch (err) {
      setErrorMsg(`Render failed: ${String(err)}`);
    }
  }, [candidate?.pdbData, candidate?.id, status, renderMode]);

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

      {candidate?.pdbData && (
        <div className="protein-controls">
          {(["cartoon", "cartoon+surface", "surface", "stick"] as RenderMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={renderMode === mode ? "active" : ""}
              onClick={() => setRenderMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="protein-fallback">
          3D renderer failed to load: {errorMsg}
        </div>
      )}
      {status === "loading" && <div className="protein-fallback">Loading 3D viewer...</div>}
      <div ref={containerRef} className="protein-viewer" />

      {candidate?.pdbData && (
        <div className="protein-confidence-bar">
          <span>Low</span>
          <div className="confidence-gradient" />
          <span>High</span>
          <span style={{ marginLeft: 8 }}>
            mean pLDDT: {meanBFactor > 0 ? meanBFactor.toFixed(1) : "--"}
          </span>
        </div>
      )}
    </div>
  );
}
