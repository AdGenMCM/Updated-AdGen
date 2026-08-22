import React, { useEffect, useState } from "react";
import { Download, ExternalLink, Star, X } from "lucide-react";
import { auth } from "../firebaseConfig";
import "./GenerationFeedback.css";

export default function GenerationFeedback({
  open,
  onClose,
  apiBase,
  resourceType,
  resourceId,
  mediaUrl,
  mediaType,
  title,
  question,
  summary,
  onDownload,
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExistingFeedback, setHasExistingFeedback] = useState(false);
  const [existingWasSkipped, setExistingWasSkipped] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !resourceId || !resourceType || !apiBase) return;

    let cancelled = false;

    const loadExistingFeedback = async () => {
      setRating(0);
      setComment("");
      setSaving(false);
      setSaved(false);
      setHasExistingFeedback(false);
      setExistingWasSkipped(false);
      setError("");
      setLoadingFeedback(true);

      try {
        const user = auth.currentUser;
        if (!user) return;

        const token = await user.getIdToken(true);
        const response = await fetch(
          `${apiBase}/feedback/${resourceType}/${resourceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.detail || "Feedback could not be loaded.");
        }

        if (cancelled) return;

        const feedback = data?.feedback;
        if (feedback && typeof feedback === "object") {
          const existingRating = Number(feedback.rating || 0);
          const skipped = Boolean(feedback.skipped);

          setRating(
            Number.isFinite(existingRating) &&
              existingRating >= 1 &&
              existingRating <= 5
              ? existingRating
              : 0
          );
          setComment(
            typeof feedback.comment === "string" ? feedback.comment : ""
          );
          setHasExistingFeedback(Boolean(existingRating) && !skipped);
          setExistingWasSkipped(skipped);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Feedback could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoadingFeedback(false);
      }
    };

    void loadExistingFeedback();

    return () => {
      cancelled = true;
    };
  }, [open, resourceId, resourceType, apiBase]);

  if (!open || !resourceId) return null;

  const saveFeedback = async ({ skipped = false } = {}) => {
    if (!skipped && !rating) {
      setError("Choose a star rating first.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !apiBase) return;

    // Closing/skipping after submitted feedback must never erase it.
    if (skipped && hasExistingFeedback) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");

    try {
      const token = await user.getIdToken(true);
      const response = await fetch(
        `${apiBase}/feedback/${resourceType}/${resourceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rating: skipped ? null : rating,
            comment: skipped ? null : comment.trim() || null,
            skipped,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Feedback could not be saved.");
      }

      if (skipped) {
        setExistingWasSkipped(true);
        setHasExistingFeedback(false);
      } else {
        setHasExistingFeedback(true);
        setExistingWasSkipped(false);
        setSaved(true);
      }

      window.setTimeout(onClose, skipped ? 150 : 650);
    } catch (err) {
      setError(err?.message || "Feedback could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (hasExistingFeedback || existingWasSkipped) {
      onClose();
      return;
    }

    void saveFeedback({ skipped: true });
  };

  return (
    <div
      className="generation-feedback-layer"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Generation result"}
    >
      <button
        className="generation-feedback-backdrop"
        type="button"
        onClick={closeModal}
        aria-label="Close result"
      />

      <section className="generation-feedback-modal">
        <header className="generation-feedback-header">
          <div>
            <span>Generation complete</span>
            <h2>{title || "Your result is ready"}</h2>
          </div>
          <button
            type="button"
            className="generation-feedback-close"
            onClick={closeModal}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        <div className="generation-feedback-body">
          {mediaUrl && mediaType === "video" && (
            <video
              src={mediaUrl}
              controls
              className="generation-feedback-media"
            />
          )}

          {mediaUrl && mediaType === "image" && (
            <img
              src={mediaUrl}
              alt="Generated result"
              className="generation-feedback-media"
            />
          )}

          {!mediaUrl && summary && (
            <div className="generation-feedback-summary">{summary}</div>
          )}

          <div className="generation-feedback-actions">
            {mediaUrl && (
              <a href={mediaUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open original
              </a>
            )}
            {mediaUrl && onDownload && (
              <button type="button" onClick={onDownload}>
                <Download size={16} /> Download
              </button>
            )}
          </div>

          <div className="generation-feedback-rating">
            <h3>{question || "How was this result?"}</h3>

            {loadingFeedback ? (
              <p className="generation-feedback-existing">
                Loading your feedback…
              </p>
            ) : (
              <>
                {hasExistingFeedback && (
                  <p className="generation-feedback-existing">
                    Your feedback is saved. You can change it below and save again.
                  </p>
                )}

                <div
                  className="generation-feedback-stars"
                  aria-label="Rate from 1 to 5 stars"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setRating(value);
                        setSaved(false);
                        setError("");
                      }}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      className={value <= rating ? "selected" : ""}
                    >
                      <Star
                        size={30}
                        fill={value <= rating ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>

                {rating > 0 && (
                  <label className="generation-feedback-comment">
                    <span>
                      Anything you'd like us to know? <em>Optional</em>
                    </span>
                    <textarea
                      value={comment}
                      onChange={(event) => {
                        setComment(event.target.value);
                        setSaved(false);
                      }}
                      maxLength={1000}
                      placeholder="Tell us what worked or what could be better."
                    />
                  </label>
                )}
              </>
            )}

            {error && <p className="generation-feedback-error">{error}</p>}
            {saved && (
              <p className="generation-feedback-success">
                Your feedback has been updated.
              </p>
            )}

            <div className="generation-feedback-submit-row">
              <button
                type="button"
                className="generation-feedback-skip"
                disabled={saving}
                onClick={() =>
                  hasExistingFeedback || existingWasSkipped
                    ? onClose()
                    : saveFeedback({ skipped: true })
                }
              >
                {hasExistingFeedback || existingWasSkipped ? "Close" : "Skip"}
              </button>

              <button
                type="button"
                className="generation-feedback-submit"
                disabled={!rating || saving || loadingFeedback}
                onClick={() => saveFeedback()}
              >
                {saving
                  ? "Saving…"
                  : hasExistingFeedback
                  ? "Update feedback"
                  : "Submit feedback"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
