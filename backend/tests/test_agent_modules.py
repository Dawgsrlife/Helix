"""Unit tests for the modular agent system.

Tests parsing, planner deterministic path, memory persistence,
tool dispatch, and state management with real genomic inputs
and exact expected outputs.
"""

import asyncio
import pytest

from services.agent.parsing import (
    apply_transform,
    band,
    extract_json_object,
    normalize_action,
    objective_from_prompt,
    parse_base_replacement,
    parse_explicit_edit,
    parse_transform_mode,
)
from services.agent.planner import deterministic_plan, is_default_explain_plan
from services.agent.memory import AgentMemory, derive_repeat_action, derive_undo_action
from services.agent.state import (
    AgentCandidateUpdate,
    AgentToolCall,
    ToolExecution,
    merge_candidate_updates,
    trim_history,
)
from services.session_store import MemorySessionStore

# Real genomic sequences for testing
# Human BRCA1 exon 2 fragment (30 bp)
BRCA1_FRAGMENT = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
# E. coli lacZ promoter region (40 bp)
LACZ_PROMOTER = "TTTACACTTTATGCTTCCGGCTCGTATGTTGTGTGGAA"
# GFP coding region fragment (24 bp)
GFP_FRAGMENT = "ATGGTGAGCAAGGGCGAGGAGCTG"


# -------------------------------------------------------------------------
# Parsing — real researcher messages
# -------------------------------------------------------------------------


class TestParseExplicitEdit:
    def test_researcher_mutates_start_codon(self):
        """Researcher wants to mutate the start codon ATG -> GTG (common alternative)."""
        result = parse_explicit_edit("change position 0 to G")
        assert result == (0, "G")

    def test_researcher_edits_splice_site(self):
        """Researcher editing a splice donor site position."""
        result = parse_explicit_edit("mutate base 23 to C")
        assert result == (23, "C")

    def test_researcher_uses_pos_shorthand(self):
        result = parse_explicit_edit("pos 142 to A")
        assert result == (142, "A")

    def test_genomic_context_no_match(self):
        """Messages about genes shouldn't trigger base edits."""
        assert parse_explicit_edit("explain the BRCA1 binding domain") is None
        assert parse_explicit_edit("what is the GC content") is None
        assert parse_explicit_edit("compare all candidates") is None

    def test_case_insensitive_real_base(self):
        result = parse_explicit_edit("Position 15 To c")
        assert result == (15, "C")


class TestParseTransformMode:
    def test_reverse_complement_request(self):
        assert parse_transform_mode("take the reverse complement") == "reverse_complement"

    def test_poly_t_tail(self):
        """Researchers sometimes want poly-T for terminator testing."""
        assert parse_transform_mode("make it all ts") == "all_t"

    def test_poly_a_tail(self):
        """Poly-A tails are biologically meaningful (mRNA stability)."""
        assert parse_transform_mode("convert to all adenine") == "all_a"

    def test_poly_c(self):
        assert parse_transform_mode("make all cs") == "all_c"

    def test_poly_g(self):
        assert parse_transform_mode("convert to all guanine") == "all_g"

    def test_analysis_request_no_match(self):
        assert parse_transform_mode("explain the candidate scores") is None


class TestParseBaseReplacement:
    def test_gc_to_at_shift(self):
        """Lowering GC content by replacing G->A (common in codon optimization)."""
        result = parse_base_replacement("change all gs to as")
        assert result == ("G", "A")

    def test_at_to_gc_shift(self):
        """Increasing GC content for thermostability."""
        result = parse_base_replacement("replace all a's with c's")
        assert result == ("A", "C")

    def test_same_base_returns_none(self):
        assert parse_base_replacement("change all gs to gs") is None

    def test_functional_request_no_match(self):
        assert parse_base_replacement("improve the functional score") is None


class TestApplyTransform:
    def test_poly_t_from_brca1(self):
        result = apply_transform(BRCA1_FRAGMENT, "all_t")
        assert result == "T" * 30
        assert len(result) == len(BRCA1_FRAGMENT)

    def test_reverse_complement_brca1(self):
        """ATGGAT... → reverse complement. Verify against known biology."""
        result = apply_transform(BRCA1_FRAGMENT, "reverse_complement")
        # BRCA1_FRAGMENT = "ATGGATTTATCTGCTCTTCGCGTTGAAGAA"
        # Reversed: "AAGAAGTTTGCGCTTCTCGTCTATTTTAGGTA" — wait, let's compute properly.
        # Reverse: "AAGAAGTTTGCGCTTCTCGTCTATTTTAGGTA" — no, complement then reverse.
        # Complement of ATGGATTTATCTGCTCTTCGCGTTGAAGAA:
        # A->T, T->A, G->C, G->C, A->T, T->A, T->A, T->A, A->T, T->A, C->G, T->A, G->C, C->G, T->A, C->G, T->A, T->A, C->G, G->C, C->G, G->C, T->A, T->A, G->C, A->T, A->T, G->C, A->T, A->T
        # Complement: TACCTAAATAGACGAGAAGCGCAACTTCTT
        # Reversed:   TTCTTCAACGCGAAGAGCAGATAAATCCAT
        assert result == "TTCTTCAACGCGAAGAGCAGATAAATCCAT"
        assert len(result) == 30

    def test_replace_g_with_c_in_gfp(self):
        result = apply_transform(GFP_FRAGMENT, "replace_base", from_base="G", to_base="C")
        # GFP_FRAGMENT = "ATGGTGAGCAAGGGCGAGGAGCTG"
        # Replace G->C: "ATCCTCACCAACCCCCACCACCTC"
        expected = GFP_FRAGMENT.replace("G", "C")
        assert result == expected
        assert "G" not in result  # All G's should be gone

    def test_unknown_mode_preserves_sequence(self):
        result = apply_transform(BRCA1_FRAGMENT, "unknown_mode")
        assert result == BRCA1_FRAGMENT


class TestExtractJsonObject:
    def test_agent_plan_json(self):
        raw = '{"actions": [{"tool": "edit_base", "args": {"position": 5, "new_base": "G"}}]}'
        result = extract_json_object(raw)
        assert result == {"actions": [{"tool": "edit_base", "args": {"position": 5, "new_base": "G"}}]}

    def test_fenced_json_from_llm(self):
        raw = '```json\n{"actions": [{"tool": "explain_candidate", "args": {}}]}\n```'
        result = extract_json_object(raw)
        assert result == {"actions": [{"tool": "explain_candidate", "args": {}}]}

    def test_json_embedded_in_llm_prose(self):
        raw = 'Sure! Here is the plan: {"actions": [{"tool": "optimize_candidate", "args": {"objective": "safety"}}]} Let me know if you need changes.'
        result = extract_json_object(raw)
        assert result["actions"][0]["tool"] == "optimize_candidate"
        assert result["actions"][0]["args"]["objective"] == "safety"

    def test_invalid_returns_empty_dict(self):
        assert extract_json_object("The BRCA1 gene encodes a tumor suppressor.") == {}

    def test_nested_json(self):
        raw = '{"actions": [{"tool": "transform_sequence", "args": {"mode": "replace_base", "from_base": "G", "to_base": "C"}}]}'
        result = extract_json_object(raw)
        assert result["actions"][0]["args"]["mode"] == "replace_base"
        assert result["actions"][0]["args"]["from_base"] == "G"
        assert result["actions"][0]["args"]["to_base"] == "C"


class TestNormalizeAction:
    def test_valid_edit_base(self):
        result = normalize_action({"tool": "edit_base", "args": {"position": 5, "new_base": "G"}})
        assert result == {"tool": "edit_base", "args": {"position": 5, "new_base": "G"}}

    def test_valid_optimize(self):
        result = normalize_action({"tool": "optimize_candidate", "args": {"objective": "safety"}})
        assert result == {"tool": "optimize_candidate", "args": {"objective": "safety"}}

    def test_unknown_tool_rejected(self):
        assert normalize_action({"tool": "delete_genome", "args": {}}) is None

    def test_non_dict_rejected(self):
        assert normalize_action("edit_base") is None

    def test_missing_args_gets_empty_dict(self):
        result = normalize_action({"tool": "explain_candidate"})
        assert result == {"tool": "explain_candidate", "args": {}}


class TestObjectiveFromPrompt:
    def test_safety_from_off_target(self):
        assert objective_from_prompt("reduce the off-target risk") == "safety"

    def test_safety_from_safer(self):
        assert objective_from_prompt("make this candidate safer for clinical use") == "safety"

    def test_functional_from_plausibility(self):
        assert objective_from_prompt("improve functional plausibility") == "functional"

    def test_novelty(self):
        assert objective_from_prompt("increase the novelty score") == "novelty"

    def test_default_tissue_specificity(self):
        assert objective_from_prompt("optimize this for brain expression") == "tissue_specificity"


class TestBand:
    def test_exact_boundaries(self):
        assert band(0.75) == "strong"
        assert band(0.74) == "promising"
        assert band(0.55) == "promising"
        assert band(0.54) == "mixed"
        assert band(0.40) == "mixed"
        assert band(0.39) == "weak"

    def test_extremes(self):
        assert band(1.0) == "strong"
        assert band(0.0) == "weak"

    def test_typical_scores(self):
        assert band(0.85) == "strong"
        assert band(0.62) == "promising"
        assert band(0.45) == "mixed"
        assert band(0.20) == "weak"


# -------------------------------------------------------------------------
# Planner — real researcher commands
# -------------------------------------------------------------------------


class TestDeterministicPlan:
    def test_researcher_edits_position_5_to_g(self):
        plan = deterministic_plan("change position 5 to G")
        assert len(plan) == 1
        assert plan[0] == {"tool": "edit_base", "args": {"position": 5, "new_base": "G"}}

    def test_researcher_edits_with_explain(self):
        """Edit + explain should produce two actions."""
        plan = deterministic_plan("change position 10 to C and explain the impact")
        assert len(plan) == 2
        assert plan[0] == {"tool": "edit_base", "args": {"position": 10, "new_base": "C"}}
        assert plan[1] == {"tool": "explain_candidate", "args": {}}

    def test_poly_t_transform(self):
        plan = deterministic_plan("make it all Ts")
        assert len(plan) == 1
        assert plan[0] == {"tool": "transform_sequence", "args": {"mode": "all_t"}}

    def test_reverse_complement_transform(self):
        plan = deterministic_plan("take the reverse complement")
        assert len(plan) == 1
        assert plan[0] == {"tool": "transform_sequence", "args": {"mode": "reverse_complement"}}

    def test_compare_candidates(self):
        plan = deterministic_plan("compare all candidates and show the best one")
        assert any(a["tool"] == "compare_candidates" for a in plan)

    def test_optimize_for_safety(self):
        plan = deterministic_plan("make this candidate safer")
        tools = [a["tool"] for a in plan]
        assert "optimize_candidate" in tools
        opt_action = next(a for a in plan if a["tool"] == "optimize_candidate")
        assert opt_action["args"]["objective"] == "safety"

    def test_optimize_for_functional(self):
        plan = deterministic_plan("improve the functional score")
        opt_action = next(a for a in plan if a["tool"] == "optimize_candidate")
        assert opt_action["args"]["objective"] == "functional"

    def test_ambiguous_defaults_to_explain(self):
        plan = deterministic_plan("what does this sequence do?")
        assert is_default_explain_plan(plan)

    def test_undo_restores_previous_sequence(self):
        memory = [
            {"candidate_updates": [{"sequence": BRCA1_FRAGMENT, "scores": {}, "mutation": None}]},
            {"candidate_updates": [{"sequence": GFP_FRAGMENT, "scores": {}, "mutation": None}]},
        ]
        plan = deterministic_plan("undo that", memory_entries=memory)
        assert plan[0]["tool"] == "restore_sequence"
        assert plan[0]["args"]["sequence"] == BRCA1_FRAGMENT

    def test_undo_no_memory_falls_to_explain(self):
        plan = deterministic_plan("undo that", memory_entries=[])
        assert is_default_explain_plan(plan)

    def test_replace_all_gs_to_cs(self):
        plan = deterministic_plan("change all Gs to Cs")
        assert plan[0] == {
            "tool": "transform_sequence",
            "args": {"mode": "replace_base", "from_base": "G", "to_base": "C"},
        }

    def test_replace_all_as_to_ts(self):
        plan = deterministic_plan("replace all A's with T's")
        assert plan[0] == {
            "tool": "transform_sequence",
            "args": {"mode": "replace_base", "from_base": "A", "to_base": "T"},
        }


class TestIsDefaultExplainPlan:
    def test_single_explain_is_default(self):
        assert is_default_explain_plan([{"tool": "explain_candidate", "args": {}}]) is True

    def test_edit_is_not_default(self):
        assert is_default_explain_plan([{"tool": "edit_base", "args": {"position": 0, "new_base": "G"}}]) is False

    def test_multiple_actions_not_default(self):
        assert is_default_explain_plan([
            {"tool": "explain_candidate", "args": {}},
            {"tool": "compare_candidates", "args": {}},
        ]) is False

    def test_empty_list_not_default(self):
        assert is_default_explain_plan([]) is False


# -------------------------------------------------------------------------
# Memory — persistence with real genomic data
# -------------------------------------------------------------------------


class TestDeriveUndoAction:
    def test_restores_brca1_after_gfp_edit(self):
        entries = [
            {"candidate_updates": [{"sequence": BRCA1_FRAGMENT}]},
            {"candidate_updates": [{"sequence": GFP_FRAGMENT}]},
        ]
        action = derive_undo_action(entries)
        assert action == {"tool": "restore_sequence", "args": {"sequence": BRCA1_FRAGMENT}}

    def test_no_memory_returns_none(self):
        assert derive_undo_action([]) is None

    def test_single_entry_no_undo_available(self):
        entries = [{"candidate_updates": [{"sequence": BRCA1_FRAGMENT}]}]
        assert derive_undo_action(entries) is None


class TestDeriveRepeatAction:
    def test_repeats_last_point_mutation(self):
        entries = [
            {"candidate_updates": [{"mutation": {"position": 5, "new_base": "G"}}]},
        ]
        action = derive_repeat_action(entries)
        assert action == {"tool": "edit_base", "args": {"position": 5, "new_base": "G"}}

    def test_no_mutations_returns_none(self):
        entries = [{"candidate_updates": [{"mutation": None}]}]
        assert derive_repeat_action(entries) is None

    def test_repeats_most_recent_mutation(self):
        entries = [
            {"candidate_updates": [{"mutation": {"position": 3, "new_base": "A"}}]},
            {"candidate_updates": [{"mutation": {"position": 10, "new_base": "T"}}]},
        ]
        action = derive_repeat_action(entries)
        assert action == {"tool": "edit_base", "args": {"position": 10, "new_base": "T"}}


@pytest.mark.asyncio
class TestAgentMemory:
    async def test_remember_and_retrieve_real_turn(self):
        store = MemorySessionStore(default_seed=BRCA1_FRAGMENT)
        memory = AgentMemory(store)

        await memory.remember_turn(
            session_id="session-brca1",
            candidate_id=0,
            user_message="change position 5 to G",
            candidate_update=AgentCandidateUpdate(
                candidate_id=0,
                sequence=BRCA1_FRAGMENT[:5] + "G" + BRCA1_FRAGMENT[6:],
                scores={"functional": 0.72, "combined": 0.65},
                mutation={"position": 5, "new_base": "G"},
            ),
            tool_calls=[{"tool": "edit_base", "status": "ok", "summary": "Mutated position 5 to G."}],
            assistant_message="Mutated position 5 from T to G. Combined score: 0.65.",
        )

        entries = await memory.snapshot("session-brca1", 0)
        assert len(entries) == 1
        assert entries[0]["user_message"] == "change position 5 to G"
        assert entries[0]["tool_calls"][0]["tool"] == "edit_base"
        assert entries[0]["tool_calls"][0]["status"] == "ok"
        assert entries[0]["candidate_updates"][0]["mutation"]["position"] == 5
        assert entries[0]["candidate_updates"][0]["mutation"]["new_base"] == "G"

    async def test_clear_session_removes_all_turns(self):
        store = MemorySessionStore(default_seed=BRCA1_FRAGMENT)
        memory = AgentMemory(store)

        await memory.remember_turn(
            session_id="session-clear",
            candidate_id=0,
            user_message="explain this",
            candidate_update=None,
            tool_calls=[{"tool": "explain_candidate", "status": "ok", "summary": "done"}],
            assistant_message="The candidate shows strong functional plausibility.",
        )
        await memory.clear_session("session-clear")
        entries = await memory.snapshot("session-clear", 0)
        assert entries == []

    async def test_memory_persists_across_instances(self):
        store = MemorySessionStore(default_seed=GFP_FRAGMENT)
        memory1 = AgentMemory(store)

        await memory1.remember_turn(
            session_id="persist-test",
            candidate_id=0,
            user_message="optimize for safety",
            candidate_update=None,
            tool_calls=[{"tool": "optimize_candidate", "status": "ok", "summary": "Optimized."}],
            assistant_message="Optimized for safety.",
        )

        memory2 = AgentMemory(store)
        entries = await memory2.snapshot("persist-test", 0)
        assert len(entries) == 1
        assert entries[0]["user_message"] == "optimize for safety"
        assert entries[0]["tool_calls"][0]["tool"] == "optimize_candidate"

    async def test_multiple_turns_ordered(self):
        store = MemorySessionStore(default_seed=BRCA1_FRAGMENT)
        memory = AgentMemory(store)

        for i, msg in enumerate(["explain", "change position 3 to A", "undo that"]):
            await memory.remember_turn(
                session_id="multi",
                candidate_id=0,
                user_message=msg,
                candidate_update=None,
                tool_calls=[],
                assistant_message=f"response {i}",
            )

        entries = await memory.snapshot("multi", 0)
        assert len(entries) == 3
        assert entries[0]["user_message"] == "explain"
        assert entries[1]["user_message"] == "change position 3 to A"
        assert entries[2]["user_message"] == "undo that"


# -------------------------------------------------------------------------
# State — merge and trim with real data
# -------------------------------------------------------------------------


class TestTrimHistory:
    def test_short_history_unchanged(self):
        history = [
            {"role": "user", "content": "explain the BRCA1 candidate"},
            {"role": "assistant", "content": "The candidate shows high functional plausibility."},
        ]
        assert trim_history(history) == history

    def test_trims_to_64_keeping_most_recent(self):
        history = [{"role": "user", "content": f"turn {i}"} for i in range(100)]
        trimmed = trim_history(history)
        assert len(trimmed) == 64
        # Should keep the 64 most recent messages (indices 36-99)
        assert trimmed[0]["content"] == "turn 36"
        assert trimmed[-1]["content"] == "turn 99"


class TestMergeCandidateUpdates:
    def test_none_previous_returns_current(self):
        current = AgentCandidateUpdate(
            candidate_id=0,
            sequence=BRCA1_FRAGMENT,
            scores={"functional": 0.82, "combined": 0.71},
        )
        result = merge_candidate_updates(None, current)
        assert result is current
        assert result.sequence == BRCA1_FRAGMENT
        assert result.scores["functional"] == 0.82

    def test_preserves_previous_mutation_when_current_has_none(self):
        previous = AgentCandidateUpdate(
            candidate_id=0,
            sequence=BRCA1_FRAGMENT,
            scores={"functional": 0.72},
            mutation={"position": 5, "new_base": "G"},
        )
        current = AgentCandidateUpdate(
            candidate_id=0,
            sequence=BRCA1_FRAGMENT,
            scores={"functional": 0.72, "combined": 0.65},
        )
        result = merge_candidate_updates(previous, current)
        assert result.mutation == {"position": 5, "new_base": "G"}
        assert result.scores["combined"] == 0.65

    def test_current_mutation_wins_over_previous(self):
        previous = AgentCandidateUpdate(
            candidate_id=0,
            sequence=BRCA1_FRAGMENT,
            scores={"functional": 0.72},
            mutation={"position": 5, "new_base": "G"},
        )
        # Second edit at position 10
        mutated = BRCA1_FRAGMENT[:10] + "A" + BRCA1_FRAGMENT[11:]
        current = AgentCandidateUpdate(
            candidate_id=0,
            sequence=mutated,
            scores={"functional": 0.68},
            mutation={"position": 10, "new_base": "A"},
        )
        result = merge_candidate_updates(previous, current)
        assert result.mutation == {"position": 10, "new_base": "A"}
        assert result.sequence == mutated
