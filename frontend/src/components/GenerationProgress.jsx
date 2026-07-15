import React from "react";
import "./GenerationProgress.css";

const STEP_MAP = {
  video: [
    { stage: "queued", label: "Request prepared" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "building_prompt", label: "Creative direction built" },
    { stage: "submitting_to_runway", label: "Request sent to server" },
    { stage: "waiting_for_runway", label: "Video generated" },
    { stage: "processing_video", label: "Final video processed" },
    { stage: "generating_voiceover", label: "Voiceover generated", voiceoverOnly: true },
    { stage: "mixing_audio", label: "Voiceover added", voiceoverOnly: true },
    { stage: "uploading_video", label: "Video uploaded" },
    { stage: "saving_library", label: "Saved to Library" },
    { stage: "succeeded", label: "Video complete" },
  ],
  image: [
    { stage: "queued", label: "Request prepared" },
    { stage: "validated", label: "Request validated" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "building_prompts", label: "Creative prompts built" },
    { stage: "generating_creative", label: "Copy and image generated" },
    { stage: "uploading_creative", label: "Creative uploaded" },
    { stage: "saving_library", label: "Saved to Library" },
    { stage: "succeeded", label: "Creative complete" },
  ],
  optimizer: [
    { stage: "queued", label: "Campaign received" },
    { stage: "validated", label: "Campaign details validated" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "analyzing_creative", label: "Uploaded creative analyzed" },
    { stage: "evaluating_performance", label: "Performance evaluated" },
    { stage: "building_recommendations", label: "Recommendations and copy prepared" },
    { stage: "saving_results", label: "Results prepared" },
    { stage: "succeeded", label: "Optimization complete" },
  ],
  optimizerGeneration: [
    { stage: "queued", label: "Optimization loaded" },
    { stage: "validated", label: "Optimization results validated" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "building_prompt", label: "Improved prompt built" },
    { stage: "generating_creative", label: "Optimized creative generated" },
    { stage: "uploading_creative", label: "Creative uploaded" },
    { stage: "saving_library", label: "Saved to Library" },
    { stage: "succeeded", label: "Creative complete" },
  ],
};

const COPY_MAP = {
  video: {
    kicker: "VIDEO GENERATION",
    title: "Creating your video",
    failedTitle: "Video generation stopped",
    defaultMessage: "Preparing your video request.",
  },
  image: {
    kicker: "CREATIVE GENERATION",
    title: "Creating your ad",
    failedTitle: "Creative generation stopped",
    defaultMessage: "Preparing your creative request.",
  },
  optimizer: {
    kicker: "AI OPTIMIZATION",
    title: "Analyzing your campaign",
    failedTitle: "Optimization stopped",
    defaultMessage: "Preparing campaign analysis.",
  },
  optimizerGeneration: {
    kicker: "CREATIVE GENERATION",
    title: "Creating your optimized ad",
    failedTitle: "Creative generation stopped",
    defaultMessage: "Preparing optimized creative.",
  },
};

export default function GenerationProgress({
  open,
  type = "video",
  stage = "queued",
  message,
  percent = 5,
  voiceoverEnabled = false,
  failed = false,
}) {
  if (!open) return null;

  const definition = STEP_MAP[type] || STEP_MAP.video;
  const copy = COPY_MAP[type] || COPY_MAP.video;
  const steps = definition.filter((step) => !step.voiceoverOnly || voiceoverEnabled);
  const order = steps.reduce((out, step, index) => {
    out[step.stage] = index;
    return out;
  }, {});
  const activeIndex = stage === "failed" ? steps.length - 1 : order[stage] ?? 0;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <div className="generation-progress-overlay" role="status" aria-live="polite">
      <div className="generation-progress-card">
        <div className="generation-progress-topline">
          <span className="generation-progress-kicker">{copy.kicker}</span>
          <strong>{safePercent}%</strong>
        </div>

        <h2>{failed ? copy.failedTitle : copy.title}</h2>
        <p className="generation-progress-message">{message || copy.defaultMessage}</p>

        <div className="generation-progress-bar" aria-hidden="true">
          <span style={{ width: `${safePercent}%` }} />
        </div>

        <div className="generation-progress-steps">
          {steps.map((step, index) => {
            const complete = !failed && index < activeIndex;
            const active = !failed && step.stage === stage;
            const error = failed && index === activeIndex;

            return (
              <div
                key={step.stage}
                className={`generation-progress-step ${complete ? "complete" : ""} ${active ? "active" : ""} ${error ? "error" : ""}`}
              >
                <span className="generation-progress-icon">
                  {complete ? "✓" : error ? "!" : active ? <i /> : ""}
                </span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
