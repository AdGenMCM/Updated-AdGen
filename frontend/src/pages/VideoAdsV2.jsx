// ADGEN_USAGE_REFRESH_ESLINT_FIX_2026_08_31
import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../firebaseConfig";
import BrandKitSelector from "../components/BrandKitSelector";
import PerformanceIntelligencePreview from "../components/PerformanceIntelligencePreview";
import GenerationFeedback from "../components/GenerationFeedback";
import GenerationProgress from "../components/GenerationProgress";
import InfoTip from "../components/ui/InfoTip";
import "./VideoAdsV2.css";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css"; // ✅ reuse AdGenerator overlay + spinner styles
import StepSection from "../components/ui/StepSection";
import FeatureTutorial from "../components/FeatureTutorial";
import CreditPackModal from "../components/billing/CreditPackModal";
import { useWorkspace } from "../context/WorkspaceContext";
import { Crown, ShoppingCart } from "lucide-react";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

const LIMITS = {
  companyName: 100,
  subjectName: 120,
  audience: 260,
  description: 1400,
  offer: 180,
  callToAction: 60,
  tone: 60,
  creativeDirection: 1200,
  scenePrompt: 1200,
  dialogue: 140,
  speakingAction: 320,
  performanceBeat: 420,
  voiceover: 180,
  caption: 100,
  overlayText: 42,
};

const DURATIONS = [
  { value: 10, credits: 3 },
  { value: 15, credits: 4, recommended: true },
];

const FORMATS = [
  { id: "vertical", label: "Vertical — TikTok / Reels / Shorts (9:16)", ratio: "720:1280", platform: "TikTok / Reels / Shorts" },
  { id: "square", label: "Square — Social Feed (1:1)", ratio: "1080:1080", platform: "Social Feed" },
  { id: "landscape", label: "Landscape — YouTube / Web (16:9)", ratio: "1280:720", platform: "YouTube / Web" },
];

const STYLES = ["UGC", "Lifestyle", "Product Showcase", "Cinematic / Premium", "Minimal"];

const CAMPAIGN_TYPES = [
  { id: "product", label: "Product", help: "Physical goods, ecommerce, packaged products, apparel, beauty, food products, and similar offers." },
  { id: "service", label: "Service", help: "Local services, professional services, consultants, agencies, contractors, and appointments." },
  { id: "software", label: "App / Software", help: "SaaS, mobile apps, digital tools, platforms, and software workflows." },
  { id: "real_estate", label: "Real Estate / Property", help: "Listings, developments, rentals, venues, and property-focused campaigns." },
  { id: "restaurant", label: "Restaurant / Food Business", help: "Restaurants, cafes, hospitality, menu items, and dining experiences." },
  { id: "event", label: "Event", help: "Conferences, concerts, openings, launches, classes, and scheduled experiences." },
  { id: "promotion", label: "Offer / Promotion", help: "Sales, limited-time offers, lead magnets, discounts, and promotional campaigns." },
  { id: "brand", label: "Brand / Awareness", help: "Brand storytelling, identity, lifestyle, mission, and awareness campaigns." },
  { id: "other", label: "Other", help: "Anything that does not fit the categories above. ADGen will infer the most useful story structure." },
];

const CHARACTER_VOICES = {
  female: [
    { id: "natural_female", label: "Natural" },
    { id: "warm_female", label: "Warm" },
    { id: "confident_female", label: "Confident" },
  ],
  male: [
    { id: "natural_male", label: "Natural" },
    { id: "warm_male", label: "Warm" },
    { id: "confident_male", label: "Confident" },
  ],
};

const NARRATOR_VOICES = ["Leslie", "Maya", "Mark", "Rachel", "Benjamin", "Ella"];

async function safeJson(res) {
  try { return await res.json(); } catch { return {}; }
}

function errorMessage(data, fallback) {
  const detail = data?.detail ?? data?.error ?? data?.message;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && detail.message) return detail.message;
  return fallback;
}

function CharacterCount({ value, max }) {
  const length = String(value || "").length;
  return (
    <small className={`videoV2Count ${length >= max * 0.9 ? "near" : ""}`}>
      {length}/{max}
    </small>
  );
}

function ratioNumber(ratio) {
  const [w, h] = String(ratio || "720:1280").split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 9 / 16;
}

async function cropImageFileToRatio(file, ratio) {
  if (!file) return file;

  const targetRatio = ratioNumber(ratio);
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("We couldn't prepare that image. Please try another image."));
      img.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("We couldn't prepare that image. Please try another image.");
    }

    // Match the selected video ratio without cutting into the uploaded reference.
    // The entire source remains visible with a small safety margin.
    const maxLongEdge = 1536;
    let outW;
    let outH;
    if (targetRatio >= 1) {
      outW = maxLongEdge;
      outH = Math.round(maxLongEdge / targetRatio);
    } else {
      outH = maxLongEdge;
      outW = Math.round(maxLongEdge * targetRatio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("We couldn't prepare that image. Please try another image.");
    }

    // Fill unused space with a soft extension of the same image.
    // This avoids hard bars while never stretching or cropping the important foreground.
    const backgroundScale = Math.max(outW / sourceWidth, outH / sourceHeight);
    const bgW = sourceWidth * backgroundScale;
    const bgH = sourceHeight * backgroundScale;
    const bgX = (outW - bgW) / 2;
    const bgY = (outH - bgH) / 2;

    ctx.save();
    ctx.filter = "blur(30px)";
    ctx.globalAlpha = 0.82;
    ctx.drawImage(image, bgX - 30, bgY - 30, bgW + 60, bgH + 60);
    ctx.restore();

    // Preserve 100% of the original reference inside a 6% safety margin.
    const safety = 0.94;
    const foregroundScale = Math.min(
      (outW * safety) / sourceWidth,
      (outH * safety) / sourceHeight
    );
    const fgW = sourceWidth * foregroundScale;
    const fgH = sourceHeight * foregroundScale;
    const fgX = (outW - fgW) / 2;
    const fgY = (outH - fgH) / 2;

    ctx.drawImage(image, fgX, fgY, fgW, fgH);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.94)
    );
    if (!blob) {
      throw new Error("We couldn't prepare that image. Please try another image.");
    }

    const base = String(file.name || "reference").replace(/\.[^.]+$/, "");
    return new File(
      [blob],
      `${base}-${ratio.replace(":", "x")}-safe.jpg`,
      { type: "image/jpeg" }
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


function hasCharacterDescription(...values) {
  const text = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text.trim()) return false;

  const characterTerms = [
    "woman", "man", "female", "male", "person", "spokesperson", "creator",
    "influencer", "customer", "employee", "agent", "host", "founder",
    "mother", "father", "mom", "dad", "girl", "boy"
  ];

  const appearanceTerms = [
    "hair", "wearing", "dressed", "outfit", "shirt", "blouse", "jacket",
    "dress", "suit", "casual", "professional", "athletic", "young", "older",
    "20s", "30s", "40s", "50s", "beard", "glasses", "brown hair",
    "black hair", "blonde", "brunette"
  ];

  const hasCharacter = characterTerms.some((term) => text.includes(term));
  const hasAppearance = appearanceTerms.some((term) => text.includes(term));

  return hasCharacter && hasAppearance;
}

export default function VideoAdsV2() {
  const { refreshWorkspace, videoUsage: workspaceVideoUsage } = useWorkspace() || {};
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  const [mode, setMode] = useState(null);
  const [me, setMe] = useState({ tier: null, isAdmin: false });
  const [videoLimitReached, setVideoLimitReached] = useState(false);
  const [creditPacksOpen, setCreditPacksOpen] = useState(false);
  const [videoUsageUsed, setVideoUsageUsed] = useState(null);
  const [videoUsageCap, setVideoUsageCap] = useState(null);

  useEffect(() => {
    if (!workspaceVideoUsage) return;

    const used = Number(workspaceVideoUsage?.used ?? 0);
    const rawCap = workspaceVideoUsage?.cap ?? null;
    const cap =
      rawCap === null || rawCap === undefined || rawCap === ""
        ? null
        : Number(rawCap);
    const purchased = Math.max(
      0,
      Number(workspaceVideoUsage?.purchasedRemaining ?? 0)
    );
    const hasFiniteCap = Number.isFinite(cap) && cap >= 0;

    setVideoUsageUsed(Number.isFinite(used) ? used : null);
    setVideoUsageCap(hasFiniteCap ? cap : null);
    setVideoLimitReached(
      Boolean(
        hasFiniteCap &&
          Number.isFinite(used) &&
          used >= cap &&
          purchased <= 0
      )
    );
  }, [workspaceVideoUsage]);

  const [duration, setDuration] = useState(15);
  const [formatId, setFormatId] = useState("vertical");
  const [companyName, setCompanyName] = useState("");
  const [campaignType, setCampaignType] = useState("product");
  const [subjectName, setSubjectName] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [goal, setGoal] = useState("conversions");
  const [visualStyle, setVisualStyle] = useState("UGC");
  const [tone, setTone] = useState("confident");
  const [callToAction, setCallToAction] = useState("Shop Now");
  const [creativeDirection, setCreativeDirection] = useState("");

  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const [usePerformanceIntelligence, setUsePerformanceIntelligence] = useState(false);

  const [voiceMode, setVoiceMode] = useState("voiceover");
  const [presetVoice, setPresetVoice] = useState("Leslie");
  const [characterGender, setCharacterGender] = useState("female");
  const [characterVoice, setCharacterVoice] = useState("natural_female");

  const [musicAndEffects, setMusicAndEffects] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [textOverlays, setTextOverlays] = useState(false);
  const [endCard, setEndCard] = useState(true);

  const [referenceImage, setReferenceImage] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState(null);
  const fileRef = useRef(null);

  const [storyboard, setStoryboard] = useState(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [characterPromptWarning, setCharacterPromptWarning] = useState(false);
  const creativeDirectionRef = useRef(null);

  const selectedFormat = useMemo(
    () => FORMATS.find((item) => item.id === formatId) || FORMATS[0],
    [formatId]
  );


  const fullVideoBrandDefaults = useMemo(() => {
    if (!brandKit) return {};

    const platformRaw = String(brandKit.preferredPlatform || "").toLowerCase();
    const ratioRaw = String(brandKit.aspectRatioPreference || "");

    let mappedFormatId = "";
    if (["1024x1792", "720:1280", "1080:1920", "9:16"].includes(ratioRaw)) {
      mappedFormatId = "vertical";
    } else if (["1024x1024", "1080:1080", "1:1"].includes(ratioRaw)) {
      mappedFormatId = "square";
    } else if (["1792x1024", "1280:720", "1920:1080", "16:9"].includes(ratioRaw)) {
      mappedFormatId = "landscape";
    } else if (platformRaw === "tiktok" || platformRaw === "pinterest") {
      mappedFormatId = "vertical";
    } else if (
      platformRaw === "meta" ||
      platformRaw === "instagram" ||
      platformRaw === "facebook"
    ) {
      mappedFormatId = "square";
    } else if (
      platformRaw === "google" ||
      platformRaw === "youtube" ||
      platformRaw === "linkedin"
    ) {
      mappedFormatId = "landscape";
    }

    const styleMap = {
      Premium: "Cinematic / Premium",
      Minimal: "Minimal",
      Bold: "Product Showcase",
      Lifestyle: "Lifestyle",
      UGC: "UGC",
      Luxury: "Cinematic / Premium",
      "Studio Product": "Product Showcase",
      Photorealistic: "Product Showcase",
      "Dark & Cinematic": "Cinematic / Premium",
      "Bright & Clean": "Minimal",
    };

    return {
      companyName: brandKit.brandName || "",
      audience: brandKit.targetAudience || "",
      tone: brandKit.voice || brandKit.brandPersonality || "",
      offer: brandKit.offerStyle || "",
      callToAction: brandKit.preferredCta || "",
      formatId: mappedFormatId,
      visualStyle: styleMap[brandKit.imageStyle] || "",
    };
  }, [brandKit]);

  useEffect(() => {
    if (!useBrandKit || !brandKit) return;

    if (fullVideoBrandDefaults.companyName) {
      setCompanyName(fullVideoBrandDefaults.companyName);
    }
    if (fullVideoBrandDefaults.audience) {
      setAudience(fullVideoBrandDefaults.audience);
    }
    if (fullVideoBrandDefaults.tone) {
      setTone(fullVideoBrandDefaults.tone);
    }
    if (fullVideoBrandDefaults.offer) {
      setOffer(fullVideoBrandDefaults.offer);
    }
    if (fullVideoBrandDefaults.callToAction) {
      setCallToAction(fullVideoBrandDefaults.callToAction);
    }
    if (fullVideoBrandDefaults.formatId) {
      setFormatId(fullVideoBrandDefaults.formatId);
      setReferenceImageUrl(null);
    }
    if (fullVideoBrandDefaults.visualStyle) {
      setVisualStyle(fullVideoBrandDefaults.visualStyle);
    }

    invalidateStoryboard();
    // Apply only when the selected Brand Kit or Brand Kit toggle changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBrandKit, brandKit, fullVideoBrandDefaults]);

  const canUsePerformanceIntelligence = useMemo(() => {
    if (me.isAdmin) return true;
    const tier = String(me.tier || "").toLowerCase();
    return tier === "pro_monthly" || tier === "business_monthly";
  }, [me]);

  const credits = useMemo(
    () => DURATIONS.find((item) => item.value === duration)?.credits || 5,
    [duration]
  );

  const characterVoiceOptions = CHARACTER_VOICES[characterGender] || CHARACTER_VOICES.female;

  useEffect(() => {
    if (!characterVoiceOptions.some((voice) => voice.id === characterVoice)) {
      setCharacterVoice(characterVoiceOptions[0].id);
    }
  }, [characterGender, characterVoice, characterVoiceOptions]);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const token = await user.getIdToken(true);
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (res.ok) setMe({ tier: data.tier || null, isAdmin: !!data.isAdmin });
      } catch {}
    };
    load();
  }, []);

  useEffect(() => () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
  }, [referencePreview]);

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Please log in first.");
    return user.getIdToken(true);
  };

  const invalidateStoryboard = () => {
    setStoryboard(null);
    setCharacterPromptWarning(false);
  };

  const chooseReference = (file) => {
    setReferenceImage(file || null);
    setReferenceImageUrl(null);
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferencePreview(file ? URL.createObjectURL(file) : null);
    invalidateStoryboard();
  };

  const uploadReferenceIfNeeded = async () => {
    if (referenceImageUrl) return referenceImageUrl;
    if (!referenceImage) return null;
    const token = await getToken();
    const body = new FormData();
    const preparedImage = await cropImageFileToRatio(referenceImage, selectedFormat.ratio);
    body.append("files", preparedImage);
    const res = await fetch(`${API_BASE}/video/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const data = await safeJson(res);
    if (!res.ok || !data?.urls?.[0]) {
      throw new Error(errorMessage(data, "Reference image upload failed."));
    }
    setReferenceImageUrl(data.urls[0]);
    return data.urls[0];
  };

  const buildBrief = (imageUrl = referenceImageUrl) => ({
    companyName: companyName.trim() || null,
    campaignType,
    subjectName: subjectName.trim(),
    description: description.trim(),
    audience: audience.trim() || null,
    offer: offer.trim() || null,
    goal,
    platform: selectedFormat.platform,
    visualStyle,
    tone,
    callToAction: callToAction.trim() || null,
    creativeDirection: creativeDirection.trim() || null,
    duration,
    ratio: selectedFormat.ratio,
    referenceImageUrl: imageUrl || null,
    useBrandKit,
    brandKitId,
    usePerformanceIntelligence: usePerformanceIntelligence && canUsePerformanceIntelligence,
    voiceMode,
    presetVoice,
    characterGender,
    characterVoice,
    musicAndEffects,
    captions: voiceMode !== "none" && captions,
    textOverlays: voiceMode === "none" && textOverlays,
    endCard,
  });

  const createStoryboard = async () => {
    if (!subjectName.trim() || !description.trim()) {
      setError("Add what you are advertising and a campaign description first.");
      return;
    }

    if (
      voiceMode === "character_dialogue" &&
      !hasCharacterDescription(description, creativeDirection)
    ) {
      setError(null);
      setCharacterPromptWarning(true);
      window.setTimeout(() => {
        creativeDirectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        creativeDirectionRef.current?.focus();
      }, 50);
      return;
    }

    setCharacterPromptWarning(false);
    setStoryLoading(true);
    setError(null);
    setJob(null);
    setJobId(null);
    try {
      const token = await getToken();
      const imageUrl = await uploadReferenceIfNeeded();
      const res = await fetch(`${API_BASE}/video-v2/storyboard`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildBrief(imageUrl)),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(errorMessage(data, "ADGen could not build the storyboard."));
      setStoryboard(data);
    } catch (err) {
      setError(err.message || "ADGen could not build the storyboard.");
    } finally {
      setStoryLoading(false);
    }
  };

  const updateScene = (sceneId, field, value) => {
    setStoryboard((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, [field]: value } : scene
      ),
    }));
  };

  const startFullAd = async () => {
    if (!storyboard) return;

    // Show feedback immediately. The server may need several seconds to create
    // provider tasks, but the user should never see an unresponsive button.
    setGenerating(true);
    setError(null);
    setJobId(null);
    setJob({
      status: "starting",
      phase: "queued",
      progressPercent: 3,
      progressMessage: "Preparing your Full Video Ad.",
    });

    try {
      const token = await getToken();
      const imageUrl = await uploadReferenceIfNeeded();
      const preparedStoryboard = voiceMode === "voiceover"
        ? {
            ...storyboard,
            voiceoverScript:
              storyboard.scenes
                .map((scene) => String(scene.voiceover || "").trim())
                .filter(Boolean)
                .join(" ") || storyboard.voiceoverScript || null,
          }
        : storyboard;

      const res = await fetch(`${API_BASE}/video-v2/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildBrief(imageUrl), storyboard: preparedStoryboard }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(errorMessage(data, "ADGen could not start the Full Video Ad."));
      setJobId(data.jobId);
      setJob({
        status: data.status,
        phase: "rendering_video",
        progressPercent: 18,
        progressMessage: "Generating your complete multi-shot ad.",
      });
    } catch (err) {
      const safeMessage =
        err.message || "ADGen could not start the Full Video Ad. Please try again.";
      setError(safeMessage);
      setGenerating(false);
      setJob((current) => ({
        ...(current || {}),
        status: "failed",
        phase: "failed",
        progressPercent: 100,
        progressMessage: safeMessage,
        error: safeMessage,
      }));
    }
  };

  useEffect(() => {
    if (!jobId) return;
    let canceled = false;
    let timer;

    const poll = async () => {
      try {
        const token = await getToken();
        let res = await fetch(`${API_BASE}/video-v2/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        let data = await safeJson(res);
        if (!res.ok) throw new Error(errorMessage(data, "Could not check Full Video Ad status."));


        if (canceled) return;
        setJob(data);
        if (data.status === "succeeded") {
          setGenerating(false);
          setFeedbackOpen(true);
          // Success is terminal: the backend has finalized the video-credit deduction.
          void refreshWorkspaceRef.current?.();
          return;
        }
        if (data.status === "failed" || data.status === "canceled") {
          setGenerating(false);
          setError(data.error || "Full Video Ad generation failed.");
          // Terminal failure/cancel reflects the finalized rollback/refund state.
          void refreshWorkspaceRef.current?.();
          return;
        }
        timer = setTimeout(poll, 1800);
      } catch (err) {
        if (!canceled) {
          setError(err.message || "Could not check Full Video Ad status.");
          timer = setTimeout(poll, 3000);
        }
      }
    };

    poll();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);


  const openDownload = () => {
    if (job?.finalVideoUrl) {
      window.open(job.finalVideoUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (mode === null) {
    return (
      <div className="videoV2 videoV2Landing">
        <header className="videoV2LandingHero">
          <span className="videoV2Eyebrow">VIDEO ADS</span>
          <h1>What do you want to create?</h1>
          <p>Choose the workflow that matches what you need. You can switch modes at any time.</p>
        </header>

        <div className="videoV2ChoiceGrid">
          <button className="videoV2ChoiceCard flagship" onClick={() => setMode("full")}>
            <div className="videoV2ChoiceTop">
              <span>FLAGSHIP</span>
              <strong>Full Video Ad</strong>
            </div>
            <p>Turn one campaign brief into a complete 10–15 second advertisement with a planned storyboard and distinct scenes.</p>
            <ul>
              <li>Campaign-aware story structure for products, services, software, real estate, restaurants, events, brands, and more</li>
              <li>Optional on-screen dialogue or AI narration</li>
              <li>Product reference, Brand Kit, captions, native sound, and CTA finish</li>
              <li>Review and edit every storyboard shot before generation</li>
            </ul>
            <div className="videoV2ChoiceAction">Create a Full Video Ad <span>→</span></div>
          </button>

          <button className="videoV2ChoiceCard" onClick={() => setMode("quick")}>
            <div className="videoV2ChoiceTop">
              <span>FAST</span>
              <strong>Quick Clip</strong>
            </div>
            <p>Create a fast 6–10 second V2 clip from one creative brief, with an optional reference image plus upgraded character and audio controls.</p>
            <ul>
              <li>One creation flow with an optional reference image</li>
              <li>6s or 10s generation</li>
              <li>Voiceover, Character Dialogue, Brand Kit, and PI controls</li>
              <li>Best when you need one polished clip instead of a full ad</li>
            </ul>
            <div className="videoV2ChoiceAction">Open Quick Clip <span>→</span></div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "quick") {
    return (
      <div className="videoV2QuickShell">
        <div className="videoV2ModeBar">
          <button onClick={() => setMode(null)}>← Choose mode</button>
          <strong>Quick Clip</strong>
          <span>Fast single-clip generation inside Video Ads V2.</span>
        </div>
        <VideoAdsV2Quick />
      </div>
    );
  }

  return (
    <div className="videoV2FullShell">
      <div className="videoV2ModeBar">
        <button onClick={() => setMode(null)}>← Choose mode</button>
        <strong>Full Video Ad</strong>
        <span>Complete multi-scene campaign generation inside Video Ads V2.</span>
      </div>

      <div className="videoV2">
      <GenerationProgress
        open={!!job && (generating || job?.status === "failed")}
        type="videoV2"
        stage={job?.phase || "queued"}
        message={job?.progressMessage}
        percent={job?.progressPercent || 20}
        voiceMode={voiceMode}
        musicAndEffects={musicAndEffects}
        failed={job?.status === "failed"}
        errorMessage={job?.error || error}
        onClose={() => {
          setGenerating(false);
          setJob(null);
          setJobId(null);
          setError(null);
        }}
        expectedMaxSeconds={600}
      />

      <GenerationFeedback
        open={feedbackOpen && !!jobId && !!job?.finalVideoUrl}
        onClose={() => setFeedbackOpen(false)}
        apiBase={API_BASE}
        resourceType="video"
        resourceId={jobId}
        mediaUrl={job?.finalVideoUrl}
        mediaType="video"
        title="Your Full Video Ad is ready"
        question="How was this result?"
      />

      <header className="videoV2Hero compact">
        <div>
          <span className="videoV2Eyebrow">FULL VIDEO AD</span>
          <h1>Build a complete multi-scene ad.</h1>
          <p>ADGen chooses a story structure for the kind of campaign you are making, turns your approved storyboard into one continuous multi-shot generation with native audiovisual performance.</p>
        </div>
      </header>

      {videoLimitReached && (
        <div className="generatorLimitTop">
          <div className="generatorUsageLimitCard generatorUsageLimitCardV2" role="alert">
            <div className="generatorLimitIntro">
              <strong>Video credits used</strong>
              <p className="generatorLimitSummary">
                You've used all available video credits
                {Number.isFinite(videoUsageCap)
                  ? ` (${videoUsageUsed ?? videoUsageCap}/${videoUsageCap})`
                  : ""}.
              </p>
              <p>
                Choose how you want to keep generating. Purchased credits are a one-time add-on and never expire.
              </p>
            </div>

            <div className="generatorLimitChoices">
              <button
                type="button"
                className="generatorLimitChoice generatorLimitChoiceUpgrade"
                onClick={() => window.location.assign("/subscribe?upgrade=1")}
              >
                <span className="generatorLimitChoiceIcon" aria-hidden="true">
                  <Crown size={20} />
                </span>
                <span className="generatorLimitChoiceCopy">
                  <strong>Upgrade your plan</strong>
                  <small>Get more included monthly video credits and additional ADGen features.</small>
                </span>
                <span className="generatorLimitChoiceAction">Upgrade Plan</span>
              </button>

              <span className="generatorLimitOr" aria-hidden="true">OR</span>

              <button
                type="button"
                className="generatorLimitChoice generatorLimitChoiceCredits"
                onClick={() => setCreditPacksOpen(true)}
              >
                <span className="generatorLimitChoiceIcon" aria-hidden="true">
                  <ShoppingCart size={20} />
                </span>
                <span className="generatorLimitChoiceCopy">
                  <strong>Buy more video credits</strong>
                  <small>Add video credits instantly with a one-time purchase.</small>
                </span>
                <span className="generatorLimitChoiceAction">Buy Video Credits</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="videoV2Layout">
        <main className="videoV2Main">
          <section className="videoV2Panel">
            <div className="videoV2SectionHead">
              <span>1</span>
              <div>
                <h2>Campaign Brief</h2>
                <p>Tell ADGen what you are promoting, what kind of campaign it is, and who the ad needs to persuade.</p>
              </div>
            </div>

            <div className="videoV2Grid two">
              <label>
                <span>Company / Brand Name</span>
                <input
                  value={companyName}
                  maxLength={LIMITS.companyName}
                  onChange={(e) => { setCompanyName(e.target.value); invalidateStoryboard(); }}
                  placeholder="Example: Lumière Skincare"
                />
                <CharacterCount value={companyName} max={LIMITS.companyName} />
              </label>

              <label>
                <span>What are you advertising?</span>
                <input
                  value={subjectName}
                  maxLength={LIMITS.subjectName}
                  onChange={(e) => { setSubjectName(e.target.value); invalidateStoryboard(); }}
                  placeholder="Product, service, property, app, event, offer..."
                />
                <CharacterCount value={subjectName} max={LIMITS.subjectName} />
              </label>
            </div>

            <div className="videoV2CampaignType">
              <div className="videoV2SubsectionHead">
                <div>
                  <strong>Campaign Type</strong>
                  <span>ADGen uses this to choose the right storyboard structure and decide how to use your visual reference.</span>
                </div>
              </div>
              <div className="videoV2CampaignTypeGrid">
                {CAMPAIGN_TYPES.map((type) => (
                  <button
                    type="button"
                    key={type.id}
                    className={campaignType === type.id ? "selected" : ""}
                    onClick={() => { setCampaignType(type.id); invalidateStoryboard(); }}
                  >
                    <strong>{type.label}</strong>
                    <span>{type.help}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="videoV2Field">
              <span>
                Campaign / Product Description
                <InfoTip text="Describe the product, problem, benefits, use case, desired action, and anything ADGen should understand before planning the scenes." />
              </span>
              <textarea
                value={description}
                maxLength={LIMITS.description}
                onChange={(e) => { setDescription(e.target.value); invalidateStoryboard(); }}
                placeholder="Describe the product, key benefits, use case, environment, and commercial you want..."
              />
              <CharacterCount value={description} max={LIMITS.description} />
            </label>

            <div className="videoV2Grid two">
              <label>
                <span>Audience</span>
                <input
                  value={audience}
                  maxLength={LIMITS.audience}
                  onChange={(e) => { setAudience(e.target.value); invalidateStoryboard(); }}
                  placeholder="Who should this persuade?"
                />
                <CharacterCount value={audience} max={LIMITS.audience} />
              </label>

              <label>
                <span>Offer</span>
                <input
                  value={offer}
                  maxLength={LIMITS.offer}
                  onChange={(e) => { setOffer(e.target.value); invalidateStoryboard(); }}
                  placeholder="Optional"
                />
                <CharacterCount value={offer} max={LIMITS.offer} />
              </label>

              <label>
                <span>Goal</span>
                <select value={goal} onChange={(e) => { setGoal(e.target.value); invalidateStoryboard(); }}>
                  <option value="conversions">Sales / Conversions</option>
                  <option value="leads">Generate Leads</option>
                  <option value="traffic">Website Traffic</option>
                  <option value="awareness">Brand Awareness</option>
                </select>
              </label>

              <label>
                <span>Call to Action</span>
                <input
                  value={callToAction}
                  maxLength={LIMITS.callToAction}
                  onChange={(e) => { setCallToAction(e.target.value); invalidateStoryboard(); }}
                />
                <CharacterCount value={callToAction} max={LIMITS.callToAction} />
              </label>

              <label>
                <span>Visual Style</span>
                <select value={visualStyle} onChange={(e) => { setVisualStyle(e.target.value); invalidateStoryboard(); }}>
                  {STYLES.map((style) => <option key={style}>{style}</option>)}
                </select>
              </label>

              <label>
                <span>Tone</span>
                <input
                  value={tone}
                  maxLength={LIMITS.tone}
                  onChange={(e) => { setTone(e.target.value); invalidateStoryboard(); }}
                />
                <CharacterCount value={tone} max={LIMITS.tone} />
              </label>

              <label className="videoV2WideField">
                <span>Format</span>
                <select value={formatId} onChange={(e) => { setFormatId(e.target.value); setReferenceImageUrl(null); invalidateStoryboard(); }}>
                  {FORMATS.map((format) => <option value={format.id} key={format.id}>{format.label}</option>)}
                </select>
              </label>
            </div>

            <label className="videoV2Field">
              <span>Extra Creative Direction</span>
              <textarea
                ref={creativeDirectionRef}
                className="short"
                value={creativeDirection}
                maxLength={LIMITS.creativeDirection}
                onChange={(e) => { setCreativeDirection(e.target.value); invalidateStoryboard(); }}
                placeholder="Optional — recurring character, location, product handling, camera language, wardrobe, lighting, or other story constraints."
              />
              <CharacterCount value={creativeDirection} max={LIMITS.creativeDirection} />
            </label>

            {characterPromptWarning && voiceMode === "character_dialogue" && (
              <div className="videoV2CharacterPromptWarning" role="alert">
                <div className="videoV2CharacterPromptWarningIcon">!</div>
                <div>
                  <strong>Describe your on-screen character before building the storyboard.</strong>
                  <p>
                    Character Dialogue works best when ADGen knows who should appear consistently
                    across the speaking scenes. Add the character to Campaign Description or
                    Extra Creative Direction.
                  </p>
                  <div className="videoV2CharacterPromptExample">
                    <span>Example</span>
                    <p>
                      A woman in her early 30s with shoulder-length brown hair, wearing a cream
                      blouse, speaking naturally to camera with relaxed expressions and minimal
                      head movement.
                    </p>
                  </div>
                  <small>
                    Include an age range, appearance, clothing/style, and any important
                    presentation details. ADGen will reuse that identity throughout the ad.
                  </small>
                </div>
              </div>
            )}

            <div className="videoV2Reference">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => chooseReference(e.target.files?.[0])}
              />
              {referencePreview
                ? <img src={referencePreview} alt="Visual reference" />
                : <div className="videoV2ReferenceIcon">＋</div>}
              <div>
                <strong>Visual Reference</strong>
                <p>Optional. Upload the product, property, interface, location, food, brand visual, or other subject ADGen should preserve. For product campaigns ADGen also directs visible product interaction and motion.</p>
              </div>
              <button type="button" onClick={() => fileRef.current?.click()}>
                {referencePreview ? "Replace" : "Upload"}
              </button>
              {referencePreview && (
                <button type="button" className="ghost" onClick={() => chooseReference(null)}>
                  Remove
                </button>
              )}
            </div>
          </section>

          <section className="videoV2Panel">
            <div className="videoV2SectionHead">
              <span>2</span>
              <div>
                <h2>Video Setup</h2>
                <p>Choose the ad length, how speech should work, and what ADGen should add during finishing.</p>
              </div>
            </div>

            <div className="videoV2Subsection">
              <div className="videoV2SubsectionHead">
                <div>
                  <strong>Ad length</strong>
                  <span>Longer ads create more independent storyboard scenes.</span>
                </div>
              </div>
              <div className="videoV2Durations">
                {DURATIONS.map((item) => (
                  <button
                    key={item.value}
                    className={duration === item.value ? "selected" : ""}
                    onClick={() => { setDuration(item.value); invalidateStoryboard(); }}
                  >
                    <strong>{item.value}s</strong>
                    <span>{item.credits} credits</span>
                    {item.recommended && <em>Recommended</em>}
                  </button>
                ))}
              </div>
            </div>

            <div className="videoV2Subsection">
              <div className="videoV2SubsectionHead">
                <div>
                  <strong>Voice & on-screen people</strong>
                  <span>Choose whether the ad is silent, narrated, or includes a recurring speaking character.</span>
                </div>
              </div>

              <div className="videoV2VoiceCards">
                {[
                  ["none", "No Voice", "Visual ad with music and sound only."],
                  ["voiceover", "AI Voiceover", "Off-screen narration timed to each storyboard scene."],
                  ["character_dialogue", "On-Screen Character", "One recurring character can move through the scene while speaking with synchronized dialogue."],
                ].map(([value, title, body]) => (
                  <button
                    key={value}
                    type="button"
                    className={voiceMode === value ? "selected" : ""}
                    onClick={() => { setVoiceMode(value); if (value === "none") { setCaptions(false); } else { setTextOverlays(false); setCaptions(true); } invalidateStoryboard(); }}
                  >
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </button>
                ))}
              </div>

              {voiceMode === "voiceover" && (
                <div className="videoV2VoiceConfig">
                  <label>
                    <span>Narrator Voice</span>
                    <select value={presetVoice} onChange={(e) => setPresetVoice(e.target.value)}>
                      {NARRATOR_VOICES.map((voice) => <option key={voice}>{voice}</option>)}
                    </select>
                  </label>
                  <div className="videoV2VoiceNote">
                    Narration uses the selected off-screen voice and is mixed over the generated visual/audio bed.
                  </div>
                </div>
              )}

              {voiceMode === "character_dialogue" && (
                <div className="videoV2CharacterConfig">
                  <div className="videoV2CharacterIntro">
                    <strong>Recurring on-screen character</strong>
                    <p>ADGen will create one persistent spokesperson identity. Speaking scenes can stay active—walking, exercising, cooking, demonstrating, working, touring a space, or performing another natural task while delivering the line.</p>
                  </div>

                  <div className="videoV2Grid two">
                    <div className="videoV2Field">
                      <span>Character</span>
                      <div className="videoV2GenderSwitch" role="radiogroup" aria-label="Character gender">
                        <button
                          type="button"
                          className={characterGender === "female" ? "selected" : ""}
                          onClick={() => { setCharacterGender("female"); invalidateStoryboard(); }}
                        >
                          Female
                        </button>
                        <button
                          type="button"
                          className={characterGender === "male" ? "selected" : ""}
                          onClick={() => { setCharacterGender("male"); invalidateStoryboard(); }}
                        >
                          Male
                        </button>
                      </div>
                    </div>

                    <label>
                      <span>Voice Style</span>
                      <select
                        value={characterVoice}
                        onChange={(e) => { setCharacterVoice(e.target.value); invalidateStoryboard(); }}
                      >
                        {characterVoiceOptions.map((voice) => (
                          <option key={voice.id} value={voice.id}>{voice.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="videoV2NaturalPerformanceNote">
                    <strong>Natural performance guardrails</strong>
                    <span>ADGen generates the spoken performance natively with the scene. ADGen still directs restrained expressions, purposeful movement, and natural dialogue pacing.</span>
                  </div>

                  <div className="videoV2CharacterDescriptionHint">
                    <strong>Character description required</strong>
                    <span>
                      Describe the recurring character in Campaign Description or Extra Creative Direction.
                      Include appearance, approximate age, wardrobe, and presentation style so ADGen can
                      keep the same person consistent across speaking scenes.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="videoV2Subsection">
              <div className="videoV2SubsectionHead">
                <div>
                  <strong>Finishing</strong>
                  <span>Choose the audio and finishing treatments ADGen applies to your video.</span>
                </div>
              </div>

              <div className="videoV2Toggles">
                <label>
                  <input type="checkbox" checked={musicAndEffects} onChange={(e) => setMusicAndEffects(e.target.checked)} />
                  <span><strong>Music & Audio</strong><small>Add campaign-matched music and subtle audio polish.</small></span>
                </label>
                <label className={voiceMode !== "none" ? "disabled" : ""}>
                  <input type="checkbox" checked={textOverlays} disabled={voiceMode !== "none"} onChange={(e) => { setTextOverlays(e.target.checked); invalidateStoryboard(); }} />
                  <span><strong>{voiceMode === "none" ? "Text Overlays" : "🔒 Text Overlays"}</strong><small>{voiceMode === "none" ? "AI-suggested short scene copy rendered exactly during finishing." : "Available with No Voice to avoid clutter with spoken messaging."}</small></span>
                </label>
                <label className={voiceMode === "none" ? "disabled" : ""}>
                  <input type="checkbox" checked={captions} disabled={voiceMode === "none"} onChange={(e) => setCaptions(e.target.checked)} />
                  <span><strong>{voiceMode === "none" ? "🔒 Captions" : "Captions"}</strong><small>{voiceMode === "none" ? "Captions are reserved for spoken content." : "Add clean subtitles for the spoken content."}</small></span>
                </label>
                <label>
                  <input type="checkbox" checked={endCard} onChange={(e) => setEndCard(e.target.checked)} />
                  <span><strong>CTA Finish</strong><small>Finish with your product, brand, and selected action.</small></span>
                </label>
              </div>
            </div>

            <div className="videoV2Subsection last">
              <div className="videoV2SubsectionHead">
                <div>
                  <strong>Brand & optimization</strong>
                  <span>Optional ADGen context used while planning the storyboard.</span>
                </div>
              </div>

              <div className="videoV2Toggles">
                <label>
                  <input type="checkbox" checked={useBrandKit} onChange={(e) => { setUseBrandKit(e.target.checked); invalidateStoryboard(); }} />
                  <span><strong>Brand Kit</strong><small>Apply saved brand direction and preferences.</small></span>
                </label>

                <label className={!canUsePerformanceIntelligence ? "disabled" : ""}>
                  <input
                    type="checkbox"
                    checked={usePerformanceIntelligence}
                    disabled={!canUsePerformanceIntelligence}
                    onChange={(e) => { setUsePerformanceIntelligence(e.target.checked); invalidateStoryboard(); }}
                  />
                  <span>
                    <strong>{canUsePerformanceIntelligence ? "Performance Intelligence" : "🔒 Performance Intelligence"}</strong>
                    <small>{canUsePerformanceIntelligence ? "Use learned creative patterns." : "Available on Pro & Business plans."}</small>
                  </span>
                </label>
              </div>

              {useBrandKit && (
                <div className="videoV2BrandKit">
                  <BrandKitSelector
                    value={brandKitId}
                    onChange={(id) => {
                      setBrandKitId(id);
                      invalidateStoryboard();
                    }}
                    onKitChange={(selectedKit) => {
                      setBrandKit(selectedKit);
                    }}
                    disabled={generating || storyLoading}
                  />
                </div>
              )}

              {canUsePerformanceIntelligence && (
                <div className="videoV2PI">
                  <PerformanceIntelligencePreview
                    enabled={usePerformanceIntelligence}
                    mode="video"
                  />
                </div>
              )}
            </div>

            <button
              className="videoV2Primary"
              disabled={videoLimitReached || storyLoading || generating || !subjectName.trim() || !description.trim()}
              onClick={createStoryboard}
            >
              {storyLoading
                ? "Building Storyboard..."
                : storyboard
                  ? "Regenerate Storyboard"
                  : "✨ Build My Storyboard"}
            </button>
          </section>

          {storyboard && (
            <section className="videoV2Panel storyboard">
              <div className="videoV2SectionHead">
                <span>3</span>
                <div>
                  <h2>Review Storyboard</h2>
                  <p>Edit the storyboard before generation. ADGen compiles these beats into one continuous multi-shot ad.</p>
                </div>
              </div>

              <div className="videoV2Concept">
                <div>
                  <span>Concept</span>
                  <h3>{storyboard.conceptTitle}</h3>
                  <p>{storyboard.conceptSummary}</p>
                </div>
                <div>
                  <span>Continuity</span>
                  <p>{storyboard.continuity}</p>
                </div>
              </div>

              <div className="videoV2Scenes">
                {storyboard.scenes.map((scene, index) => (
                  <article className="videoV2Scene" key={scene.id}>
                    <div className="videoV2SceneTop">
                      <div className="videoV2SceneNum">{index + 1}</div>
                      <div>
                        <span>{scene.purpose} · {scene.duration}s</span>
                        <h3>{scene.title}</h3>
                      </div>
                    </div>

                    <label>
                      <span>Visual direction</span>
                      <textarea
                        value={scene.visualPrompt}
                        maxLength={LIMITS.scenePrompt}
                        onChange={(e) => updateScene(scene.id, "visualPrompt", e.target.value)}
                      />
                      <CharacterCount value={scene.visualPrompt} max={LIMITS.scenePrompt} />
                    </label>

                    {voiceMode === "voiceover" && (
                      <label>
                        <span>Voiceover</span>
                        <input
                          value={scene.voiceover || ""}
                          maxLength={LIMITS.voiceover}
                          onChange={(e) => updateScene(scene.id, "voiceover", e.target.value)}
                        />
                        <CharacterCount value={scene.voiceover} max={LIMITS.voiceover} />
                      </label>
                    )}

                    {voiceMode === "character_dialogue" && (
                      <>
                        <div className="videoV2PerformanceState">
                          <div>
                            <span>Human performance</span>
                            <strong>
                              {scene.performanceMode === "speaking"
                                ? "Speaking"
                                : scene.performanceMode === "silent"
                                  ? "Silent"
                                  : "No person required"}
                            </strong>
                          </div>
                          <span className={`videoV2PerformanceBadge ${scene.performanceMode || "no_person"}`}>
                            {scene.performanceMode === "speaking"
                              ? "Voice + action"
                              : scene.performanceMode === "silent"
                                ? "No speech"
                                : "Visual scene"}
                          </span>
                        </div>

                        {scene.performanceMode !== "no_person" && (
                          <label className="videoV2PerformanceBeat">
                            <span>Performance beat</span>
                            <textarea
                              value={scene.performanceBeat || ""}
                              maxLength={LIMITS.performanceBeat}
                              placeholder="Example: enter bathroom → approach vanity → pick up serum → inspect bottle → continue routine"
                              onChange={(e) => updateScene(scene.id, "performanceBeat", e.target.value)}
                            />
                            <small className="videoV2FieldHelp">
                              Define intentional movement in order. Silent scenes are explicitly directed not to mouth words or perform speech-like gestures.
                            </small>
                            <CharacterCount value={scene.performanceBeat} max={LIMITS.performanceBeat} />
                          </label>
                        )}

                        {["Hook", "CTA"].includes(scene.purpose) && scene.performanceMode === "speaking" && (
                          <label className="videoV2SpeakingAction">
                            <span>Character action while speaking</span>
                            <textarea
                              value={scene.actionWhileSpeaking || ""}
                              maxLength={LIMITS.speakingAction}
                              placeholder="Example: Walk through the living room, gesture toward the windows, and continue moving naturally while speaking."
                              onChange={(e) => updateScene(scene.id, "actionWhileSpeaking", e.target.value)}
                            />
                            <small className="videoV2FieldHelp">
                              This physical action is preserved during dialogue synchronization. Use a static pose only when you intentionally want a testimonial/interview shot.
                            </small>
                            <CharacterCount value={scene.actionWhileSpeaking} max={LIMITS.speakingAction} />
                          </label>
                        )}
                        <label>
                          <span>{scene.dialogue ? "On-screen dialogue" : "On-screen dialogue · visual-only scene"}</span>
                          <input
                            value={scene.dialogue || ""}
                            maxLength={LIMITS.dialogue}
                            disabled={scene.performanceMode !== "speaking"}
                            placeholder={scene.performanceMode === "speaking" ? "Short natural line that comfortably fits this scene" : "No dialogue in this scene"}
                            onChange={(e) => updateScene(scene.id, "dialogue", e.target.value)}
                          />
                          {scene.performanceMode === "speaking" && (
                            <CharacterCount value={scene.dialogue} max={LIMITS.dialogue} />
                          )}
                        </label>
                      </>
                    )}

                    {voiceMode === "none" && textOverlays && (
                      <label>
                        <span>Text overlay</span>
                        <input value={scene.overlayText || ""} maxLength={LIMITS.overlayText} placeholder="Optional — 2–6 words" onChange={(e) => updateScene(scene.id, "overlayText", e.target.value)} />
                        <CharacterCount value={scene.overlayText} max={LIMITS.overlayText} />
                      </label>
                    )}
                    {voiceMode !== "none" && captions && (
                      <label>
                        <span>Caption idea</span>
                        <input value={scene.caption || ""} maxLength={LIMITS.caption} onChange={(e) => updateScene(scene.id, "caption", e.target.value)} />
                        <CharacterCount value={scene.caption} max={LIMITS.caption} />
                      </label>
                    )}
                  </article>
                ))}
              </div>

              <div className="videoV2GenerateBar">
                <div>
                  <strong>{duration}-second Full Video Ad</strong>
                  <span>{credits} video credits · {storyboard.scenes.length} storyboard shots · one continuous generation</span>
                </div>
                <button className="videoV2Primary" onClick={startFullAd} disabled={videoLimitReached || generating}>
                  {generating ? "Creating Your Ad..." : `Generate Full Ad · ${credits} Credits`}
                </button>
              </div>
            </section>
          )}

          {error && <div className="videoV2Error">{error}</div>}
        </main>

        <aside className="videoV2Side">
          <section className="videoV2SideCard">
            <span className="sideKicker">CURRENT BUILD</span>
            <h3>{duration}s Full Video Ad</h3>
            <div className="videoV2Specs">
              <div><span>Scenes</span><strong>{storyboard?.scenes?.length || "AI planned"}</strong></div>
              <div><span>Campaign</span><strong>{CAMPAIGN_TYPES.find(type => type.id === campaignType)?.label || "Other"}</strong></div>
              <div><span>Credits</span><strong>{credits}</strong></div>
              <div><span>Format</span><strong>{selectedFormat.platform}</strong></div>
              <div><span>Voice</span><strong>{voiceMode === "voiceover" ? "AI Voiceover" : voiceMode === "character_dialogue" ? `${characterGender === "female" ? "Female" : "Male"} · ${characterVoiceOptions.find(v => v.id === characterVoice)?.label || characterVoice}` : "None"}</strong></div>
              <div><span>Brand Kit</span><strong>{useBrandKit ? "On" : "Off"}</strong></div>
            </div>
          </section>

          <section className="videoV2SideCard preview">
            <span className="sideKicker">GENERATED AD</span>
            {!job?.finalVideoUrl && (
              <div className="videoV2EmptyPreview">
                <div>▶</div>
                <p>{job?.progressMessage || "Your finished multi-scene ad will appear here."}</p>
                {job && (
                  <div className="videoV2Progress">
                    <span style={{ width: `${job.progressPercent || 0}%` }} />
                  </div>
                )}
              </div>
            )}

            {job?.finalVideoUrl && (
              <>
                <video src={job.finalVideoUrl} controls />
                <div className="videoV2PreviewActions">
                  <button onClick={openDownload}>Open Video</button>
                  <button onClick={() => setFeedbackOpen(true)}>Rate Result</button>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
      <CreditPackModal
        open={creditPacksOpen}
        onClose={() => setCreditPacksOpen(false)}
      />
    </div>
    </div>
  );
}

/* ---------------- V2 QUICK CLIP MODE ---------------- */

const QUICK_V2_API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

const VIDEO_DESCRIPTION_MAX = 1200;
const QUICK_PRODUCT_MAX = 80;
const QUICK_AUDIENCE_MAX = 100;
const QUICK_CTA_MAX = 20;
const IMAGE_MOTION_PROMPT_MAX = 1000;
const CREATIVE_DIRECTION_MAX = 900;
const QUICK_V2_CHARACTER_ACTION_MAX = 300;
const VIDEO_GENERATOR_MODE_KEY = "adgen:video-generator-mode";

const NARRATOR_VOICE_OPTIONS = [
  "Leslie",
  "Maya",
  "Mark",
  "Rachel",
  "Benjamin",
  "Ella",
];

const QUICK_V2_CHARACTER_VOICES = [
  { id: "natural_female", label: "Natural", gender: "female" },
  { id: "warm_female", label: "Warm", gender: "female" },
  { id: "confident_female", label: "Confident", gender: "female" },
  { id: "natural_male", label: "Natural", gender: "male" },
  { id: "warm_male", label: "Warm", gender: "male" },
  { id: "confident_male", label: "Confident", gender: "male" },
];

// ✅ One dropdown: Platform + Aspect Ratio
const FORMAT_OPTIONS = [
  {
    id: "vertical_9x16",
    label: "Vertical — TikTok / Reels / Shorts (9:16)",
    platform: "TikTok / Reels / Shorts",
    ratio: "720:1280",
  },
  {
    id: "square_1x1",
    label: "Square — Social Feed (1:1)",
    platform: "Social Feed",
    ratio: "1080:1080",
  },
  {
    id: "landscape_16x9",
    label: "Landscape — YouTube / Web (16:9)",
    platform: "YouTube / Web",
    ratio: "1280:720",
  },
];

const VIDEO_TEMPLATES = [
  {
    id: "skincare", icon: "🧴", name: "Skincare & Beauty",
    description: "Beauty, skincare, cosmetics, and self-care products",
    values: {
      productName: "Vitamin C Glow Serum",
      description: "Create a polished skincare commercial showing a premium serum bottle in a bright bathroom setting, close-up product details, smooth application, and healthy glowing skin.",
      offer: "20% off your first order", audience: "Skincare shoppers seeking brighter, healthier-looking skin",
      tone: "premium and reassuring", goal: "conversions", hookStyle: "problem solution",
      sceneStyle: "lifestyle", cameraMotion: "subtle", lightingStyle: "bright clean", pace: "medium",
      callToAction: "Shop now.", formatId: "vertical_9x16",
      promptText: "Subtle cinematic push-in, soft highlights across the serum bottle, gentle hand movement, premium skincare commercial pacing.",
      voiceoverScript: "Reveal brighter-looking skin with Vitamin C Glow Serum. Shop now.",
    },
  },
  {
    id: "food-beverage", icon: "☕", name: "Food & Beverage",
    description: "Restaurants, coffee, snacks, drinks, and food brands",
    values: {
      productName: "Small-Batch Cold Brew",
      description: "Create an energetic beverage ad with cold brew pouring over ice, rich coffee texture, condensation, quick lifestyle cuts, and a refreshing final product shot.",
      offer: "Buy one, get one 50% off", audience: "Busy professionals, students, and coffee lovers",
      tone: "warm and energetic", goal: "conversions", hookStyle: "bold claim",
      sceneStyle: "studio product", cameraMotion: "dynamic", lightingStyle: "high contrast", pace: "fast",
      callToAction: "Order now.", formatId: "vertical_9x16",
      promptText: "Dynamic product reveal, cold brew pouring over ice, condensation details, quick camera push-in, refreshing commercial energy.",
      voiceoverScript: "Fresh flavor in every sip. Try our cold brew today.",
    },
  },
  {
    id: "fashion", icon: "👕", name: "Fashion & Apparel",
    description: "Clothing, accessories, footwear, and fashion brands",
    values: {
      productName: "Everyday Performance Hoodie",
      description: "Create a modern fashion ad showing a premium hoodie in motion across urban and lifestyle settings, with close fabric details and a clean final brand shot.",
      offer: "Free shipping this week", audience: "Style-conscious shoppers who value comfort and versatility",
      tone: "modern and confident", goal: "conversions", hookStyle: "bold claim",
      sceneStyle: "lifestyle", cameraMotion: "dynamic", lightingStyle: "natural", pace: "fast",
      callToAction: "Shop the drop.", formatId: "vertical_9x16",
      promptText: "Smooth fashion camera movement, subtle fabric motion, confident model turn, clean urban lighting, premium apparel commercial.",
      voiceoverScript: "New styles are here. Find your perfect look today.",
    },
  },
  {
    id: "fitness", icon: "🏋️", name: "Fitness & Wellness",
    description: "Gyms, supplements, coaching, and wellness services",
    values: {
      productName: "30-Day Strength Program",
      description: "Create a motivational fitness ad with focused training moments, progress tracking, energetic movement, and a clear invitation to start a structured 30-day program.",
      offer: "Start your first week free", audience: "Busy adults who want a clear and sustainable fitness plan",
      tone: "motivational and direct", goal: "leads", hookStyle: "problem solution",
      sceneStyle: "lifestyle", cameraMotion: "fast cuts", lightingStyle: "dramatic", pace: "fast",
      callToAction: "Start training.", formatId: "vertical_9x16",
      promptText: "Energetic training montage, confident movement, quick close-ups, dramatic gym lighting, motivating final hero pose.",
      voiceoverScript: "Train smarter, feel stronger, and start your fitness journey today.",
    },
  },
  {
    id: "saas", icon: "💻", name: "Software & SaaS",
    description: "Apps, software platforms, AI tools, and B2B services",
    values: {
      productName: "Workflow Automation Platform",
      description: "Create a clean software commercial showing a modern dashboard, automated task flows, team collaboration, and a simple before-and-after story about saving time.",
      offer: "14-day free trial", audience: "Small business owners, operations teams, and growing startups",
      tone: "clear and professional", goal: "leads", hookStyle: "problem solution",
      sceneStyle: "minimal abstract", cameraMotion: "subtle", lightingStyle: "bright clean", pace: "medium",
      callToAction: "Start your free trial.", formatId: "landscape_16x9",
      promptText: "Smooth interface animation, subtle camera movement across a software dashboard, clean transitions, polished modern SaaS commercial.",
      voiceoverScript: "Save time, work smarter, and grow with our platform.",
    },
  },
  {
    id: "ecommerce", icon: "🛍️", name: "Retail & Ecommerce",
    description: "Online stores, consumer products, gifts, and marketplaces",
    values: {
      productName: "Portable LED Desk Lamp",
      description: "Create a conversion-focused ecommerce ad showing a compact rechargeable desk lamp used at a desk, bedside, and while traveling, with clear feature highlights.",
      offer: "Save 15% today", audience: "Online shoppers, students, remote workers, and home office buyers",
      tone: "polished and persuasive", goal: "conversions", hookStyle: "before after",
      sceneStyle: "studio product", cameraMotion: "dynamic", lightingStyle: "bright clean", pace: "fast",
      callToAction: "Get the offer.", formatId: "square_1x1",
      promptText: "Clean product rotation, light turning on, quick lifestyle transitions, crisp detail shots, ecommerce product commercial.",
      voiceoverScript: "Better light anywhere. Portable, rechargeable, and ready to work.",
    },
  },
  {
    id: "real-estate", icon: "🏠", name: "Real Estate",
    description: "Agents, brokerages, rentals, developments, and property services",
    values: {
      productName: "Modern Downtown Residence",
      description: "Create an aspirational real estate video with bright interior walkthrough shots, premium details, neighborhood moments, and a clear invitation to schedule a tour.",
      offer: "Schedule a private tour", audience: "Homebuyers and renters seeking a modern, well-located property",
      tone: "polished and trustworthy", goal: "leads", hookStyle: "bold claim",
      sceneStyle: "lifestyle", cameraMotion: "smooth pan", lightingStyle: "natural", pace: "medium",
      callToAction: "Book a tour.", formatId: "vertical_9x16",
      promptText: "Smooth property walkthrough, bright natural light, premium interior details, neighborhood lifestyle cuts, elegant real estate commercial.",
      voiceoverScript: "Discover modern living. Schedule your private tour today.",
    },
  },
  {
    id: "professional-services", icon: "💼", name: "Professional Services",
    description: "Agencies, consultants, finance, legal, and local services",
    values: {
      productName: "Business Growth Consultation",
      description: "Create a credible professional services video showing focused consultation, collaborative planning, clear strategy visuals, and a confident invitation to book a call.",
      offer: "Free 30-minute consultation", audience: "Business owners and decision-makers seeking experienced guidance",
      tone: "professional and approachable", goal: "leads", hookStyle: "problem solution",
      sceneStyle: "lifestyle", cameraMotion: "subtle", lightingStyle: "bright clean", pace: "medium",
      callToAction: "Book a call.", formatId: "landscape_16x9",
      promptText: "Professional consultation scenes, strategic planning details, polished office environment, subtle camera motion, credible service commercial.",
      voiceoverScript: "Clear strategy starts here. Book your consultation today.",
    },
  },
];

// Handles: detail as string, detail as {message}, detail as nested objects, etc.
function safeDetailMessage(detail) {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    if (detail.message) return detail.message;
    if (detail.error) return detail.error;
    try { return JSON.stringify(detail); } catch { return String(detail); }
  }
  return String(detail);
}

function customerSafeMessage(detail, fallback = "Something went wrong. Please try again.") {
  const message = safeDetailMessage(detail);
  if (!message) return fallback;

  const blockedTechnicalTerms =
    /openai|open ai|gpt(?:-|\s)?(?:image|\d)|gen4|model[_\s-]?id|api[_\s-]?key|api error|provider|firebase|firestore|storage\.googleapis|httpx|uvicorn|pydantic|ffmpeg|ffprobe|traceback|stack trace|exception|internal server error|task[_\s-]?id|request[_\s-]?id/i;

  const looksLikeRawPayload =
    /^[[{]/.test(message.trim()) ||
    /(?:status[_\s-]?code|error[_\s-]?code|response body|raw response)/i.test(message);

  if (blockedTechnicalTerms.test(message) || looksLikeRawPayload) {
    return fallback;
  }

  return message;
}

async function quickV2SafeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}


function buildVideoValidationError(detail) {
  const message = customerSafeMessage(
    detail,
    "Please review your video inputs and try again."
  );
  const lower = String(message || "").toLowerCase();

  if (
    lower.includes("character dialogue") &&
    (lower.includes("person") || lower.includes("on-screen"))
  ) {
    return {
      code: "character_person_required",
      title: "Character Dialogue needs an on-screen person",
      message,
      help:
        "Describe a visible speaker in the Video Prompt. Example: “Create a fitness ad featuring a female athlete training in a gym.” Or switch to AI Voiceover for off-screen narration.",
      actionLabel: "Use Suggested Prompt",
      secondaryActionLabel: "Switch to AI Voiceover",
      target: "creative",
    };
  }

  if (
    lower.includes("dialogue") &&
    (lower.includes("too long") || lower.includes("speaking window"))
  ) {
    return {
      code: "dialogue_too_long",
      title: "Shorten the Character Dialogue",
      message,
      help:
        "Character Dialogue only uses part of the video for on-screen speech. Shorten the line so it fits naturally inside the speaking window.",
      actionLabel: "Trim to Fit",
      target: "settings",
    };
  }

  if (
    lower.includes("conflict") &&
    lower.includes("voice")
  ) {
    return {
      code: "voice_character_mismatch",
      title: "Voice and on-screen character do not match",
      message,
      help:
        "Choose a character voice that matches the person described in your prompt, or update the prompt to match the selected voice.",
      actionLabel: "Match Voice to Prompt",
      target: "settings",
    };
  }

  if (
    lower.includes("uploaded image") &&
    lower.includes("visible person")
  ) {
    return {
      code: "image_person_required",
      title: "Character Dialogue needs a visible person",
      message,
      help:
        "Upload an image with a clearly visible person, or switch to AI Voiceover if you want narration without an on-screen speaker.",
      actionLabel: "Switch to AI Voiceover",
      target: "creative",
    };
  }

  if (
    lower.includes("voiceover") ||
    lower.includes("audio script") ||
    lower.includes("script")
  ) {
    return {
      code: "voice_script",
      title: "Review your voice script",
      message,
      help:
        "Edit the script so it fits the selected duration, then try again.",
      actionLabel: "Review Voice Settings",
      target: "settings",
    };
  }

  if (
    lower.includes("duration") ||
    lower.includes("format") ||
    lower.includes("ratio")
  ) {
    return {
      code: "video_settings",
      title: "Review your video settings",
      message,
      help:
        "Check the selected duration and format, then try the generation again.",
      actionLabel: "Review Video Settings",
      target: "settings",
    };
  }

  if (
    lower.includes("image") ||
    lower.includes("upload") ||
    lower.includes("reference")
  ) {
    return {
      code: "source_creative",
      title: "Review the source creative",
      message,
      help:
        "Check the uploaded image and prompt, then try again.",
      actionLabel: "Review Source Creative",
      target: "creative",
    };
  }

  return {
    code: "generic_input",
    title: "Update your video before generating",
    message,
    help:
      "Review the highlighted input and adjust the request before trying again.",
    actionLabel: "Review Video Inputs",
    target: "creative",
  };
}
async function claimFirstGeneration(kind, jobId, token) {
  if (!jobId || !token) return;

  try {
    const response = await fetch(`${QUICK_V2_API_BASE}/analytics/claim-first-generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, jobId }),
    });

    const data = await quickV2SafeJson(response);
    if (!response.ok || !data?.track) return;

    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "first_generation", {
        generation_type: kind,
      });
    }
  } catch (error) {
    console.warn("[ADGen] First-generation analytics could not be recorded:", error);
  }
}

// ✅ simple speech-time estimate for warn/block (rough but effective)
function estimateSpeechSeconds(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  const words = t.split(/\s+/).filter(Boolean).length;
  // ~2.2 words/sec + small buffer for more natural delivery.
  return Math.round(((words / 2.2) + 0.55) * 10) / 10;
}


function characterDialogueMaxSeconds(duration) {
  return Number(duration) >= 10 ? 4.0 : 2.5;
}



function hasUsefulCharacterDescription(...values) {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return false;

  const personTerms = [
    "woman", "man", "female", "male", "person", "spokesperson", "creator",
    "influencer", "athlete", "trainer", "agent", "host", "customer", "employee",
    "founder", "chef", "coach", "model"
  ];
  const detailTerms = [
    "hair", "wearing", "dressed", "outfit", "shirt", "blouse", "jacket", "dress",
    "suit", "casual", "professional", "athletic", "20s", "30s", "40s", "50s",
    "beard", "glasses", "blonde", "brunette", "brown hair", "black hair"
  ];

  return personTerms.some((term) => text.includes(term)) &&
    detailTerms.some((term) => text.includes(term));
}


// --- helpers for winners guidance ---

function VideoAdsV2Quick() {
  const { refreshWorkspace, videoUsage: workspaceVideoUsage } = useWorkspace() || {};
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  const navigate = useNavigate();
  const firstWorkspaceSectionRef = useRef(null);
  const videoSettingsSectionRef = useRef(null);
  const templateSectionRef = useRef(null);

  const [me, setMe] = useState({ tier: null, status: null, isAdmin: false });
  const [meLoaded, setMeLoaded] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasGeneratedBefore, setHasGeneratedBefore] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ========== Image → Video ==========
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [promptText, setPromptText] = useState("Subtle cinematic camera movement, product showcase");

  // ========== Shared video settings ==========
  const [duration, setDuration] = useState(6);
  const [progressStage, setProgressStage] = useState("queued");
  const [progressMessage, setProgressMessage] = useState("Preparing your video request.");
  const [progressPercent, setProgressPercent] = useState(5);

  // Combined dropdown state
  const [formatId, setFormatId] = useState(FORMAT_OPTIONS[0].id);
  const [ratio, setRatio] = useState(FORMAT_OPTIONS[0].ratio);

  // ========== Prompt → Video ==========
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("confident");

  // extra direction fields (kept; backend can ignore)
  const [goal, setGoal] = useState("conversions");
  const [hookStyle, setHookStyle] = useState("bold claim");
  const [sceneStyle, setSceneStyle] = useState("studio product");
  const [cameraMotion, setCameraMotion] = useState("subtle");
  const [lightingStyle, setLightingStyle] = useState("bright clean");
  const [pace, setPace] = useState("fast");
  const [callToAction, setCallToAction] = useState("");
  const [fullCreativeDirection, setFullCreativeDirection] = useState("");
  const [controlOverrides, setControlOverrides] = useState([]);

  const markControlOverride = (field) => {
    setControlOverrides((current) =>
      current.includes(field) ? current : [...current, field]
    );
  };

  const quickOverlayLimit = Number(duration) >= 10 ? 3 : 2;
  const updateOverlayMessage = (index, value) => {
    const nextValue = String(value || "").split(/\s+/).filter(Boolean).slice(0, 6).join(" ").slice(0, 42);
    setOverlayMessages((current) => { const next = [...current]; next[index] = nextValue; return next; });
  };

  // ========== Voice & Audio ==========
  const [voiceMode, setVoiceMode] = useState("voiceover"); // none | voiceover | character_dialogue
  const [presetVoice, setPresetVoice] = useState("Leslie");
  const [characterGender, setCharacterGender] = useState("female");
  const [characterVoice, setCharacterVoice] = useState("natural_female");
  const [characterAction, setCharacterAction] = useState("");
  const [musicAndEffects, setMusicAndEffects] = useState(false);
  const [textOverlays, setTextOverlays] = useState(false);
  const [overlayMessages, setOverlayMessages] = useState(["", "", ""]);
  const [ctaFinish, setCtaFinish] = useState(true);
  const [voiceoverScript, setVoiceoverScript] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const audioRef = useRef(null);

  // ========== Performance Intelligence ==========
  const [usePerformanceIntelligence, setUsePerformanceIntelligence] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const lastVideoBrandDefaultsRef = useRef({});

  const canUsePerformanceIntelligence = useMemo(() => {
    if (me.isAdmin) return true;
    const t = String(me.tier || "").toLowerCase();
    return t === "pro_monthly" || t === "business_monthly";
  }, [me]);

  const videoBrandDefaults = useMemo(() => {
    if (!brandKit) return {};

    const platformFormatMap = {
      meta: "square_1x1",
      instagram: "square_1x1",
      facebook: "square_1x1",
      tiktok: "vertical_9x16",
      pinterest: "vertical_9x16",
      google: "landscape_16x9",
      youtube: "landscape_16x9",
      linkedin: "landscape_16x9",
    };

    const ratioRaw = String(brandKit.aspectRatioPreference || "");
    let ratioFormatId = "";
    if (["1024x1792", "720:1280", "1080:1920", "9:16"].includes(ratioRaw)) {
      ratioFormatId = "vertical_9x16";
    } else if (["1024x1024", "1080:1080", "1:1"].includes(ratioRaw)) {
      ratioFormatId = "square_1x1";
    } else if (["1792x1024", "1280:720", "1920:1080", "16:9"].includes(ratioRaw)) {
      ratioFormatId = "landscape_16x9";
    }

    const sceneStyleMap = {
      Premium: "studio product",
      Minimal: "minimal abstract",
      Bold: "studio product",
      Lifestyle: "lifestyle",
      UGC: "ugc",
      Luxury: "cinematic",
      "Studio Product": "studio product",
      Photorealistic: "studio product",
      "Dark & Cinematic": "cinematic",
      "Bright & Clean": "studio product",
    };

    const platformKey = String(brandKit.preferredPlatform || "").toLowerCase();

    return {
      companyName: brandKit.brandName || "",
      audience: brandKit.targetAudience || "",
      tone: brandKit.voice || brandKit.brandPersonality || "",
      offer: brandKit.offerStyle || "",
      callToAction: brandKit.preferredCta || "",
      formatId: ratioFormatId || platformFormatMap[platformKey] || "",
      sceneStyle: sceneStyleMap[brandKit.imageStyle] || "",
    };
  }, [brandKit]);

  useEffect(() => {
    const nextDefaults = useBrandKit && brandKit ? videoBrandDefaults : {};

    setCompanyName(nextDefaults.companyName || "");
    setAudience(nextDefaults.audience || "");
    setTone(nextDefaults.tone || "confident");
    setOffer(nextDefaults.offer || "");
    setCallToAction(nextDefaults.callToAction || "");
    setFormatId(nextDefaults.formatId || FORMAT_OPTIONS[0].id);
    setSceneStyle(nextDefaults.sceneStyle || "studio product");

    lastVideoBrandDefaultsRef.current = nextDefaults;
  }, [useBrandKit, brandKit, videoBrandDefaults]);


  // ========== Job state ==========
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const characterVoiceOptions = useMemo(
    () => QUICK_V2_CHARACTER_VOICES.filter((voice) => voice.gender === characterGender),
    [characterGender]
  );

  useEffect(() => {
    if (!characterVoiceOptions.some((voice) => voice.id === characterVoice)) {
      setCharacterVoice(characterVoiceOptions[0]?.id || (characterGender === "male" ? "natural_male" : "natural_female"));
    }
  }, [characterGender, characterVoice, characterVoiceOptions]);

  const [videoLimitReached, setVideoLimitReached] = useState(false);
  const [purchasedVideoCredits, setPurchasedVideoCredits] = useState(0);
  const [creditPacksOpen, setCreditPacksOpen] = useState(false);
  const [videoUsageUsed, setVideoUsageUsed] = useState(null);
  const [videoUsageCap, setVideoUsageCap] = useState(null);

  // Keep the local Video limit state synchronized with WorkspaceContext.
  // When a purchased pack is confirmed, WorkspaceContext refreshes /video/usage
  // and this clears the warning immediately without a manual page refresh.
  useEffect(() => {
    if (!workspaceVideoUsage) return;

    const used = Number(workspaceVideoUsage?.used ?? 0);
    const rawCap = workspaceVideoUsage?.cap ?? null;
    const cap =
      rawCap === null || rawCap === undefined || rawCap === ""
        ? null
        : Number(rawCap);
    const purchased = Math.max(
      0,
      Number(workspaceVideoUsage?.purchasedRemaining ?? 0)
    );
    const hasFiniteCap = Number.isFinite(cap) && cap >= 0;

    setPurchasedVideoCredits(purchased);
    setVideoUsageUsed(Number.isFinite(used) ? used : null);
    setVideoUsageCap(hasFiniteCap ? cap : null);
    setVideoLimitReached(
      Boolean(
        hasFiniteCap &&
          Number.isFinite(used) &&
          used >= cap &&
          purchased <= 0
      )
    );
  }, [workspaceVideoUsage]);

  // scroll targets
  const statusRef = useRef(null);
  const validationRef = useRef(null);
  const creativeSectionRef = useRef(null);
  const voiceScriptRef = useRef(null);

  const canUseVideoAds = useMemo(() => {
    if (me.isAdmin) return true;
    const t = String(me.tier || "").toLowerCase();
    return [
      "free",
      "trial_monthly",
      "starter_monthly",
      "pro_monthly",
      "business_monthly",
      "early_access",
    ].includes(t);
  }, [me]);

  const isFreePlan = useMemo(() => {
    return (
      !me.isAdmin &&
      String(me.tier || "").toLowerCase() === "free"
    );
  }, [me]);

  const canUseQuickTenSeconds = useMemo(() => {
    if (me.isAdmin) return true;
    if (!me.tier) return false;
    return String(me.tier || "").toLowerCase() !== "free";
  }, [me]);

  useEffect(() => {
    if (isFreePlan && duration !== 6) {
      setDuration(6);
    }
  }, [isFreePlan, duration]);

  useEffect(() => {
    if (isFreePlan) {
      setUseBrandKit(false);
      setBrandKitId(null);
      setBrandKit(null);
    }
  }, [isFreePlan]);

  // Performance Intelligence is Pro/Business only (admin allowed).
  useEffect(() => {
    if (
      usePerformanceIntelligence &&
      !canUsePerformanceIntelligence
    ) {
      setUsePerformanceIntelligence(false);
    }
  }, [
    usePerformanceIntelligence,
    canUsePerformanceIntelligence,
  ]);

  const isGenerating =
    loading || (!!jobId && !finalVideoUrl && status !== "failed" && status !== "succeeded");

  // Sync ratio when format changes.
  useEffect(() => {
    const opt = FORMAT_OPTIONS.find(o => o.id === formatId) || FORMAT_OPTIONS[0];
    setRatio(opt.ratio);
  }, [formatId]);

  // Auto-scroll when finished or error
  useEffect(() => {
    if (finalVideoUrl || error) {
      setTimeout(() => {
        statusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [finalVideoUrl, error]);

  const moveToWorkspaceSection = (targetRef) => {
    setTemplatesOpen(false);

    // Wait for the collapsible template panel to close before scrolling so
    // the movement feels intentional instead of abrupt.
    window.setTimeout(() => {
      targetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 300);
  };


  const clearVideoValidation = () => setValidationError(null);

  const showVideoValidation = (detail) => {
    const next = buildVideoValidationError(detail);
    setValidationError(next);
    setError(null);
    window.setTimeout(() => {
      validationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  const scrollToUpdatedArea = (targetRef, block = "start") => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        targetRef.current?.scrollIntoView({
          behavior: "smooth",
          block,
        });
      }, 180);
    });
  };

  const goToValidationTarget = (target) => {
    if (target === "settings") {
      scrollToUpdatedArea(videoSettingsSectionRef, "start");
      return;
    }

    scrollToUpdatedArea(creativeSectionRef, "start");
  };


  const applyValidationFix = (validation, secondary = false) => {
    if (!validation) return;

    if (validation.code === "character_description_required") {
      const example =
        characterGender === "male"
          ? "a man in his early 30s with short dark hair, wearing a fitted athletic top, moving naturally through the scene with relaxed facial expressions"
          : "a woman in her early 30s with shoulder-length brown hair, wearing a cream fitted top, moving naturally through the scene with relaxed facial expressions";

      setDescription((current) => {
        const existing = String(current || "").trim();
        if (!existing) return `Create a video featuring ${example}.`;
        return `${existing} Use one recurring on-screen character: ${example}.`;
      });

      clearVideoValidation();
      scrollToUpdatedArea(creativeSectionRef, "start");
      return;
    }

    if (validation.code === "character_person_required") {
      if (secondary) {
        setVoiceMode("voiceover");
        clearVideoValidation();
        scrollToUpdatedArea(videoSettingsSectionRef, "start");
        return;
      }

      const gender =
        QUICK_V2_CHARACTER_VOICES.find((voice) => voice.id === characterVoice)?.gender ||
        "female";
      const personPhrase =
        gender === "male" ? "a male athlete" : "a female athlete";

      setDescription((current) => {
        const existing = String(current || "").trim();
        if (!existing) {
          return `Create a video featuring ${personPhrase} clearly on screen and speaking naturally during the Character Dialogue portion.`;
        }

        if (/\b(person|woman|women|girl|female|man|men|boy|male|model|athlete|trainer|coach|creator|influencer|spokesperson|speaker|human)\b/i.test(existing)) {
          return existing;
        }

        const lowered = existing.charAt(0).toLowerCase() + existing.slice(1);
        return `Create a video featuring ${personPhrase} clearly on screen, ${lowered}`;
      });

      clearVideoValidation();
      scrollToUpdatedArea(creativeSectionRef, "start");
      return;
    }

    if (validation.code === "dialogue_too_long") {
      const maxSeconds = characterDialogueMaxSeconds(duration);
      const maxWords = Math.max(3, Math.floor((maxSeconds - 0.6) * 2.5));
      setVoiceoverScript((current) => {
        const words = String(current || "").trim().split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) return current;
        return words.slice(0, maxWords).join(" ").replace(/[,:;.!?]*$/, "") + ".";
      });
      clearVideoValidation();
      scrollToUpdatedArea(voiceScriptRef, "center");
      return;
    }

    if (validation.code === "voice_character_mismatch") {
      const text = `${description || ""} ${promptText || ""}`.toLowerCase();
      const mentionsFemale = /\b(woman|women|girl|female)\b/.test(text);
      const mentionsMale = /\b(man|men|boy|male)\b/.test(text);

      const desiredGender = mentionsFemale && !mentionsMale
        ? "female"
        : mentionsMale && !mentionsFemale
          ? "male"
          : null;

      if (desiredGender) {
        const matchingVoice = QUICK_V2_CHARACTER_VOICES.find(
          (voice) => voice.gender === desiredGender
        );
        if (matchingVoice) {
          setCharacterVoice(matchingVoice.id);
        }
      }

      clearVideoValidation();
      scrollToUpdatedArea(videoSettingsSectionRef, "start");
      return;
    }

    if (validation.code === "image_person_required") {
      setVoiceMode("voiceover");
      clearVideoValidation();
      scrollToUpdatedArea(videoSettingsSectionRef, "start");
      return;
    }

    goToValidationTarget(validation.target);
  };

  const applyVideoTemplate = (template) => {
    const values = template.values;

    resetJob();
    setSelectedTemplateId(template.id);
    setAdvancedOpen(true);
    setProductName(values.productName);
    setDescription(values.description);
    setOffer(values.offer);
    setAudience(values.audience);
    setTone(values.tone);
    setGoal(values.goal);
    setHookStyle(values.hookStyle);
    setSceneStyle(values.sceneStyle);
    setCameraMotion(values.cameraMotion);
    setLightingStyle(values.lightingStyle);
    setPace(values.pace);
    setCallToAction(values.callToAction);
    setFormatId(values.formatId);
    setPromptText(values.promptText);
    setVoiceoverScript(values.voiceoverScript);
    setCharacterAction("");
    setFullCreativeDirection("");
    setControlOverrides([
      "goal",
      "tone",
      "hookStyle",
      "sceneStyle",
      "cameraMotion",
      "lightingStyle",
      "pace",
    ]);
    moveToWorkspaceSection(creativeSectionRef);
  };

  const startVideoFromScratch = () => {
    resetJob();
    setSelectedTemplateId("scratch");
    setAdvancedOpen(true);
    setCompanyName("");
    setProductName("");
    setDescription("");
    setOffer("");
    setAudience("");
    setTone("confident");
    setGoal("conversions");
    setHookStyle("bold claim");
    setSceneStyle("studio product");
    setCameraMotion("subtle");
    setLightingStyle("bright clean");
    setPace("fast");
    setCallToAction("");
    setFormatId(FORMAT_OPTIONS[0].id);
    setPromptText("Subtle cinematic camera movement, product showcase");
    setVoiceoverScript("");
    setCharacterAction("");
    setFullCreativeDirection("");
    setControlOverrides([]);
    moveToWorkspaceSection(firstWorkspaceSectionRef);
  };

  const selectedVideoTemplate = VIDEO_TEMPLATES.find(
    (template) => template.id === selectedTemplateId
  );

  const resetJob = () => {
    setJobId(null);
    setStatus(null);
    setFinalVideoUrl(null);
    setError(null);
    setVideoLimitReached(false);
    setProgressStage("queued");
    setProgressMessage("Preparing your video request.");
    setProgressPercent(5);
  };

  const getIdToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    return await user.getIdToken(true);
  };


  // Fetch /me
  useEffect(() => {
    const run = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const token = await user.getIdToken(true);
        const res = await fetch(`${QUICK_V2_API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await quickV2SafeJson(res);
        if (res.ok && data) {
          setMe({
            tier: data.tier || null,
            status: data.status || null,
            isAdmin: !!data.isAdmin,
          });
        }
      } catch {
        // If account lookup fails, finish loading and let the normal gate
        // handle the unresolved account state instead of flashing it early.
      } finally {
        setMeLoaded(true);
      }
    };
    run();
  }, []);

  useEffect(() => {
    const loadVideoUsageAndPreference = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setUsageLoaded(true);
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${QUICK_V2_API_BASE}/video/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await quickV2SafeJson(response);
        const used = Number(
          data?.used ??
          data?.videoUsed ??
          data?.video_used ??
          data?.usage ??
          0
        );
        const rawCap =
          data?.cap ??
          data?.limit ??
          data?.videoCap ??
          data?.video_cap ??
          data?.credits ??
          null;
        const cap =
          rawCap === null || rawCap === undefined || rawCap === ""
            ? null
            : Number(rawCap);
        const hasFiniteCap = Number.isFinite(cap) && cap >= 0;
        const purchased = Math.max(0, Number(data?.purchasedRemaining || 0));
        const exhausted =
          response.ok &&
          hasFiniteCap &&
          Number.isFinite(used) &&
          used >= cap && purchased <= 0;

        const hasPreviousGeneration =
          response.ok && Number.isFinite(used) && used > 0;

        setPurchasedVideoCredits(purchased);
        setVideoUsageUsed(Number.isFinite(used) ? used : null);
        setVideoUsageCap(hasFiniteCap ? cap : null);
        setVideoLimitReached(exhausted);
        setHasGeneratedBefore(hasPreviousGeneration);

        if (hasPreviousGeneration) {
          const savedMode = window.localStorage.getItem(
            VIDEO_GENERATOR_MODE_KEY
          );

          if (savedMode === "advanced") {
            setAdvancedOpen(true);
          }
        }
      } catch {
        // Usage detection only controls presentation.
      } finally {
        setUsageLoaded(true);
      }
    };

    loadVideoUsageAndPreference();
  }, []);

  useEffect(() => {
    if (!usageLoaded) return;

    window.localStorage.setItem(
      VIDEO_GENERATOR_MODE_KEY,
      advancedOpen ? "advanced" : "quick"
    );
  }, [advancedOpen, usageLoaded]);

  useEffect(() => {
    if (advancedOpen) return;
    setDuration(6);
    setVoiceMode("none");
    setVoiceoverScript("");
  }, [advancedOpen]);

  // Cleanup object URL previews
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const onPickFile = (f) => {
    resetJob();
    setImageFile(f || null);
    if (imagePreview) {
      try { URL.revokeObjectURL(imagePreview); } catch {}
    }

    if (!f) {
      setImagePreview(null);
      return;
    }
    setImagePreview(URL.createObjectURL(f));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const uploadImageToBackend = async (file, targetRatio = ratio) => {
    const token = await getIdToken();
    const preparedImage = await cropImageFileToRatio(file, targetRatio);
    const form = new FormData();
    form.append("files", preparedImage);

    const res = await fetch(`${QUICK_V2_API_BASE}/video/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await quickV2SafeJson(res);
    if (!res.ok) {
      throw new Error(
        customerSafeMessage(
          data?.detail,
          "We couldn't upload that image. Please try again."
        )
      );
    }
    const url = data?.urls?.[0];
    if (!url) throw new Error("Upload succeeded but no URL returned.");
    return url;
  };


  // Voice preview
  const previewVoice = async () => {
    setPreviewLoading(true);
    setError(null);
    setPreviewUrl(null);

    try {
      if (voiceMode !== "voiceover") throw new Error("Voice preview is available for AI Voiceover only.");
      const text = (voiceoverScript || "").trim();
      if (!text) throw new Error("Add a voiceover script first.");

      const token = await getIdToken();

      const res = await fetch(`${QUICK_V2_API_BASE}/video-v2/quick/tts/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          presetVoice,
        }),
      });

      const data = await quickV2SafeJson(res);
      if (!res.ok) {
        throw new Error(
          customerSafeMessage(
            data?.detail,
            "The voice preview is temporarily unavailable. Please try again."
          )
        );
      }

      if (!data.audioUrl) throw new Error("Preview succeeded but no audioUrl returned.");

      setPreviewUrl(data.audioUrl);

      setTimeout(() => {
        const el = audioRef.current;
        if (!el) return;
        try {
          el.load();
          el.play().catch(() => {});
        } catch {}
      }, 50);
    } catch (e) {
      setError(
        customerSafeMessage(
          e?.message,
          "The voice preview is temporarily unavailable. Please try again."
        )
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  // ✅ warn/block if script too long
  const scriptEstimateSec = useMemo(() => estimateSpeechSeconds(voiceoverScript), [voiceoverScript]);
  const scriptMaxSeconds = useMemo(() => {
    if (voiceMode === "character_dialogue") {
      return characterDialogueMaxSeconds(duration);
    }
    return Number(duration) + 0.2;
  }, [voiceMode, duration]);

  const scriptTooLong = useMemo(() => {
    if (voiceMode === "none") return false;
    const s = (voiceoverScript || "").trim();
    if (!s) return false;
    return scriptEstimateSec > scriptMaxSeconds;
  }, [voiceMode, voiceoverScript, scriptEstimateSec, scriptMaxSeconds]);

  const scriptHint = useMemo(() => {
    if (voiceMode === "none") return null;
    const s = (voiceoverScript || "").trim();
    if (!s) return null;

    if (voiceMode === "character_dialogue") {
      if (!scriptTooLong) {
        return `Estimated speaking time: ~${scriptEstimateSec}s. Character Dialogue uses up to ~${scriptMaxSeconds}s in this ${duration}s video so the ad still has time to showcase the creative.`;
      }
      return `Estimated speaking time: ~${scriptEstimateSec}s — too long for the ~${scriptMaxSeconds}s Character Dialogue window. Shorten the dialogue.`;
    }

    if (!scriptTooLong) {
      return `Estimated read time: ~${scriptEstimateSec}s (fits ${duration}s)`;
    }
    return `Estimated read time: ~${scriptEstimateSec}s — too long for ${duration}s. Shorten your script.`;
  }, [voiceMode, voiceoverScript, scriptEstimateSec, scriptTooLong, scriptMaxSeconds, duration]);

  const ensureScriptFitsOrThrow = () => {
    if (voiceMode === "none") return;
    const s = (voiceoverScript || "").trim();
    if (!s) return;
    if (scriptTooLong) {
      if (voiceMode === "character_dialogue") {
        throw new Error(
          `Your Character Dialogue is too long (~${scriptEstimateSec}s). Keep it within about ${scriptMaxSeconds}s so the person only speaks during their on-screen dialogue window.`
        );
      }
      throw new Error(
        `Your voiceover script is too long (~${scriptEstimateSec}s) for a ${duration}s video. Please shorten it.`
      );
    }
  };

  const buildUnifiedReferencePrompt = () => {
    const parts = [
      description.trim(),
      productName.trim() ? `Advertised product or service: ${productName.trim()}.` : "",
      offer.trim() ? `Offer: ${offer.trim()}.` : "",
      audience.trim() ? `Audience: ${audience.trim()}.` : "",
      goal ? `Goal: ${goal}.` : "",
      tone.trim() ? `Tone: ${tone.trim()}.` : "",
      hookStyle ? `Hook style: ${hookStyle}.` : "",
      sceneStyle ? `Scene style: ${sceneStyle}.` : "",
      cameraMotion ? `Camera motion: ${cameraMotion}.` : "",
      lightingStyle ? `Lighting: ${lightingStyle}.` : "",
      pace ? `Pace: ${pace}.` : "",
      callToAction.trim() ? `Call to action: ${callToAction.trim()}.` : "",
      fullCreativeDirection.trim()
        ? `Additional creative direction: ${fullCreativeDirection.trim()}`
        : "",
      promptText.trim()
        ? `Reference image motion direction: ${promptText.trim()}`
        : "",
    ].filter(Boolean);

    return parts.join(" ").slice(0, 1580);
  };

  // Start jobs
  const startImageVideo = async () => {
    if (!ensureVideoCreditsAvailable()) return;
    if (!imageFile) throw new Error("Please upload an image first.");
    ensureScriptFitsOrThrow();

    resetJob();
    setLoading(true);
    setError(null);
    clearVideoValidation();

    try {
      const token = await getIdToken();
      const promptImageUrl = await uploadImageToBackend(imageFile, ratio);

      const payload = {
        companyName: companyName.trim() || null,
        productName: productName.trim() || null,
        useBrandKit,
        brandKitId,
        promptImageUrl,
        promptText: buildUnifiedReferencePrompt(),
        duration,
        ratio,
        voiceoverScript: voiceMode !== "none" ? (voiceoverScript || "").trim() : null,
        voiceover: {
          enabled: voiceMode === "voiceover",
          presetVoice,
        },
        audio: {
          voiceMode,
          characterVoice,
          characterGender,
          characterAction: characterAction.trim() || null,
          musicAndEffects,
        },
        textOverlays: voiceMode === "none" && textOverlays,
        overlayMessages: voiceMode === "none" && textOverlays ? overlayMessages.slice(0, quickOverlayLimit) : [],
        ctaFinish,

        // The backend securely resolves the current learned profile.
        usePerformanceIntelligence:
          usePerformanceIntelligence &&
          canUsePerformanceIntelligence,
      };

      const res = await fetch(`${QUICK_V2_API_BASE}/video-v2/quick/start-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await quickV2SafeJson(res);
      if (!res.ok) {
        const detail =
          data?.detail ??
          data?.error ??
          data?.message;

        const message =
          customerSafeMessage(
            detail,
            "We couldn't start your video generation. Please try again."
          );

        if (res.status === 400) {
          showVideoValidation(detail);
          return;
        }

        if (res.status === 429) {
          setVideoLimitReached(true);
          const responseUsed = Number(detail?.used);
          const responseCap = Number(detail?.cap);
          if (Number.isFinite(responseUsed)) setVideoUsageUsed(responseUsed);
          if (Number.isFinite(responseCap)) setVideoUsageCap(responseCap);
        }

        throw new Error(
          res.status === 429
            ? message ||
              "You've reached your video credit limit. Upgrade or wait until your next billing cycle."
            : message
        );
      }

      setJobId(data.jobId);
      setHasGeneratedBefore(true);
      setVideoUsageUsed((current) => {
        const next = Number.isFinite(current) ? current + Number(duration === 10 ? 2 : 1) : current;
        if (
          Number.isFinite(next) &&
          Number.isFinite(videoUsageCap) &&
          next >= videoUsageCap &&
          purchasedVideoCredits <= 0
        ) {
          setVideoLimitReached(true);
        }
        return next;
      });
      setStatus(data.status || "running");
      setProgressStage(data.progressStage || "waiting_for_server");
      setProgressMessage(data.progressMessage || "Generating your video.");
      setProgressPercent(data.progressPercent ?? 45);
    } catch (e) {
      setError(
        customerSafeMessage(
          e?.message,
          "We couldn't start your video generation. Please try again."
        )
      );
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const startPromptVideo = async ({ quickMode = false } = {}) => {
    if (!ensureVideoCreditsAvailable()) return;
    if (!quickMode) {
      ensureScriptFitsOrThrow();

      if (
        voiceMode === "character_dialogue" &&
        !hasUsefulCharacterDescription(description, fullCreativeDirection, characterAction)
      ) {
        setValidationError({
          code: "character_description_required",
          title: "Describe the on-screen character",
          message: "Character Dialogue works best when ADGen knows who should stay consistent on screen.",
          help: "Add approximate age, appearance, wardrobe, and presentation style to the Video Prompt or Full Creative Direction. Example: “A woman in her early 30s with shoulder-length brown hair, wearing a cream fitted top.”",
          actionLabel: "Add Suggested Character",
          target: "creative",
        });
        setError(null);
        window.setTimeout(() => {
          validationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
        return;
      }
    }

    resetJob();
    setLoading(true);
    setError(null);
    clearVideoValidation();

    try {
      const token = await getIdToken();

      const effectiveDuration = duration;
      const effectiveVoiceMode = quickMode ? "none" : voiceMode;
      const effectiveVoiceEnabled = effectiveVoiceMode === "voiceover";
      const selectedFormat =
        FORMAT_OPTIONS.find((option) => option.id === formatId) ||
        FORMAT_OPTIONS[0];
      const effectiveRatio = selectedFormat.ratio;
      const effectivePlatform = selectedFormat.platform;

      const payload = {
        companyName: companyName.trim() || null,
        useBrandKit,
        brandKitId,
        productName,
        description,
        offer: offer || null,
        audience: audience || null,
        tone,
        platform: effectivePlatform,

        goal,
        hookStyle,
        sceneStyle,
        cameraMotion,
        lightingStyle,
        pace,
        callToAction,
        controlOverrides,
        fullCreativeDirection: quickMode
          ? null
          : fullCreativeDirection || null,
        userPrompt: null,

        duration: effectiveDuration,
        ratio: effectiveRatio,

        voiceoverScript: effectiveVoiceMode !== "none"
          ? (voiceoverScript || "").trim()
          : null,
        voiceover: {
          enabled: effectiveVoiceEnabled,
          presetVoice,
        },
        audio: {
          voiceMode: effectiveVoiceMode,
          characterVoice,
          characterGender,
          characterAction: quickMode ? null : (characterAction.trim() || null),
          musicAndEffects: quickMode ? false : musicAndEffects,
        },
        textOverlays: !quickMode && effectiveVoiceMode === "none" && textOverlays,
        overlayMessages:
          !quickMode && effectiveVoiceMode === "none" && textOverlays
            ? overlayMessages.slice(0, quickOverlayLimit)
            : [],
        ctaFinish: quickMode ? false : ctaFinish,

        // The backend securely resolves the current learned profile.
        usePerformanceIntelligence:
          usePerformanceIntelligence &&
          canUsePerformanceIntelligence,
      };

      const res = await fetch(`${QUICK_V2_API_BASE}/video-v2/quick/start-prompt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await quickV2SafeJson(res);
      if (!res.ok) {
        const detail =
          data?.detail ??
          data?.error ??
          data?.message;

        const message =
          customerSafeMessage(
            detail,
            "We couldn't start your video generation. Please try again."
          );

        if (res.status === 400) {
          showVideoValidation(detail);
          return;
        }

        if (res.status === 429) {
          setVideoLimitReached(true);
          const responseUsed = Number(detail?.used);
          const responseCap = Number(detail?.cap);
          if (Number.isFinite(responseUsed)) setVideoUsageUsed(responseUsed);
          if (Number.isFinite(responseCap)) setVideoUsageCap(responseCap);
        }

        throw new Error(
          res.status === 429
            ? message ||
              "You've reached your video credit limit. Upgrade or wait until your next billing cycle."
            : message
        );
      }

      setJobId(data.jobId);
      setHasGeneratedBefore(true);
      setVideoUsageUsed((current) => {
        const creditsUsed = quickMode ? 1 : Number(duration === 10 ? 2 : 1);
        const next = Number.isFinite(current) ? current + creditsUsed : current;
        if (
          Number.isFinite(next) &&
          Number.isFinite(videoUsageCap) &&
          next >= videoUsageCap &&
          purchasedVideoCredits <= 0
        ) {
          setVideoLimitReached(true);
        }
        return next;
      });
      setStatus(data.status || "running");
      setProgressStage(data.progressStage || "waiting_for_server");
      setProgressMessage(data.progressMessage || "Generating your video.");
      setProgressPercent(data.progressPercent ?? 45);
    } catch (e) {
      setError(
        customerSafeMessage(
          e?.message,
          "We couldn't start your video generation. Please try again."
        )
      );
      throw e;
    } finally {
      setLoading(false);
    }
  };

  // Poll status
  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`${QUICK_V2_API_BASE}/video-v2/quick/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await quickV2SafeJson(res);
        if (!res.ok) {
          throw new Error(
            customerSafeMessage(
              data?.detail,
              "We couldn't check your video status. Please try again."
            )
          );
        }

        if (cancelled) return;

        setStatus(data.status);
        setProgressStage(data.progressStage || (data.status === "succeeded" ? "succeeded" : "waiting_for_server"));
        setProgressMessage(data.progressMessage || "Generating your video.");
        setProgressPercent(data.progressPercent ?? (data.status === "succeeded" ? 100 : 45));

        if (data.status === "succeeded" && data.finalVideoUrl) {
          setFinalVideoUrl(data.finalVideoUrl);
          setFeedbackOpen(true);
          void claimFirstGeneration("video", jobId, token);
          // Success is terminal: refresh the shared plan/purchased-credit balances now.
          void refreshWorkspaceRef.current?.();
          return;
        }
        if (data.status === "failed") {
          const safeFailure = customerSafeMessage(
            data.error,
            "We couldn't create your video. Close this message and try again."
          );
          setProgressStage("failed");
          setProgressPercent(100);
          setProgressMessage(safeFailure);
          setError(safeFailure);
          // Terminal failure reflects the backend's finalized rollback/refund state.
          void refreshWorkspaceRef.current?.();
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        const safeFailure = customerSafeMessage(
          e?.message,
          "We couldn't continue checking this video. Close this message and try again."
        );
        setStatus("failed");
        setProgressStage("failed");
        setProgressPercent(100);
        setProgressMessage(safeFailure);
        setError(safeFailure);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);
  const canStartUnified = Boolean(productName.trim() && description.trim());

  const ensureVideoCreditsAvailable = () => {
    if (!videoLimitReached) return true;

    setError(
      "You've used all available video credits for this billing period. Upgrade to continue creating."
    );
    window.setTimeout(() => {
      statusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    return false;
  };

  // Locked UX
  if (!auth.currentUser) {
    return (
      <div className="videoAds">
        <div className="videoAdsHeader">
          <h1>Video Ads</h1>
          <p>Create 6s or 10s video ads with optional voice, dialogue, music, and sound effects.</p>
        </div>

        <div className="box">
          <p>Please log in to use Video Ads.</p>
          <button className="primary" onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      </div>
    );
  }

  if (!meLoaded) {
    return (
      <div className="videoAds">
        <div className="videoAdsHeader">
          <h1>Video Ads</h1>
          <p>Loading your video workspace...</p>
        </div>
      </div>
    );
  }

  if (!canUseVideoAds) {
    return (
      <div className="videoAds">
        <div className="videoAdsHeader">
          <h1>Video Ads</h1>
          <p>Create 6s or 10s video ads with optional voice, dialogue, music, and sound effects.</p>
        </div>

        <div className="box">
          <h2>🔒 Video Ads require an active plan</h2>
          <p>Activate Free or choose a paid plan to unlock video generation.</p>
          <button className="primary" onClick={() => navigate("/subscribe?upgrade=1")}>Upgrade</button>
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    );
  }
const downloadVideo = async () => {
  if (!jobId) return;

  try {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    const token = await user.getIdToken(true);
    const response = await fetch(
      `${QUICK_V2_API_BASE}/video-v2/quick/download/${encodeURIComponent(jobId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const data = await quickV2SafeJson(response);
      throw new Error(
        safeDetailMessage(data?.detail) || "Download request failed."
      );
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `adgen-${jobId}.mp4`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Video download failed:", err);
    alert("Download failed. Please try again.");
  }
};

return (
  <div className="videoAds">
    <GenerationFeedback
      open={feedbackOpen && !!jobId && !!finalVideoUrl}
      onClose={() => setFeedbackOpen(false)}
      apiBase={API_BASE}
      resourceType="video"
      resourceId={jobId}
      mediaUrl={finalVideoUrl}
      mediaType="video"
      title="Your video is ready"
      question="How was this result?"
      onDownload={downloadVideo}
    />
    <GenerationProgress
      open={isGenerating || status === "failed"}
      type="videoV2Quick"
      stage={status === "failed" ? "failed" : progressStage}
      message={error || progressMessage}
      percent={status === "failed" ? 100 : progressPercent}
      voiceoverEnabled={voiceMode === "voiceover" && !!(voiceoverScript || "").trim()}
      voiceMode={voiceMode}
      musicAndEffects={musicAndEffects}
      failed={status === "failed"}
      errorMessage={error}
      onClose={() => {
        setStatus(null);
        setJobId(null);
        setError(null);
        setProgressStage("queued");
        setProgressMessage("Preparing your video request.");
        setProgressPercent(5);
      }}
      expectedMaxSeconds={600}
    />

    <div className="videoAdsLayout">
      <main className="videoAdsMain">
        <div className="videoAdsHeader videoAdsHero">
          <div className="videoTitleRow">
            <h1>Generate Video</h1>
            <FeatureTutorial
              feature="videoGenerator"
              title="Learn Video Generator"
              description="See how to create a video with Quick Create, then explore image animation, voiceover, and advanced video controls."
              durationLabel="Quick walkthrough"
              videoSrc="/tutorials/video-generator-demo.mp4"
            />
          </div>
          <p>
            Create high-performing AI video advertisements from prompts or images using your Brand Kit,
            winning creative insights, optional voice, synchronized dialogue, music, and sound effects.
          </p>
        </div>

{videoLimitReached && (
          <div className="generatorLimitTop">
            <div className="generatorUsageLimitCard generatorUsageLimitCardV2" role="alert">
                  <div className="generatorLimitIntro">
                    <strong>Video credits used</strong>
                    
                    <p className="generatorLimitSummary">
                      You've used all available video credits
                      {Number.isFinite(videoUsageCap)
                        ? ` (${videoUsageUsed ?? videoUsageCap}/${videoUsageCap})`
                        : ""}.
                    </p>
                    <p>
                      Choose how you want to keep generating. Purchased credits are a one-time add-on and never expire.
                    </p>
                  </div>

                  <div className="generatorLimitChoices">
                    <button
                      type="button"
                      className="generatorLimitChoice generatorLimitChoiceUpgrade"
                      onClick={() => navigate("/subscribe?upgrade=1")}
                    >
                      <span className="generatorLimitChoiceIcon" aria-hidden="true">
                        <Crown size={20} />
                      </span>
                      <span className="generatorLimitChoiceCopy">
                        <strong>Upgrade your plan</strong>
                        <small>Get more included monthly video credits and additional ADGen features.</small>
                      </span>
                      <span className="generatorLimitChoiceAction">Upgrade Plan</span>
                    </button>

                    <span className="generatorLimitOr" aria-hidden="true">OR</span>

                    <button
                      type="button"
                      className="generatorLimitChoice generatorLimitChoiceCredits"
                      onClick={() => setCreditPacksOpen(true)}
                    >
                      <span className="generatorLimitChoiceIcon" aria-hidden="true">
                        <ShoppingCart size={20} />
                      </span>
                      <span className="generatorLimitChoiceCopy">
                        <strong>Buy more video credits</strong>
                        <small>Add video credits instantly with a one-time purchase.</small>
                      </span>
                      <span className="generatorLimitChoiceAction">Buy Video Credits</span>
                    </button>
                  </div>
                </div>
          </div>
        )}

        {advancedOpen ? (
          <section className="videoQuickCollapsed" aria-label="Quick Create">
            <div>
              <span className="videoQuickKicker">Quick Create</span>
              <h2>Full Creative Workspace is open</h2>
              <p>
                The simplified prompt is hidden so there is only one active
                generation path and one Create button.
              </p>
            </div>

            <button
              type="button"
              className="videoSwitchQuickButton"
              onClick={() => {
                setAdvancedOpen(false);
                setTemplatesOpen(false);
                setDuration(6);
                setVoiceMode("none");
                setVoiceoverScript("");
                setControlOverrides([]);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={isGenerating}
            >
              Switch to Quick Create
              <span aria-hidden="true">↑</span>
            </button>
          </section>
        ) : (
          <section className="videoQuickStart" aria-labelledby="video-quick-title">
            <div className="videoQuickHead">
              <span className="videoQuickKicker">
                {hasGeneratedBefore ? "Quick Create" : "Fastest way to begin"}
              </span>
              <h2 id="video-quick-title">
                {hasGeneratedBefore
                  ? "Create Another Video"
                  : "Create Your First Video"}
              </h2>
              <p>
                {hasGeneratedBefore
                  ? "Add the essentials for a fast prompt-to-video generation, or open the full workspace for complete control."
                  : "Describe what you are promoting and ADGen will prepare the video settings for you. The full creative workspace remains available below."}
              </p>
            </div>

            <div className="videoQuickDefaultsNote">
              <strong>
                {isFreePlan
                  ? "Quick Create uses Prompt → Video, a 6-second duration, and no voiceover."
                  : "Quick Create uses Prompt → Video, your choice of 6 or 10 seconds, and no voiceover."}
              </strong>
              <span>
                Open the Full Creative Workspace for image animation, narration,
                character dialogue, and advanced motion controls.
              </span>
            </div>

            <div className="videoQuickDurationPicker" aria-label="Quick Create duration">
              <span>Duration</span>
              <div>
                {[
                  { value: 6, credits: 1 },
                  ...(canUseQuickTenSeconds ? [{ value: 10, credits: 2 }] : []),
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={duration === item.value ? "selected" : ""}
                    onClick={() => setDuration(item.value)}
                    disabled={isGenerating}
                  >
                    <strong>{item.value}s</strong>
                    <small>{item.credits} {item.credits === 1 ? "credit" : "credits"}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="videoQuickFields">
              <div className="field">
                <label>Company / Brand Name <span className="videoQuickOptional">Optional</span></label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Example: Ember Coffee Co."
                  maxLength={LIMITS.companyName}
                  disabled={isGenerating}
                />
                <div
                  className={`videoCharacterCount ${
                    companyName.length >= LIMITS.companyName * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {companyName.length}/{LIMITS.companyName}
                </div>
              </div>

              <div className="field">
                <label>Product or Service</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="What are you advertising?"
                  maxLength={QUICK_PRODUCT_MAX}
                  disabled={isGenerating}
                />
                <div
                  className={`videoCharacterCount ${
                    productName.length >= QUICK_PRODUCT_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {productName.length}/{QUICK_PRODUCT_MAX}
                </div>
              </div>

              <div className="field">
                <label>Who is this for?</label>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Example: online shoppers, busy parents, small businesses"
                  maxLength={QUICK_AUDIENCE_MAX}
                  disabled={isGenerating}
                />
                <div
                  className={`videoCharacterCount ${
                    audience.length >= QUICK_AUDIENCE_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {audience.length}/{QUICK_AUDIENCE_MAX}
                </div>
              </div>

              <div className="field videoQuickDescription">
                <label>
                  Video Prompt
                  <InfoTip text="Describe the subject, action, environment, camera movement, and ending shot you want in the video." />
                </label>
                <textarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearVideoValidation(); }}
                  placeholder="Example: A premium coffee bottle pouring over ice in a bright café, close-up condensation, energetic movement, ending with the product centered on screen."
                  maxLength={VIDEO_DESCRIPTION_MAX}
                  disabled={isGenerating}
                />
                <div className="videoQuickPromptHelper">
                  Describe the subject, action, environment, product interaction, camera movement, and ending shot. ADGen expands this into production-ready video direction.
                </div>
                <div
                  className={`videoCharacterCount ${
                    description.length >= VIDEO_DESCRIPTION_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {description.length}/{VIDEO_DESCRIPTION_MAX}
                </div>
              </div>

              <div className="field">
                <label>Goal</label>
                <select
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    markControlOverride("goal");
                  }}
                  disabled={isGenerating}
                >
                  <option value="conversions">Sales / Conversions</option>
                  <option value="leads">Generate Leads</option>
                  <option value="traffic">Website Traffic</option>
                  <option value="awareness">Brand Awareness</option>
                </select>
              </div>

              <div className="field">
                <label>Visual Style</label>
                <select
                  value={sceneStyle}
                  onChange={(e) => {
                    setSceneStyle(e.target.value);
                    markControlOverride("sceneStyle");
                  }}
                  disabled={isGenerating}
                >
                  <option value="studio product">Product Showcase</option>
                  <option value="lifestyle">Lifestyle</option>
                  <option value="ugc">UGC Style</option>
                  <option value="cinematic">Cinematic / Premium</option>
                  <option value="minimal abstract">Minimal</option>
                </select>
              </div>

              <div className="field">
                <label>Platform / Aspect Ratio</label>
                <select
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  disabled={isGenerating}
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Call to Action <span className="videoQuickOptional">Optional</span></label>
                <input
                  value={callToAction}
                  onChange={(e) => setCallToAction(e.target.value)}
                  placeholder="Example: Shop Now"
                  maxLength={QUICK_CTA_MAX}
                  disabled={isGenerating}
                />
                <div
                  className={`videoCharacterCount ${
                    callToAction.length >= QUICK_CTA_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {callToAction.length}/{QUICK_CTA_MAX}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="videoQuickGenerate"
              disabled={
                isGenerating ||
                videoLimitReached ||
                !productName.trim() ||
                !description.trim()
              }
              onClick={async () => {
                setVoiceMode("none");
                setVoiceoverScript("");

                try {
                  await startPromptVideo({ quickMode: true });
                } catch {}
              }}
            >
              {isGenerating
                ? "Creating..."
                : hasGeneratedBefore
                  ? "✨ Generate Video"
                  : "✨ Generate My First Video"}
            </button>

            <div className="videoQuickDivider">
              <span>or</span>
            </div>

            <div className="videoQuickTemplateAction">
              <button
                type="button"
                className="videoQuickSecondary"
                onClick={() => {
                  setTemplatesOpen(true);

                  window.setTimeout(() => {
                    templateSectionRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 120);
                }}
                disabled={isGenerating}
                aria-expanded={templatesOpen}
                aria-controls="video-template-options"
              >
                Need Inspiration? 🎨 Start with a Template
              </button>
            </div>

            <div className="videoFullWorkspaceCallout">
              <div>
                <span className="videoFullWorkspaceKicker">
                  Full creative workspace
                </span>
                <h3>Need complete video control?</h3>
                <p>
                  Choose image-to-video or prompt-to-video, configure duration,
                  format, voice, audio, Brand Kit, Performance Intelligence, motion,
                  lighting, pacing, creative direction, and every advanced setting.
                </p>
              </div>

              <button
                type="button"
                className="videoFullWorkspaceButton"
                onClick={() => {
                  setTemplatesOpen(false);
                  setAdvancedOpen(true);

                  window.setTimeout(() => {
                    firstWorkspaceSectionRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 80);
                }}
                disabled={isGenerating}
                aria-expanded={advancedOpen}
                aria-controls="video-full-workspace"
              >
                Open Full Creative Workspace
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

        {(!advancedOpen ? templatesOpen : true) && (
          <section
            ref={templateSectionRef}
            className={`template-starter video-template-starter ${
              templatesOpen ? "is-open" : "is-collapsed"
            }`}
            aria-labelledby="video-template-title"
          >
            <button
              type="button"
              className="template-starter-toggle"
              onClick={() => setTemplatesOpen((open) => !open)}
              aria-expanded={templatesOpen}
              aria-controls="video-template-options"
            >
              <span className="template-starter-heading">
                <span>
                  <span className="template-eyebrow">Need inspiration?</span>
                  <span id="video-template-title" className="template-title">
                    Start with a Template
                  </span>
                  <span className="template-description">
                    Choose an industry and ADGen will prepare the workspace for you. 8 templates available.
                  </span>
                </span>

                <span className="template-heading-actions">
                  {selectedTemplateId && (
                    <span className="template-loaded-pill">
                      {selectedTemplateId === "scratch"
                        ? "Blank setup selected"
                        : `✓ ${selectedVideoTemplate?.name || "Template"} template`}
                    </span>
                  )}
                  <span className="template-chevron" aria-hidden="true">⌄</span>
                </span>
              </span>
            </button>

            <div
              id="video-template-options"
              className="template-options"
              hidden={!templatesOpen}
            >
              <div className="template-card-grid">
                {VIDEO_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`template-card ${
                      selectedTemplateId === template.id ? "selected" : ""
                    }`}
                    onClick={() => applyVideoTemplate(template)}
                    disabled={isGenerating}
                    aria-pressed={selectedTemplateId === template.id}
                  >
                    <span className="template-card-icon" aria-hidden="true">
                      {template.icon}
                    </span>
                    <span className="template-card-copy">
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                    <span className="template-card-action">Use template</span>
                  </button>
                ))}

                <button
                  type="button"
                  className={`template-card template-card-scratch ${
                    selectedTemplateId === "scratch" ? "selected" : ""
                  }`}
                  onClick={startVideoFromScratch}
                  disabled={isGenerating}
                  aria-pressed={selectedTemplateId === "scratch"}
                >
                  <span className="template-card-icon" aria-hidden="true">
                    ✨
                  </span>
                  <span className="template-card-copy">
                    <strong>Start From Scratch</strong>
                    <small>
                      Clear the guided setup and configure the video yourself.
                    </small>
                  </span>
                  <span className="template-card-action">
                    {selectedTemplateId === "scratch"
                      ? "Selected ✓"
                      : "Use blank setup"}
                  </span>
                </button>
              </div>

              <div className="template-helper-note">
                <span aria-hidden="true">✨</span>
                <span>
                  Templates prefill your current controls only. Brand Kit,
                  voiceover, Performance Intelligence, optional reference images,
                  and every existing integration stay unchanged.
                </span>
              </div>
            </div>
          </section>
        )}

        {advancedOpen && (
          <div id="video-full-workspace">
            {!isFreePlan ? (
              <BrandKitSelector
                value={brandKitId}
                onChange={setBrandKitId}
                onKitChange={setBrandKit}
                disabled={isGenerating || !useBrandKit}
              />
            ) : (
              <div className="hint videoFreePlanHint">
                Brand Kit is available on paid plans. Your complimentary video
                can still be created without it.
              </div>
            )}

        <div className="videoAdsForm">
        <div ref={firstWorkspaceSectionRef} className="template-scroll-target">
          <div ref={creativeSectionRef} className="videoCreativeScrollTarget">
            <StepSection
              step="1"
              title="Create Your Video"
              description="Describe the video you want. Add a reference image only when you want ADGen to preserve a specific product, subject, packaging, or visual starting point."
            >
              <div className="videoQuickCreativeIdentity">
                <div className="field">
                  <label>
                    Company / Brand Name <span className="videoQuickOptional">Optional</span>
                    <InfoTip text="Keeps the generated video associated with the correct company or brand and supports Brand Kit context when enabled." />
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Example: Ember Coffee Co."
                    maxLength={LIMITS.companyName}
                    disabled={isGenerating}
                  />
                  <div
                    className={`videoCharacterCount ${
                      companyName.length >= LIMITS.companyName * 0.9 ? "nearLimit" : ""
                    }`}
                  >
                    {companyName.length}/{LIMITS.companyName}
                  </div>
                </div>

                <div className="field">
                  <label>
                    Product or Service
                    <InfoTip text="The product, service, app, property, event, or offer the video is advertising." />
                  </label>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="What are you advertising?"
                    maxLength={QUICK_PRODUCT_MAX}
                    disabled={isGenerating}
                  />
                  <div
                    className={`videoCharacterCount ${
                      productName.length >= QUICK_PRODUCT_MAX * 0.9 ? "nearLimit" : ""
                    }`}
                  >
                    {productName.length}/{QUICK_PRODUCT_MAX}
                  </div>
                </div>
              </div>

              <div className="field">
                <label>
                  Video Prompt & Product Description
                  <InfoTip text="Describe the product, setting, action, environment, product interaction, camera movement, and desired ending shot." />
                </label>
                <textarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearVideoValidation(); }}
                  rows={3}
                  maxLength={VIDEO_DESCRIPTION_MAX}
                  disabled={isGenerating}
                  placeholder="Describe the product, setting, action, and desired visual result."
                />
                <div
                  className={`videoCharacterCount ${
                    description.length >= VIDEO_DESCRIPTION_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {description.length}/{VIDEO_DESCRIPTION_MAX}
                </div>
              </div>

              <div className="videoSectionHeading videoModeHeading">
                <h2>
                  Optional Reference Image
                  <InfoTip text="If you add an image, ADGen automatically uses it as the visual starting point. If you leave this empty, ADGen generates the clip from your written brief." />
                </h2>
                <p>
                  Upload an image when exact product appearance, packaging, a person, property,
                  interface, or another visual should be preserved.
                </p>
              </div>

              <div
                className={`dropzone ${dragOver ? "dragOver" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !isGenerating && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <input
                  ref={fileInputRef}
                  className="hiddenFile"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                  disabled={isGenerating}
                />

                {!imagePreview ? (
                  <div className="dropzoneInner">
                    <div className="dzTitle">Add a reference image (optional)</div>
                    <div className="dzSub">
                      Drag & drop or click to upload (PNG/JPG/WEBP)
                    </div>
                  </div>
                ) : (
                  <div className="previewWrap">
                    <img src={imagePreview} alt="Reference preview" className="previewImg" />
                    <div className="previewMeta">
                      <div className="previewName">{imageFile?.name}</div>
                      <div className="hint">
                        ADGen will automatically use Image → Video for this generation.
                      </div>
                      <button
                        className="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPickFile(null);
                        }}
                        type="button"
                        disabled={isGenerating}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {imagePreview && (
                <>
                  <div className="uploadTip">
                    <strong>Reference image active</strong>
                    <p>
                      ADGen will preserve the supplied visual identity while using the same
                      campaign brief and controls below to direct the clip.
                    </p>
                  </div>

                  <div className="field">
                    <label>
                      Reference Image Motion <span className="videoQuickOptional">Optional</span>
                      <InfoTip text="Add any motion that specifically applies to the uploaded image, such as a camera push, hand interaction, product rotation, or subject movement." />
                    </label>
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={3}
                      maxLength={IMAGE_MOTION_PROMPT_MAX}
                      disabled={isGenerating}
                      placeholder="Example: Slow camera push-in while a hand picks up the bottle and turns it toward camera."
                    />
                    <div
                      className={`videoCharacterCount ${
                        promptText.length >= IMAGE_MOTION_PROMPT_MAX * 0.9
                          ? "nearLimit"
                          : ""
                      }`}
                    >
                      {promptText.length}/{IMAGE_MOTION_PROMPT_MAX}
                    </div>
                  </div>
                </>
              )}

              <div className="grid2">
                <div className="field">
                  <label>
                    Offer
                    <InfoTip text="Discounts, promotions, free trials, bundles, or incentives to include." />
                  </label>
                  <input
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
                </div>

                <div className="field">
                  <label>
                    Audience
                    <InfoTip text="Who this video advertisement is intended for." />
                  </label>
                  <input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>
                    Goal
                    <InfoTip text="Choose whether the video should focus on sales, leads, traffic, or awareness." />
                  </label>
                  <select value={goal} onChange={(e) => { setGoal(e.target.value); markControlOverride("goal"); }} disabled={isGenerating}>
                    <option value="conversions">Sales / Conversions</option>
                    <option value="leads">Generate Leads</option>
                    <option value="traffic">Website Traffic</option>
                    <option value="awareness">Brand Awareness</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Tone
                    <InfoTip text="Controls the personality of the commercial." />
                  </label>
                  <input value={tone} onChange={(e) => { setTone(e.target.value); markControlOverride("tone"); }} disabled={isGenerating} />
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>
                    Hook Style
                    <InfoTip text="Determines how the video captures attention during the first few seconds." />
                  </label>
                  <select value={hookStyle} onChange={(e) => { setHookStyle(e.target.value); markControlOverride("hookStyle"); }} disabled={isGenerating}>
                    <option value="bold claim">Bold claim</option>
                    <option value="question">Question</option>
                    <option value="problem solution">Problem → Solution</option>
                    <option value="social proof">Social proof</option>
                    <option value="before after">Before / After</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Pace
                    <InfoTip text="Controls the speed and rhythm of the edit." />
                  </label>
                  <select value={pace} onChange={(e) => { setPace(e.target.value); markControlOverride("pace"); }} disabled={isGenerating}>
                    <option value="fast">Fast (scroll-stopping)</option>
                    <option value="medium">Medium</option>
                    <option value="slow cinematic">Slow / cinematic</option>
                  </select>
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>
                    Scene Style
                    <InfoTip text="Defines the overall visual style of the commercial." />
                  </label>
                  <select value={sceneStyle} onChange={(e) => { setSceneStyle(e.target.value); markControlOverride("sceneStyle"); }} disabled={isGenerating}>
                    <option value="studio product">Studio product</option>
                    <option value="lifestyle">Lifestyle</option>
                    <option value="ugc">UGC style</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="minimal abstract">Minimal / abstract</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Camera Motion
                    <InfoTip text="Controls how the virtual camera moves through the scene." />
                  </label>
                  <select value={cameraMotion} onChange={(e) => { setCameraMotion(e.target.value); markControlOverride("cameraMotion"); }} disabled={isGenerating}>
                    <option value="none">None</option>
                    <option value="subtle">Subtle</option>
                    <option value="dynamic">Dynamic</option>
                    <option value="fast cuts">Fast cuts</option>
                  </select>
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>
                    Lighting
                    <InfoTip text="Sets the lighting mood for the generated video." />
                  </label>
                  <select value={lightingStyle} onChange={(e) => { setLightingStyle(e.target.value); markControlOverride("lightingStyle"); }} disabled={isGenerating}>
                    <option value="bright clean">Bright / clean</option>
                    <option value="natural">Natural</option>
                    <option value="dramatic">Dramatic</option>
                    <option value="high contrast">High contrast</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Call to Action
                    <InfoTip text="The action you want viewers to take after watching." />
                  </label>
                  <input value={callToAction} onChange={(e) => setCallToAction(e.target.value)} disabled={isGenerating} />
                </div>
              </div>

              <div className="field">
                <label>
                  Creative Direction
                  <InfoTip text="Optional guidance for composition, storytelling, motion, or other details not covered by the controls above." />
                </label>
                <textarea
                  value={fullCreativeDirection}
                  onChange={(e) => setFullCreativeDirection(e.target.value)}
                  maxLength={CREATIVE_DIRECTION_MAX}
                  placeholder="Optional — add any final creative direction"
                  disabled={isGenerating}
                  rows={3}
                />
                <div
                  className={`videoCharacterCount ${
                    fullCreativeDirection.length >= CREATIVE_DIRECTION_MAX * 0.9
                      ? "nearLimit"
                      : ""
                  }`}
                >
                  {fullCreativeDirection.length}/{CREATIVE_DIRECTION_MAX}
                </div>
              </div>

              {validationError && (
                <div
                  ref={validationRef}
                  className="videoValidationCard"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="videoValidationIcon" aria-hidden="true">!</div>
                  <div className="videoValidationCopy">
                    <strong>{validationError.title}</strong>
                    <p>{validationError.message}</p>
                    {validationError.help && (
                      <p className="videoValidationHelp">{validationError.help}</p>
                    )}
                  </div>

                  <div className="videoValidationActions">
                    <button
                      type="button"
                      className="videoValidationAction"
                      onClick={() => applyValidationFix(validationError)}
                    >
                      {validationError.actionLabel}
                    </button>

                    {validationError.secondaryActionLabel && (
                      <button
                        type="button"
                        className="videoValidationAction secondary"
                        onClick={() => applyValidationFix(validationError, true)}
                      >
                        {validationError.secondaryActionLabel}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </StepSection>
          </div>
        </div>
<div ref={videoSettingsSectionRef} className="video-settings-scroll-target">
        <StepSection
          step="2"
          title="Video Settings"
          description="Configure duration, format, voiceover, Brand Kit, and AI enhancements."
        >
          <div className="row videoSettingsCompact">
            <div className="field videoVoiceModeField">
              <label>
                Voice
                <InfoTip text="Choose silent video, off-screen AI narration, or synchronized on-screen Character Dialogue." />
              </label>
              <div className="videoVoiceModes" role="radiogroup" aria-label="Voice mode">
                {[
                  ["none", "No voice"],
                  ["voiceover", "AI Voiceover"],
                  ["character_dialogue", "Character Dialogue"],
                ].map(([value, label]) => (
                  <label key={value} className={`videoVoiceMode ${voiceMode === value ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="videoVoiceMode"
                      value={value}
                      checked={voiceMode === value}
                      onChange={() => setVoiceMode(value)}
                      disabled={isGenerating}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {voiceMode === "voiceover" && (
              <div className="field">
                <label>
                  Narrator Voice
                  <InfoTip text="Choose the off-screen voice that will narrate your script. Visible people remain nonverbal." />
                </label>
                <select
                  value={presetVoice}
                  onChange={(e) => setPresetVoice(e.target.value)}
                  disabled={isGenerating}
                >
                  {NARRATOR_VOICE_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {voiceMode === "character_dialogue" && (
              <>
                <div className="field">
                  <label>
                    On-Screen Character
                    <InfoTip text="Choose the character gender first. ADGen will only show matching character voices." />
                  </label>
                  <select
                    value={characterGender}
                    onChange={(e) => setCharacterGender(e.target.value)}
                    disabled={isGenerating}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Voice Style
                    <InfoTip text="Only voices matching the selected on-screen character are shown." />
                  </label>
                  <select
                    value={characterVoice}
                    onChange={(e) => setCharacterVoice(e.target.value)}
                    disabled={isGenerating}
                  >
                    {characterVoiceOptions.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label.replace(" — Female", "").replace(" — Male", "")}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="field">
              <label>
                Duration
                <InfoTip text="Controls the maximum length of the generated video." />
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={isGenerating}
              >
                <option value={6}>6 seconds (1 Credit)</option>
                {canUseQuickTenSeconds && (
                  <option value={10}>10 seconds (2 Credits)</option>
                )}
              </select>
            </div>

            <div className="field">
              <label>
                Format
                <InfoTip text="Optimizes framing and aspect ratio for your chosen platform." />
              </label>
              <select
                value={formatId}
                onChange={(e) => setFormatId(e.target.value)}
                disabled={isGenerating}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>


          <div className="videoEnhancementGrid">
           <div className={`videoEnhancementCard ${musicAndEffects ? "enabled" : ""}`}>
              <label className="videoToggle">
                <input
                  type="checkbox"
                  checked={musicAndEffects}
                  onChange={(e) => setMusicAndEffects(e.target.checked)}
                  disabled={isGenerating}
                />
                <span className="videoToggleCopy">
                  <span className="videoToggleTitle">
                    <span>Music &amp; Audio</span>
                    <InfoTip text="Adds campaign-matched instrumental music at a restrained background level. ADGen keeps speech clear and avoids unrelated sounds." />
                  </span>
                  <small>{musicAndEffects ? "Subtle background music and audio polish" : "Optional"}</small>
                </span>
              </label>
           </div>

           <div className={`videoEnhancementCard ${textOverlays && voiceMode === "none" ? "enabled" : ""}`}>
            <label className="videoToggle"><input type="checkbox" checked={textOverlays} onChange={(e) => setTextOverlays(e.target.checked)} disabled={isGenerating || voiceMode !== "none"} /><span className="videoToggleCopy"><span className="videoToggleTitle"><span>{voiceMode === "none" ? "Text Overlays" : "🔒 Text Overlays"}</span></span><small>{voiceMode === "none" ? `${quickOverlayLimit} messages maximum` : "Available with No Voice"}</small></span></label>
           </div>
           <div className={`videoEnhancementCard ${ctaFinish ? "enabled" : ""}`}>
            <label className="videoToggle"><input type="checkbox" checked={ctaFinish} onChange={(e) => setCtaFinish(e.target.checked)} disabled={isGenerating} /><span className="videoToggleCopy"><span className="videoToggleTitle"><span>CTA Finish</span></span><small>Separate final branded action</small></span></label>
           </div>

           <div className="videoEnhancementCard">
            {isFreePlan ? (
              <div className="videoToggleCopy">
                <span className="videoToggleTitle">
                  <span>🔒 Brand Kit</span>
                </span>
                <small>  Available on paid plans.</small>
              </div>
            ) : (
              <label className="videoToggle">
                <input
                  type="checkbox"
                  checked={useBrandKit}
                  onChange={(e) => setUseBrandKit(e.target.checked)}
                  disabled={isGenerating}
                />

                <span className="videoToggleCopy">
                  <span className="videoToggleTitle">
                    <span>Apply Brand Kit</span>
                    <InfoTip text="Applies your saved logo, colors, fonts, messaging, and creative preferences automatically." />
                  </span>
                  <small>Recommended</small>
                </span>
              </label>
            )}
          </div>

            <div
              className={`videoEnhancementCard videoIntelligenceCard ${
                usePerformanceIntelligence ? "enabled" : ""
              }`}
            >
              {!canUsePerformanceIntelligence ? (
                <div className="videoToggleCopy">
                  <span className="videoToggleTitle">
                    <span>🔒 Performance Intelligence</span>
                    <InfoTip text="Applies concise patterns learned from qualified performance data while preserving the current request, Brand Kit, source image, and the expanded video prompt budget." />
                  </span>
                  <small>Available on Pro &amp; Business plans.</small>
                </div>
              ) : (
                <label className="videoToggle">
                  <input
                    type="checkbox"
                    checked={usePerformanceIntelligence}
                    onChange={(e) =>
                      setUsePerformanceIntelligence(e.target.checked)
                    }
                    disabled={isGenerating}
                  />

                  <span className="videoToggleCopy">
                    <span className="videoToggleTitle">
                      <span>Apply Performance Intelligence</span>
                      <InfoTip text="Applies concise patterns learned from qualified performance data while preserving the current request, Brand Kit, source image, and the expanded video prompt budget." />
                    </span>
                    <small>
                      {usePerformanceIntelligence
                        ? "Learned video patterns will guide this generation"
                        : "Use what AdGen has learned from your performance"}
                    </small>
                  </span>
                </label>
              )}

              {canUsePerformanceIntelligence && (
                <PerformanceIntelligencePreview
                  enabled={usePerformanceIntelligence}
                  mode="video"
                />
              )}
            </div>
          </div>


          {voiceMode === "none" && textOverlays && <div className="videoQuickOverlayEditor"><div className="videoQuickFinishingHead"><strong>Text Overlay Messages</strong><span>{quickOverlayLimit} maximum · 2–6 words each.</span></div><div className="videoQuickOverlayInputs">{Array.from({ length: quickOverlayLimit }).map((_, index) => <label key={index}><span>Message {index + 1}</span><input value={overlayMessages[index] || ""} maxLength={42} placeholder="2–6 words" onChange={(e) => updateOverlayMessage(index, e.target.value)} /><small>{(overlayMessages[index] || "").length}/42</small></label>)}</div></div>}
          <div ref={voiceScriptRef} className={`box voBox ${voiceMode === "none" ? "voBoxDisabled" : ""}`}>
            <div className="voiceHeader">
              <div>
                <div className="boxTitle">
                  {voiceMode === "character_dialogue" ? "Character Dialogue Script" : "Voiceover Script"}
                  <InfoTip text="Keep the script concise so it fits the selected duration and the speaker’s planned on-screen time." />
                </div>
                <div className="hint">{voiceMode === "character_dialogue" ? "The visible on-screen person will deliver this line while continuing the Action While Speaking. Keep the line short enough for a natural pace." : "The selected narrator will read this script off-screen."}</div>
              </div>

              <button
                className="secondary miniBtn"
                disabled={isFreePlan || voiceMode !== "voiceover" || previewLoading || isGenerating || !(voiceoverScript || "").trim()}
                onClick={() => previewVoice()}
                type="button"
              >
                {previewLoading ? "Previewing..." : "Preview Voice"}
              </button>
            </div>

            {isFreePlan && (
              <div className="hint" style={{ marginTop: 8 }}>
                Voice preview is available on paid plans. Voiceover can still be included in your complimentary video.
              </div>
            )}

            {voiceMode === "character_dialogue" && (
              <div className="hint" style={{ marginTop: 8 }}>
                Character Dialogue is generated as part of the on-screen performance, so the final voice is evaluated with the finished scene rather than a separate preview.
              </div>
            )}

            {voiceMode === "character_dialogue" && (
              <div className="field videoCharacterActionField">
                <label>
                  Action While Speaking
                  <InfoTip text="Describe the physical action that should continue while the character delivers the dialogue. Quick Clip preserves this generated motion instead of defaulting to a static talking head." />
                </label>
                <textarea
                  value={characterAction}
                  onChange={(e) => { setCharacterAction(e.target.value); clearVideoValidation(); }}
                  rows={3}
                  maxLength={QUICK_V2_CHARACTER_ACTION_MAX}
                  disabled={isGenerating}
                  placeholder="Example: Walk through the gym while adjusting the treadmill and speaking naturally to camera."
                />
                <div className="hint">{characterAction.length}/{QUICK_V2_CHARACTER_ACTION_MAX} characters</div>
              </div>
            )}

            <textarea
              value={voiceoverScript}
              onChange={(e) => { setVoiceoverScript(e.target.value); clearVideoValidation(); }}
              rows={4}
              disabled={voiceMode === "none" || isGenerating}
              placeholder={voiceMode === "character_dialogue" ? "Type what the on-screen person should say…" : "Type your voiceover script here…"}
            />

            {scriptHint && (
              <div className={scriptTooLong ? "error" : "hint"} style={{ marginTop: 8 }}>
                {scriptHint}
              </div>
            )}

            {voiceMode === "none" && (
              <div className="voOverlay" aria-hidden="true">
                <div className="voOverlayCard">
                  <div className="voLock">🔒</div>
                  <div>
                    <div className="voOverlayTitle">Voice disabled</div>
                    <div className="voOverlaySub">Choose AI Voiceover or Character Dialogue to edit a script.</div>
                  </div>
                </div>
              </div>
            )}

            {previewUrl && (
              <div className="audioPreview">
                <audio ref={audioRef} controls src={previewUrl} />
                <button
                  type="button"
                  className="secondary miniBtn"
                  onClick={() => {
                    try {
                      audioRef.current?.play();
                    } catch {}
                  }}
                  style={{ marginLeft: 10 }}
                  disabled={isGenerating}
                >
                  Play
                </button>
              </div>
            )}
          </div>

          <div className="videoQuickFinalAction">
            <button
              className="primary"
              disabled={
                isGenerating ||
                videoLimitReached ||
                scriptTooLong ||
                !canStartUnified
              }
              onClick={async () => {
                try {
                  if (imageFile) {
                    await startImageVideo();
                  } else {
                    await startPromptVideo();
                  }
                } catch {}
              }}
              title={
                scriptTooLong
                  ? "Shorten your voiceover script to fit the selected duration."
                  : ""
              }
            >
              {isGenerating ? "Creating..." : "Create My Video"}
            </button>

            <div className="hint" style={{ marginTop: 8 }}>
              High-quality video generation can take up to 4 minutes.
            </div>
          </div>
        </StepSection>
        </div>
                </div>
          </div>
        )}
      </main>

      <aside className="videoAdsSide">
        <div className="side-card">
          <h3>Tips for better video ads</h3>
          <p>Use clear product visuals, short prompts, and strong motion direction.</p>
          <ul>
            <li>Use clean images with minimal text</li>
            <li>Describe camera movement or pacing</li>
            <li>Keep voiceover scripts short</li>
            <li>Match format to the placement</li>
          </ul>
        </div>

        <div className="side-card" ref={statusRef}>
          <h3>Generated Preview</h3>

          {!finalVideoUrl && !error && (
            <p className="side-muted">
              Your generated video will appear here after creation.
            </p>
          )}

          {error && <p>{error}</p>}

          {finalVideoUrl && (
            <>
              <video
                src={finalVideoUrl}
                controls
                className="generated-image"
              />

              <button
                type="button"
                className="download-button"
                onClick={() => {
                  window.open(finalVideoUrl, "_blank", "noopener,noreferrer");
                }}
              >
                Open Video
              </button>

              <button
                type="button"
                className="download-button"
                onClick={downloadVideo}
              >
                Download Video
              </button>

              <button
                type="button"
                className="download-button"
                onClick={() => setFeedbackOpen(true)}
              >
                View & Rate Result
              </button>
            </>
          )}
        </div>

        <div className="side-card">
          <h3>{advancedOpen ? "Video Specs" : "Quick Create Defaults"}</h3>

          {!advancedOpen ? (
            <div className="videoSpecList">
              <div className="videoSpecRow">
                <span>Creation mode</span>
                <strong>Prompt → Video</strong>
              </div>

              <div className="videoSpecRow">
                <span>Duration</span>
                <strong>{duration} seconds · {duration === 6 ? "1 credit" : "2 credits"}</strong>
              </div>

              <div className="videoSpecRow">
                <span>Format</span>
                <strong>
                  {FORMAT_OPTIONS.find((option) => option.id === formatId)?.label ||
                    formatId}
                </strong>
              </div>

              <div className="videoSpecRow">
                <span>Voiceover</span>
                <strong className="videoStatusPill off">Disabled</strong>
              </div>

              <div className="videoSpecRow">
                <span>Camera & lighting</span>
                <strong>AI directed</strong>
              </div>

              <div className="videoSpecRow">
                <span>Scene pacing</span>
                <strong>AI optimized</strong>
              </div>
            </div>
          ) : (
            <div className="videoSpecList">
              <div className="videoSpecRow">
                <span>Source</span>
                <strong>{imageFile ? "Reference image + brief" : "Written brief"}</strong>
              </div>

              <div className="videoSpecRow">
                <span>Duration</span>
                <strong>{duration}s</strong>
              </div>

              <div className="videoSpecRow">
                <span>Format</span>
                <strong>
                  {FORMAT_OPTIONS.find((o) => o.id === formatId)?.label ||
                    formatId}
                </strong>
              </div>

              <div className="videoSpecRow">
                <span>Voice</span>
                <strong>
                  {voiceMode === "voiceover"
                    ? `AI Voiceover · ${presetVoice}`
                    : voiceMode === "character_dialogue"
                      ? `Character Dialogue · ${QUICK_V2_CHARACTER_VOICES.find((voice) => voice.id === characterVoice)?.label || characterVoice}`
                      : "No voice"}
                </strong>
              </div>

              <div className="videoSpecRow">
                <span>Music & effects</span>
                <strong className={`videoStatusPill ${musicAndEffects ? "on" : "off"}`}>
                  {musicAndEffects ? "Enabled" : "Disabled"}
                </strong>
              </div>

              <div className="videoSpecRow">
                <span>Brand Kit</span>
                <strong
                  className={`videoStatusPill ${useBrandKit ? "on" : "off"}`}
                >
                  {useBrandKit ? "Enabled" : "Disabled"}
                </strong>
              </div>

              <div className="videoSpecRow">
                <span>Performance Intelligence</span>
                <strong
                  className={`videoStatusPill ${
                    usePerformanceIntelligence ? "on" : "off"
                  }`}
                >
                  {usePerformanceIntelligence ? "Enabled" : "Disabled"}
                </strong>
              </div>
            </div>
          )}
        </div>
      </aside>
      <CreditPackModal open={creditPacksOpen} onClose={() => setCreditPacksOpen(false)} />
    </div>
  </div>
);
}