import { parseTitledListItems, renderInlineMarkdown } from "../lib/textFormatting";

const MAX_QUESTIONS = 5;

// Answers "what's blocking confidence?" — the model's own open_questions,
// capped at 5 (the model already orders these; taking the first 5 keeps
// the real ones, not a random subset). If there are more, the count is
// disclosed rather than silently dropped.
function OpenQuestions({ rawText, showTitle = true }) {
  if (!rawText || !rawText.trim()) return null;

  const rows = parseTitledListItems(rawText);
  if (!rows || rows.length === 0) return null;

  const shown = rows.slice(0, MAX_QUESTIONS);
  const remaining = rows.length - shown.length;

  return (
    <section className="open-questions">
      {showTitle && <h2 className="section-heading">Open Questions</h2>}
      <ul className="question-list">
        {shown.map((row, index) => (
          <li className="question-item" key={index}>
            <span className="question-title">{renderInlineMarkdown(row.title || row.body)}</span>
            {row.title && <span className="question-detail">{renderInlineMarkdown(row.body)}</span>}
          </li>
        ))}
      </ul>
      {remaining > 0 && <p className="question-more">+{remaining} more not shown</p>}
    </section>
  );
}

export default OpenQuestions;
