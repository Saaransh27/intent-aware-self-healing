import { useState, useEffect } from "react";

// Client-side "Generated" timestamp (captured when the response rendered)
// plus a Copy Review action. Hides entirely until a review has loaded —
// there's nothing to timestamp or copy before that.
//
// Deliberately no "Model version" field: the API response has no model
// identifier anywhere (verified against src/api/models.py) — inventing a
// version string here would be exactly the kind of fabricated field this
// app is built to avoid.
function Footer({ generatedAt, plainText }) {
  const [label, setLabel] = useState("Copy Review");

  useEffect(() => {
    setLabel("Copy Review");
  }, [plainText]);

  if (!generatedAt || !plainText) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plainText);
      setLabel("Copied");
    } catch {
      setLabel("Couldn't copy");
    } finally {
      setTimeout(() => setLabel("Copy Review"), 1500);
    }
  }

  return (
    <footer className="app-footer">
      <span className="footer-timestamp">Generated {generatedAt}</span>
      <button type="button" className="secondary-button" onClick={handleCopy}>
        {label}
      </button>
    </footer>
  );
}

export default Footer;
