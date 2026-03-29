const express = require("express");
const cors = require("cors");
const expressWs = require("express-ws");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
expressWs(app);

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Try to load the real 114-residue PDB from the frontend's public assets
let SAMPLE_PDB;
try {
  SAMPLE_PDB = fs.readFileSync(
    path.join(__dirname, "..", "frontend", "public", "assets", "sample-structure.pdb"),
    "utf8"
  );
} catch {
  // Fallback to minimal PDB
  SAMPLE_PDB = `ATOM      1  N   MET A   1      12.345  23.456   5.678  1.00 92.30           N
ATOM      2  CA  MET A   1      13.100  24.200   6.100  1.00 93.10           C
ATOM      3  C   MET A   1      14.500  23.800   5.800  1.00 91.50           C
ATOM      4  O   MET A   1      14.800  22.700   5.400  1.00 89.20           O
ATOM      5  N   ASP A   2      15.300  24.800   6.000  1.00 90.80           N
ATOM      6  CA  ASP A   2      16.700  24.600   5.700  1.00 91.20           C
ATOM      7  C   ASP A   2      17.500  25.800   5.200  1.00 88.50           C
ATOM      8  O   ASP A   2      17.100  26.950   5.400  1.00 85.30           O
TER
END`;
}

const BASES = ["A", "T", "C", "G"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomBase() {
  return BASES[Math.floor(Math.random() * 4)];
}

/**
 * Generate realistic genomic regions for a given sequence length.
 * Cycles through exon / intron / orf, assigning contiguous non-overlapping
 * ranges that cover a portion of the sequence.
 */
function generateRegions(seqLength) {
  const count = Math.floor(randomFloat(3, 7)); // 3-6 regions
  const types = ["exon", "intron", "orf"];
  const counters = { exon: 0, intron: 0, orf: 0 };
  const regions = [];
  let cursor = 0;

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    counters[type] += 1;

    const regionLen = Math.max(
      10,
      Math.floor(randomFloat(seqLength * 0.05, seqLength * 0.25))
    );
    const start = cursor;
    const end = Math.min(start + regionLen, seqLength - 1);

    let label;
    if (type === "exon") label = `Exon ${counters.exon}`;
    else if (type === "intron") label = `Intron ${counters.intron}`;
    else label = `ORF ${counters.orf}`;

    regions.push({
      start,
      end,
      type,
      label,
      score: parseFloat(randomFloat(0.6, 0.99).toFixed(2)),
    });

    // leave a small gap between regions
    cursor = end + Math.floor(randomFloat(1, seqLength * 0.05));
    if (cursor >= seqLength) break;
  }

  return regions;
}

/**
 * Generate per-position log-likelihood scores (negative, -4 to 0).
 */
function generateScores(seqLength) {
  const scores = [];
  for (let i = 0; i < seqLength; i++) {
    scores.push(parseFloat(randomFloat(-4, 0).toFixed(3)));
  }
  return scores;
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    model: "evo2-40b",
    gpu_available: true,
    inference_mode: "mock",
  });
});

// Analyze a sequence
app.post("/api/analyze", (req, res) => {
  const { sequence } = req.body;
  if (!sequence) {
    return res.status(400).json({ error: "sequence is required" });
  }

  const seqLength = sequence.length;

  res.json({
    sequence,
    regions: generateRegions(seqLength),
    scores: generateScores(seqLength),
    proteins: [
      {
        id: "protein_1",
        name: "Predicted protein",
        pdb_data: SAMPLE_PDB,
      },
    ],
  });
});

// Single-position mutation analysis
app.post("/api/mutations", (req, res) => {
  const { sequence, position, alternate_base } = req.body;
  if (!sequence || position == null || !alternate_base) {
    return res
      .status(400)
      .json({ error: "sequence, position, and alternate_base are required" });
  }

  const reference_base = sequence[position] || "N";
  const delta_likelihood = parseFloat(randomFloat(-5, 5).toFixed(3));

  let predicted_impact;
  const absDelta = Math.abs(delta_likelihood);
  if (absDelta < 1.5) predicted_impact = "benign";
  else if (absDelta < 3.5) predicted_impact = "moderate";
  else predicted_impact = "deleterious";

  res.json({
    position,
    reference_base,
    alternate_base,
    delta_likelihood,
    predicted_impact,
  });
});

// Structure prediction
app.post("/api/structure", (_req, res) => {
  res.json({ pdb_data: SAMPLE_PDB });
});

// Design — kick off pipeline
app.post("/api/design", (req, res) => {
  const session_id = req.body.session_id || uuidv4();
  res.json({
    session_id,
    status: "pipeline_started",
    ws_url: `ws://localhost:8000/ws/pipeline/${session_id}`,
  });
});

// Base editing
app.post("/api/edit/base", (req, res) => {
  const { position, new_base, session_id, candidate_id } = req.body;
  if (position == null || !new_base) {
    return res
      .status(400)
      .json({ error: "position and new_base are required" });
  }

  const reference_base = randomBase();
  const delta_likelihood = parseFloat(randomFloat(-5, 5).toFixed(3));

  let predicted_impact;
  const absDelta = Math.abs(delta_likelihood);
  if (absDelta < 1.5) predicted_impact = "benign";
  else if (absDelta < 3.5) predicted_impact = "moderate";
  else predicted_impact = "deleterious";

  res.json({
    position,
    reference_base,
    new_base,
    delta_likelihood,
    predicted_impact,
    updated_scores: {
      functional: parseFloat(randomFloat(0.6, 0.95).toFixed(2)),
      tissue_specificity: parseFloat(randomFloat(0.5, 0.9).toFixed(2)),
      off_target: parseFloat(randomFloat(0.01, 0.1).toFixed(2)),
      novelty: parseFloat(randomFloat(0.4, 0.8).toFixed(2)),
      combined: parseFloat(randomFloat(0.65, 0.9).toFixed(2)),
    },
  });
});

// Follow-up edit
app.post("/api/edit/followup", (_req, res) => {
  res.json({
    status: "partial_rerun_started",
    steps_rerunning: ["intent_parse", "evo2_scoring"],
  });
});

// Auth — session
app.get("/api/auth/session", (_req, res) => {
  res.json({
    user: {
      id: "user_1",
      name: "Demo User",
      email: "demo@helix.bio",
      image: null,
    },
    expires: "2026-12-31",
  });
});

// Auth — sign out
app.post("/api/auth/signout", (_req, res) => {
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// WebSocket pipeline
// ---------------------------------------------------------------------------

app.ws("/ws/pipeline/:session_id", (ws, req) => {
  const { session_id } = req.params;
  console.log(`[ws] pipeline connected: ${session_id}`);

  const send = (payload) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  };

  // Build the generated sequence as we emit tokens
  const generatedTokens = [];

  const schedule = [];
  let delay = 0;

  // 1. Intent parsed
  delay += 500;
  schedule.push(
    setTimeout(() => {
      send({
        event: "intent_parsed",
        data: {
          spec: {
            design_type: "promoter",
            target_gene: "BDNF",
            organism: "human",
          },
        },
      });
    }, delay)
  );

  // 2. Retrieval progress — ncbi
  delay += 500;
  schedule.push(
    setTimeout(() => {
      send({
        event: "retrieval_progress",
        data: { source: "ncbi", status: "complete" },
      });
    }, delay)
  );

  // 3. Retrieval progress — pubmed
  delay += 300;
  schedule.push(
    setTimeout(() => {
      send({
        event: "retrieval_progress",
        data: { source: "pubmed", status: "complete" },
      });
    }, delay)
  );

  // 4. Retrieval progress — clinvar
  delay += 200;
  schedule.push(
    setTimeout(() => {
      send({
        event: "retrieval_progress",
        data: { source: "clinvar", status: "complete" },
      });
    }, delay)
  );

  // 5. Generation tokens — 36 tokens, 30ms apart
  delay += 300;
  for (let i = 0; i < 36; i++) {
    const tokenDelay = delay + i * 30;
    schedule.push(
      setTimeout(() => {
        const token = randomBase();
        generatedTokens.push(token);
        send({
          event: "generation_token",
          data: { candidate_id: 0, token, position: i },
        });
      }, tokenDelay)
    );
  }
  delay += 36 * 30; // advance past all token events

  // 6. Candidate scored
  const candidateScores = {
    functional: 0.89,
    tissue_specificity: 0.76,
    off_target: 0.03,
    novelty: 0.65,
    combined: 0.82,
  };

  delay += 200;
  schedule.push(
    setTimeout(() => {
      send({
        event: "candidate_scored",
        data: { candidate_id: 0, scores: candidateScores },
      });
    }, delay)
  );

  // 7. Structure ready
  delay += 500;
  schedule.push(
    setTimeout(() => {
      send({
        event: "structure_ready",
        data: { candidate_id: 0, pdb_data: SAMPLE_PDB, confidence: 0.73 },
      });
    }, delay)
  );

  // 8. Explanation chunks (3x)
  const explanations = [
    "This promoter design targets the BDNF gene using a combination of SP1 and CREB binding sites optimized for neuronal expression.",
    "Tissue specificity was enhanced by incorporating a CpG island pattern and TATA-box variant found in highly expressed cortical genes.",
    "Off-target analysis shows minimal predicted binding in hepatic or cardiac regulatory networks, supporting CNS-selective activity.",
  ];

  delay += 300;
  for (let i = 0; i < explanations.length; i++) {
    const chunkDelay = delay + i * 300;
    schedule.push(
      setTimeout(() => {
        send({
          event: "explanation_chunk",
          data: { text: explanations[i] },
        });
      }, chunkDelay)
    );
  }
  delay += explanations.length * 300;

  // 9. Pipeline complete
  delay += 300;
  schedule.push(
    setTimeout(() => {
      const finalSequence = generatedTokens.join("");
      send({
        event: "pipeline_complete",
        data: {
          candidates: [
            {
              id: 0,
              sequence: finalSequence,
              scores: candidateScores,
              pdb_data: SAMPLE_PDB,
            },
          ],
        },
      });
    }, delay)
  );

  // Clean up on close
  ws.on("close", () => {
    console.log(`[ws] pipeline disconnected: ${session_id}`);
    schedule.forEach((t) => clearTimeout(t));
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Helix mock backend running on http://localhost:${PORT}`);
});
