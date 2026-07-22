import React, { useEffect, useMemo, useRef, useState } from "react";
import "./GenerationProgress.css";

const STEP_MAP = {
  video: [
    { stage: "queued", label: "Request prepared" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "building_prompt", label: "Creative direction built" },
    { stage: "submitting_to_runway", label: "Request sent to Runway" },
    { stage: "waiting_for_runway", label: "Video rendering" },
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
    defaultTitle: "Creating your video",
    failedTitle: "Video generation stopped",
    defaultMessage: "Preparing your video request.",
  },
  image: {
    kicker: "CREATIVE GENERATION",
    defaultTitle: "Creating your ad",
    failedTitle: "Creative generation stopped",
    defaultMessage: "Preparing your creative request.",
  },
  optimizer: {
    kicker: "AI OPTIMIZATION",
    defaultTitle: "Analyzing your campaign",
    failedTitle: "Optimization stopped",
    defaultMessage: "Preparing campaign analysis.",
  },
  optimizerGeneration: {
    kicker: "CREATIVE GENERATION",
    defaultTitle: "Creating your optimized ad",
    failedTitle: "Creative generation stopped",
    defaultMessage: "Preparing optimized creative.",
  },
};

const TITLE_MAP = {
  video: {
    queued: "Preparing your request",
    loading_brand_kit: "Applying your brand",
    building_prompt: "Building your commercial",
    submitting_to_runway: "Sending your request",
    waiting_for_runway: "Rendering your video",
    processing_video: "Finalizing your video",
    generating_voiceover: "Generating your voiceover",
    mixing_audio: "Adding voiceover",
    uploading_video: "Uploading your video",
    saving_library: "Saving to your Library",
    succeeded: "Your video is ready",
  },
  image: {
    queued: "Preparing your request",
    validated: "Checking your request",
    loading_brand_kit: "Applying your brand",
    building_prompts: "Building creative direction",
    generating_creative: "Generating your ad",
    uploading_creative: "Uploading your creative",
    saving_library: "Saving to your Library",
    succeeded: "Your ad is ready",
  },
  optimizer: {
    queued: "Preparing your analysis",
    validated: "Checking campaign details",
    loading_brand_kit: "Applying your brand",
    analyzing_creative: "Analyzing your creative",
    evaluating_performance: "Evaluating performance",
    building_recommendations: "Building recommendations",
    saving_results: "Preparing your results",
    succeeded: "Optimization complete",
  },
  optimizerGeneration: {
    queued: "Preparing optimized creative",
    validated: "Checking optimization results",
    loading_brand_kit: "Applying your brand",
    building_prompt: "Building improved direction",
    generating_creative: "Generating optimized creative",
    uploading_creative: "Uploading your creative",
    saving_library: "Saving to your Library",
    succeeded: "Your optimized ad is ready",
  },
};

const HELPER_MESSAGES = {
  video: {
    queued: [
      "Setting up your generation workspace...",
      "Checking your request details...",
      "Preparing the video pipeline...",
    ],
    loading_brand_kit: [
      "Loading your brand preferences...",
      "Applying saved visual direction...",
      "Matching your creative to your brand...",
    ],
    building_prompt: [
      "Planning the scene composition...",
      "Preparing camera and motion direction...",
      "Refining the commercial concept...",
      "Optimizing the prompt for video generation...",
    ],
    submitting_to_runway: [
      "Establishing the generation request...",
      "Sending your creative direction to Runway...",
      "Preparing the render job...",
    ],
    waiting_for_runway: [
      "Rendering cinematic frames...",
      "Building realistic motion...",
      "Preserving product details...",
      "Refining lighting and reflections...",
      "Stabilizing movement across the scene...",
      "Applying high-quality visual polish...",
    ],
    processing_video: [
      "Preparing the final video file...",
      "Optimizing playback quality...",
      "Checking the finished render...",
    ],
    generating_voiceover: [
      "Preparing your narration...",
      "Matching pacing to the selected duration...",
      "Generating the selected voice...",
    ],
    mixing_audio: [
      "Synchronizing narration and video...",
      "Balancing the final audio mix...",
      "Preparing the completed soundtrack...",
    ],
    uploading_video: [
      "Uploading the finished video...",
      "Preparing your video preview...",
      "Optimizing delivery for playback...",
    ],
    saving_library: [
      "Adding the video to your Library...",
      "Saving generation details...",
      "Preparing your completed creative...",
    ],
    succeeded: ["Your finished video is ready."],
  },
  image: {
    queued: [
      "Setting up your creative workspace...",
      "Checking your request details...",
      "Preparing image generation...",
    ],
    validated: [
      "Your request looks good...",
      "Preparing your creative inputs...",
      "Getting everything ready...",
    ],
    loading_brand_kit: [
      "Loading your brand preferences...",
      "Applying saved visual direction...",
      "Matching the creative to your brand...",
    ],
    building_prompts: [
      "Planning the composition...",
      "Building your creative strategy...",
      "Preparing copy and visual direction...",
      "Optimizing for your selected platform...",
    ],
    generating_creative: [
      "Generating your image...",
      "Writing and refining ad copy...",
      "Enhancing product detail...",
      "Balancing layout and visual hierarchy...",
      "Applying final creative polish...",
    ],
    uploading_creative: [
      "Uploading your finished creative...",
      "Preparing the image preview...",
      "Optimizing delivery quality...",
    ],
    saving_library: [
      "Adding the creative to your Library...",
      "Saving generation details...",
      "Preparing your completed ad...",
    ],
    succeeded: ["Your finished creative is ready."],
  },
  optimizer: {
    queued: [
      "Preparing your campaign data...",
      "Setting up the analysis...",
      "Checking the supplied inputs...",
    ],
    validated: [
      "Campaign details are ready...",
      "Preparing your creative context...",
      "Organizing performance inputs...",
    ],
    loading_brand_kit: [
      "Loading your brand preferences...",
      "Applying brand context...",
      "Matching recommendations to your brand...",
    ],
    analyzing_creative: [
      "Reviewing composition and hierarchy...",
      "Evaluating messaging clarity...",
      "Inspecting the creative for friction points...",
    ],
    evaluating_performance: [
      "Comparing performance signals...",
      "Identifying likely opportunities...",
      "Prioritizing the highest-impact changes...",
    ],
    building_recommendations: [
      "Writing practical recommendations...",
      "Improving copy and creative direction...",
      "Preparing your next-step actions...",
    ],
    saving_results: [
      "Organizing your final results...",
      "Preparing the optimization summary...",
      "Finishing your recommendations...",
    ],
    succeeded: ["Your campaign analysis is ready."],
  },
  optimizerGeneration: {
    queued: [
      "Preparing the optimization output...",
      "Setting up creative generation...",
      "Loading the improved direction...",
    ],
    validated: [
      "Optimization results are ready...",
      "Checking the improved inputs...",
      "Preparing your next creative...",
    ],
    loading_brand_kit: [
      "Loading your brand preferences...",
      "Applying saved visual direction...",
      "Keeping the new creative on-brand...",
    ],
    building_prompt: [
      "Building improved creative direction...",
      "Translating recommendations into a prompt...",
      "Preparing the optimized composition...",
    ],
    generating_creative: [
      "Generating the optimized image...",
      "Applying the strongest recommendations...",
      "Refining visual hierarchy...",
      "Enhancing the final creative...",
    ],
    uploading_creative: [
      "Uploading your optimized creative...",
      "Preparing the image preview...",
      "Optimizing delivery quality...",
    ],
    saving_library: [
      "Adding the creative to your Library...",
      "Saving generation details...",
      "Preparing your completed ad...",
    ],
    succeeded: ["Your optimized creative is ready."],
  },
};

const VISUAL_CEILINGS = {
  video: {
    queued: 11,
    loading_brand_kit: 21,
    building_prompt: 31,
    submitting_to_runway: 47,
    waiting_for_runway: 60,
    processing_video: 77,
    generating_voiceover: 85,
    mixing_audio: 92,
    uploading_video: 97,
    saving_library: 99,
    succeeded: 100,
  },
  image: {
    queued: 11,
    validated: 19,
    loading_brand_kit: 31,
    building_prompts: 47,
    generating_creative: 81,
    uploading_creative: 93,
    saving_library: 99,
    succeeded: 100,
  },
  optimizer: {
    queued: 11,
    validated: 19,
    loading_brand_kit: 33,
    analyzing_creative: 51,
    evaluating_performance: 77,
    building_recommendations: 93,
    saving_results: 99,
    succeeded: 100,
  },
  optimizerGeneration: {
    queued: 11,
    validated: 21,
    loading_brand_kit: 33,
    building_prompt: 53,
    generating_creative: 83,
    uploading_creative: 93,
    saving_library: 99,
    succeeded: 100,
  },
};

function formatElapsed(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function GenerationProgress({
  open,
  type = "video",
  stage = "queued",
  message,
  percent = 5,
  voiceoverEnabled = false,
  failed = false,
  expectedMaxSeconds,
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [helperIndex, setHelperIndex] = useState(0);
  const [displayPercent, setDisplayPercent] = useState(
    Math.max(0, Math.min(100, Number(percent) || 0))
  );
  const startedAtRef = useRef(null);

  const definition = STEP_MAP[type] || STEP_MAP.video;
  const copy = COPY_MAP[type] || COPY_MAP.video;
  const steps = useMemo(
    () => definition.filter((step) => !step.voiceoverOnly || voiceoverEnabled),
    [definition, voiceoverEnabled]
  );

  const backendPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const helperMessages =
    HELPER_MESSAGES[type]?.[stage] ||
    HELPER_MESSAGES[type]?.queued ||
    ["Your request is still processing..."];

  const visualCeiling = Math.max(
    backendPercent,
    VISUAL_CEILINGS[type]?.[stage] ?? backendPercent
  );

  useEffect(() => {
    if (!open) {
      startedAtRef.current = null;
      setElapsedSeconds(0);
      setHelperIndex(0);
      return undefined;
    }

    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
    }

    const tick = () => {
      setElapsedSeconds(
        Math.floor((Date.now() - startedAtRef.current) / 1000)
      );
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    setHelperIndex(0);
  }, [stage, type]);

  useEffect(() => {
    if (!open || failed || helperMessages.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setHelperIndex((current) => (current + 1) % helperMessages.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [open, failed, stage, type, helperMessages.length]);

  useEffect(() => {
    if (!open) return undefined;

    setDisplayPercent((current) => Math.max(current, backendPercent));

    if (failed || stage === "succeeded" || backendPercent >= 100) {
      setDisplayPercent(backendPercent);
      return undefined;
    }

    const animationInterval =
      type === "video" && stage === "waiting_for_runway" ? 5000 : 2400;

    const timer = window.setInterval(() => {
      setDisplayPercent((current) => {
        const baseline = Math.max(current, backendPercent);
        if (baseline >= visualCeiling) return baseline;
        return Math.min(visualCeiling, baseline + 1);
      });
    }, animationInterval);

    return () => window.clearInterval(timer);
  }, [open, failed, stage, type, backendPercent, visualCeiling]);

  if (!open) return null;

  const order = steps.reduce((out, stepItem, index) => {
    out[stepItem.stage] = index;
    return out;
  }, {});

  const activeIndex =
    stage === "failed" ? steps.length - 1 : order[stage] ?? 0;

  const title = failed
    ? copy.failedTitle
    : TITLE_MAP[type]?.[stage] || copy.defaultTitle;

  const isRunwayRendering =
    type === "video" &&
    ["submitting_to_runway", "waiting_for_runway"].includes(stage);

  let reassurance = null;

  if (isRunwayRendering) {
    if (elapsedSeconds >= 120) {
      reassurance =
        "Your video is still rendering normally. Complex scenes or high demand can increase generation time.";
    } else if (elapsedSeconds >= 60) {
      reassurance =
        "Your video is still actively generating. More detailed scenes may take a little longer.";
    } else {
      const maxSeconds = expectedMaxSeconds || 180;
      const maxMinutes = Math.max(1, Math.round(maxSeconds / 60));

      reassurance = `High-quality video generation can take up to ${maxMinutes} minutes.`;
    }
  } else if (!failed && elapsedSeconds >= 45 && stage !== "succeeded") {
    reassurance =
      "This request is still actively processing. Keep this page open while it completes.";
  }

  return (
    <div
      className="generation-progress-overlay"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={`generation-progress-card ${
          failed ? "is-failed" : "is-active"
        }`}
      >
        <div className="generation-progress-topline">
          <span className="generation-progress-kicker">{copy.kicker}</span>

          <div className="generation-progress-meta">
            <span className="generation-progress-elapsed">
              {formatElapsed(elapsedSeconds)} elapsed
            </span>
            <strong>{Math.round(displayPercent)}%</strong>
          </div>
        </div>

        <h2>{title}</h2>

        <p className="generation-progress-message">
          {message || copy.defaultMessage}
        </p>

        {!failed && (
          <div className="generation-progress-helper" key={`${stage}-${helperIndex}`}>
            <span className="generation-progress-helper-dot" aria-hidden="true" />
            <span>{helperMessages[helperIndex]}</span>
          </div>
        )}

        {reassurance && (
          <div className="generation-progress-notice">
            <span aria-hidden="true">i</span>
            <p>{reassurance}</p>
          </div>
        )}

        <div
          className="generation-progress-bar"
          aria-label={`${Math.round(displayPercent)} percent complete`}
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(displayPercent)}
        >
          <span style={{ width: `${displayPercent}%` }}>
            {!failed && <i aria-hidden="true" />}
          </span>
        </div>

        <div className="generation-progress-steps">
          {steps.map((stepItem, index) => {
            const complete = !failed && index < activeIndex;
            const active = !failed && stepItem.stage === stage;
            const error = failed && index === activeIndex;

            return (
              <div
                key={stepItem.stage}
                className={`generation-progress-step ${
                  complete ? "complete" : ""
                } ${active ? "active" : ""} ${error ? "error" : ""}`}
              >
                <span className="generation-progress-icon">
                  {complete ? (
                    "✓"
                  ) : error ? (
                    "!"
                  ) : active ? (
                    <i aria-hidden="true" />
                  ) : (
                    ""
                  )}
                </span>
                <span>{stepItem.label}</span>
              </div>
            );
          })}
        </div>

        {!failed && type === "video" && (
          <p className="generation-progress-footer">
            Keep this page open. Your finished video will be saved to your Library automatically.
          </p>
        )}
      </div>
    </div>
  );
}
