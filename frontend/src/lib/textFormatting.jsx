// Text-processing helpers shared by the dashboard components. All of these
// operate on the REAL prose fields the backend returns (review.sections.*)
// — none of them invent content, they only reshape existing text for
// presentation. Rendering returns React nodes/elements directly (never
// HTML strings + dangerouslySetInnerHTML) so escaping is handled by React
// itself, the same way it is for any other text child.

// Splits text on **bold** and `code` spans and returns an array of plain
// strings and <strong>/<code> elements. Every plain-string piece is still
// just a normal React child, so it's escaped exactly like any other text.
export function renderInlineMarkdown(text) {
  if (!text) return null;
  const tokens = text.split(/(\*\*.+?\*\*|`[^`]+?`)/g);
  return tokens.map((token, index) => {
    if (/^\*\*.+\*\*$/.test(token)) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(token)) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    return token;
  });
}

// Renders the small, predictable markdown shape the model produces
// (paragraphs, bulleted/numbered lists, bold, inline code) as real React
// elements — paragraphs and list items, each running its text through
// renderInlineMarkdown.
export function renderMarkdownLite(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split("\n");
  const blocks = [];
  let currentList = null;
  let currentParagraph = [];
  let blockKey = 0;

  function flushParagraph() {
    if (currentParagraph.length) {
      const text = currentParagraph.join(" ").trim();
      blocks.push(<p key={blockKey++}>{renderInlineMarkdown(text)}</p>);
      currentParagraph = [];
    }
  }

  function flushList() {
    if (currentList) {
      const ListTag = currentList.tag;
      blocks.push(
        <ListTag key={blockKey++}>
          {currentList.items.map((item, i) => (
            <li key={i}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
      currentList = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch) {
      flushParagraph();
      if (!currentList || currentList.tag !== "ul") {
        flushList();
        currentList = { tag: "ul", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
    } else if (numberedMatch) {
      flushParagraph();
      if (!currentList || currentList.tag !== "ol") {
        flushList();
        currentList = { tag: "ol", items: [] };
      }
      currentList.items.push(numberedMatch[1]);
    } else {
      flushList();
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks;
}

// Splits the Verdict text into a lead conclusion sentence and a "why"
// remainder. The backend returns Verdict as a single field — this is a
// best-effort split on the first sentence boundary, not new backend data.
// Deliberately does NOT derive a category/severity label from this text.
export function splitVerdict(rawText) {
  const trimmed = (rawText || "").trim();
  const match = trimmed.match(/^(.*?[.!?])\s+(.*)$/s);
  if (!match) {
    return { conclusion: trimmed, why: "" };
  }
  return { conclusion: match[1].trim(), why: match[2].trim() };
}

// Splits a list-shaped section's raw text into {title, body} rows, where
// title is the model's own bold lead-in phrase and body is the rest of the
// sentence ("**Title** – explanation"). Returns null when no list structure
// is present, so the caller can fall back to plain markdown rendering.
export function parseTitledListItems(rawText) {
  const lines = (rawText || "").split("\n");
  const items = [];
  let sawAnyListLine = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^\d+\.\s+(.*)$/) || line.match(/^[-*]\s+(.*)$/);
    if (match) {
      sawAnyListLine = true;
      items.push(match[1]);
    }
  }

  if (!sawAnyListLine) return null;

  return items.map((item) => {
    const titleMatch = item.match(/^\*\*(.+?)\*\*\s*[–—-]?\s*(.*)$/);
    return {
      title: titleMatch ? titleMatch[1] : "",
      body: titleMatch ? titleMatch[2] : item,
    };
  });
}

// --- File-centric reorganization of what_changed_and_why ------------------
//
// The backend has no changed-files list or diff — only this prose. This
// reorganizes the SAME text around real filenames it already mentions,
// never new data. See FilesToReview.jsx for how the fallback is surfaced.

const FILE_TOKEN_RE = /\b[\w][\w./-]*\.(?:py|pyi|ipynb|js|jsx|mjs|cjs|ts|tsx|json|toml|ya?ml|lock|md|mdx|txt|cfg|ini|env|rs|go|java|kt|kts|rb|php|c|h|hpp|cc|cpp|cs|sh|bash|zsh|ps1|html?|css|scss|less|sql|xml|gradle|proto|graphql|vue|svelte|swift|scala|r|lua|dockerfile)\b/gi;

export function extractFilenames(text) {
  const matches = text.match(FILE_TOKEN_RE) || [];
  const seen = new Set();
  const files = [];
  for (const match of matches) {
    if (!seen.has(match)) {
      seen.add(match);
      files.push(match);
    }
  }
  return files;
}

export function splitIntoItems(rawText) {
  const lines = (rawText || "").split("\n");
  const items = [];
  let sawList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^[-*]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (match) {
      sawList = true;
      items.push(match[1]);
    }
  }

  return sawList ? items : [(rawText || "").trim()];
}

export function groupByFile(rawText) {
  const items = splitIntoItems(rawText);
  const fileOrder = [];
  const fileTexts = new Map();
  const leftover = [];

  for (const item of items) {
    const names = extractFilenames(item);
    if (names.length === 0) {
      leftover.push(item);
      continue;
    }
    for (const name of names) {
      if (!fileTexts.has(name)) {
        fileTexts.set(name, []);
        fileOrder.push(name);
      }
      const texts = fileTexts.get(name);
      if (!texts.includes(item)) {
        texts.push(item);
      }
    }
  }

  const files = fileOrder.map((name) => ({ name, texts: fileTexts.get(name) }));
  return { files, leftover };
}

// Classifies a set of already-detected filenames (from groupByFile) into a
// real, observable category — never a fabricated "impact score". Returns
// null when there are no files to classify, so the caller can hide the
// "Primary Impact Area" metric rather than guessing.
const DOC_EXTENSIONS = /\.(md|mdx|rst|txt)$/i;
const CONFIG_EXTENSIONS = /\.(toml|ya?ml|json|ini|cfg|lock|env)$/i;
const TEST_PATTERN = /(^|[\\/])tests?([\\/]|$)|test_|_test\.|\.test\./i;

function classifyFile(name) {
  if (TEST_PATTERN.test(name)) return "Tests";
  if (DOC_EXTENSIONS.test(name)) return "Documentation";
  if (CONFIG_EXTENSIONS.test(name)) return "Config";
  return "Code";
}

export function classifyPrimaryImpactArea(files) {
  if (!files || files.length === 0) return null;

  const counts = new Map();
  for (const file of files) {
    const category = classifyFile(file.name);
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  if (counts.size === 1) return [...counts.keys()][0];

  const total = files.length;
  const [topCategory, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return topCount / total > 0.6 ? topCategory : "Mixed";
}

// Reuses what_changed_and_why's OWN list items as the Executive Summary's
// "key bullets" when that text is already list-shaped — never invents
// bullets by chopping up a plain paragraph, since that would impose
// structure the model never actually asserted. Returns null when the text
// isn't list-shaped, so the caller shows the paragraph alone.
export function extractSummaryBullets(rawText, max = 5) {
  const rows = parseTitledListItems(rawText);
  if (!rows) return null;
  // Prefer the descriptive body over the bold lead-in: the model's own
  // lead-ins are frequently just a bare category word ("Documentation",
  // "Solver"), while the body is the actual self-contained sentence — the
  // one that reads like a real bullet, not a label.
  const bullets = rows.map((row) => row.body || row.title);
  return {
    bullets: bullets.slice(0, max),
    truncatedCount: Math.max(0, bullets.length - max),
  };
}

// Plain-text export for the Copy Review action. Labels mirror the
// component names, and a section is skipped entirely when its backing
// field is empty — the export hides missing data the same way the
// on-screen components do, rather than printing an empty heading.
const PLAIN_TEXT_SECTIONS = [
  ["verdict", "Executive Summary"],
  ["what_changed_and_why", "File Overview (model narrative)"],
  ["what_deserves_attention_ranked", "Review Findings"],
  ["open_questions", "Open Questions"],
  ["minor_notes", "Additional Notes"],
];

export function buildPlainTextReview({ repositoryUrl, commitHash, sections }) {
  const lines = [`Repository: ${repositoryUrl}`, `Commit: ${commitHash}`, ""];

  for (const [key, label] of PLAIN_TEXT_SECTIONS) {
    const text = ((sections && sections[key]) || "").trim();
    if (!text) continue;
    lines.push(label, text, "");
  }

  return lines.join("\n").trim();
}
