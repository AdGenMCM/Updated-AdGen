import React, { useEffect, useState } from "react";
import { getGenerationProfile } from "../services/performanceIntelligenceService";
import "./PerformanceIntelligencePreview.css";

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstValue(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const first = items[0];
  return typeof first === "string" ? first : first?.value || "";
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(0, Math.min(1, parsed)) * 100);
}

function formatUpdatedAt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return new Date(parsed * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildPatterns(profile, mode) {
  const common = [
    ["Visual style", firstValue(profile?.top_visual_styles)],
    ["Composition", firstValue(profile?.top_compositions)],
    ["Imagery", firstValue(profile?.top_imagery_types)],
    ["Emotional tone", firstValue(profile?.top_emotional_tones)],
  ];

  if (mode === "video") {
    return common.filter(([, value]) => value).slice(0, 4);
  }

  return [
    ["Colors", firstValue(profile?.top_colors)],
    ...common,
    ["Background", firstValue(profile?.top_backgrounds)],
    ["CTA opener", firstValue(profile?.top_cta_openers)],
    ["Headline opener", firstValue(profile?.top_headline_openers)],
  ]
    .filter(([, value]) => value)
    .slice(0, 6);
}

export default function PerformanceIntelligencePreview({
  enabled,
  mode = "image",
}) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (response || loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await getGenerationProfile();
      setResponse(result || {});
    } catch (err) {
      setError(err?.message || "Could not load learned patterns.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const profile = response?.profile || {};
  const confidence = normalizeConfidence(response?.confidence);
  const evidenceCount = Number(response?.evidenceCount || 0);
  const qualifiedCount = Number(response?.qualifiedCount || 0);
  const positiveCount = Number(response?.positiveCount || 0);
  const updatedAt = formatUpdatedAt(
    response?.updatedAt ||
      response?.generatedAt ||
      profile?.updated_at ||
      profile?.generated_at,
  );

 const patterns = buildPatterns(profile, mode);

  const hasQualifiedSignal = qualifiedCount > 0 && positiveCount > 0;
  const statusLabel = !evidenceCount
    ? "Waiting for performance data"
    : !qualifiedCount
      ? "Still learning"
      : !positiveCount
        ? "No positive pattern yet"
        : confidence >= 75
          ? "Strong guidance"
          : "Growing guidance";

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await load();
  };

  return (
    <div className={`pi-preview ${enabled ? "enabled" : ""}`}>
      <button
        type="button"
        className="pi-previewToggle"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>
          {enabled ? "See what AdGen will apply" : "Preview learned patterns"}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="pi-previewBody">
          {loading && (
            <div className="pi-previewState">Loading learned patterns…</div>
          )}

          {!loading && error && (
            <div className="pi-previewState error">{error}</div>
          )}

          {!loading && !error && response && (
            <>
              <div className="pi-previewHeader">
                <div>
                  <span className="pi-previewEyebrow">
                    Performance Intelligence
                  </span>
                  <strong>{statusLabel}</strong>
                  <small>
                    {enabled
                      ? "These patterns will guide this generation without replacing your request or Brand Kit."
                      : "Enable Performance Intelligence to apply these learned patterns."}
                  </small>
                </div>

                <div className="pi-previewConfidence">
                  <strong>{confidence}%</strong>
                  <span>Confidence</span>
                </div>
              </div>

              <div className="pi-previewStats">
                <div>
                  <strong>{evidenceCount}</strong>
                  <span>Evidence</span>
                </div>
                <div>
                  <strong>{qualifiedCount}</strong>
                  <span>Qualified</span>
                </div>
                <div>
                  <strong>{positiveCount}</strong>
                  <span>Positive</span>
                </div>
              </div>

              {hasQualifiedSignal && patterns.length > 0 ? (
                <div className="pi-previewPatterns">
                  <div className="pi-previewSectionTitle">
                    Currently guiding generation
                  </div>
                  <div className="pi-previewPatternGrid">
                    {patterns.map(([label, value]) => (
                      <div key={`${label}-${value}`} className="pi-previewPattern">
                        <span>{label}</span>
                        <strong>{titleCase(value)}</strong>
                      </div>
                    ))}
                  </div>

                  {mode === "image" &&
                    Number(profile?.average_winning_headline_length) > 0 && (
                      <div className="pi-previewFinePrint">
                        Winning headlines average{" "}
                        {Math.round(
                          Number(profile.average_winning_headline_length),
                        )}{" "}
                        characters
                        {Number(
                          profile?.average_winning_product_prominence_percent,
                        ) > 0
                          ? ` · Product prominence averages ${Math.round(
                              Number(
                                profile.average_winning_product_prominence_percent,
                              ),
                            )}%`
                          : ""}
                      </div>
                    )}
                </div>
              ) : (
                <div className="pi-previewEmpty">
                  Add impressions, clicks, conversions, spend, and revenue to
                  Library creatives. AdGen will begin applying patterns after
                  qualified positive evidence is available.
                </div>
              )}

              {updatedAt && (
                <div className="pi-previewUpdated">
                  Learning profile updated {updatedAt}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
