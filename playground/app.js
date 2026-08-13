// Commit Review — a commit-triage workspace for reviewers moving through
// many commits a day: Overview, Review Checklist, Changed Files, Unknowns /
// Limitations, Technical Details. Talks only to the existing POST /review
// and GET /health endpoints. No framework, no build step, no persistence
// (checklist "reviewed" marks are a client-only, per-viewing convenience —
// they are not saved anywhere), no new backend fields.
//
// Backend contract (src/api/models.py): repository_url, commit_hash, outcome,
// adapter_state, review: {raw, parsed, sections: {verdict,
// what_changed_and_why, what_deserves_attention_ranked, open_questions,
// minor_notes}}, findings (always [] — never displayed), validation (about
// the response's OWN formatting compliance, not the commit's risk — never
// displayed as a badge). There is no changed-files list, no diff, and no
// risk/complexity/effort score anywhere in this response. Anything below
// that looks "file-centric" is reorganized from the existing prose text,
// never fabricated.

const API_BASE_URL = window.API_BASE_URL;
const REQUEST_TIMEOUT_MESSAGE = "This is taking longer than expected and the request timed out.";

// Maps the backend's real HTTP status codes to calm, specific messages.
// Never surfaces the raw `detail` string from the API.
function messageForStatus(status) {
  switch (status) {
    case 404:
      return "This repository or commit couldn't be found. Check the URL and try again.";
    case 500:
      return "Something went wrong while preparing this review. Please try again.";
    case 502:
      return "The model couldn't produce a usable review for this commit. Try again, or try a different commit.";
    case 504:
      return REQUEST_TIMEOUT_MESSAGE;
    default:
      return "Something went wrong while completing this review. Please try again.";
  }
}

const form = document.getElementById("review-form");
const repositoryInput = document.getElementById("repository-url");
const commitInput = document.getElementById("commit-hash");
const submitButton = document.getElementById("submit-button");
const output = document.getElementById("output");

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// The compact "owner/repo" form of a repository URL, for a header that
// should read as a repo name rather than a full URL. Falls back to the
// raw URL for anything that isn't a normal http(s) URL (e.g. an SSH form).
function shortRepoName(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const trimmed = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    return trimmed || rawUrl;
  } catch (err) {
    return rawUrl;
  }
}

// Renders the small, predictable subset of markdown the model actually
// produces (bold, inline code, bulleted/numbered lists, paragraphs) as
// safe HTML. Escapes the raw text FIRST, then only ever introduces our
// own fixed tags around the already-escaped content — the model's text
// can never inject an arbitrary tag.
function renderInlineMarkdown(escapedText) {
  return escapedText
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>");
}

function renderMarkdownLite(rawText) {
  if (!rawText || !rawText.trim()) {
    return "";
  }

  const lines = escapeHtml(rawText).split("\n");
  const blocks = [];
  let currentList = null;
  let currentParagraph = [];

  function flushParagraph() {
    if (currentParagraph.length) {
      blocks.push(`<p>${renderInlineMarkdown(currentParagraph.join(" ").trim())}</p>`);
      currentParagraph = [];
    }
  }

  function flushList() {
    if (currentList) {
      const items = currentList.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("");
      blocks.push(`<${currentList.tag}>${items}</${currentList.tag}>`);
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

  return blocks.join("");
}

// Splits the Verdict text into a lead conclusion sentence and a "why"
// remainder. The backend returns Verdict as a single field ("one or two
// sentences" per its own spec) — this is a best-effort split on the first
// sentence boundary, not new backend data. If there's only one sentence,
// there is no separate "why" and the caller renders the conclusion only.
// Deliberately does NOT derive a category/severity label from this text —
// the backend has no such field, and guessing one from prose risks a
// confidently wrong classification.
function splitVerdict(rawText) {
  const trimmed = (rawText || "").trim();
  const match = trimmed.match(/^(.*?[.!?])\s+(.*)$/s);
  if (!match) {
    return { conclusion: trimmed, why: "" };
  }
  return { conclusion: match[1].trim(), why: match[2].trim() };
}

// Splits a list-shaped section's raw text into {title, body} rows, where
// title is the model's own bold lead-in phrase and body is the rest of the
// sentence. Shared by the Review Checklist and Unknowns, which the model
// consistently formats as "**Title** – explanation". Returns null when no
// list structure is present, so the caller can fall back to plain markdown.
function parseTitledListItems(rawText) {
  const lines = escapeHtml(rawText).split("\n");
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

  if (!sawAnyListLine) {
    return null;
  }

  return items.map((item) => {
    const titleMatch = item.match(/^\*\*(.+?)\*\*\s*[–—-]?\s*(.*)$/);
    return {
      title: titleMatch ? titleMatch[1] : "",
      body: titleMatch ? titleMatch[2] : item,
    };
  });
}

// Review Checklist — collapsed by default so only the title is visible on
// first look; the reasoning ("Evidence" for why this check was raised)
// expands on click. Each row also carries a real checkbox: clicking it
// marks the item reviewed for this viewing (client-only, resets on the
// next review — there is nowhere to persist this, and it doesn't claim
// to be more than a within-session progress cue).
function renderChecklist(rawText) {
  if (!rawText || !rawText.trim()) {
    return "";
  }
  const rows = parseTitledListItems(rawText);
  if (!rows) {
    return renderMarkdownLite(rawText);
  }

  const itemsHtml = rows.map((row, index) => {
    const checkbox = `<input type="checkbox" class="checklist-check" aria-label="Mark item ${index + 1} reviewed">`;
    if (row.title && row.body) {
      return `
        <details class="checklist-item">
          <summary class="checklist-summary">
            ${checkbox}
            <span class="checklist-index">${index + 1}</span>
            <span class="checklist-title">${renderInlineMarkdown(row.title)}</span>
          </summary>
          <p class="checklist-reasoning">${renderInlineMarkdown(row.body)}</p>
        </details>
      `;
    }
    return `
      <div class="checklist-item checklist-item-plain">
        <div class="checklist-summary">
          ${checkbox}
          <span class="checklist-index">${index + 1}</span>
          <span class="checklist-title">${renderInlineMarkdown(row.body)}</span>
        </div>
      </div>
    `;
  }).join("");

  return `<div class="checklist-list">${itemsHtml}</div>`;
}

// Unknowns — the question leads and is always visible; the reasoning
// behind it is the lower-priority detail, collapsed by default.
function renderUnknowns(rawText) {
  if (!rawText || !rawText.trim()) {
    return "";
  }
  const rows = parseTitledListItems(rawText);
  if (!rows) {
    return renderMarkdownLite(rawText);
  }

  const rowsHtml = rows.map((row) => {
    if (row.title && row.body) {
      return `
        <details class="unknown-item">
          <summary class="unknown-summary">${renderInlineMarkdown(row.title)}</summary>
          <p class="unknown-reason">${renderInlineMarkdown(row.body)}</p>
        </details>
      `;
    }
    return `
      <div class="unknown-item unknown-item-plain">
        <div class="unknown-summary">${renderInlineMarkdown(row.body)}</div>
      </div>
    `;
  }).join("");

  return `<div class="unknown-list">${rowsHtml}</div>`;
}

// --- Changed Files ------------------------------------------------------
//
// The backend has no changed-files list or diff — only the prose in
// `what_changed_and_why`. This is a best-effort reorganization of that
// SAME text around real filenames it already mentions, not new data:
//
//   1. Split the text into items — one per list bullet if it's a list,
//      otherwise the whole paragraph is treated as a single item (trying
//      to sentence-split flowing prose is fragile around version numbers
//      like "0.51.0" and isn't worth the risk of misattribution).
//   2. Within each item, look for tokens that end in a real file
//      extension (e.g. `src/foo.py`, `pyproject.toml`) — a bold label
//      like "**Solver**" or a bare code symbol like `_min_release_age`
//      does not match, so it's never mistaken for a filename.
//   3. Items that mention one or more filenames become that file's
//      evidence (the same original text, just filed under a heading).
//      Items that mention no filename are kept, never dropped, under a
//      trailing "Other changes" note.
//   4. If nothing in the whole section matches a filename, there is
//      nothing honest to group — the section falls back to rendering the
//      original text as a plain "Change Summary".

const FILE_TOKEN_RE = /\b[\w][\w./-]*\.(?:py|pyi|ipynb|js|jsx|mjs|cjs|ts|tsx|json|toml|ya?ml|lock|md|mdx|txt|cfg|ini|env|rs|go|java|kt|kts|rb|php|c|h|hpp|cc|cpp|cs|sh|bash|zsh|ps1|html?|css|scss|less|sql|xml|gradle|proto|graphql|vue|svelte|swift|scala|r|lua|dockerfile)\b/gi;

function extractFilenames(text) {
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

function splitIntoItems(rawText) {
  const lines = rawText.split("\n");
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

  return sawList ? items : [rawText.trim()];
}

function groupByFile(rawText) {
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

function renderChangedFiles(rawText) {
  if (!rawText || !rawText.trim()) {
    return { html: "", isFallback: true };
  }

  const { files, leftover } = groupByFile(rawText);

  if (files.length === 0) {
    return { html: renderMarkdownLite(rawText), isFallback: true };
  }

  const fileRows = files.map((file) => `
    <details class="file-item">
      <summary class="file-summary">
        <code class="file-name">${escapeHtml(file.name)}</code>
      </summary>
      <div class="file-evidence">
        ${file.texts.map((text) => renderMarkdownLite(text)).join("")}
      </div>
    </details>
  `).join("");

  const leftoverHtml = leftover.length ? `
    <div class="file-leftover">
      <p class="file-leftover-label">Other changes</p>
      ${leftover.map((text) => renderMarkdownLite(text)).join("")}
    </div>
  ` : "";

  return { html: `<div class="file-list">${fileRows}</div>${leftoverHtml}`, isFallback: false };
}

function renderIdle() {
  output.innerHTML = `
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p class="idle-hint">Enter a repository URL and click Review Commit to get started.</p>
    </div>
  `;
}

function showForm() {
  form.style.display = "";
}

function hideForm() {
  form.style.display = "none";
}

function renderLoading() {
  output.innerHTML = `
    <div class="skeleton" aria-hidden="true">
      <div class="skeleton-line" style="width: 30%; height: 8px;"></div>
      <div class="skeleton-line" style="width: 85%; height: 20px; margin-top: 10px;"></div>
      <div class="skeleton-line" style="width: 60%; height: 20px;"></div>
      <div class="skeleton-line" style="width: 25%; height: 8px; margin-top: 20px;"></div>
      <div class="skeleton-line" style="width: 70%;"></div>
      <div class="skeleton-line" style="width: 55%;"></div>
    </div>
    <p class="loading-caption">
      <span class="spinner" role="presentation"></span>
      Reviewing commit — this can take up to a minute.
    </p>
  `;
}

const ERROR_ICON = `
  <svg class="error-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 6v4.5M10 13.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;

function renderError(message) {
  output.innerHTML = `
    <div class="error-box" role="alert">
      ${ERROR_ICON}
      <div>
        <p class="error-title">Unable to complete this review</p>
        <p class="error-message">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function formatGeneratedTimestamp(date) {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PLAIN_TEXT_SECTIONS = [
  ["verdict", "Overview"],
  ["what_deserves_attention_ranked", "Review Checklist"],
  ["what_changed_and_why", "Changed Files"],
  ["open_questions", "Unknowns / Limitations"],
  ["minor_notes", "Technical Details"],
];

function buildPlainTextReview(body) {
  const lines = [
    `Repository: ${body.repository_url}`,
    `Commit: ${body.commit_hash}`,
    "",
  ];

  if (body.review.parsed && body.review.sections) {
    for (const [key, label] of PLAIN_TEXT_SECTIONS) {
      lines.push(label, (body.review.sections[key] || "").trim(), "");
    }
  } else {
    lines.push("Response did not parse into sections. Raw response:", "", (body.review.raw || "").trim());
  }

  return lines.join("\n").trim();
}

function renderResult(body) {
  hideForm();

  const timestamp = formatGeneratedTimestamp(new Date());

  const headerHtml = `
    <div class="context-strip">
      <div class="context-meta">
        <span class="context-item" title="${escapeHtml(body.repository_url)}">${escapeHtml(shortRepoName(body.repository_url))}</span>
        <span class="context-sep">·</span>
        <code class="context-item context-commit" title="${escapeHtml(body.commit_hash)}">${escapeHtml(body.commit_hash.slice(0, 12))}</code>
        <span class="context-sep">·</span>
        <span class="context-item context-time">${escapeHtml(timestamp)}</span>
      </div>
      <div class="context-actions">
        <button type="button" id="copy-review-button" class="secondary-button">Copy Review</button>
        <button type="button" id="review-another-button" class="secondary-button">New Review</button>
      </div>
    </div>
  `;

  let bodyHtml;
  if (body.review.parsed && body.review.sections) {
    const { conclusion, why } = splitVerdict(body.review.sections.verdict || "");

    const overviewHtml = `
      <section class="stage overview" id="overview">
        <p class="overview-conclusion">${renderInlineMarkdown(escapeHtml(conclusion))}</p>
        ${why ? `<p class="overview-why">${renderInlineMarkdown(escapeHtml(why))}</p>` : ""}
      </section>
    `;

    const checklistBody = renderChecklist(body.review.sections.what_deserves_attention_ranked || "");
    const checklistHtml = checklistBody ? `
      <section class="stage" id="checklist">
        <h2 class="stage-label">Review Checklist</h2>
        ${checklistBody}
      </section>
    ` : "";

    const filesResult = renderChangedFiles(body.review.sections.what_changed_and_why || "");
    const filesHtml = filesResult.html ? `
      <section class="stage" id="files">
        <h2 class="stage-label">${filesResult.isFallback ? "Change Summary" : "Changed Files"}</h2>
        ${filesResult.html}
      </section>
    ` : "";

    const unknownsBody = renderUnknowns(body.review.sections.open_questions || "");
    const unknownsHtml = unknownsBody ? `
      <section class="stage" id="unknowns">
        <h2 class="stage-label">Unknowns / Limitations</h2>
        ${unknownsBody}
      </section>
    ` : "";

    const detailsBody = renderMarkdownLite(body.review.sections.minor_notes || "");
    const detailsHtml = detailsBody ? `
      <details class="stage tech-details" id="details">
        <summary class="stage-label">Technical Details</summary>
        <div class="section-body">${detailsBody}</div>
      </details>
    ` : "";

    const jumpNav = `
      <nav class="jump-nav" aria-label="Jump to section">
        ${checklistHtml ? '<a href="#checklist">Checklist</a>' : ""}
        ${filesHtml ? `<a href="#files">${filesResult.isFallback ? "Summary" : "Files"}</a>` : ""}
        ${unknownsHtml ? '<a href="#unknowns">Unknowns</a>' : ""}
        ${detailsHtml ? '<a href="#details">Details</a>' : ""}
      </nav>
    `;

    bodyHtml = jumpNav + overviewHtml + checklistHtml + filesHtml + unknownsHtml + detailsHtml;
  } else {
    bodyHtml = `
      <section class="stage raw-response">
        <p class="raw-response-note">This response didn't parse into the standard sections. Showing it as received.</p>
        <p class="section-body">${escapeHtml(body.review.raw || "")}</p>
      </section>
    `;
  }

  output.innerHTML = headerHtml + bodyHtml;

  document.getElementById("review-another-button").addEventListener("click", () => {
    showForm();
    commitInput.value = "";
    renderIdle();
    commitInput.focus();
  });

  document.getElementById("copy-review-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(buildPlainTextReview(body));
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    } catch (err) {
      button.textContent = "Couldn't copy";
      setTimeout(() => {
        button.textContent = "Copy Review";
      }, 1500);
    }
  });
}

async function submitReview(event) {
  event.preventDefault();

  const repository_url = repositoryInput.value.trim();
  const commit_hash = commitInput.value.trim() || null;

  if (!repository_url) {
    renderError("Enter a repository URL to continue.");
    return;
  }

  submitButton.disabled = true;
  renderLoading();

  try {
    const response = await fetch(`${API_BASE_URL}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository_url, commit_hash }),
    });

    if (!response.ok) {
      renderError(messageForStatus(response.status));
      return;
    }

    const body = await response.json();
    renderResult(body);
  } catch (err) {
    renderError("Couldn't reach the review service. Confirm it's running and try again.");
  } finally {
    submitButton.disabled = false;
  }
}

// Clicking a checklist row's checkbox marks it reviewed (see .checklist-check
// styling) without also triggering the row's own expand/collapse — a single
// delegated listener on `output` handles this for every render, present or
// future, rather than re-binding per-row on each renderResult() call.
output.addEventListener("click", (event) => {
  const target = event.target;
  if (target && target.classList && target.classList.contains("checklist-check")) {
    event.stopPropagation();
  }
});

form.addEventListener("submit", submitReview);
renderIdle();
