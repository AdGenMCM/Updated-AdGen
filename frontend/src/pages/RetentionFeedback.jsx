import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import "./RetentionFeedback.css";

const PRODUCTION_API = "https://updated-adgen.onrender.com";
const API_BASE = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  PRODUCTION_API
).trim();

const REASON_LABELS = {
  no_need: "I haven't needed another ad yet",
  results: "The results weren't what I needed",
  complexity: "It was too complicated",
  missing_feature: "I couldn't find the feature I needed",
  pricing: "The plans or pricing didn't work for me",
  other: "Something else",
};

export default function RetentionFeedback() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const reason = (searchParams.get("reason") || "").trim().toLowerCase();

  const [state, setState] = useState("saving");
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commentSaved, setCommentSaved] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const reasonLabel = useMemo(
    () => REASON_LABELS[reason] || "Your response",
    [reason]
  );

  useEffect(() => {
    let cancelled = false;

    const saveSelection = async () => {
      if (!token || !REASON_LABELS[reason]) {
        setState("error");
        setError("This feedback link is incomplete or invalid.");
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/feedback/retention`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, reason }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || "Your feedback could not be recorded.");
        }
        if (!cancelled) {
          setState("saved");
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setState("error");
          setError(requestError?.message || "Your feedback could not be recorded.");
        }
      }
    };

    saveSelection();
    return () => {
      cancelled = true;
    };
  }, [reason, token]);

  const submitComment = async (event) => {
    event.preventDefault();
    if (!comment.trim() || savingComment) return;

    setSavingComment(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/feedback/retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason, comment: comment.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Your note could not be saved.");
      }
      setCommentSaved(true);
    } catch (requestError) {
      setError(requestError?.message || "Your note could not be saved.");
    } finally {
      setSavingComment(false);
    }
  };

  return (
    <main className="retention-feedback-page">
      <section className="retention-feedback-card">
        <span className="retention-feedback-icon" aria-hidden="true">
          {state === "saved" ? <CheckCircle2 size={27} /> : <MessageSquareText size={27} />}
        </span>

        {state === "saving" && (
          <>
            <span className="retention-feedback-eyebrow">ADGen feedback</span>
            <h1>Recording your response…</h1>
            <p>This should only take a moment.</p>
          </>
        )}

        {state === "error" && (
          <>
            <span className="retention-feedback-eyebrow">ADGen feedback</span>
            <h1>We couldn't record that response.</h1>
            <p>{error}</p>
            <Link to="/contact" className="retention-feedback-primary">Contact support</Link>
          </>
        )}

        {state === "saved" && (
          <>
            <span className="retention-feedback-eyebrow">Feedback recorded</span>
            <h1>Thanks — that helps.</h1>
            <p className="retention-feedback-selection">
              You selected: <strong>{reasonLabel}</strong>
            </p>
            <p>
              If you want to add context, leave a quick note below. It's optional.
            </p>

            {!commentSaved ? (
              <form className="retention-feedback-form" onSubmit={submitComment}>
                <label htmlFor="retention-feedback-comment">Anything else you'd like me to know?</label>
                <textarea
                  id="retention-feedback-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="Optional — one sentence is enough."
                />
                <div className="retention-feedback-form-footer">
                  <span>{comment.length} / 2000</span>
                  <button type="submit" disabled={!comment.trim() || savingComment}>
                    {savingComment ? "Saving…" : "Save note"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="retention-feedback-note-saved">
                <CheckCircle2 size={18} /> Your note was saved. Thank you.
              </div>
            )}

            {error && <p className="retention-feedback-error">{error}</p>}

            <div className="retention-feedback-actions">
              <Link to="/dashboard" className="retention-feedback-primary">Return to ADGen</Link>
              <Link to="/" className="retention-feedback-secondary">Back to site</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
