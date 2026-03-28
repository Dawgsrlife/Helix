"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

interface ProteinViewerProps {
  pdbData: string;
  highlightResidues?: number[];
}

interface ParsedAtom {
  pos: THREE.Vector3;
  bFactor: number;
  residueSeq: number;
}

// pLDDT color scheme matching AlphaFold convention
// Blue (high confidence) -> Teal -> Amber -> Coral (low confidence)
function plddtColor(score: number): string {
  if (score >= 90) return "#5bb5a2"; // teal - very high
  if (score >= 70) return "#6b9fd4"; // blue - confident
  if (score >= 50) return "#c9a855"; // amber - moderate
  return "#d47a7a"; // coral - low
}

function parsePDB(pdbData: string): ParsedAtom[] {
  const atoms: ParsedAtom[] = [];
  for (const line of pdbData.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    const atomName = line.substring(12, 16).trim();
    if (atomName !== "CA") continue;
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const bFactor = parseFloat(line.substring(60, 66)) || 70;
    const residueSeq = parseInt(line.substring(22, 26).trim(), 10);
    atoms.push({ pos: new THREE.Vector3(x, y, z), bFactor, residueSeq });
  }
  return atoms;
}

function BackboneTrace({
  pdbData,
  highlightResidues = [],
}: {
  pdbData: string;
  highlightResidues: number[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const atoms = useMemo(() => parsePDB(pdbData), [pdbData]);
  const highlightSet = useMemo(() => new Set(highlightResidues), [highlightResidues]);

  // Slow auto-rotate
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  const { centeredPoints, center } = useMemo(() => {
    if (atoms.length === 0) return { centeredPoints: [], center: new THREE.Vector3() };
    const c = new THREE.Vector3();
    atoms.forEach((a) => c.add(a.pos));
    c.divideScalar(atoms.length);
    return {
      centeredPoints: atoms.map((a) => new THREE.Vector3().subVectors(a.pos, c)),
      center: c,
    };
  }, [atoms]);

  if (atoms.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(centeredPoints);

  return (
    <group ref={groupRef}>
      {/* Backbone tube - subtle, not the star */}
      <mesh>
        <tubeGeometry args={[curve, centeredPoints.length * 3, 0.2, 6, false]} />
        <meshStandardMaterial
          color="#3a3a3c"
          roughness={0.7}
          metalness={0.05}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* CA spheres colored by pLDDT */}
      {atoms.map((atom, i) => {
        const pos = centeredPoints[i];
        const isHighlighted = highlightSet.has(atom.residueSeq);
        const color = isHighlighted ? "#e5e1e4" : plddtColor(atom.bFactor);
        const radius = isHighlighted ? 0.55 : 0.35;

        return (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[radius, 12, 12]} />
            <meshStandardMaterial
              color={color}
              roughness={0.35}
              metalness={0.15}
              emissive={isHighlighted ? "#5bb5a2" : "#000000"}
              emissiveIntensity={isHighlighted ? 0.3 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function ViewerFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-[#5bb5a2] border-t-transparent animate-spin" />
        <span className="text-[11px] text-[#4a4a4a]">Loading structure</span>
      </div>
    </div>
  );
}

export default function ProteinViewer({
  pdbData,
  highlightResidues = [],
}: ProteinViewerProps) {
  return (
    <Suspense fallback={<ViewerFallback />}>
      <Canvas
        camera={{ position: [0, 0, 35], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Lighting - warm, cinematic */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 8, 5]} intensity={0.8} color="#e5e1e4" />
        <directionalLight position={[-8, -4, -6]} intensity={0.2} color="#5bb5a2" />
        <Environment preset="city" environmentIntensity={0.1} />

        <BackboneTrace pdbData={pdbData} highlightResidues={highlightResidues} />

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={15}
          maxDistance={80}
          enablePan={false}
        />
      </Canvas>
    </Suspense>
  );
}

/**
 * Sample PDB data for standalone demo rendering.
 * This is a fragment of a small alpha-helical protein (30 residues).
 * bFactor column encodes pLDDT confidence scores.
 */
export const SAMPLE_PDB = `ATOM      1  CA  MET A   1      27.340  24.430   2.614  1.00 95.00           C
ATOM      2  CA  ASP A   2      25.210  21.190   2.110  1.00 93.00           C
ATOM      3  CA  ILE A   3      23.050  18.240   3.470  1.00 91.00           C
ATOM      4  CA  GLU A   4      20.300  16.240   1.530  1.00 89.00           C
ATOM      5  CA  LYS A   5      17.120  17.940   0.340  1.00 88.00           C
ATOM      6  CA  ALA A   6      14.440  15.600   1.640  1.00 92.00           C
ATOM      7  CA  LEU A   7      12.230  13.350   3.700  1.00 87.00           C
ATOM      8  CA  ARG A   8       9.840  11.010   2.010  1.00 82.00           C
ATOM      9  CA  GLY A   9       7.910   8.540   4.170  1.00 74.00           C
ATOM     10  CA  PHE A  10       5.440   6.380   2.250  1.00 69.00           C
ATOM     11  CA  LEU A  11       3.450   3.360   3.390  1.00 65.00           C
ATOM     12  CA  THR A  12       1.190   1.480   0.810  1.00 58.00           C
ATOM     13  CA  ASN A  13      -1.510  -0.750   2.320  1.00 52.00           C
ATOM     14  CA  GLU A  14      -3.880  -2.480   0.000  1.00 48.00           C
ATOM     15  CA  VAL A  15      -5.810  -5.130   1.760  1.00 45.00           C
ATOM     16  CA  ALA A  16      -4.020  -7.310  -0.800  1.00 50.00           C
ATOM     17  CA  ASP A  17      -1.640  -9.340   1.350  1.00 55.00           C
ATOM     18  CA  LEU A  18       0.780 -11.530  -0.470  1.00 62.00           C
ATOM     19  CA  ARG A  19       3.310 -13.100   1.710  1.00 68.00           C
ATOM     20  CA  SER A  20       5.920 -15.150  -0.170  1.00 73.00           C
ATOM     21  CA  GLN A  21       8.180 -17.180   1.930  1.00 78.00           C
ATOM     22  CA  ILE A  22      10.980 -18.340  -0.410  1.00 83.00           C
ATOM     23  CA  TRP A  23      13.610 -20.120   1.310  1.00 86.00           C
ATOM     24  CA  ALA A  24      16.380 -21.530  -0.790  1.00 88.00           C
ATOM     25  CA  GLU A  25      18.810 -23.810   0.850  1.00 90.00           C
ATOM     26  CA  PHE A  26      21.570 -24.960  -1.470  1.00 92.00           C
ATOM     27  CA  LYS A  27      24.100 -26.510   0.840  1.00 91.00           C
ATOM     28  CA  ASP A  28      27.070 -27.860  -1.190  1.00 85.00           C
ATOM     29  CA  VAL A  29      29.120 -30.250   0.940  1.00 78.00           C
ATOM     30  CA  THR A  30      32.210 -31.310  -0.820  1.00 72.00           C
END`;
