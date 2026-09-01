import React, { useEffect, useMemo, useRef, useState } from "react";
import "./GenerationProgress.css";

const STEP_MAP = {
  videoV2: [
    { stage: "queued", label: "Request prepared" },
    { stage: "building_prompt", label: "Storyboard compiled for video" },
    { stage: "submitting_video", label: "Generation submitted" },
    { stage: "rendering_video", label: "Video generated" },
    { stage: "processing_video", label: "Finished render processed" },
    { stage: "adding_voiceover", label: "AI narration added", voiceModes: ["voiceover"] },
    { stage: "adding_music", label: "Background music mixed", musicOnly: true },
    { stage: "finalizing", label: "ADGen finishing applied" },
    { stage: "uploading_video", label: "Finished ad uploaded" },
    { stage: "saving_library", label: "Saved to Library" },
    { stage: "succeeded", label: "Full Video Ad complete" },
  ],
  videoV2Quick: [
    { stage: "queued", label: "Request prepared" },
    { stage: "loading_brand_kit", label: "Brand context applied" },
    { stage: "building_prompt", label: "Video direction built" },
    { stage: "submitting_video", label: "Generation submitted" },
    { stage: "rendering_video", label: "Video generated" },
    { stage: "processing_video", label: "Finished render processed" },
    { stage: "adding_voiceover", label: "AI narration added", voiceModes: ["voiceover"] },
    { stage: "adding_music", label: "Background music mixed", musicOnly: true },
    { stage: "finalizing", label: "Selected finishing applied" },
    { stage: "uploading_video", label: "Video uploaded" },
    { stage: "saving_library", label: "Saved to Library" },
    { stage: "succeeded", label: "Video complete" },
  ],
  video: [
    { stage: "queued", label: "Request prepared" },
    { stage: "loading_brand_kit", label: "Active Brand applied" },
    { stage: "building_prompt", label: "Creative direction built" },
    { stage: "submitting_video", label: "Request sent" },
    { stage: "rendering_video", label: "Video rendered" },
    { stage: "processing_video", label: "Base video processed" },
    { stage: "generating_voiceover", label: "Voiceover generated", voiceModes: ["voiceover"] },
    { stage: "mixing_voiceover", label: "Voiceover added", voiceModes: ["voiceover"] },
    { stage: "generating_dialogue", label: "Dialogue prepared", voiceModes: ["character_dialogue"] },
    { stage: "preparing_speaking_scene", label: "Speaking scene prepared", voiceModes: ["character_dialogue"] },
    { stage: "applying_dialogue", label: "In-scene dialogue synchronized", voiceModes: ["character_dialogue"] },
    { stage: "mixing_dialogue", label: "Dialogue added", voiceModes: ["character_dialogue"] },
    { stage: "generating_audio", label: "Ambient effects generated", musicOnly: true },
    { stage: "mixing_audio", label: "Ambient effects mixed", musicOnly: true },
    { stage: "normalizing_duration", label: "Duration verified" },
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
  videoV2: {
    kicker: "FULL VIDEO AD", defaultTitle: "Creating your Full Video Ad",
    failedTitle: "We couldn't finish this video", defaultMessage: "Preparing your Full Video Ad.",
  },
  videoV2Quick: {
    kicker: "QUICK CLIP", defaultTitle: "Creating your Quick Clip",
    failedTitle: "We couldn't finish this video", defaultMessage: "Preparing your Quick Clip.",
  },
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
  videoV2: {
    queued: "Preparing your request",
    building_prompt: "Preparing your creative direction",
    submitting_video: "Submitting your video",
    rendering_video: "Generating your advertisement",
    processing_video: "Processing your video",
    adding_voiceover: "Adding AI narration",
    adding_music: "Adding background music",
    finalizing: "Applying finishing touches",
    uploading_video: "Uploading your finished ad",
    saving_library: "Saving to your Library",
    succeeded: "Your Full Video Ad is ready",
  },
  videoV2Quick: {
    queued: "Preparing your request",
    loading_brand_kit: "Applying your brand",
    building_prompt: "Preparing creative direction",
    submitting_video: "Submitting your video",
    rendering_video: "Generating your video",
    processing_video: "Processing your video",
    adding_voiceover: "Adding AI narration",
    adding_music: "Adding background music",
    finalizing: "Applying finishing touches",
    uploading_video: "Uploading your video",
    saving_library: "Saving to your Library",
    succeeded: "Your Quick Clip is ready",
  },
  video: {
    queued: "Preparing your request",
    loading_brand_kit: "Applying your brand",
    building_prompt: "Building your commercial",
    submitting_video: "Sending your request",
    rendering_video: "Rendering your video",
    processing_video: "Processing your base video",
    generating_voiceover: "Generating your voiceover",
    mixing_voiceover: "Adding your voiceover",
    generating_dialogue: "Preparing character dialogue",
    preparing_speaking_scene: "Preparing the speaking scene",
    applying_dialogue: "Synchronizing dialogue in the scene",
    mixing_dialogue: "Adding synchronized dialogue",
    generating_audio: "Generating ambient sound",
    mixing_audio: "Mixing ambient sound",
    normalizing_duration: "Verifying final duration",
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
  videoV2: {
    queued: ["Preparing your approved storyboard..."],
    building_prompt: ["Combining storyboard, brand direction, creative learnings, motion, and audio direction..."],
    submitting_video: ["Submitting one continuous multi-shot generation..."],
    rendering_video: ["Generating video, motion, and native audio together...", "Preserving product identity and purposeful motion across shots...", "Building natural human performance and synchronized dialogue..."],
    processing_video: ["Preparing and validating the completed video..."],
    adding_voiceover: ["Generating and mixing the selected off-screen narrator..."],
    adding_music: ["Creating campaign-matched instrumental music...", "Mixing it quietly beneath speech and visuals..."],
    finalizing: ["Applying your selected text and CTA finishing...", "Preparing the final ADGen delivery..."],
    uploading_video: ["Uploading your finished Full Video Ad..."],
    saving_library: ["Adding the completed ad to your Library..."],
    succeeded: ["Your finished Full Video Ad is ready."],
  },
  videoV2Quick: {
    queued: ["Preparing your Quick Clip..."],
    loading_brand_kit: ["Applying your active Brand Kit..."],
    building_prompt: ["Expanding your inputs into production-ready creative direction..."],
    submitting_video: ["Submitting your generation..."],
    rendering_video: ["Generating the visual performance and audio...", "Building fluid motion and commercial cinematography...", "Preserving your subject and product details..."],
    processing_video: ["Preparing the completed video..."],
    adding_voiceover: ["Adding the selected off-screen narration..."],
    adding_music: ["Adding subtle campaign-matched background music..."],
    finalizing: ["Applying your selected text and CTA finishing...", "Preparing the final ADGen delivery..."],
    uploading_video: ["Uploading your video..."],
    saving_library: ["Adding the video to your Library..."],
    succeeded: ["Your Quick Clip is ready."],
  },
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
    submitting_video: [
      "Establishing the generation request...",
      "Sending your creative direction to server...",
      "Preparing the render job...",
    ],
    rendering_video: [
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
    mixing_voiceover: [
      "Adding narration to the rendered video...",
      "Synchronizing the voiceover track...",
      "Preparing the narrated video...",
    ],
    generating_dialogue: [
      "Preparing the selected character voice...",
      "Building the dialogue performance...",
      "Matching the script to the speaking window...",
    ],
    preparing_speaking_scene: [
      "Keeping the speaker inside the commercial scene...",
      "Preparing the in-scene speaking moment...",
      "Preserving the original environment and composition...",
    ],
    applying_dialogue: [
      "Synchronizing the on-screen speaker...",
      "Matching the in-scene facial movement to the dialogue...",
      "Keeping the speaking performance aligned...",
    ],
    mixing_dialogue: [
      "Adding the synchronized dialogue track...",
      "Aligning dialogue with the speaking window...",
      "Preparing the spoken video...",
    ],
    generating_audio: [
      "Creating subtle scene ambience...",
      "Generating restrained scene-appropriate effects...",
      "Building a cohesive ambient track...",
    ],
    mixing_audio: [
      "Balancing ambience and sound effects...",
      "Keeping dialogue or narration clear...",
      "Preparing the final soundtrack...",
    ],
    normalizing_duration: [
      "Locking the finished video to the selected duration...",
      "Checking final video and audio length...",
      "Verifying the delivered runtime...",
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

const CHARACTER_DIALOGUE_VISUAL_CEILINGS = {
  queued: 5,
  loading_brand_kit: 8,
  building_prompt: 12,
  submitting_video: 15,
  rendering_video: 45,
  processing_video: 48,
  generating_dialogue: 55,
  preparing_speaking_scene: 65,
  applying_dialogue: 76,
  mixing_dialogue: 82,
  generating_audio: 88,
  mixing_audio: 92,
  normalizing_duration: 95,
  uploading_video: 97,
  saving_library: 99,
  succeeded: 100,
};

const CHARACTER_DIALOGUE_VISUAL_FLOORS = {
  queued: 1,
  loading_brand_kit: 5,
  building_prompt: 8,
  submitting_video: 12,
  rendering_video: 15,
  processing_video: 45,
  generating_dialogue: 48,
  preparing_speaking_scene: 55,
  applying_dialogue: 65,
  mixing_dialogue: 76,
  generating_audio: 82,
  mixing_audio: 88,
  normalizing_duration: 92,
  uploading_video: 95,
  saving_library: 97,
  succeeded: 99,
};

const VIDEO_V2_VISUAL_FLOORS = {
  queued: 3, loading_brand_kit: 6, building_prompt: 8, submitting_video: 14,
  rendering_video: 18, processing_video: 74, adding_voiceover: 80,
  adding_music: 84, finalizing: 89, uploading_video: 93, saving_library: 98, succeeded: 100,
};

const VIDEO_V2_VISUAL_CEILINGS = {
  queued: 8, loading_brand_kit: 10, building_prompt: 14, submitting_video: 18,
  rendering_video: 73, processing_video: 79, adding_voiceover: 84,
  adding_music: 89, finalizing: 93, uploading_video: 98, saving_library: 99, succeeded: 100,
};

const VISUAL_CEILINGS = {
  videoV2: {
    queued: 8,
    loading_brand_kit: 10,
    building_prompt: 14,
    submitting_video: 18,
    rendering_video: 72,
    processing_video: 78,
    adding_voiceover: 86,
    finalizing: 92,
    uploading_video: 97,
    saving_library: 99,
    succeeded: 100,
  },
  video: {
    queued: 11,
    loading_brand_kit: 21,
    building_prompt: 31,
    submitting_video: 47,
    rendering_video: 66,
    processing_video: 70,
    generating_voiceover: 78,
    mixing_voiceover: 84,
    generating_dialogue: 76,
    preparing_speaking_scene: 79,
    applying_dialogue: 83,
    mixing_dialogue: 85,
    generating_audio: 89,
    mixing_audio: 93,
    normalizing_duration: 95,
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
  voiceMode,
  musicAndEffects = false,
  failed = false,
  errorMessage,
  onClose,
  expectedMaxSeconds,
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [helperIndex, setHelperIndex] = useState(0);
  const [failureDismissed, setFailureDismissed] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(
    Math.max(0, Math.min(100, Number(percent) || 0))
  );
  const startedAtRef = useRef(null);

  const definition = STEP_MAP[type] || STEP_MAP.video;
  const copy = COPY_MAP[type] || COPY_MAP.video;
  const resolvedVoiceMode =
    voiceMode || (voiceoverEnabled ? "voiceover" : "none");

  const steps = useMemo(
    () =>
      definition.filter((step) => {
        if (step.voiceModes && !step.voiceModes.includes(resolvedVoiceMode)) {
          return false;
        }
        if (step.musicOnly && !musicAndEffects) {
          return false;
        }
        return true;
      }),
    [definition, resolvedVoiceMode, musicAndEffects]
  );

  const backendPercent = Math.max(0, Math.min(100, Number(percent) || 0));

  const isVideoV2Progress = type === "videoV2" || type === "videoV2Quick";
  const videoV2Floor = isVideoV2Progress
    ? VIDEO_V2_VISUAL_FLOORS[stage]
    : undefined;
  const videoV2Ceiling = isVideoV2Progress
    ? VIDEO_V2_VISUAL_CEILINGS[stage]
    : undefined;
  const helperMessages =
    HELPER_MESSAGES[type]?.[stage] ||
    HELPER_MESSAGES[type]?.queued ||
    ["Your request is still processing..."];

  const isCharacterDialogueProgress =
    type === "video" && resolvedVoiceMode === "character_dialogue";

  const stageVisualCeiling = isVideoV2Progress
    ? videoV2Ceiling
    : isCharacterDialogueProgress
      ? CHARACTER_DIALOGUE_VISUAL_CEILINGS[stage]
      : VISUAL_CEILINGS[type]?.[stage];

  const stageVisualFloor = isVideoV2Progress
    ? videoV2Floor
    : isCharacterDialogueProgress
      ? CHARACTER_DIALOGUE_VISUAL_FLOORS[stage]
      : undefined;

  const visualCeiling = isVideoV2Progress
    ? stageVisualCeiling ?? backendPercent
    : isCharacterDialogueProgress
      ? stageVisualCeiling ?? backendPercent
      : Math.max(
          backendPercent,
          stageVisualCeiling ?? backendPercent
        );

  // For Character Dialogue, backend percentages are treated only as a signal
  // that the stage changed. The visible percentage is animated within the
  // current stage's own floor/ceiling range so it never jumps from one backend
  // percentage to another.
  const effectiveBackendPercent = isVideoV2Progress
    ? Math.max(
        stageVisualFloor ?? 0,
        Math.min(backendPercent, stageVisualCeiling ?? backendPercent)
      )
    : isCharacterDialogueProgress
      ? stageVisualFloor ?? Math.min(
          backendPercent,
          stageVisualCeiling ?? backendPercent
        )
      : backendPercent;

  useEffect(() => {
    if (!open || !failed) setFailureDismissed(false);
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
  }, [open, failed]);

  useEffect(() => {
    setHelperIndex(0);
  }, [stage, type]);

  useEffect(() => {
    if (!open || !isVideoV2Progress) return;

    const floor = VIDEO_V2_VISUAL_FLOORS[stage];
    if (typeof floor !== "number") return;

    setDisplayPercent((current) => Math.max(current, floor));
  }, [open, stage, isVideoV2Progress]);

  useEffect(() => {
    if (!open || !isCharacterDialogueProgress) return;

    const floor = CHARACTER_DIALOGUE_VISUAL_FLOORS[stage];
    if (typeof floor !== "number") return;

    setDisplayPercent((current) => {
      // Never move backward, but do not jump to the stage ceiling.
      return Math.max(current, floor);
    });
  }, [open, stage, isCharacterDialogueProgress]);

  useEffect(() => {
    if (!open || failed || helperMessages.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setHelperIndex((current) => (current + 1) % helperMessages.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [open, failed, stage, type, helperMessages.length]);

  useEffect(() => {
    if (!open) return undefined;

    setDisplayPercent((current) =>
      Math.max(current, effectiveBackendPercent)
    );

    if (
      failed ||
      stage === "succeeded" ||
      effectiveBackendPercent >= 100
    ) {
      setDisplayPercent(effectiveBackendPercent);
      return undefined;
    }

    const animationInterval =
      isVideoV2Progress
        ? stage === "rendering_video"
          ? 3200
          : stage === "processing_video"
            ? 1800
            : stage === "adding_voiceover"
              ? 2200
              : stage === "adding_music"
                ? 2100
                : stage === "finalizing"
                  ? 1800
                : ["uploading_video", "saving_library"].includes(stage)
                  ? 1400
                  : 1800
        : isCharacterDialogueProgress
        ? stage === "rendering_video"
          ? 4200
          : stage === "processing_video"
            ? 1800
            : ["generating_dialogue", "preparing_speaking_scene"].includes(stage)
              ? 2200
              : ["applying_dialogue", "mixing_dialogue"].includes(stage)
                ? 2600
                : ["generating_audio", "mixing_audio"].includes(stage)
                  ? 2200
                  : ["normalizing_duration", "uploading_video", "saving_library"].includes(stage)
                    ? 1600
                    : 2000
        : type === "video" && stage === "rendering_video"
          ? 6500
          : 2400;

    const timer = window.setInterval(() => {
      setDisplayPercent((current) => {
        const baseline = Math.max(current, effectiveBackendPercent);
        if (baseline >= visualCeiling) return baseline;

        if (isVideoV2Progress) {
          const remaining = visualCeiling - baseline;

          // Smoothly advance inside the current backend-confirmed stage only.
          // Never visually complete a stage before the backend advances.
          let increment = 0.45;
          if (stage === "rendering_video") increment = 0.35;
          else if (stage === "adding_voiceover") increment = 0.4;
          else if (stage === "adding_music") increment = 0.38;
          else if (stage === "processing_video") increment = 0.5;
          else if (stage === "finalizing") increment = 0.45;
          else if (["uploading_video", "saving_library"].includes(stage)) increment = 0.35;

          if (remaining <= 1) increment = 0.08;
          else if (remaining <= 2) increment = 0.12;
          else if (remaining <= 4) increment = 0.2;

          return Math.min(
            Math.max(stageVisualFloor ?? 0, visualCeiling - 0.1),
            baseline + increment
          );
        }

        if (isCharacterDialogueProgress) {
          const remaining = visualCeiling - baseline;

          // Smooth every Character Dialogue stage rather than jumping to the
          // backend-reported percentage. Slow progressively near each ceiling.
          let increment = 1;
          if (remaining <= 2) increment = 0.18;
          else if (remaining <= 4) increment = 0.32;
          else if (remaining <= 7) increment = 0.55;
          else if (remaining <= 12) increment = 0.8;

          // Do not visually "complete" an active stage. Leave a small amount
          // of headroom until the backend actually advances to the next stage.
          return Math.min(
            Math.max(stageVisualFloor ?? 0, visualCeiling - 0.1),
            baseline + increment
          );
        }

        return Math.min(visualCeiling, baseline + 1);
      });
    }, animationInterval);

    return () => window.clearInterval(timer);
  }, [
    open,
    failed,
    stage,
    type,
    backendPercent,
    effectiveBackendPercent,
    visualCeiling,
    stageVisualFloor,
    resolvedVoiceMode,
    isCharacterDialogueProgress,
    isVideoV2Progress,
  ]);

  if (!open || (failed && failureDismissed)) return null;

  const order = steps.reduce((out, stepItem, index) => {
    out[stepItem.stage] = index;
    return out;
  }, {});

  const visiblePercent =
    isVideoV2Progress && typeof videoV2Ceiling === "number"
      ? Math.min(displayPercent, stage === "succeeded" ? 100 : videoV2Ceiling)
      : displayPercent;

  const activeIndex =
    stage === "failed" ? steps.length - 1 : order[stage] ?? 0;

  const title = failed
    ? copy.failedTitle
    : TITLE_MAP[type]?.[stage] || copy.defaultTitle;

  const isVideoRendering =
    ["videoV2", "videoV2Quick"].includes(type) &&
    ["submitting_video", "rendering_video"].includes(stage);

  let reassurance = null;

  if (isVideoRendering) {
    const videoLabel = type === "videoV2Quick" ? "Quick Clips" : "Full Video Ads";
    if (elapsedSeconds >= 600) {
      reassurance =
        "This render is taking longer than the usual 8–10 minute window, but it may still complete normally. Keep this page open while ADGen continues checking it.";
    } else if (elapsedSeconds >= 300) {
      reassurance =
        `Your video is still rendering normally. ${videoLabel} can take up to 8–10 minutes depending on scene complexity and generation demand.`;
    } else {
      reassurance =
        `${videoLabel} can take up to 8–10 minutes for a finished result. The percentage is an estimate based on the backend-confirmed processing stage.`;
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
            <strong>{isVideoV2Progress ? "Est. " : ""}{Math.round(visiblePercent)}%</strong>
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

        {failed && (
          <div className="generation-progress-failure" role="alert">
            <div className="generation-progress-failure-icon" aria-hidden="true">!</div>
            <div>
              <strong>Something interrupted this generation.</strong>
              <p>{errorMessage || message || "ADGen couldn't complete this request. Close this message and try again."}</p>
              <small>You can safely close this window and make another attempt.</small>
            </div>
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
          aria-label={`${isVideoV2Progress ? "Estimated " : ""}${Math.round(visiblePercent)} percent complete`}
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(visiblePercent)}
        >
          <span style={{ width: `${visiblePercent}%` }}>
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

        {failed ? (
          <div className="generation-progress-failure-actions">
            <button
              type="button"
              className="generation-progress-close"
              onClick={() => {
                setFailureDismissed(true);
                if (onClose) onClose();
              }}
            >
              Close & Try Again
            </button>
          </div>
        ) : (
          ["video", "videoV2", "videoV2Quick"].includes(type) && (
            <p className="generation-progress-footer">
              Keep this page open. After the base render completes, any selected finishing is applied before the finished video is saved to your Library automatically.
            </p>
          )
        )}
      </div>
    </div>
  );
}
