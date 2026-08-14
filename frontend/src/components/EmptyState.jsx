import { AlertCircle, Inbox, Loader2 } from "lucide-react";

// One shared shape for every "nothing to show yet" state this app needs
// (loading / empty / error) — never a browser alert(). `tone` only picks
// an icon and a text color; it never implies a severity the backend
// didn't report. `action` (Milestone 5, optional) renders a real link —
// used for "Sign in again" on a 401, so an expired/revoked session has
// an actual way back to LoginGate instead of just a stuck text error.
// Milestone 7A: `action.onClick` renders a button instead of a link
// (opening the repository selector isn't a navigation), same visual
// treatment either way.
function EmptyState({ tone = "empty", title, body, action }) {
  const Icon = tone === "loading" ? Loader2 : tone === "error" ? AlertCircle : Inbox;
  return (
    <div className={`empty-state empty-state-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <Icon className={tone === "loading" ? "empty-state-icon empty-state-icon-spin" : "empty-state-icon"} size={20} strokeWidth={1.75} aria-hidden="true" />
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
      {action && (action.onClick ? (
        <button type="button" className="empty-state-action" onClick={action.onClick}>{action.label}</button>
      ) : (
        <a className="empty-state-action" href={action.href}>{action.label}</a>
      ))}
    </div>
  );
}

export default EmptyState;
