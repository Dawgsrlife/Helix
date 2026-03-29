"use client";

import React, {
  useRef,
  useMemo,
  Suspense,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

/* ─── Types ───────────────────────────────────────────────────────────── */

interface ProteinViewerProps {
  pdbData?: string;
  highlightResidues?: number[];
  onResidueClick?: (residueSeq: number) => void;
  onResidueHover?: (residueSeq: number | null) => void;
  isFullscreen?: boolean;
  theme?: "dark" | "light";
}

interface ParsedAtom {
  pos: THREE.Vector3;
  bFactor: number;
  residueSeq: number;
  atomName: string;
  residueName: string;
}

/* ─── pLDDT helpers ───────────────────────────────────────────────────── */

function plddtColor(score: number): THREE.Color {
  if (score >= 90) return new THREE.Color(0x5bb5a2); // teal
  if (score >= 70) return new THREE.Color(0x6b9fd4); // blue
  if (score >= 50) return new THREE.Color(0xc9a855); // amber
  return new THREE.Color(0xd47a7a); // coral
}

function plddtHex(score: number): string {
  if (score >= 90) return "#5bb5a2";
  if (score >= 70) return "#6b9fd4";
  if (score >= 50) return "#c9a855";
  return "#d47a7a";
}

function plddtLabel(score: number): string {
  if (score >= 90) return "Very high confidence";
  if (score >= 70) return "Confident";
  if (score >= 50) return "Low confidence";
  return "Very low confidence";
}

/* ─── PDB parser ──────────────────────────────────────────────────────── */

function parsePDB(pdbData: string): ParsedAtom[] {
  const atoms: ParsedAtom[] = [];
  for (const line of pdbData.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    const atomName = line.substring(12, 16).trim();
    if (!["N", "CA", "C", "O"].includes(atomName)) continue;
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const bFactor = parseFloat(line.substring(60, 66)) || 70;
    const residueSeq = parseInt(line.substring(22, 26).trim(), 10);
    const residueName = line.substring(17, 20).trim();
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      atoms.push({
        pos: new THREE.Vector3(x, y, z),
        bFactor,
        residueSeq,
        atomName,
        residueName,
      });
    }
  }
  return atoms;
}

/* ─── Camera adjuster (responds to isFullscreen) ──────────────────────── */

function CameraController({ isFullscreen }: { isFullscreen: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    const target = isFullscreen ? 22 : 30;
    camera.position.setLength(target);
  }, [isFullscreen, camera]);
  return null;
}

/* ─── Residue tooltip (drei Html) ─────────────────────────────────────── */

function ResidueTooltip({
  atom,
  position,
  theme,
}: {
  atom: ParsedAtom;
  position: THREE.Vector3;
  theme: "dark" | "light";
}) {
  const bgColor =
    theme === "dark"
      ? "oklch(0.105 0.003 280)"
      : "oklch(0.97 0.003 280)";
  const textColor = theme === "dark" ? "#e5e1e4" : "#1a1a1c";
  const mutedColor = theme === "dark" ? "#999" : "#666";
  const borderColor =
    theme === "dark"
      ? "rgba(91,181,162,0.25)"
      : "rgba(91,181,162,0.4)";

  const score = Math.round(atom.bFactor * 10) / 10;
  const hex = plddtHex(atom.bFactor);
  const label = plddtLabel(atom.bFactor);

  return (
    <Html
      position={position}
      center
      style={{ pointerEvents: "none" }}
      distanceFactor={40}
    >
      <div
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: "8px 12px",
          fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
          fontSize: 12,
          color: textColor,
          whiteSpace: "nowrap",
          boxShadow:
            theme === "dark"
              ? "0 4px 20px rgba(0,0,0,0.6), 0 0 8px oklch(0.72 0.12 175 / 0.15)"
              : "0 4px 20px rgba(0,0,0,0.12)",
          backdropFilter: "blur(12px)",
          transform: "translateY(-28px)",
          lineHeight: 1.45,
          minWidth: 140,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 3,
            letterSpacing: "0.01em",
          }}
        >
          {atom.residueName}{" "}
          <span style={{ color: mutedColor, fontWeight: 400, fontSize: 11 }}>
            #{atom.residueSeq}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: hex,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11, color: mutedColor }}>
            pLDDT{" "}
            <span style={{ color: hex, fontWeight: 600 }}>{score}</span>
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: hex,
            marginTop: 3,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </div>
      </div>
    </Html>
  );
}

/* ─── Single CA sphere mesh ───────────────────────────────────────────── */

function CASphere({
  atom,
  position,
  isHighlighted,
  isHovered,
  isClicked,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  atom: ParsedAtom;
  position: THREE.Vector3;
  isHighlighted: boolean;
  isHovered: boolean;
  isClicked: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const active = isHighlighted || isClicked;
  const baseRadius = active ? 0.55 : 0.35;
  const radius = isHovered ? baseRadius * 1.15 : baseRadius;

  const color = active
    ? new THREE.Color(0xe5e1e4)
    : plddtColor(atom.bFactor);

  const emissiveColor = active
    ? new THREE.Color(0x5bb5a2)
    : isHovered
      ? plddtColor(atom.bFactor)
      : new THREE.Color(0x000000);

  const emissiveIntensity = active ? 0.5 : isHovered ? 0.25 : 0;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onPointerOut();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial
        color={color}
        roughness={0.3}
        metalness={0.2}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

/* ─── Main 3D protein structure ───────────────────────────────────────── */

function ProteinStructure({
  pdbData,
  highlightResidues = [],
  onResidueClick,
  onResidueHover,
  isInteracting,
  theme,
}: {
  pdbData: string;
  highlightResidues: number[];
  onResidueClick?: (residueSeq: number) => void;
  onResidueHover?: (residueSeq: number | null) => void;
  isInteracting: boolean;
  theme: "dark" | "light";
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredAtomIdx, setHoveredAtomIdx] = useState<number | null>(null);
  const [clickedResidue, setClickedResidue] = useState<number | null>(null);

  const atoms = useMemo(() => parsePDB(pdbData), [pdbData]);
  const highlightSet = useMemo(
    () => new Set(highlightResidues),
    [highlightResidues]
  );

  // Auto-rotate, pausing on interaction or hover
  useFrame((_, delta) => {
    if (groupRef.current && !isInteracting && hoveredAtomIdx === null) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  const { centeredPositions, scale: _scale } = useMemo(() => {
    if (atoms.length === 0)
      return {
        centeredPositions: new Map<number, THREE.Vector3>(),
        center: new THREE.Vector3(),
        scale: 1,
      };

    const c = new THREE.Vector3();
    atoms.forEach((a) => c.add(a.pos));
    c.divideScalar(atoms.length);

    let maxDist = 0;
    atoms.forEach((a) => {
      const d = a.pos.distanceTo(c);
      if (d > maxDist) maxDist = d;
    });
    const s = maxDist > 0 ? 12 / maxDist : 1;

    const positions = new Map<number, THREE.Vector3>();
    atoms.forEach((a, i) => {
      positions.set(
        i,
        new THREE.Vector3().subVectors(a.pos, c).multiplyScalar(s)
      );
    });

    return { centeredPositions: positions, center: c, scale: s };
  }, [atoms]);

  // Indices of CA atoms
  const caIndices = useMemo(
    () =>
      atoms.reduce<number[]>((acc, a, i) => {
        if (a.atomName === "CA") acc.push(i);
        return acc;
      }, []),
    [atoms]
  );

  // Backbone curve
  const curve = useMemo(() => {
    const caPoints = caIndices
      .map((i) => centeredPositions.get(i)!)
      .filter(Boolean);
    return caPoints.length >= 2
      ? new THREE.CatmullRomCurve3(caPoints)
      : null;
  }, [caIndices, centeredPositions]);

  // Backbone bonds
  const bonds = useMemo(() => {
    const result: {
      key: string;
      mid: THREE.Vector3;
      quat: THREE.Quaternion;
      len: number;
      color: THREE.Color;
    }[] = [];
    const residueMap = new Map<number, Map<string, number>>();
    atoms.forEach((a, i) => {
      if (!residueMap.has(a.residueSeq))
        residueMap.set(a.residueSeq, new Map());
      residueMap.get(a.residueSeq)!.set(a.atomName, i);
    });

    const bondPairs: [string, string][] = [
      ["N", "CA"],
      ["CA", "C"],
    ];
    residueMap.forEach((atomMap, resSeq) => {
      const avgBFactor = atoms[atomMap.get("CA") ?? 0]?.bFactor ?? 70;
      const color = plddtColor(avgBFactor);
      for (const [a1, a2] of bondPairs) {
        const i1 = atomMap.get(a1);
        const i2 = atomMap.get(a2);
        if (i1 === undefined || i2 === undefined) continue;
        const p1 = centeredPositions.get(i1);
        const p2 = centeredPositions.get(i2);
        if (!p1 || !p2) continue;
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        dir.normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir
        );
        result.push({ key: `${resSeq}-${a1}-${a2}`, mid, quat, len, color });
      }
    });
    return result;
  }, [atoms, centeredPositions]);

  const handlePointerOver = useCallback(
    (atomIdx: number) => {
      setHoveredAtomIdx(atomIdx);
      onResidueHover?.(atoms[atomIdx].residueSeq);
    },
    [atoms, onResidueHover]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredAtomIdx(null);
    onResidueHover?.(null);
  }, [onResidueHover]);

  const handleClick = useCallback(
    (atomIdx: number) => {
      const seq = atoms[atomIdx].residueSeq;
      setClickedResidue((prev) => (prev === seq ? null : seq));
      onResidueClick?.(seq);
    },
    [atoms, onResidueClick]
  );

  if (atoms.length < 4) return null;

  const hoveredAtom =
    hoveredAtomIdx !== null ? atoms[hoveredAtomIdx] : null;
  const hoveredPosition =
    hoveredAtomIdx !== null ? centeredPositions.get(hoveredAtomIdx) : null;

  return (
    <group ref={groupRef}>
      {/* Backbone ribbon tube */}
      {curve && (
        <mesh>
          <tubeGeometry
            args={[
              curve,
              caIndices.length * 4,
              0.22,
              8,
              false,
            ]}
          />
          <meshStandardMaterial
            color={theme === "dark" ? "#3a3a3c" : "#b0b0b4"}
            roughness={0.7}
            metalness={0.05}
            transparent
            opacity={theme === "dark" ? 0.35 : 0.3}
          />
        </mesh>
      )}

      {/* CA spheres */}
      {caIndices.map((atomIdx) => {
        const atom = atoms[atomIdx];
        const pos = centeredPositions.get(atomIdx);
        if (!pos) return null;
        return (
          <CASphere
            key={atomIdx}
            atom={atom}
            position={pos}
            isHighlighted={highlightSet.has(atom.residueSeq)}
            isHovered={hoveredAtomIdx === atomIdx}
            isClicked={clickedResidue === atom.residueSeq}
            onPointerOver={() => handlePointerOver(atomIdx)}
            onPointerOut={handlePointerOut}
            onClick={() => handleClick(atomIdx)}
          />
        );
      })}

      {/* Backbone bonds */}
      {bonds.map((b) => (
        <mesh key={b.key} position={b.mid} quaternion={b.quat}>
          <cylinderGeometry args={[0.06, 0.06, b.len, 4]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}

      {/* Tooltip */}
      {hoveredAtom && hoveredPosition && (
        <ResidueTooltip
          atom={hoveredAtom}
          position={hoveredPosition}
          theme={theme}
        />
      )}
    </group>
  );
}

/* ─── Fallback spinner ────────────────────────────────────────────────── */

function ViewerFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
        <span className="text-[11px] text-[var(--text-faint)]">
          Loading structure
        </span>
      </div>
    </div>
  );
}

/* ─── Main exported component ─────────────────────────────────────────── */

export default function ProteinViewer({
  pdbData,
  highlightResidues = [],
  onResidueClick,
  onResidueHover,
  isFullscreen = false,
  theme = "dark",
}: ProteinViewerProps) {
  const [data, setData] = useState(pdbData ?? "");
  const [isInteracting, setIsInteracting] = useState(false);

  // Load sample PDB from static file if no data provided
  useEffect(() => {
    if (!pdbData) {
      fetch("/assets/sample-structure.pdb")
        .then((r) => r.text())
        .then(setData)
        .catch(() => setData(SAMPLE_PDB_FALLBACK));
    } else {
      setData(pdbData);
    }
  }, [pdbData]);

  if (!data) return <ViewerFallback />;

  const cameraZ = isFullscreen ? 22 : 30;

  return (
    <Suspense fallback={<ViewerFallback />}>
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 50 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        {/* Lighting varies by theme */}
        {theme === "dark" ? (
          <>
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[10, 8, 5]}
              intensity={0.9}
              color="#e5e1e4"
            />
            <directionalLight
              position={[-8, -4, -6]}
              intensity={0.3}
              color="#5bb5a2"
            />
            <hemisphereLight
              color="#2a2a2e"
              groundColor="#131315"
              intensity={0.35}
            />
          </>
        ) : (
          <>
            <ambientLight intensity={0.7} />
            <directionalLight
              position={[10, 8, 5]}
              intensity={1.0}
              color="#ffffff"
            />
            <directionalLight
              position={[-8, -4, -6]}
              intensity={0.4}
              color="#5bb5a2"
            />
            <hemisphereLight
              color="#f0f0f2"
              groundColor="#d0d0d4"
              intensity={0.5}
            />
          </>
        )}

        <CameraController isFullscreen={isFullscreen} />

        <ProteinStructure
          pdbData={data}
          highlightResidues={highlightResidues}
          onResidueClick={onResidueClick}
          onResidueHover={onResidueHover}
          isInteracting={isInteracting}
          theme={theme}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={8}
          maxDistance={60}
          enablePan={false}
          onStart={() => setIsInteracting(true)}
          onEnd={() => setIsInteracting(false)}
        />
      </Canvas>
    </Suspense>
  );
}

/* ─── Sample PDB data ─────────────────────────────────────────────────── */

/**
 * Minimal fallback PDB (used only if /assets/sample-structure.pdb fails to load).
 * The real sample is a 114-residue protein loaded from the static file.
 */
const SAMPLE_PDB_FALLBACK = `ATOM      1  N   MET A   1      12.345  23.456   5.678  1.00 92.30           N
ATOM      2  CA  MET A   1      13.100  24.200   6.100  1.00 93.10           C
ATOM      3  C   MET A   1      14.500  23.800   5.800  1.00 91.50           C
ATOM      4  O   MET A   1      14.800  22.700   5.400  1.00 89.20           O
ATOM      5  N   ASP A   2      15.300  24.800   6.000  1.00 90.80           N
ATOM      6  CA  ASP A   2      16.700  24.600   5.700  1.00 91.20           C
ATOM      7  C   ASP A   2      17.500  25.800   5.200  1.00 88.50           C
ATOM      8  O   ASP A   2      17.100  26.950   5.400  1.00 85.30           O
ATOM      9  N   ILE A   3      18.600  25.500   4.500  1.00 86.40           N
ATOM     10  CA  ILE A   3      19.500  26.500   3.900  1.00 84.70           C
ATOM     11  C   ILE A   3      20.800  25.800   3.500  1.00 82.10           C
ATOM     12  O   ILE A   3      20.900  24.600   3.300  1.00 79.50           O
ATOM     13  N   GLU A   4      21.800  26.600   3.200  1.00 78.30           N
ATOM     14  CA  GLU A   4      23.100  26.100   2.700  1.00 75.60           C
ATOM     15  C   GLU A   4      24.100  27.200   2.300  1.00 72.40           C
ATOM     16  O   GLU A   4      23.800  28.400   2.400  1.00 69.80           O
ATOM     17  N   LYS A   5      25.200  26.800   1.700  1.00 67.20           N
ATOM     18  CA  LYS A   5      26.300  27.700   1.200  1.00 64.50           C
ATOM     19  C   LYS A   5      27.500  26.900   0.700  1.00 61.30           C
ATOM     20  O   LYS A   5      27.400  25.700   0.500  1.00 58.60           O
ATOM     21  N   ALA A   6      28.600  27.600   0.400  1.00 55.90           N
ATOM     22  CA  ALA A   6      29.800  27.000  -0.200  1.00 53.20           C
ATOM     23  C   ALA A   6      30.900  28.000  -0.500  1.00 50.80           C
ATOM     24  O   ALA A   6      30.700  29.200  -0.300  1.00 48.40           O
ATOM     25  N   LEU A   7      32.000  27.500  -1.000  1.00 52.10           N
ATOM     26  CA  LEU A   7      33.200  28.300  -1.400  1.00 55.80           C
ATOM     27  C   LEU A   7      34.300  27.400  -1.900  1.00 59.40           C
ATOM     28  O   LEU A   7      34.200  26.200  -1.800  1.00 63.10           O
ATOM     29  N   ARG A   8      35.300  28.000  -2.500  1.00 66.70           N
ATOM     30  CA  ARG A   8      36.500  27.300  -3.000  1.00 70.30           C
ATOM     31  C   ARG A   8      37.600  28.300  -3.300  1.00 73.90           C
ATOM     32  O   ARG A   8      37.400  29.500  -3.200  1.00 77.50           O
TER
END`;

/** Re-export for backward compatibility with mock API routes */
export const SAMPLE_PDB = SAMPLE_PDB_FALLBACK;
