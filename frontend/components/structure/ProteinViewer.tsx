"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ProteinViewerProps {
  pdbData?: string;
  highlightResidues?: number[];
  onResidueClick?: (residueSeq: number) => void;
  onResidueHover?: (residueSeq: number | null) => void;
  isFullscreen?: boolean;
  theme?: "dark" | "light";
}

type RenderMode = "cinematic" | "cartoon" | "sticks";

declare global {
  interface Window {
    $3Dmol?: any;
  }
}

let molScriptPromise: Promise<void> | null = null;

function load3DMol(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.$3Dmol) {
    return Promise.resolve();
  }
  if (molScriptPromise) {
    return molScriptPromise;
  }
  const scriptSources = [
    "https://cdn.jsdelivr.net/npm/3dmol@2.4.2/build/3Dmol-min.js",
    "https://unpkg.com/3dmol@2.4.2/build/3Dmol-min.js",
    "https://3Dmol.org/build/3Dmol-min.js",
  ];

  molScriptPromise = (async () => {
    let lastError: Error | null = null;
    for (const src of scriptSources) {
      try {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
          if (existing && window.$3Dmol) {
            resolve();
            return;
          }
          const script = existing ?? document.createElement("script");
          script.src = src;
          script.async = true;
          const timeout = window.setTimeout(() => reject(new Error("3Dmol script load timeout")), 7000);
          script.onload = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          script.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error(`Failed loading ${src}`));
          };
          if (!existing) {
            document.head.appendChild(script);
          }
        });
        if (window.$3Dmol) {
          return;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error("Failed to load 3Dmol");
  })();
  return molScriptPromise;
}

function confidenceColor(bFactor?: number): string {
  const score = Number.isFinite(bFactor as number) ? Number(bFactor) : 70;
  if (score >= 90) return "#5bb5a2";
  if (score >= 70) return "#6b9fd4";
  if (score >= 50) return "#c9a855";
  return "#d47a7a";
}

function applyViewerStyle(viewer: any, mode: RenderMode) {
  if (!viewer) return;
  if (mode === "sticks") {
    viewer.setStyle(
      {},
      {
        stick: {
          radius: 0.2,
          colorfunc: (atom: any) => confidenceColor(atom?.b),
        },
      }
    );
    return;
  }

  if (mode === "cartoon") {
    viewer.setStyle(
      {},
      {
        cartoon: {
          colorfunc: (atom: any) => confidenceColor(atom?.b),
          opacity: 1.0,
        },
      }
    );
    return;
  }

  // Cinematic blend: cartoon backbone + subtle atom detail.
  viewer.setStyle(
    {},
    {
      cartoon: {
        colorfunc: (atom: any) => confidenceColor(atom?.b),
        opacity: 1.0,
      },
      stick: {
        radius: 0.1,
        opacity: 0.35,
        colorfunc: (atom: any) => confidenceColor(atom?.b),
      },
    }
  );
}

function pdbStats(pdbText: string): { atoms: number; residues: number } {
  const residues = new Set<number>();
  let atoms = 0;
  for (const line of pdbText.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    atoms += 1;
    const resi = Number.parseInt(line.substring(22, 26).trim(), 10);
    if (!Number.isNaN(resi)) {
      residues.add(resi);
    }
  }
  return { atoms, residues: residues.size };
}

export const SAMPLE_PDB = `HEADER    SAMPLE PDB\nTITLE     HELIX SAMPLE\nMODEL     1\nATOM      1  N   MET A   1      12.345  23.456   5.678  1.00 92.30           N\nATOM      2  CA  MET A   1      13.100  24.200   6.100  1.00 93.10           C\nATOM      3  C   MET A   1      14.500  23.800   5.800  1.00 91.50           C\nATOM      4  O   MET A   1      14.800  22.700   5.400  1.00 89.20           O\nATOM      5  CB  MET A   1      12.900  25.700   5.900  1.00 88.70           C\nATOM      6  N   ASP A   2      15.300  24.800   6.000  1.00 90.80           N\nATOM      7  CA  ASP A   2      16.700  24.600   5.700  1.00 91.20           C\nATOM      8  C   ASP A   2      17.400  25.900   5.400  1.00 89.40           C\nATOM      9  O   ASP A   2      16.900  27.000   5.700  1.00 87.80           O\nATOM     10  CB  ASP A   2      17.300  23.600   4.700  1.00 86.40           C\nTER\nENDMDL\nEND`;

export default function ProteinViewer({
  pdbData,
  highlightResidues = [],
  onResidueClick,
  onResidueHover,
  isFullscreen = false,
  theme = "dark",
}: ProteinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const clickHandlerRef = useRef<typeof onResidueClick>(onResidueClick);
  const hoverHandlerRef = useRef<typeof onResidueHover>(onResidueHover);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode>("cinematic");
  const [compatibilityMode, setCompatibilityMode] = useState(false);

  const pdb = pdbData?.trim() ? pdbData : "";
  const stats = useMemo(() => pdbStats(pdb), [pdb]);

  useEffect(() => {
    clickHandlerRef.current = onResidueClick;
  }, [onResidueClick]);

  useEffect(() => {
    hoverHandlerRef.current = onResidueHover;
  }, [onResidueHover]);

  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const message = String(event.message || "");
      if (
        message.includes("OffscreenCanvas.transferToImageBitmap") ||
        (message.includes("OffscreenCanvas") && message.includes("ImageBitmap"))
      ) {
        const viewer = viewerRef.current;
        if (viewer && typeof viewer.spin === "function") {
          try {
            viewer.spin(false);
          } catch {
            // noop
          }
        }
        setCompatibilityMode(true);
        setLoadError("3D acceleration fallback enabled for this browser/GPU.");
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    let rafId: number | null = null;
    let retries = 0;

    async function mountViewer() {
      if (!containerRef.current) return;
      if (!pdb) {
        setIsReady(false);
        return;
      }
      setLoadError(null);
      setIsReady(false);

      try {
        await load3DMol();
        if (!mounted || !containerRef.current || !window.$3Dmol) return;

        // Avoid initializing when container is effectively hidden/zero-sized.
        const rect = containerRef.current.getBoundingClientRect();
        if ((rect.width < 24 || rect.height < 24) && retries < 8) {
          retries += 1;
          rafId = window.requestAnimationFrame(mountViewer);
          return;
        }

        containerRef.current.innerHTML = "";
        const viewer = window.$3Dmol.createViewer(containerRef.current, {
          backgroundColor: theme === "dark" ? "#050b14" : "#f7fafc",
        });

        viewer.addModel(pdb, "pdb");
        const effectiveMode: RenderMode = compatibilityMode ? "cartoon" : renderMode;
        applyViewerStyle(viewer, effectiveMode);

        viewer.setClickable({}, true, (atom: any) => {
          const residue = Number(atom?.resi);
          if (!Number.isNaN(residue)) {
            clickHandlerRef.current?.(residue);
          }
        });
        viewer.setHoverable(
          {},
          true,
          (atom: any) => {
            const residue = Number(atom?.resi);
            if (!Number.isNaN(residue)) {
              hoverHandlerRef.current?.(residue);
            }
          },
          () => hoverHandlerRef.current?.(null)
        );

        viewer.zoomTo();
        viewer.zoom(1.15);
        // Avoid internal spin interval; it can trigger OffscreenCanvas crashes
        // on some browser/GPU combinations.
        viewer.render();

        viewerRef.current = viewer;
        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : "3D viewer failed to initialize");
        }
      }
    }

    mountViewer();

    return () => {
      mounted = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (viewerRef.current && typeof viewerRef.current.spin === "function") {
        viewerRef.current.spin(false);
      }
      viewerRef.current = null;
    };
  }, [compatibilityMode, pdb, renderMode, theme]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const effectiveMode: RenderMode = compatibilityMode ? "cartoon" : renderMode;
    applyViewerStyle(viewer, effectiveMode);

    if (highlightResidues.length > 0) {
      viewer.setStyle(
        { resi: highlightResidues },
        {
          stick: { radius: 0.22, color: "#f8fafc" },
          sphere: { radius: 0.38, color: "#f8fafc" },
        }
      );
      viewer.zoomTo({ resi: highlightResidues }, 260);
    }

    viewer.render();
  }, [compatibilityMode, highlightResidues, renderMode]);

  useEffect(() => {
    const onResize = () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.resize();
      viewer.render();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {loadError && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: "var(--base-t)" }}
        >
          {loadError}
        </div>
      )}

      {!pdb && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Waiting for structure data...
        </div>
      )}

      {!isReady && !loadError && pdb && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Loading protein fold...
        </div>
      )}

      <div
        className="absolute left-4 top-4 rounded-md px-3 py-2 text-[11px] font-mono"
        style={{
          background: "rgba(5, 11, 20, 0.72)",
          color: "#dbeafe",
          border: "1px solid rgba(148, 163, 184, 0.3)",
        }}
      >
        {stats.residues > 0 ? `${stats.residues} residues · ${stats.atoms} atoms` : "No PDB loaded"}
      </div>

      <div
        className="absolute right-4 top-4 rounded-md px-3 py-2 text-[11px]"
        style={{
          background: "rgba(5, 11, 20, 0.72)",
          color: "#dbeafe",
          border: "1px solid rgba(148, 163, 184, 0.3)",
        }}
      >
        {isFullscreen ? "Fullscreen" : "Interactive"} 3D fold
      </div>

      {compatibilityMode && (
        <div
          className="absolute right-4 top-14 rounded-md px-3 py-2 text-[10px]"
          style={{
            background: "rgba(5, 11, 20, 0.78)",
            color: "#f8d7a0",
            border: "1px solid rgba(248, 215, 160, 0.35)",
          }}
        >
          Compatibility mode
        </div>
      )}

      <div className="absolute right-4 bottom-4 flex items-center gap-1.5">
        {([
          { id: "cinematic", label: "Cinematic" },
          { id: "cartoon", label: "Cartoon" },
          { id: "sticks", label: "Sticks" },
        ] as const).map((mode) => (
          <button
            key={mode.id}
            onClick={() => setRenderMode(mode.id)}
            disabled={compatibilityMode}
            className="px-2.5 py-1 rounded text-[10px] transition-colors"
            style={{
              background:
                renderMode === mode.id ? "rgba(91, 181, 162, 0.22)" : "rgba(15, 23, 42, 0.68)",
              color: renderMode === mode.id ? "#b7f7e8" : "#cbd5e1",
              border:
                renderMode === mode.id
                  ? "1px solid rgba(91, 181, 162, 0.55)"
                  : "1px solid rgba(148, 163, 184, 0.25)",
              opacity: compatibilityMode ? 0.45 : 1,
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
