// Commit Review — Version 1 product UI (Milestone 23).
// Talks only to the existing POST /review and GET /health endpoints.
// No framework, no build step, no persistence.

const API_BASE_URL = window.API_BASE_URL;
const REQUEST_TIMEOUT_MESSAGE = "This is taking longer than expected and the request timed out.";

// Backend section keys (src/api/response_parser.py SECTION_KEYS), in order.
const SECTIONS = [
  ["verdict", "Verdict"],
  ["what_changed_and_why", "What changed and why"],
  ["what_deserves_attention_ranked", "What deserves attention, ranked"],
  ["open_questions", "Open questions"],
  ["minor_notes", "Minor notes"],
];

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

function renderIdle() {
  output.innerHTML = `<p class="idle-hint">Enter a repository URL and click Review Commit to get started.</p>`;
}

function renderLoading() {
  output.innerHTML = `
    <div class="loading">
      <span class="spinner" role="presentation"></span>
      <span>Reviewing commit — this can take up to a minute.</span>
    </div>
  `;
}

function renderError(message) {
  output.innerHTML = `
    <div class="error-box" role="alert">
      <p class="error-title">Unable to complete this review</p>
      <p class="error-message">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderResult(body) {
  const metaHtml = `
    <div class="result-meta">
      <span><span class="meta-label">Repository:</span> ${escapeHtml(body.repository_url)}</span>
      <span><span class="meta-label">Commit:</span> <code title="${escapeHtml(body.commit_hash)}">${escapeHtml(body.commit_hash.slice(0, 12))}</code></span>
    </div>
  `;

  let bodyHtml;
  if (body.review.parsed && body.review.sections) {
    bodyHtml = SECTIONS.map(([key, label]) => `
      <section class="review-section">
        <h2>${escapeHtml(label)}</h2>
        <p class="section-body">${escapeHtml(body.review.sections[key] || "")}</p>
      </section>
    `).join("");
  } else {
    bodyHtml = `
      <section class="review-section raw-response">
        <p class="raw-response-note">This response didn't parse into the standard sections. Showing it as received.</p>
        <p class="section-body">${escapeHtml(body.review.raw || "")}</p>
      </section>
    `;
  }

  const validationHtml = renderValidationNote(body.validation);

  output.innerHTML = metaHtml + bodyHtml + validationHtml;
}

function renderValidationNote(validation) {
  if (!validation || !validation.findings || validation.findings.length === 0) {
    return "";
  }
  const first = validation.findings[0];
  const extra = validation.findings.length > 1 ? ` (+${validation.findings.length - 1} more)` : "";
  return `
    <div class="validation-note">
      Formatting note: ${escapeHtml(first.message)}${extra}
    </div>
  `;
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

form.addEventListener("submit", submitReview);
renderIdle();
