from src.reasoning.contracts import filter_evidence
from src.reasoning.modules import (
    body_evidence,
    change_shape,
    contract_stability,
    historical_risk,
    reach,
    verification_coverage,
)

MODULES = [
    change_shape,
    historical_risk,
    reach,
    verification_coverage,
    contract_stability,
    body_evidence,
]


def run_reasoning(fused_evidence):
    outputs = []
    for module in MODULES:
        filtered = filter_evidence(fused_evidence, module.CONSUMES)
        outputs.append(module.reason(filtered))
    return outputs
