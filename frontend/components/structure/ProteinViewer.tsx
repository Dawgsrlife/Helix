"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface ProteinViewerProps {
  pdbData: string;
  highlightResidues?: number[];
}

/** Parse PDB ATOM records into position + bFactor arrays */
function parsePDB(pdbData: string) {
  const atoms: { pos: THREE.Vector3; bFactor: number; residueSeq: number }[] = [];

  for (const line of pdbData.split("\n")) {
    if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;

    // Only take CA (alpha carbon) for backbone trace
    const atomName = line.substring(12, 16).trim();
    if (atomName !== "CA") continue;

    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const bFactor = parseFloat(line.substring(60, 66)) || 0;
    const residueSeq = parseInt(line.substring(22, 26).trim(), 10);

    atoms.push({
      pos: new THREE.Vector3(x, y, z),
      bFactor,
      residueSeq,
    });
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

  // Auto-rotate
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  if (atoms.length === 0) return null;

  // Center the structure
  const center = new THREE.Vector3();
  atoms.forEach((a) => center.add(a.pos));
  center.divideScalar(atoms.length);

  // Create tube geometry along backbone
  const points = atoms.map((a) =>
    new THREE.Vector3().subVectors(a.pos, center)
  );

  const highlightSet = new Set(highlightResidues);

  return (
    <group ref={groupRef}>
      {/* Backbone tube */}
      {points.length >= 2 && (
        <mesh>
          <tubeGeometry
            args={[
              new THREE.CatmullRomCurve3(points),
              points.length * 2,
              0.3,
              8,
              false,
            ]}
          />
          <meshStandardMaterial
            color="#06b6d4"
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      )}

      {/* CA spheres */}
      {atoms.map((atom, i) => {
        const pos = new THREE.Vector3().subVectors(atom.pos, center);
        const isHighlighted = highlightSet.has(atom.residueSeq);
        // Color by confidence (bFactor as pLDDT)
        const confidence = atom.bFactor / 100;
        const color = isHighlighted
          ? "#f43f5e"
          : confidence > 0.7
            ? "#22c55e"
            : confidence > 0.5
              ? "#f59e0b"
              : "#ef4444";

        return (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[isHighlighted ? 0.6 : 0.35, 8, 8]} />
            <meshStandardMaterial
              color={color}
              roughness={0.5}
              metalness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function ProteinViewer({
  pdbData,
  highlightResidues = [],
}: ProteinViewerProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 50], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
      <BackboneTrace
        pdbData={pdbData}
        highlightResidues={highlightResidues}
      />
      <OrbitControls enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
