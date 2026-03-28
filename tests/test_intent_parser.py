import pytest
from backend.models.domain import TissueSpec, DesignSpec


class TestTissueSpec:
    def test_default_empty_lists(self):
        spec = TissueSpec()
        assert spec.high_expression == []
        assert spec.low_expression == []

    def test_with_values(self):
        spec = TissueSpec(
            high_expression=["hippocampal_neurons"],
            low_expression=["cardiac_tissue"],
        )
        assert spec.high_expression == ["hippocampal_neurons"]
        assert spec.low_expression == ["cardiac_tissue"]


class TestDesignSpec:
    def test_minimal_spec(self):
        spec = DesignSpec(design_type="regulatory_element")
        assert spec.design_type == "regulatory_element"
        assert spec.target_gene is None
        assert spec.organism is None
        assert spec.tissue_specificity is None
        assert spec.therapeutic_context is None
        assert spec.constraints == []

    def test_full_spec(self):
        spec = DesignSpec(
            design_type="regulatory_element",
            target_gene="BDNF",
            organism="human",
            tissue_specificity=TissueSpec(
                high_expression=["hippocampal_neurons"],
                low_expression=["cardiac_tissue"],
            ),
            therapeutic_context="Alzheimer's disease",
            constraints=["novel_sequence", "no_known_pathogenic_variants"],
        )
        assert spec.target_gene == "BDNF"
        assert spec.organism == "human"
        assert spec.tissue_specificity.high_expression == ["hippocampal_neurons"]
        assert spec.therapeutic_context == "Alzheimer's disease"
        assert len(spec.constraints) == 2

    def test_design_type_required(self):
        with pytest.raises(Exception):
            DesignSpec()

    def test_json_schema_generation(self):
        schema = DesignSpec.model_json_schema()
        assert "properties" in schema
        assert "design_type" in schema["properties"]
