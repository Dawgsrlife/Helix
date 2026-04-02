"""Tests for Phase 5 agent tools — codon_optimize, offtarget_scan,
insert_bases, delete_bases, restriction_sites.

Tests verify:
  - Tool execution returns correct ToolExecution shape
  - Session store is updated with mutated sequences
  - Scores are recomputed after mutation
  - Biological invariants hold (amino acid preservation, length changes)
  - Error handling for invalid inputs
  - Deterministic regex-based planning routes correctly
"""

from __future__ import annotations

import pytest

from services.agent.tools import (
    tool_codon_optimize,
    tool_delete_bases,
    tool_insert_bases,
    tool_offtarget_scan,
    tool_restriction_sites,
)
from services.agent.parsing import ALLOWED_TOOLS, normalize_action
from services.agent.planner import deterministic_plan
from services.evo2 import Evo2MockService
from services.session_store import MemorySessionStore

DEFAULT_SEED = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"


@pytest.fixture
def service():
    return Evo2MockService()


@pytest.fixture
def store():
    return MemorySessionStore(DEFAULT_SEED)


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------


class TestToolRegistration:
    """Verify all new tools are properly registered in the whitelist."""

    def test_new_tools_in_allowed_set(self):
        for tool in ("codon_optimize", "offtarget_scan", "insert_bases",
                      "delete_bases", "restriction_sites"):
            assert tool in ALLOWED_TOOLS, f"{tool} not in ALLOWED_TOOLS"

    def test_normalize_accepts_new_tools(self):
        for tool in ("codon_optimize", "offtarget_scan", "insert_bases",
                      "delete_bases", "restriction_sites"):
            result = normalize_action({"tool": tool, "args": {}})
            assert result is not None
            assert result["tool"] == tool


# ---------------------------------------------------------------------------
# Codon optimization tool
# ---------------------------------------------------------------------------


class TestToolCodonOptimize:
    """Tests for the codon_optimize agent tool."""

    @pytest.mark.asyncio
    async def test_codon_optimize_basic(self, service, store):
        # ATG GAT TTA TCT GCT CTT CGC GTT GAA GAA — protein-coding
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            organism="homo_sapiens",
        )
        assert result.call.status == "ok"
        assert result.call.tool == "codon_optimize"
        assert result.candidate_update is not None
        assert result.candidate_update.sequence != ""
        assert len(result.candidate_update.sequence) == len(seq)

    @pytest.mark.asyncio
    async def test_codon_optimize_preserves_amino_acids(self, service, store):
        """The optimized DNA must encode the same protein."""
        from services.translation import translate

        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            organism="e_coli",
        )
        original_protein = translate(seq, to_stop=False)
        optimized_protein = translate(result.candidate_update.sequence, to_stop=False)
        assert original_protein == optimized_protein

    @pytest.mark.asyncio
    async def test_codon_optimize_updates_store(self, service, store):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        stored = await store.require_candidate_sequence("s1", 0)
        assert stored == result.candidate_update.sequence

    @pytest.mark.asyncio
    async def test_codon_optimize_has_scores(self, service, store):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        scores = result.candidate_update.scores
        assert "combined" in scores
        assert "functional" in scores
        assert all(0.0 <= v <= 1.0 for v in scores.values())

    @pytest.mark.asyncio
    async def test_codon_optimize_mutation_metadata(self, service, store):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
        )
        mutation = result.candidate_update.mutation
        assert mutation["scope"] == "transform"
        assert mutation["mode"] == "codon_optimize"
        assert mutation["organism"] == "homo_sapiens"
        assert isinstance(mutation["codons_changed"], int)
        assert isinstance(mutation["cai_before"], float)
        assert isinstance(mutation["cai_after"], float)

    @pytest.mark.asyncio
    async def test_codon_optimize_invalid_organism(self, service, store):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="Unsupported organism"):
            await tool_codon_optimize(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                organism="alien",
            )

    @pytest.mark.asyncio
    async def test_codon_optimize_too_short(self, service, store):
        seq = "AT"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="at least 3"):
            await tool_codon_optimize(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
            )

    @pytest.mark.asyncio
    async def test_codon_optimize_for_ecoli(self, service, store):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_codon_optimize(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            organism="e_coli",
        )
        assert result.candidate_update.mutation["organism"] == "e_coli"


# ---------------------------------------------------------------------------
# Off-target scan tool
# ---------------------------------------------------------------------------


class TestToolOfftargetScan:
    """Tests for the offtarget_scan agent tool."""

    @pytest.mark.asyncio
    async def test_offtarget_scan_basic(self, service):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"
        result = await tool_offtarget_scan(
            service=service, candidate_id=0, sequence=seq,
        )
        assert result.call.status == "ok"
        assert result.call.tool == "offtarget_scan"
        # No candidate_update — this is a read-only analysis tool
        assert result.candidate_update is None

    @pytest.mark.asyncio
    async def test_offtarget_scan_with_alu_content(self, service):
        """Sequence with Alu-like content should produce hits."""
        # Use first 40bp of the Alu consensus
        alu_fragment = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTT"
        result = await tool_offtarget_scan(
            service=service, candidate_id=0, sequence=alu_fragment, k=8,
        )
        assert result.call.status == "ok"
        assert "off-target scan" in result.note.lower() or "Off-target" in result.note

    @pytest.mark.asyncio
    async def test_offtarget_scan_k_clamped(self, service):
        seq = "ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAAT"
        # k too small — should clamp to 8
        result = await tool_offtarget_scan(
            service=service, candidate_id=0, sequence=seq, k=3,
        )
        assert result.call.status == "ok"
        # k too large — should clamp to 20
        result = await tool_offtarget_scan(
            service=service, candidate_id=0, sequence=seq, k=100,
        )
        assert result.call.status == "ok"

    @pytest.mark.asyncio
    async def test_offtarget_scan_includes_gc_risk(self, service):
        # Very high GC sequence should flag GC balance risk
        high_gc_seq = "GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC"
        result = await tool_offtarget_scan(
            service=service, candidate_id=0, sequence=high_gc_seq, k=8,
        )
        assert "GC" in result.note


# ---------------------------------------------------------------------------
# Insert bases tool
# ---------------------------------------------------------------------------


class TestToolInsertBases:
    """Tests for the insert_bases agent tool."""

    @pytest.mark.asyncio
    async def test_insert_single_base(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=4, bases="G",
        )
        assert result.call.status == "ok"
        assert result.candidate_update.sequence == "ATCGGATCG"
        assert len(result.candidate_update.sequence) == len(seq) + 1

    @pytest.mark.asyncio
    async def test_insert_multiple_bases(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=0, bases="ATG",
        )
        assert result.candidate_update.sequence == "ATGATCGATCG"
        assert len(result.candidate_update.sequence) == len(seq) + 3

    @pytest.mark.asyncio
    async def test_insert_at_end(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=len(seq), bases="TGA",
        )
        assert result.candidate_update.sequence == "ATCGTGA"

    @pytest.mark.asyncio
    async def test_insert_updates_store(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=2, bases="GGG",
        )
        stored = await store.require_candidate_sequence("s1", 0)
        assert stored == result.candidate_update.sequence

    @pytest.mark.asyncio
    async def test_insert_invalid_position(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="out of range"):
            await tool_insert_bases(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                position=10, bases="A",
            )

    @pytest.mark.asyncio
    async def test_insert_empty_bases(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="at least one valid base"):
            await tool_insert_bases(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                position=0, bases="",
            )

    @pytest.mark.asyncio
    async def test_insert_filters_non_bases(self, service, store):
        """Non-ATCG characters in bases string should be filtered out."""
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=2, bases="AxTzN",
        )
        # Only A and T should remain
        assert result.candidate_update.sequence == "ATATCG"

    @pytest.mark.asyncio
    async def test_insert_mutation_metadata(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_insert_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            position=2, bases="GGG",
        )
        mutation = result.candidate_update.mutation
        assert mutation["scope"] == "insert"
        assert mutation["position"] == 2
        assert mutation["inserted_bases"] == "GGG"
        assert mutation["inserted_length"] == 3


# ---------------------------------------------------------------------------
# Delete bases tool
# ---------------------------------------------------------------------------


class TestToolDeleteBases:
    """Tests for the delete_bases agent tool."""

    @pytest.mark.asyncio
    async def test_delete_range(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_delete_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            start=2, end=5,
        )
        assert result.call.status == "ok"
        assert result.candidate_update.sequence == "ATTCG"
        assert len(result.candidate_update.sequence) == len(seq) - 3

    @pytest.mark.asyncio
    async def test_delete_single_base(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_delete_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            start=0, end=1,
        )
        assert result.candidate_update.sequence == "TCGATCG"

    @pytest.mark.asyncio
    async def test_delete_updates_store(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_delete_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            start=0, end=4,
        )
        stored = await store.require_candidate_sequence("s1", 0)
        assert stored == result.candidate_update.sequence

    @pytest.mark.asyncio
    async def test_delete_invalid_range_start_ge_end(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="invalid range"):
            await tool_delete_bases(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                start=5, end=3,
            )

    @pytest.mark.asyncio
    async def test_delete_entire_sequence_fails(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="empty"):
            await tool_delete_bases(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                start=0, end=4,
            )

    @pytest.mark.asyncio
    async def test_delete_out_of_range(self, service, store):
        seq = "ATCG"
        await store.set_candidate_sequence("s1", 0, seq)
        with pytest.raises(ValueError, match="invalid range"):
            await tool_delete_bases(
                service=service, store=store,
                session_id="s1", candidate_id=0, sequence=seq,
                start=0, end=10,
            )

    @pytest.mark.asyncio
    async def test_delete_mutation_metadata(self, service, store):
        seq = "ATCGATCG"
        await store.set_candidate_sequence("s1", 0, seq)

        result = await tool_delete_bases(
            service=service, store=store,
            session_id="s1", candidate_id=0, sequence=seq,
            start=2, end=5,
        )
        mutation = result.candidate_update.mutation
        assert mutation["scope"] == "delete"
        assert mutation["start"] == 2
        assert mutation["end"] == 5
        assert mutation["deleted_bases"] == "CGA"
        assert mutation["deleted_length"] == 3


# ---------------------------------------------------------------------------
# Restriction sites tool
# ---------------------------------------------------------------------------


class TestToolRestrictionSites:
    """Tests for the restriction_sites agent tool."""

    @pytest.mark.asyncio
    async def test_restriction_sites_finds_ecori(self):
        seq = "ATCGGAATTCATCG"  # Contains EcoRI site (GAATTC)
        result = await tool_restriction_sites(
            candidate_id=0, sequence=seq,
        )
        assert result.call.status == "ok"
        assert "EcoRI" in result.note

    @pytest.mark.asyncio
    async def test_restriction_sites_no_sites(self):
        seq = "AAAAAAAAAAAAAAAA"  # No RE sites
        result = await tool_restriction_sites(
            candidate_id=0, sequence=seq,
        )
        assert result.call.status == "ok"
        assert "No restriction sites" in result.call.summary or "0" in result.note

    @pytest.mark.asyncio
    async def test_restriction_sites_specific_enzyme(self):
        seq = "ATCGGAATTCGGATCCATCG"  # EcoRI + BamHI
        result = await tool_restriction_sites(
            candidate_id=0, sequence=seq, enzymes=["EcoRI"],
        )
        assert result.call.status == "ok"
        assert "EcoRI" in result.note
        # BamHI should NOT be mentioned since we only asked for EcoRI
        assert "BamHI" not in result.note

    @pytest.mark.asyncio
    async def test_restriction_sites_multiple_enzymes(self):
        seq = "ATCGGAATTCGGATCCATCG"  # EcoRI + BamHI
        result = await tool_restriction_sites(
            candidate_id=0, sequence=seq, enzymes=["EcoRI", "BamHI"],
        )
        assert result.call.status == "ok"
        assert "EcoRI" in result.note
        assert "BamHI" in result.note

    @pytest.mark.asyncio
    async def test_restriction_sites_invalid_enzyme(self):
        seq = "ATCGATCG"
        with pytest.raises(ValueError, match="No recognized enzymes"):
            await tool_restriction_sites(
                candidate_id=0, sequence=seq, enzymes=["FakeEnzyme"],
            )

    @pytest.mark.asyncio
    async def test_restriction_sites_no_candidate_update(self):
        """Restriction sites is a read-only analysis — no sequence mutation."""
        seq = "ATCGGAATTCATCG"
        result = await tool_restriction_sites(candidate_id=0, sequence=seq)
        assert result.candidate_update is None

    @pytest.mark.asyncio
    async def test_restriction_sites_multiple_occurrences(self):
        """Multiple EcoRI sites in one sequence."""
        seq = "GAATTCAAAGAATTC"
        result = await tool_restriction_sites(candidate_id=0, sequence=seq)
        assert "EcoRI" in result.note


# ---------------------------------------------------------------------------
# Deterministic planner routing
# ---------------------------------------------------------------------------


class TestPlannerRouting:
    """Verify deterministic planner correctly routes to new tools."""

    def test_codon_optimize_route(self):
        plan = deterministic_plan("optimize codons for e. coli")
        tools = [a["tool"] for a in plan]
        assert "codon_optimize" in tools

    def test_codon_optimize_yeast(self):
        plan = deterministic_plan("codon optimize for yeast")
        tools = [a["tool"] for a in plan]
        assert "codon_optimize" in tools
        codon_action = next(a for a in plan if a["tool"] == "codon_optimize")
        assert codon_action["args"]["organism"] == "yeast"

    def test_offtarget_route(self):
        plan = deterministic_plan("scan for off-target risks")
        tools = [a["tool"] for a in plan]
        assert "offtarget_scan" in tools

    def test_restriction_site_route(self):
        plan = deterministic_plan("find restriction enzyme sites")
        tools = [a["tool"] for a in plan]
        assert "restriction_sites" in tools

    def test_ecori_keyword_routes(self):
        plan = deterministic_plan("does this have an ecori site?")
        tools = [a["tool"] for a in plan]
        assert "restriction_sites" in tools

    def test_offtarget_does_not_shadow_optimize(self):
        """'off-target' used to trigger optimize_candidate for safety.
        Now it should route to offtarget_scan instead (unless 'safer' is present)."""
        plan = deterministic_plan("check off-target risk")
        tools = [a["tool"] for a in plan]
        assert "offtarget_scan" in tools

    def test_safer_still_routes_to_optimize(self):
        """'safer' should still trigger optimize_candidate with safety objective."""
        plan = deterministic_plan("make this safer")
        tools = [a["tool"] for a in plan]
        assert "optimize_candidate" in tools

    def test_combined_codon_and_explain(self):
        """Codon optimize + 'explain' in text should produce codon_optimize action.
        The explain chaining is only automatic for edit/transform paths;
        the LLM planner handles multi-tool chaining for other tools.
        """
        plan = deterministic_plan("optimize codons for human expression")
        tools = [a["tool"] for a in plan]
        assert "codon_optimize" in tools
