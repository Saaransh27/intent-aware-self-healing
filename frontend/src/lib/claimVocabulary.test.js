import { describe, expect, it } from "vitest";
import { isRiskBearingClaim } from "./claimVocabulary";

// Milestone 5: grounded in a real finding, not a hunch — running the
// pre-fix definition (whole `reach` module risk-bearing) against 8 real,
// diverse PRs (pallets/flask, pallets/click, fastapi/fastapi) tiered 34
// of 39 real files "Requires Immediate Review", including the single
// file in a one-line documentation typo fix. These cases are the exact
// claim shapes that caused it.

function claim(module, claimId) {
  return { claim: claimId, scope: { level: "file", file_path: "x", qualified_name: null }, confidence: "observed", basis: [], module };
}

describe("isRiskBearingClaim", () => {
  it("does not treat reach.large_neighborhood as risk-bearing (a structural fact true of most files)", () => {
    expect(isRiskBearingClaim(claim("reach", "reach.large_neighborhood"))).toBe(false);
  });

  it("does not treat reach.corroborated_wide_reach as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("reach", "reach.corroborated_wide_reach"))).toBe(false);
  });

  it("does not treat reach.high_historical_coupling as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("reach", "reach.high_historical_coupling"))).toBe(false);
  });

  it("does treat reach.expected_co_change_partner_missing as risk-bearing (the one genuinely surprising reach signal)", () => {
    expect(isRiskBearingClaim(claim("reach", "reach.expected_co_change_partner_missing"))).toBe(true);
  });

  it("still treats the whole contract_stability module as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("contract_stability", "contract.public_signature_changed"))).toBe(true);
  });

  it("still treats history.hot_file and history.first_author_touch as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("historical_risk", "history.hot_file"))).toBe(true);
    expect(isRiskBearingClaim(claim("historical_risk", "history.first_author_touch"))).toBe(true);
  });

  it("treats history.high_recent_churn as risk-bearing (5+ changes in 30 days is a real signal worth surfacing)", () => {
    expect(isRiskBearingClaim(claim("historical_risk", "history.high_recent_churn"))).toBe(true);
  });

  it("does not treat an ordinary history claim like history.rapid_iteration as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("historical_risk", "history.rapid_iteration"))).toBe(false);
  });

  it("still treats verification.public_change_without_tests as risk-bearing", () => {
    expect(isRiskBearingClaim(claim("verification_coverage", "verification.public_change_without_tests"))).toBe(true);
  });
});
