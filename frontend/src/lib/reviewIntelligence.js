// Milestone 7 (Review Intelligence): turns the model's own real prose
// (review.sections) plus the real deterministic review_context/observations
// into the structured presentation this product's differentiation depends
// on -- verdict, per-finding severity/confidence/category/evidence, intent
// vs. implementation, behavioral-change detection, and blind spots.
//
// No backend change was needed for any of this except one additive field
// (PullRequestSummary.head_sha, for stale-review detection -- see
// prCache.js). Nothing here invents a fact the model or the deterministic
// layer didn't already produce.
//
// A hard limitation, discovered directly against real data (see
// docs/MILESTONE_7_REVIEW_INTELLIGENCE.md): src/semantic/python/ only
// parses Python, so a commit touching only JS/config/docs files gets ZERO
// claims from the deterministic reasoning layer (confirmed empty
// file_claims against two real captured PR responses). For those commits,
// severity/confidence/category below are derived entirely from the
// model's own real generated language, using the same real four-term
// uncertainty vocabulary already frozen into SYSTEM_PROMPT (Confirmed /
// Likely / Worth checking / Unknown -- src/prompt/prompt_builder.py) as
// the primary signal, with a disclosed hedge-language fallback for the
// (already-documented, pre-existing) cases where the model doesn't use
// that vocabulary literally. This is a heuristic over real text, not a
// certainty -- documented as such, not papered over.
import { parseTitledListItems, extractFilenames, groupByFile } from "./textFormatting";
import { isRiskBearingClaim } from "./claimVocabulary";

export const SAFE_TO_REVIEW = "SAFE TO REVIEW";
export const REVIEWER_ATTENTION = "REVIEWER ATTENTION";
export const HIGH_RISK = "HIGH RISK";

export const CONFIRMED = "Confirmed";
export const STRONG_EVIDENCE = "Strong evidence";
export const NEEDS_VERIFICATION = "Needs verification";

export const SEVERITY_CRITICAL = "Critical";
export const SEVERITY_HIGH = "High";
export const SEVERITY_MEDIUM = "Medium";
export const SEVERITY_LOW = "Low";

export const CATEGORY_BUG = "Bug";
export const CATEGORY_BEHAVIORAL_REGRESSION = "Behavioral regression";
export const CATEGORY_TEST_FAILURE = "Test failure";
export const CATEGORY_MISSING_TEST_COVERAGE = "Missing test coverage";
export const CATEGORY_SECURITY = "Security";
export const CATEGORY_API_CONTRACT = "API/contract mismatch";
export const CATEGORY_DEPENDENCY = "Dependency/compatibility";
export const CATEGORY_DATA_CORRECTNESS = "Data correctness";
export const CATEGORY_LOGIC_INCONSISTENCY = "Logic inconsistency";
export const CATEGORY_CONFIGURATION = "Configuration";
export const CATEGORY_MAINTAINABILITY = "Maintainability";
export const CATEGORY_OTHER = "Other";

// --- Confidence: the model's own real uncertainty vocabulary, first ------
//
// SYSTEM_PROMPT requires exactly these four terms for the model's own
// conclusions. Already documented elsewhere in this project (Milestone 32)
// as used non-literally in practice, so this is the primary signal, not
// the only one.
const VOCAB_CONFIDENCE = [
  { pattern: /\bconfirmed\b/i, confidence: CONFIRMED },
  { pattern: /\blikely\b/i, confidence: STRONG_EVIDENCE },
  { pattern: /\bworth checking\b/i, confidence: NEEDS_VERIFICATION },
  { pattern: /\bunknown\b/i, confidence: NEEDS_VERIFICATION },
];

// Fallback when the model doesn't use its own vocabulary literally --
// imperative/hedged phrasing that asks the reviewer to go verify
// something, rather than asserting it as already-established fact.
const HEDGE_PATTERNS = [
  /\bconfirm (that|the|whether)\b/i,
  /\bverify (that|the|whether)\b/i,
  /\bensure (that|the)\b/i,
  /\bcheck (that|whether|if)\b/i,
  /\bmay\b/i,
  /\bcould\b/i,
  /\bmight\b/i,
  /\bpotentially\b/i,
  /\bshould be verified\b/i,
];

// Never auto-classify as Confirmed by default -- Part 6's core rule.
// Absent an explicit vocabulary hit, the conservative floor is "Needs
// verification," same as an explicit hedge.
export function classifyConfidence(text) {
  for (const { pattern, confidence } of VOCAB_CONFIDENCE) {
    if (pattern.test(text)) return confidence;
  }
  for (const pattern of HEDGE_PATTERNS) {
    if (pattern.test(text)) return NEEDS_VERIFICATION;
  }
  return NEEDS_VERIFICATION;
}

// --- Severity --------------------------------------------------------------

const NO_IMPACT_PATTERNS = [
  /\bno functional impact\b/i,
  /\bno impact\b/i,
  /\bcosmetic\b/i,
  /\bno behaviou?r(al)? change\b/i,
  /\bsyntactically correct\b/i,
];

const HIGH_SEVERITY_PATTERNS = [
  /\bdowngrade[ds]?\b/i,
  /\bsilently\b/i,
  /\bwill fail\b/i,
  /\bcauses? .*to fail\b/i,
  /\bbreak(s|ing)?\b/i,
  /\bregression\b/i,
  /\bsecurity\b/i,
  /\bdata loss\b/i,
  /\bcrash(es)?\b/i,
  /\bmismatch\b/i,
  /\bmisspell(ed|ing)?\b/i,
  /\bnever (be )?(recognized|triggered|matched|called)\b/i,
];

const MEDIUM_SEVERITY_PATTERNS = [
  /\binconsistent\b/i,
  /\bconfusing\b/i,
  /\bunclear\b/i,
  /\bduplicate[ds]?\b/i,
  /\boutdated\b/i,
];

// Reuses the existing, already-disclosed file-risk-tier rule as a
// secondary signal (real deterministic data, when it exists) -- never the
// only signal, since it's silent (empty file_claims) for any non-Python
// commit, confirmed directly against real data from both test PRs.
function fileRiskBoost(mentionedFiles, reviewContext) {
  const fileClaims = reviewContext?.file_claims || {};
  return mentionedFiles.some((f) => (fileClaims[f] || []).some(isRiskBearingClaim));
}

export function classifySeverity(text, mentionedFiles, reviewContext) {
  if (NO_IMPACT_PATTERNS.some((p) => p.test(text))) return SEVERITY_LOW;

  const hasHighKeyword = HIGH_SEVERITY_PATTERNS.some((p) => p.test(text));
  const hasMediumKeyword = MEDIUM_SEVERITY_PATTERNS.some((p) => p.test(text));
  const hasFileRisk = fileRiskBoost(mentionedFiles, reviewContext);

  if (hasHighKeyword && hasFileRisk) return SEVERITY_CRITICAL;
  if (hasHighKeyword) return SEVERITY_HIGH;
  if (hasMediumKeyword || hasFileRisk) return SEVERITY_MEDIUM;
  return SEVERITY_LOW;
}

// --- Category ----------------------------------------------------------

const CATEGORY_RULES = [
  { category: CATEGORY_TEST_FAILURE, pattern: /\btest[s]?\b.*\bfail(s|ure)?\b|\bfail(s|ure)?\b.*\btest[s]?\b/i },
  { category: CATEGORY_MISSING_TEST_COVERAGE, pattern: /\bno (relevant )?test coverage\b|\bnot covered\b|\bno test[s]?\b|\buntested\b|\bno coverage\b/i },
  { category: CATEGORY_SECURITY, pattern: /\bsecurity\b|\bauth(entication|orization)?\b|\bsecret[s]?\b|\bcredential[s]?\b|\binjection\b/i },
  { category: CATEGORY_BEHAVIORAL_REGRESSION, pattern: /\border(ing|er)\b|\bprecedence\b|\bdefault\b|\bearly return\b|\bfallback\b|\bpriority\b/i },
  { category: CATEGORY_API_CONTRACT, pattern: /\bsignature\b|\bcontract\b|\bbreaking change\b|\bapi\b/i },
  { category: CATEGORY_DEPENDENCY, pattern: /\bversion\b|\bdependenc(y|ies)\b|\bcompatib(le|ility)\b|\bupgrade\b|\bbump(ed)?\b/i },
  { category: CATEGORY_DATA_CORRECTNESS, pattern: /\bdata\b|\bincorrect value\b/i },
  { category: CATEGORY_CONFIGURATION, pattern: /\bconfig(uration)?\b|\benvironment variable\b|\benv var\b/i },
  { category: CATEGORY_LOGIC_INCONSISTENCY, pattern: /\bmismatch\b|\binconsistent\b|\bdoes not match\b|\bdiffer(s|ent)?\b/i },
  { category: CATEGORY_MAINTAINABILITY, pattern: /\breadability\b|\brefactor\b/i },
];

export function classifyCategory(text, severity) {
  for (const { category, pattern } of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  if (severity === SEVERITY_HIGH || severity === SEVERITY_CRITICAL) return CATEGORY_BUG;
  return CATEGORY_OTHER;
}

// --- Behavioral change detection (Part 10) ------------------------------

const BEHAVIORAL_KEYWORDS = /\border(ing|er)\b|\bprecedence\b|\bdefault\b|\bearly return\b|\bfallback\b|\bexception handling\b|\bfiltering\b|\bauthorization\b|\bstate transition\b|\bfeature flag\b|\bcomparison\b|\bsorting\b|\bselection logic\b|\bapi response\b/i;

export function isBehavioralChange(text) {
  return BEHAVIORAL_KEYWORDS.test(text);
}

// Real, quoted code identifiers the model itself cited (backtick spans) --
// the closest thing to raw diff evidence available without the API
// exposing any raw diff/Evidence Unit text at all. Shared by
// buildBehavioralDetail and deriveIntentVsImplementation below.
const BACKTICK_SPAN_G = () => /`([^`\n]+)`/g;

// Strips one redundant, matching pair of enclosing quote characters --
// the model sometimes writes `` `"literal"` `` (backticks AND quotes
// together); the backticks already provide the "this is code" signal, so
// the inner quotes are display noise, not part of the real identifier.
// Never strips anything else -- a lone quote, or non-matching quotes, is
// left exactly as the model wrote it.
function stripRedundantQuotes(value) {
  const first = value[0];
  const last = value[value.length - 1];
  if (value.length >= 2 && (first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

function quotedIdentifiersIn(text) {
  const seen = new Set();
  const out = [];
  let match;
  const re = BACKTICK_SPAN_G();
  while ((match = re.exec(text)) !== null) {
    const value = stripRedundantQuotes(match[1]);
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

// "After" is only ever extracted when the model's own sentence is phrased
// with a real "now X" clause -- the captured text IS what the model wrote,
// never invented. "Before" likewise only comes from an explicit
// previously/"used to" clause. When neither shape is present, both are
// null and the caller shows the finding's own full description instead of
// forcing a fabricated split -- this project's standing no-fabrication
// rule applies here exactly as everywhere else.
const AFTER_PATTERNS = [/\bnow\s+(.+?)\.(?:\s|$)/i, /\bwill\s+(.+?)\.(?:\s|$)/i];
const BEFORE_PATTERNS = [/\bpreviously,?\s+(.+?)[,.]/i, /\bused to\s+(.+?)[,.]/i, /\bhad\s+(.+?),\s*(?:but|now)/i];

function extractAfter(text) {
  for (const pattern of AFTER_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractBefore(text) {
  for (const pattern of BEFORE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Impact is the real trailing sentence that actually states a consequence
// (contains a real consequence word) -- never a synthesized "this might
// matter because" sentence. Returns null, not a guess, when no sentence in
// the finding states one.
const IMPACT_KEYWORDS = /\b(could|would|may|might|downgrade[ds]?|caus(e|es|ing)|result(s|ing)?|break(s|ing)?|fail(s|ing)?|expose[ds]?|hide[ds]?|mask(s|ed|ing)?|silently)\b/i;

function extractImpact(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (IMPACT_KEYWORDS.test(sentences[i])) return sentences[i].trim();
  }
  return null;
}

// Part 10's full "Behavioral change detected" card: Before / After /
// Impact / Evidence / Tests. Before/After/Impact are only ever the
// model's own real clauses (or null, shown honestly as "not stated");
// Evidence is the same real quoted-identifier mechanism used throughout
// this module; Tests reuses the exact same "does this finding's own text
// mention a test, or was it already flagged as missing coverage"
// classification TestSignal.jsx applies at the page level, so the two
// never disagree.
export function buildBehavioralDetail(finding) {
  const text = `${finding.title} ${finding.body}`;
  const hasTestMention = /\btest\b/i.test(text) || finding.category === CATEGORY_TEST_FAILURE;
  const hasNoCoverageNote = finding.category === CATEGORY_MISSING_TEST_COVERAGE;

  return {
    before: extractBefore(text),
    after: extractAfter(text),
    impact: extractImpact(text),
    evidence: quotedIdentifiersIn(text),
    testsNote: hasNoCoverageNote
      ? "Missing test coverage identified for this change."
      : hasTestMention
        ? "Tests are mentioned in this finding — see Findings above for detail."
        : "No test coverage was found for this behavior.",
  };
}

// --- Finding assembly ----------------------------------------------------

// One finding, fully classified -- the "Finding -> Evidence -> Impact ->
// Suggested action" shape Part 20 asks for. `evidence` is the model's own
// real sentence(s), never a fabricated reasoning chain; `corroboratingCount`
// is the one piece of real deterministic backing, when it exists.
function buildFinding(row, index, reviewContext) {
  const text = `${row.title} ${row.body}`;
  const mentionedFiles = extractFilenames(row.body);
  const confidence = classifyConfidence(text);
  const severity = classifySeverity(text, mentionedFiles, reviewContext);
  const category = classifyCategory(text, severity);
  const corroboratingCount = mentionedFiles.reduce(
    (sum, name) => sum + (reviewContext?.file_claims?.[name]?.length || 0),
    0
  );
  const behavioral = isBehavioralChange(text);

  const finding = {
    index,
    title: row.title,
    body: row.body,
    severity,
    confidence,
    category,
    mentionedFiles,
    corroboratingCount,
    // Part 5: Evidence as a first-class field, not folded into the prose
    // body -- the model's own quoted code identifiers (real, never
    // invented) plus the real corroborating-claim count computed above.
    // Empty when the model quoted nothing and no real claims exist --
    // never backfilled with a placeholder.
    evidence: quotedIdentifiersIn(text),
    isBehavioralChange: behavioral,
    isInformational: severity === SEVERITY_LOW && NO_IMPACT_PATTERNS.some((p) => p.test(text)),
  };

  // Part 10: the full Before/After/Impact/Evidence/Tests breakdown, only
  // computed (and only ever shown) for findings the keyword detector
  // actually flagged as a behavioral change.
  finding.behavioralDetail = behavioral ? buildBehavioralDetail(finding) : null;

  return finding;
}

export function buildFindings(rawFindingsText, reviewContext) {
  const rows = parseTitledListItems(rawFindingsText);
  if (!rows) return [];
  return rows.map((row, index) => buildFinding(row, index, reviewContext));
}

// --- Verdict (Part 3) ----------------------------------------------------

const SEVERITY_RANK = { [SEVERITY_CRITICAL]: 3, [SEVERITY_HIGH]: 2, [SEVERITY_MEDIUM]: 1, [SEVERITY_LOW]: 0 };

// Conservative by design -- never "SAFE TO MERGE." A confirmed finding
// whose severity carries real behavioral/security/data/compatibility
// weight (Critical or High) is what promotes to HIGH RISK; any other
// confirmed or high-confidence issue is REVIEWER ATTENTION; anything else
// (informational-only or unresolved verification items) is SAFE TO REVIEW.
export function deriveVerdict(findings) {
  const actionable = findings.filter((f) => !f.isInformational);
  const confirmedCount = actionable.filter((f) => f.confidence === CONFIRMED).length;
  const strongEvidenceCount = actionable.filter((f) => f.confidence === STRONG_EVIDENCE).length;
  const needsVerificationCount = actionable.filter((f) => f.confidence === NEEDS_VERIFICATION).length;
  const informationalCount = findings.length - actionable.length;

  const hasHighRisk = actionable.some(
    (f) => f.confidence === CONFIRMED && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[SEVERITY_HIGH]
  );
  const hasReviewerAttention = actionable.some(
    (f) => f.confidence === CONFIRMED || f.confidence === STRONG_EVIDENCE
  );

  let level = SAFE_TO_REVIEW;
  if (hasHighRisk) level = HIGH_RISK;
  else if (hasReviewerAttention) level = REVIEWER_ATTENTION;

  return { level, confirmedCount, strongEvidenceCount, needsVerificationCount, informationalCount };
}

export const FILE_RISK_ROUTINE = "Routine";

// Part 13: attributes each finding's severity to the real file(s) it's
// actually about. A finding in what_deserves_attention_ranked frequently
// names symbols ("`highestTier` now checks...") rather than the file
// itself -- confirmed directly against both of this milestone's real
// captured PRs, where NOT ONE individual finding names a real file with
// its extension. what_changed_and_why, in contrast, is a real, per-file
// bulleted breakdown that DOES name each file explicitly (also confirmed
// directly). This cross-references the two: for each file, collect the
// real quoted identifiers from its own what-changed-and-why description,
// then attribute a finding to that file when the finding quotes at least
// one of the same identifiers. This is exactly what closes the real gap
// -- e.g. PR #3's tier-ordering finding quotes `highestTier`/
// `STANDARD_REVIEW`/`REQUIRES_IMMEDIATE_REVIEW`, and reviewTiers.js's own
// what-changed-and-why entry quotes the same three, so the finding
// correctly attributes to reviewTiers.js and nowhere else.
export function attributeFindingsToFiles(findings, changeText, changedFilePaths) {
  const { files: changeGroups } = groupByFile(changeText || "");
  const identifiersByPath = new Map();

  for (const group of changeGroups) {
    const matchingPath = changedFilePaths.find(
      (path) => path === group.name || path.endsWith("/" + group.name) || path.endsWith(group.name)
    );
    if (!matchingPath) continue;
    const ids = new Set();
    for (const groupText of group.texts) {
      quotedIdentifiersIn(groupText).forEach((id) => ids.add(id));
    }
    identifiersByPath.set(matchingPath, ids);
  }

  const severityByPath = new Map();
  for (const finding of findings) {
    for (const [path, ids] of identifiersByPath.entries()) {
      const overlaps = finding.evidence.some((id) => ids.has(id)) || finding.mentionedFiles.includes(path);
      if (!overlaps) continue;
      const current = severityByPath.get(path) || SEVERITY_LOW;
      if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current]) {
        severityByPath.set(path, finding.severity);
      }
    }
  }
  return severityByPath;
}

// Reconciles the two risk signals this product computes for a file, so
// File Overview and Findings never silently disagree about the same
// file. Before this fix, File Overview's Risk column only reflected real
// deterministic risk-bearing claims (reviewTiers.js's fileTier) -- silent
// (Standard Review at best) for any commit with zero such claims, which
// is exactly the case for both of this milestone's real evaluation PRs
// (neither touches Python, so semantic analysis produces no claims at
// all). Takes the higher of: the real risk-bearing-claim signal (when it
// exists) and the attributed finding severity above. "Routine" is
// preserved as a distinct, still-honest value -- only when the backend's
// own coverage ledger already collapsed this file AND nothing escalates it.
export function fileSeverity(filePath, severityByPath, isRiskBearingFile, isRoutineFile) {
  let maxSeverity = severityByPath.get(filePath) || SEVERITY_LOW;
  if (isRiskBearingFile && SEVERITY_RANK[SEVERITY_MEDIUM] > SEVERITY_RANK[maxSeverity]) {
    maxSeverity = SEVERITY_MEDIUM;
  }
  if (maxSeverity === SEVERITY_LOW && isRoutineFile && !isRiskBearingFile) {
    return FILE_RISK_ROUTINE;
  }
  return maxSeverity;
}

// --- Intent vs Implementation (Part 9) ----------------------------------

const MISMATCH_PATTERNS = [/\bmismatch\b/i, /\bdoes not match\b/i, /\bmisspell(ed|ing)?\b/i, /\binconsistent\b/i];

// claimedIntent: the real PR title/commit message (already-real data).
// implementationDetail: real quoted identifiers from the model's own
// findings text (real, model-generated, never invented here).
// consistency: MISMATCH only when a Confirmed-tier finding's text itself
// contains mismatch language -- never inferred from absence of evidence.
// A mismatch finding's text typically quotes BOTH conflicting identifiers
// in one sentence (e.g. "the set contains `X` while the test... refer to
// `Y`") -- naively dumping every identifier from that finding into one
// bucket (as an earlier version of this function did) meant "Test" never
// populated at all for exactly this real case, the one Part 9 is built
// around. This looks for the identifier that appears nearest a real
// occurrence of the word "test" in the same sentence and attributes it to
// the test; every other identifier from the same finding is the
// implementation side. Falls back to putting everything under
// Implementation, Test empty, only when the text never mentions "test" at
// all -- never guesses when there's no real anchor.
function splitTestVsImplementation(text, identifiers) {
  const testMatch = text.match(/\btest[s]?\b[^`]*?`([^`\n]+)`/i);
  if (!testMatch) return { implementation: identifiers, test: [] };

  const testValue = stripRedundantQuotes(testMatch[1]);
  const implementation = identifiers.filter((id) => id !== testValue);
  const test = identifiers.includes(testValue) ? [testValue] : [];
  return { implementation, test };
}

export function deriveIntentVsImplementation(claimedIntent, findings) {
  const implementationDetail = [];
  const testDetail = [];
  let mismatchFinding = null;

  for (const finding of findings) {
    const text = `${finding.title} ${finding.body}`;
    const identifiers = quotedIdentifiersIn(text);
    const isMismatch = finding.confidence === CONFIRMED && MISMATCH_PATTERNS.some((p) => p.test(text));

    if (isMismatch) {
      mismatchFinding = finding;
      const split = splitTestVsImplementation(text, identifiers);
      implementationDetail.push(...split.implementation);
      testDetail.push(...split.test);
    } else if (finding.category === CATEGORY_MISSING_TEST_COVERAGE || /\btest\b/i.test(text)) {
      testDetail.push(...identifiers);
    } else if (implementationDetail.length === 0) {
      implementationDetail.push(...identifiers);
    }
  }

  return {
    claimedIntent,
    implementationDetail: [...new Set(implementationDetail)],
    testDetail: [...new Set(testDetail)],
    consistency: mismatchFinding ? "MISMATCH" : "PASS",
    mismatchFinding,
  };
}

// --- Blind spots (Part 7) ------------------------------------------------

// Only findings that require reasoning beyond the changed lines
// themselves -- reuses isBehavioralChange plus the same mismatch check as
// intent-vs-implementation, since both are "a human skimming the diff
// would plausibly miss this." Legitimately empty when nothing qualifies.
export function deriveBlindSpots(findings) {
  return findings.filter(
    (f) => f.isBehavioralChange || MISMATCH_PATTERNS.some((p) => p.test(`${f.title} ${f.body}`))
  );
}
