import { LogIn } from "lucide-react";
import { loginUrl } from "../lib/authApi";

// Shown whenever there is no valid session — the only way into the app.
// A real browser navigation (<a href>), not a fetch: GitHub's OAuth
// authorize step has to happen as an actual page load.
function LoginGate() {
  return (
    <div className="login-gate">
      <div className="login-gate-card">
        <span className="brand-mark" aria-hidden="true">C</span>
        <h1 className="login-gate-title">PR Review</h1>
        <p className="login-gate-body">
          Sign in with GitHub to review pull requests across the repositories you have access to.
        </p>
        <a className="primary-button login-gate-action" href={loginUrl()}>
          <LogIn size={16} strokeWidth={1.75} aria-hidden="true" />
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}

export default LoginGate;
