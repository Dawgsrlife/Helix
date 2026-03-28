export interface ProteinStructure {
  pdbData: string;
  name?: string;
  confidence?: number; // pLDDT score
}

export interface PDBAtom {
  serial: number;
  name: string;
  residueName: string;
  chainId: string;
  residueSeq: number;
  x: number;
  y: number;
  z: number;
  bFactor: number;
}

export interface Residue {
  index: number;
  name: string;
  atoms: PDBAtom[];
  secondaryStructure?: "helix" | "sheet" | "coil";
}
