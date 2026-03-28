from pydantic import BaseModel


class TissueSpec(BaseModel):
    high_expression: list[str] = []
    low_expression: list[str] = []


class DesignSpec(BaseModel):
    design_type: str
    target_gene: str | None = None
    organism: str | None = None
    tissue_specificity: TissueSpec | None = None
    therapeutic_context: str | None = None
    constraints: list[str] = []
