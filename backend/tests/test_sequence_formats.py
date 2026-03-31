"""Tests for FASTA/GenBank import and export (Phase 3.2).

Uses real genomic sequences and validates exact output format compliance.
"""

import pytest
from services.sequence_formats import (
    FastaRecord,
    GenBankFeature,
    GenBankRecord,
    export_fasta,
    export_genbank,
    parse_fasta,
    parse_genbank,
)

# Real BRCA1 exon 2 fragment
BRCA1_SEQ = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"

# Real GFP fragment
GFP_SEQ = "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTG"


# -------------------------------------------------------------------------
# FASTA parsing
# -------------------------------------------------------------------------


class TestParseFasta:
    def test_single_record(self):
        fasta = f">BRCA1_exon2 Homo sapiens BRCA1\n{BRCA1_SEQ}\n"
        records = parse_fasta(fasta)
        assert len(records) == 1
        assert records[0].header == "BRCA1_exon2"
        assert records[0].description == "Homo sapiens BRCA1"
        assert records[0].sequence == BRCA1_SEQ
        assert records[0].id == "BRCA1_exon2"

    def test_multi_record(self):
        fasta = f">BRCA1\n{BRCA1_SEQ}\n>GFP\n{GFP_SEQ}\n"
        records = parse_fasta(fasta)
        assert len(records) == 2
        assert records[0].header == "BRCA1"
        assert records[0].sequence == BRCA1_SEQ
        assert records[1].header == "GFP"
        assert records[1].sequence == GFP_SEQ

    def test_multiline_sequence(self):
        lines = [BRCA1_SEQ[i : i + 20] for i in range(0, len(BRCA1_SEQ), 20)]
        fasta = ">test\n" + "\n".join(lines) + "\n"
        records = parse_fasta(fasta)
        assert len(records) == 1
        assert records[0].sequence == BRCA1_SEQ

    def test_raw_sequence_no_header(self):
        records = parse_fasta(BRCA1_SEQ)
        assert len(records) == 1
        assert records[0].header == "imported_sequence"
        assert records[0].sequence == BRCA1_SEQ

    def test_lowercase_normalized(self):
        records = parse_fasta(f">test\n{BRCA1_SEQ.lower()}\n")
        assert records[0].sequence == BRCA1_SEQ

    def test_whitespace_stripped(self):
        fasta = f">test\n  {BRCA1_SEQ[:20]}  \n  {BRCA1_SEQ[20:]}  \n"
        records = parse_fasta(fasta)
        assert records[0].sequence == BRCA1_SEQ

    def test_empty_input(self):
        assert parse_fasta("") == []
        assert parse_fasta("   \n\n  ") == []

    def test_invalid_bases_filtered(self):
        """Non-standard characters (digits, punctuation) are removed. IUPAC ambiguity codes are kept."""
        records = parse_fasta(">test\nATCG1234ATCG\n")
        assert records[0].sequence == "ATCGATCG"

    def test_n_bases_preserved(self):
        records = parse_fasta(">test\nATCGNNNNATCG\n")
        assert records[0].sequence == "ATCGNNNNATCG"


# -------------------------------------------------------------------------
# FASTA export
# -------------------------------------------------------------------------


class TestExportFasta:
    def test_single_sequence(self):
        result = export_fasta([{"id": "BRCA1", "sequence": BRCA1_SEQ}])
        lines = result.strip().split("\n")
        assert lines[0] == ">BRCA1"
        assert "".join(lines[1:]) == BRCA1_SEQ

    def test_with_description(self):
        result = export_fasta([{
            "id": "BRCA1",
            "sequence": BRCA1_SEQ,
            "description": "Homo sapiens BRCA1 exon 2",
        }])
        assert result.startswith(">BRCA1 Homo sapiens BRCA1 exon 2\n")

    def test_line_wrapping(self):
        long_seq = "A" * 200
        result = export_fasta([{"id": "test", "sequence": long_seq}], line_width=80)
        lines = result.strip().split("\n")
        assert lines[0] == ">test"
        assert len(lines[1]) == 80
        assert len(lines[2]) == 80
        assert len(lines[3]) == 40

    def test_multiple_sequences(self):
        result = export_fasta([
            {"id": "seq1", "sequence": "ATCG"},
            {"id": "seq2", "sequence": "GCTA"},
        ])
        assert ">seq1" in result
        assert ">seq2" in result

    def test_roundtrip(self):
        """Export then re-parse should produce identical records."""
        original = [
            {"id": "BRCA1", "sequence": BRCA1_SEQ, "description": "test gene"},
            {"id": "GFP", "sequence": GFP_SEQ, "description": "fluorescent protein"},
        ]
        exported = export_fasta(original)
        parsed = parse_fasta(exported)
        assert len(parsed) == 2
        assert parsed[0].header == "BRCA1"
        assert parsed[0].sequence == BRCA1_SEQ
        assert parsed[1].header == "GFP"
        assert parsed[1].sequence == GFP_SEQ


# -------------------------------------------------------------------------
# GenBank parsing
# -------------------------------------------------------------------------


SAMPLE_GENBANK = """LOCUS       BRCA1_FRAG               48 bp    DNA     linear   SYN 30-MAR-2026
DEFINITION  BRCA1 exon 2 fragment, synthetic.
ACCESSION   BRCA1_FRAG
VERSION     BRCA1_FRAG.1
SOURCE      Homo sapiens
  ORGANISM  Homo sapiens
            Eukaryota; Metazoa; Chordata; Mammalia; Primates; Hominidae; Homo.
FEATURES             Location/Qualifiers
     source          1..48
                     /organism="Homo sapiens"
                     /mol_type="genomic DNA"
     CDS             1..48
                     /gene="BRCA1"
                     /product="breast cancer type 1"
ORIGIN
        1 atggatttat ctgctcttcg cgttgaagaa gtacaaaatg tcattaat
//
"""


class TestParseGenBank:
    def test_parses_locus(self):
        records = parse_genbank(SAMPLE_GENBANK)
        assert len(records) == 1
        assert "BRCA1_FRAG" in records[0].locus

    def test_parses_definition(self):
        records = parse_genbank(SAMPLE_GENBANK)
        assert "BRCA1 exon 2 fragment" in records[0].definition

    def test_parses_organism(self):
        records = parse_genbank(SAMPLE_GENBANK)
        assert records[0].organism == "Homo sapiens"

    def test_parses_sequence(self):
        records = parse_genbank(SAMPLE_GENBANK)
        # GenBank ORIGIN has lowercase + spaces + line numbers
        assert records[0].sequence == BRCA1_SEQ

    def test_parses_features(self):
        records = parse_genbank(SAMPLE_GENBANK)
        features = records[0].features
        # Should have source + CDS
        cds_features = [f for f in features if f.type == "CDS"]
        assert len(cds_features) == 1
        assert cds_features[0].start == 1
        assert cds_features[0].end == 48
        assert cds_features[0].qualifiers.get("gene") == "BRCA1"

    def test_empty_input(self):
        assert parse_genbank("") == []

    def test_multiple_records(self):
        double = SAMPLE_GENBANK + "\n" + SAMPLE_GENBANK.replace("BRCA1_FRAG", "GFP_FRAG")
        records = parse_genbank(double)
        assert len(records) == 2


# -------------------------------------------------------------------------
# GenBank export
# -------------------------------------------------------------------------


class TestExportGenBank:
    def test_basic_export(self):
        result = export_genbank(sequence=BRCA1_SEQ, locus="TEST")
        assert "LOCUS       TEST" in result
        assert "48 bp" in result
        assert "ORIGIN" in result
        assert "//" in result

    def test_sequence_in_origin(self):
        result = export_genbank(sequence="ATCGATCG", locus="TINY")
        # Origin should contain lowercase grouped sequence
        assert "atcgatcg" in result

    def test_scores_in_comment(self):
        result = export_genbank(
            sequence=BRCA1_SEQ,
            scores={"functional": 0.85, "combined": 0.72},
        )
        assert "functional: 0.8500" in result
        assert "combined: 0.7200" in result

    def test_features_exported(self):
        result = export_genbank(
            sequence=BRCA1_SEQ,
            features=[{"type": "CDS", "start": 1, "end": 47, "gene": "BRCA1"}],
        )
        assert "CDS" in result
        assert "1..47" in result
        assert '/gene="BRCA1"' in result

    def test_complement_feature(self):
        result = export_genbank(
            sequence=BRCA1_SEQ,
            features=[{"type": "CDS", "start": 1, "end": 47, "strand": -1}],
        )
        assert "complement(1..47)" in result

    def test_genbank_roundtrip(self):
        """Export then re-parse should recover the sequence."""
        exported = export_genbank(
            sequence=BRCA1_SEQ,
            locus="ROUNDTRIP",
            definition="Roundtrip test",
            organism="Homo sapiens",
        )
        parsed = parse_genbank(exported)
        assert len(parsed) == 1
        assert parsed[0].sequence == BRCA1_SEQ
        assert parsed[0].organism == "Homo sapiens"

    def test_long_sequence_formatting(self):
        """GenBank ORIGIN groups sequence in blocks of 10, 6 per line."""
        seq = "A" * 120
        result = export_genbank(sequence=seq, locus="LONG")
        origin_lines = [l for l in result.split("\n") if l.strip() and l[0] == " " and l.strip()[0].isdigit()]
        # First line starts at position 1, should have 60 bases
        assert origin_lines[0].strip().startswith("1")
        # Second line at 61
        assert origin_lines[1].strip().startswith("61")


# -------------------------------------------------------------------------
# API endpoint tests (via TestClient)
# -------------------------------------------------------------------------


class TestImportExportEndpoints:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_import_fasta(self, client):
        fasta_content = f">BRCA1\n{BRCA1_SEQ}\n"
        response = client.post(
            "/api/import",
            files={"file": ("test.fasta", fasta_content, "text/plain")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "fasta"
        assert data["count"] == 1
        assert data["sequences"][0]["id"] == "BRCA1"
        assert data["sequences"][0]["sequence"] == BRCA1_SEQ
        assert data["sequences"][0]["length"] == 48

    def test_import_genbank(self, client):
        response = client.post(
            "/api/import",
            files={"file": ("test.gb", SAMPLE_GENBANK, "text/plain")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "genbank"
        assert data["count"] == 1
        assert data["sequences"][0]["sequence"] == BRCA1_SEQ

    def test_export_fasta(self, client):
        response = client.post(
            "/api/export/fasta",
            json={"sequences": [{"id": "BRCA1", "sequence": BRCA1_SEQ}]},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/plain; charset=utf-8"
        assert ">BRCA1" in response.text
        assert BRCA1_SEQ in response.text

    def test_export_genbank(self, client):
        response = client.post(
            "/api/export/genbank",
            json={
                "sequence": BRCA1_SEQ,
                "locus": "BRCA1_TEST",
                "scores": {"functional": 0.85},
            },
        )
        assert response.status_code == 200
        assert "LOCUS" in response.text
        assert "ORIGIN" in response.text
        assert "functional: 0.8500" in response.text

    def test_export_fasta_empty(self, client):
        response = client.post("/api/export/fasta", json={"sequences": []})
        assert response.status_code == 422

    def test_export_genbank_empty(self, client):
        response = client.post("/api/export/genbank", json={"sequence": ""})
        assert response.status_code == 422
