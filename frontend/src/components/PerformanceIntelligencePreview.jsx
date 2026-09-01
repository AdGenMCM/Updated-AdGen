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

function yesNoValue(items) {
  const value = firstValue(items);
  if (!value) return "";
  if (String(value).toLowerCase() === "yes") return "Enabled";
  if (String(value).toLowerCase() === "no") return "Disabled";
  return value;
}

function buildPatterns(profile, mode) {
  if (mode === "video") {
    return [
      ["Visual style", firstValue(profile?.top_visual_styles)],
      ["Hook", firstValue(profile?.top_hook_styles)],
      ["Pacing", firstValue(profile?.top_pacing)],
      ["Camera", firstValue(profile?.top_camera_motion)],
      ["Duration", firstValue(profile?.top_durations)
        ? `${firstValue(profile?.top_durations)}s`
        : ""],
      ["Format", firstValue(profile?.top_ratios)],
      ["Voice", firstValue(profile?.top_voice_modes)],
      ["Music", yesNoValue(profile?.top_music_usage)],
      ["Text overlays", yesNoValue(profile?.top_text_overlay_usage)],
      ["CTA finish", yesNoValue(profile?.top_cta_finish_usage)],
      ["Reference image", yesNoValue(profile?.top_reference_image_usage)],
      ["Campaign type", firstValue(profile?.top_campaign_types)],
    ]
      .filter(([, value]) => value)
      .slice(0, 8);
  }

  return [
    ["Colors", firstValue(profile?.top_colors)],
    ["Visual style", firstValue(profile?.top_visual_styles)],
    ["Composition", firstValue(profile?.top_compositions)],
    ["Imagery", firstValue(profile?.top_imagery_types)],
    ["Background", firstValue(profile?.top_backgrounds)],
    ["Contrast", firstValue(profile?.top_contrast_levels)],
    ["Text level", firstValue(profile?.top_text_overlay_levels)],
    ["CTA opener", firstValue(profile?.top_cta_openers)],
    ["Headline opener", firstValue(profile?.top_headline_openers)],
    ["Format", firstValue(profile?.top_ratios)],
  ]
    .filter(([, value]) => value)
    .slice(0, 8);
}

export default function PerformanceIntelligencePreview({
  enabled,
  mode = "image",
}) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async ({ force = false } = {}) => {
    if (!force && (response || loading)) return;

    setLoading(true);
    setError("");

    try {
      const result = await getGenerationProfile(mode);
      setResponse(result || {});
    } catch (err) {
      setError(err?.message || "Could not load learned patterns.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Mode can change because the same preview component is shared by Image
    // Generation and Video Generation. Never show one mode's cached profile in
    // the other.
    setResponse(null);
    setError("");

    if (enabled) {
      load({ force: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode]);

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
    ? `Waiting for ${mode} performance data`
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

  const mediaLabel = mode === "video" ? "video" : "image";

  return (
    <div className={`pi-preview ${enabled ? "enabled" : ""}`}>
      <button
        type="button"
        className="pi-previewToggle"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>
          {enabled ? "See what ADGen will apply" : "Preview learned patterns"}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="pi-previewBody">
          {loading && (
            <div className="pi-previewState">
              Loading learned {mediaLabel} patterns…
            </div>
          )}

          {!loading && error && (
            <div className="pi-previewState error">{error}</div>
          )}

          {!loading && !error && response && (
            <>
              <div className="pi-previewHeader">
                <div>
                  <span className="pi-previewEyebrow">
                    Performance Intelligence · {titleCase(mediaLabel)}
                  </span>
                  <strong>{statusLabel}</strong>
                  <small>
                    {enabled
                      ? `These ${mediaLabel} patterns can guide this generation without replacing your current request, Brand Kit, or source assets.`
                      : `Enable Performance Intelligence to apply these learned ${mediaLabel} patterns.`}
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
                  <span>{titleCase(mediaLabel)} evidence</span>
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
                    Currently guiding {mediaLabel} generation
                  </div>

                  <div className="pi-previewPatternGrid">
                    {patterns.map(([label, value]) => (
                      <div
                        key={`${label}-${value}`}
                        className="pi-previewPattern"
                      >
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
                          Number(profile.average_winning_headline_length)
                        )}{" "}
                        characters
                        {Number(
                          profile?.average_winning_product_prominence_percent
                        ) > 0
                          ? ` · Product prominence averages ${Math.round(
                              Number(
                                profile.average_winning_product_prominence_percent
                              )
                            )}%`
                          : ""}
                      </div>
                    )}

                  {mode === "video" && (
                    <div className="pi-previewFinePrint">
                      {Number(profile?.average_winning_hold_rate) > 0
                        ? `Winning hold rate averages ${Number(
                            profile.average_winning_hold_rate
                          ).toFixed(1)}%`
                        : "Video retention guidance will appear as 3s, 6s, and hold-rate data becomes available."}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pi-previewEmpty">
                  Add performance data to {mediaLabel} creatives in Library.
                  ADGen will apply learned {mediaLabel} patterns after qualified
                  positive evidence is available.
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
