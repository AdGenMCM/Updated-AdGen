import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VideoAds.css";
import "./AdGenerator.css"; // ✅ reuse AdGenerator overlay + spinner styles
import { auth } from "../firebaseConfig";
import StepSection from "../components/ui/StepSection";
import InfoTip from "../components/ui/InfoTip";
import PerformanceIntelligencePreview from "../components/PerformanceIntelligencePreview";
import BrandKitSelector from "../components/BrandKitSelector";
import GenerationProgress from "../components/GenerationProgress";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

const VIDEO_DESCRIPTION_MAX = 400;
const IMAGE_MOTION_PROMPT_MAX = 400;
const EXTRA_DIRECTION_MAX = 200;
const FULL_CREATIVE_DIRECTION_MAX = 300;

const RUNWAY_VOICES = [
  "Maya","Arjun","Serene","Bernard","Billy","Mark","Clint","Mabel","Chad","Leslie",
  "Eleanor","Elias","Elliot","Grungle","Brodie","Sandra","Kirk","Kylie","Lara","Lisa",
  "Malachi","Marlene","Martin","Miriam","Paula","Pip","Rusty","Ragnar","Xylar","Maggie",
  "Jack","Katie","Noah","James","Rina","Ella","Mariah","Frank","Claudia","Niki","Vincent",
  "Kendrick","Myrna","Tom","Wanda","Benjamin","Kiana","Rachel"
];

// ✅ One dropdown: Platform + Aspect Ratio
const FORMAT_OPTIONS = [
  {
    id: "tiktok_9x16",
    label: "TikTok / Reels / Shorts — Vertical (720×1280)",
    platform: "TikTok / Reels / Shorts",
    ratio: "720:1280",
  },
  {
    id: "youtube_16x9",
    label: "YouTube — Landscape (1280×720)",
    platform: "YouTube",
    ratio: "1280:720",
  },
  {
    id: "meta_square",
    label: "Meta Feed — Square (1080×1080)",
    platform: "Meta Feed",
    ratio: "1080:1080",
  },
  {
    id: "meta_portrait",
    label: "Meta Feed — Portrait (1080×1350)",
    platform: "Meta Feed",
    ratio: "1080:1350",
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
      callToAction: "Shop now.", formatId: "tiktok_9x16",
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
      callToAction: "Order now.", formatId: "tiktok_9x16",
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
      callToAction: "Shop the drop.", formatId: "tiktok_9x16",
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
      callToAction: "Start training.", formatId: "tiktok_9x16",
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
      callToAction: "Start your free trial.", formatId: "youtube_16x9",
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
      callToAction: "Get the offer.", formatId: "meta_portrait",
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
      callToAction: "Book a tour.", formatId: "tiktok_9x16",
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
      callToAction: "Book a call.", formatId: "youtube_16x9",
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

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ✅ simple speech-time estimate for warn/block (rough but effective)
function estimateSpeechSeconds(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  const words = t.split(/\s+/).filter(Boolean).length;
  // ~2.5 words/sec + small buffer
  return Math.round(((words / 2.5) + 0.6) * 10) / 10;
}



// --- helpers for winners guidance ---

export default function VideoAds() {
  const navigate = useNavigate();
  const firstWorkspaceSectionRef = useRef(null);
  const videoSettingsSectionRef = useRef(null);

  const [me, setMe] = useState({ tier: null, status: null, isAdmin: false });

  const [tab, setTab] = useState("image"); // "image" | "prompt"
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
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
  const [platform, setPlatform] = useState(FORMAT_OPTIONS[0].platform);

  // ========== Prompt → Video ==========
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
  const [callToAction, setCallToAction] = useState("Tap to learn more.");
  const [fullCreativeDirection, setFullCreativeDirection] = useState("");
  const [userPrompt, setUserPrompt] = useState("");

  // ========== Voiceover ==========
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [presetVoice, setPresetVoice] = useState("Leslie");
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
      meta: "meta_portrait",
      tiktok: "tiktok_9x16",
      google: "youtube_16x9",
      linkedin: "meta_square",
      pinterest: "tiktok_9x16",
    };

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

    return {
      audience: brandKit.targetAudience || "",
      tone: brandKit.voice || brandKit.brandPersonality || "",
      offer: brandKit.offerStyle || "",
      callToAction: brandKit.preferredCta || "",
      formatId: platformFormatMap[brandKit.preferredPlatform] || "",
      sceneStyle: sceneStyleMap[brandKit.imageStyle] || "",
    };
  }, [brandKit]);

  useEffect(() => {
    const nextDefaults = useBrandKit && brandKit ? videoBrandDefaults : {};

    setAudience(nextDefaults.audience || "");
    setTone(nextDefaults.tone || "confident");
    setOffer(nextDefaults.offer || "");
    setCallToAction(nextDefaults.callToAction || "Tap to learn more.");
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

  const [videoLimitReached, setVideoLimitReached] = useState(false);

  // scroll target
  const statusRef = useRef(null);

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

  // Sync platform + ratio when format changes
  useEffect(() => {
    const opt = FORMAT_OPTIONS.find(o => o.id === formatId) || FORMAT_OPTIONS[0];
    setRatio(opt.ratio);
    setPlatform(opt.platform);
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

  const applyVideoTemplate = (template) => {
    const values = template.values;

    resetJob();
    setSelectedTemplateId(template.id);
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
    setFullCreativeDirection("");
    setUserPrompt("");
    moveToWorkspaceSection(videoSettingsSectionRef);
  };

  const startVideoFromScratch = () => {
    resetJob();
    setSelectedTemplateId("scratch");
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
    setCallToAction("Tap to learn more.");
    setFormatId(FORMAT_OPTIONS[0].id);
    setPromptText("Subtle cinematic camera movement, product showcase");
    setVoiceoverScript("");
    setFullCreativeDirection("");
    setUserPrompt("");
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
        const res = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (res.ok && data) {
          setMe({
            tier: data.tier || null,
            status: data.status || null,
            isAdmin: !!data.isAdmin,
          });
        }
      } catch {
        // non-fatal
      }
    };
    run();
  }, []);

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

  const uploadImageToBackend = async (file) => {
    const token = await getIdToken();
    const form = new FormData();
    form.append("files", file);

    const res = await fetch(`${API_BASE}/video/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data?.detail?.message || safeDetailMessage(data?.detail) || "Upload failed");
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
      if (!voiceEnabled) throw new Error("Enable voiceover to preview a voice.");
      const text = (voiceoverScript || "").trim();
      if (!text) throw new Error("Add a voiceover script first.");

      const token = await getIdToken();

      const res = await fetch(`${API_BASE}/video/tts/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, presetVoice }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.detail?.message || safeDetailMessage(data?.detail) || "Voice preview failed");
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
      setError(e?.message || "Voice preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ✅ warn/block if script too long
  const scriptEstimateSec = useMemo(() => estimateSpeechSeconds(voiceoverScript), [voiceoverScript]);
  const scriptTooLong = useMemo(() => {
    if (!voiceEnabled) return false;
    const s = (voiceoverScript || "").trim();
    if (!s) return false;
    return scriptEstimateSec > (Number(duration) + 0.2);
  }, [voiceEnabled, voiceoverScript, scriptEstimateSec, duration]);

  const scriptHint = useMemo(() => {
    if (!voiceEnabled) return null;
    const s = (voiceoverScript || "").trim();
    if (!s) return null;
    if (!scriptTooLong) return `Estimated read time: ~${scriptEstimateSec}s (fits ${duration}s)`;
    return `Estimated read time: ~${scriptEstimateSec}s — too long for ${duration}s. Shorten your script.`;
  }, [voiceEnabled, voiceoverScript, scriptEstimateSec, scriptTooLong, duration]);

  const ensureScriptFitsOrThrow = () => {
    if (!voiceEnabled) return;
    const s = (voiceoverScript || "").trim();
    if (!s) return;
    if (scriptTooLong) {
      throw new Error(`Your voiceover script is too long (~${scriptEstimateSec}s) for a ${duration}s video. Please shorten it.`);
    }
  };

  // Start jobs
  const startImageVideo = async () => {
    if (!imageFile) throw new Error("Please upload an image first.");
    ensureScriptFitsOrThrow();

    resetJob();
    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken();
      const promptImageUrl = await uploadImageToBackend(imageFile);

      const payload = {
        useBrandKit,
        brandKitId,
        promptImageUrl,
        promptText,
        duration,
        ratio,
        voiceoverScript: voiceEnabled ? (voiceoverScript || "").trim() : null,
        voiceover: {
          enabled: voiceEnabled,
          presetVoice,
        },

        // The backend securely resolves the current learned profile.
        usePerformanceIntelligence:
          usePerformanceIntelligence &&
          canUsePerformanceIntelligence,
      };

      const res = await fetch(`${API_BASE}/video/start-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        const detail =
          data?.detail ??
          data?.error ??
          data?.message;

        const message =
          safeDetailMessage(detail) ||
          `Video generation failed (${res.status})`;

        if (res.status === 429) {
          setVideoLimitReached(true);
        }

        throw new Error(
          res.status === 429
            ? message ||
              "You've reached your video credit limit. Upgrade or wait until your next billing cycle."
            : message
        );
      }

      setJobId(data.jobId);
      setStatus(data.status || "running");
      setProgressStage(data.progressStage || "waiting_for_server");
      setProgressMessage(data.progressMessage || "Generating your video.");
      setProgressPercent(data.progressPercent ?? 45);
    } catch (e) {
      setError(e?.message || "Failed to start video job.");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const startPromptVideo = async () => {
    ensureScriptFitsOrThrow();

    resetJob();
    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken();

      const payload = {
        useBrandKit,
        brandKitId,
        productName,
        description,
        offer: offer || null,
        audience: audience || null,
        tone,
        platform,

        goal,
        hookStyle,
        sceneStyle,
        cameraMotion,
        lightingStyle,
        pace,
        callToAction,
        fullCreativeDirection: fullCreativeDirection || null,
        userPrompt: userPrompt || null,

        duration,
        ratio,

        voiceoverScript: voiceEnabled ? (voiceoverScript || "").trim() : null,
        voiceover: {
          enabled: voiceEnabled,
          presetVoice,
        },

        // The backend securely resolves the current learned profile.
        usePerformanceIntelligence:
          usePerformanceIntelligence &&
          canUsePerformanceIntelligence,
      };

      const res = await fetch(`${API_BASE}/video/start-prompt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        const detail =
          data?.detail ??
          data?.error ??
          data?.message;

        const message =
          safeDetailMessage(detail) ||
          `Video generation failed (${res.status})`;

        if (res.status === 429) {
          setVideoLimitReached(true);
        }

        throw new Error(
          res.status === 429
            ? message ||
              "You've reached your video credit limit. Upgrade or wait until your next billing cycle."
            : message
        );
      }

      setJobId(data.jobId);
      setStatus(data.status || "running");
      setProgressStage(data.progressStage || "waiting_for_server");
      setProgressMessage(data.progressMessage || "Generating your video.");
      setProgressPercent(data.progressPercent ?? 45);
    } catch (e) {
      setError(e?.message || "Failed to start video job.");
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
        const res = await fetch(`${API_BASE}/video/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.detail?.message || safeDetailMessage(data?.detail) || "Status check failed");

        if (cancelled) return;

        setStatus(data.status);
        setProgressStage(data.progressStage || (data.status === "succeeded" ? "succeeded" : "waiting_for_server"));
        setProgressMessage(data.progressMessage || "Generating your video.");
        setProgressPercent(data.progressPercent ?? (data.status === "succeeded" ? 100 : 45));

        if (data.status === "succeeded" && data.finalVideoUrl) {
          setFinalVideoUrl(data.finalVideoUrl);
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Video generation failed.");
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Polling failed.");
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const canStartPrompt = productName.trim() && description.trim();
  const canStartImage = !!imageFile;

  // Locked UX
  if (!auth.currentUser) {
    return (
      <div className="videoAds">
        <div className="videoAdsHeader">
          <h1>Video Ads</h1>
          <p>Create 6s or 10s video ads with optional AI voiceover.</p>
        </div>

        <div className="box">
          <p>Please log in to use Video Ads.</p>
          <button className="primary" onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      </div>
    );
  }

  if (!canUseVideoAds) {
    return (
      <div className="videoAds">
        <div className="videoAdsHeader">
          <h1>Video Ads</h1>
          <p>Create 6s or 10s video ads with optional AI voiceover.</p>
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
return (
  <div className="videoAds">
    <GenerationProgress
      open={isGenerating}
      type="video"
      stage={progressStage}
      message={progressMessage}
      percent={progressPercent}
      voiceoverEnabled={voiceEnabled && !!(voiceoverScript || "").trim()}
      failed={status === "failed"}
      expectedMaxSeconds={180}
    />

    <div className="videoAdsLayout">
      <main className="videoAdsMain">
        <div className="videoAdsHeader videoAdsHero">
          <h1>Generate Video</h1>
          <p>
            Create high-performing AI video advertisements from prompts or images using your Brand Kit,
            winning creative insights, and optional AI voiceover.
          </p>
        </div>

        {!isFreePlan ? (
          <BrandKitSelector
            value={brandKitId}
            onChange={setBrandKitId}
            onKitChange={setBrandKit}
            disabled={isGenerating || !useBrandKit}
          />
        ) : (
          <div className="hint videoFreePlanHint">
            Brand Kit is available on paid plans. Your complimentary video can still be created without it.
          </div>
        )}

        <section className={`template-starter video-template-starter ${templatesOpen ? "is-open" : "is-collapsed"}`} aria-labelledby="video-template-title">
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
                <span id="video-template-title" className="template-title">Start with a Template</span>
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

          <div id="video-template-options" className="template-options" hidden={!templatesOpen}>
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
                <span className="template-card-action">
                  Use template
                </span>
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
              <span className="template-card-icon" aria-hidden="true">✨</span>
              <span className="template-card-copy">
                <strong>Start From Scratch</strong>
                <small>Clear the guided setup and configure the video yourself.</small>
              </span>
              <span className="template-card-action">
                {selectedTemplateId === "scratch" ? "Selected ✓" : "Use blank setup"}
              </span>
            </button>
          </div>

          <div className="template-helper-note">
            <span aria-hidden="true">✨</span>
            <span>Templates prefill your current controls only. Creation modes, Brand Kit, voiceover, Performance Intelligence, uploads, and every existing integration stay unchanged.</span>
          </div>
          </div>
        </section>

        <div className="videoAdsForm">
        <div ref={firstWorkspaceSectionRef} className="template-scroll-target">
        <StepSection
          step="1"
          title="Creation Mode"
          description="Choose whether to animate an uploaded image or generate a video from a written prompt."
        >
          <div className="videoTabs">
            <button
              type="button"
              disabled={isGenerating}
              className={tab === "image" ? "active" : ""}
              onClick={() => {
                setTab("image");
                resetJob();
              }}
            >
              Image → Video
            </button>

            <button
              type="button"
              disabled={isGenerating}
              className={tab === "prompt" ? "active" : ""}
              onClick={() => {
                setTab("prompt");
                resetJob();
              }}
            >
              Prompt → Video
            </button>
          </div>
        </StepSection>
        </div>

        <div ref={videoSettingsSectionRef} className="video-settings-scroll-target">
        <StepSection
          step="2"
          title="Video Settings"
          description="Configure duration, format, voiceover, Brand Kit, and AI enhancements."
        >
          <div className="row videoSettingsCompact">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                disabled={isGenerating}
              />
              AI Voiceover
              <InfoTip text="Reads your script using an AI-generated voice. Disable this if you do not want narration." />
            </label>

            <div className="field">
              <label>
                Voice
                <InfoTip text="Choose which AI voice will narrate your script." />
              </label>
              <select
                value={presetVoice}
                onChange={(e) => setPresetVoice(e.target.value)}
                disabled={!voiceEnabled || isGenerating}
              >
                {RUNWAY_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

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
                {!isFreePlan && (
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
                      <InfoTip text="Applies concise patterns learned from qualified performance data while preserving the current request, Brand Kit, source image, and Runway's 1,000-character prompt limit." />
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


          <div className={`box voBox ${!voiceEnabled ? "voBoxDisabled" : ""}`}>
            <div className="voiceHeader">
              <div>
                <div className="boxTitle">
                  Voiceover Script
                  <InfoTip text="Optional narration spoken by the AI voice. Keep it concise so it fits the selected duration." />
                </div>
                <div className="hint">If enabled, the voice will read this script.</div>
              </div>

              <button
                className="secondary miniBtn"
                disabled={isFreePlan || !voiceEnabled || previewLoading || isGenerating || !(voiceoverScript || "").trim()}
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

            <textarea
              value={voiceoverScript}
              onChange={(e) => setVoiceoverScript(e.target.value)}
              rows={4}
              disabled={!voiceEnabled || isGenerating}
              placeholder="Type your voiceover script here…"
            />

            {scriptHint && (
              <div className={scriptTooLong ? "error" : "hint"} style={{ marginTop: 8 }}>
                {scriptHint}
              </div>
            )}

            {!voiceEnabled && (
              <div className="voOverlay" aria-hidden="true">
                <div className="voOverlayCard">
                  <div className="voLock">🔒</div>
                  <div>
                    <div className="voOverlayTitle">Voiceover disabled</div>
                    <div className="voOverlaySub">Turn on “AI voiceover” to edit and preview.</div>
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
        </StepSection>
        </div>
                <StepSection
          step="3"
          title={tab === "image" ? "Image to Video" : "Prompt to Video"}
          description={
            tab === "image"
              ? "Upload an image and describe how it should move."
              : "Describe the video you want to generate."
          }
        >
          {tab === "image" && (
            <>
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
                    <div className="dzTitle">
                      Drag & drop an image
                      <InfoTip text="Upload a clean product or lifestyle image that will become the starting frame of the animation." />
                    </div>
                    <div className="dzSub">or click to upload (PNG/JPG/WEBP)</div>
                  </div>
                ) : (
                  <div className="previewWrap">
                    <img src={imagePreview} alt="preview" className="previewImg" />
                    <div className="previewMeta">
                      <div className="previewName">{imageFile?.name}</div>
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

              <div className="uploadTip">
                <strong>💡 Best Results</strong>
                <p>
                  Upload clean product or lifestyle images with little or no text. Flyer-style images,
                  posters, or graphics with heavy text may not generate successfully.
                </p>
              </div>

              <div className="field">
                <label>
                  Prompt Text
                  <InfoTip text="Describe how the image should move, what happens in the scene, and any camera movement." />
                </label>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={3}
                  maxLength={IMAGE_MOTION_PROMPT_MAX}
                  disabled={isGenerating}
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

              <button
                className="primary"
                disabled={isGenerating || !canStartImage || scriptTooLong}
                onClick={async () => {
                  try {
                    await startImageVideo();
                  } catch {}
                }}
                title={scriptTooLong ? "Shorten your voiceover script to fit the selected duration." : ""}
              >
                {isGenerating ? "Creating..." : "Create My Video"}
              </button>

              <div className="hint" style={{ marginTop: 8 }}>
                High-quality video generation can take up to 4 minutes.
              </div>
            </>
          )}

          {tab === "prompt" && (
            <>
              <div className="grid2">
                <div className="field">
                  <label>
                    Product Name
                    <InfoTip text="Helps the AI understand what the advertisement is promoting." />
                  </label>
                  <input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                <div className="field">
                  <label>
                    Platform / Format
                    <InfoTip text="Optimizes framing and aspect ratio for the selected video placement." />
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

              <div className="field">
                <label>
                  Video Prompt & Product Description
                  <InfoTip text="Describe the product, visuals, motion, offer, and commercial you want generated." />
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
                  <select value={goal} onChange={(e) => setGoal(e.target.value)} disabled={isGenerating}>
                    <option value="conversions">Conversions</option>
                    <option value="leads">Leads</option>
                    <option value="traffic">Traffic</option>
                    <option value="awareness">Awareness</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Tone
                    <InfoTip text="Controls the personality of the commercial." />
                  </label>
                  <input value={tone} onChange={(e) => setTone(e.target.value)} disabled={isGenerating} />
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>
                    Hook Style
                    <InfoTip text="Determines how the video captures attention during the first few seconds." />
                  </label>
                  <select value={hookStyle} onChange={(e) => setHookStyle(e.target.value)} disabled={isGenerating}>
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
                  <select value={pace} onChange={(e) => setPace(e.target.value)} disabled={isGenerating}>
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
                  <select value={sceneStyle} onChange={(e) => setSceneStyle(e.target.value)} disabled={isGenerating}>
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
                  <select value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value)} disabled={isGenerating}>
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
                  <select value={lightingStyle} onChange={(e) => setLightingStyle(e.target.value)} disabled={isGenerating}>
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

              <div className="grid2">
                <div className="field">
                  <label>
                    Extra Direction
                    <InfoTip text="Optional short instructions to further refine the generated video." />
                  </label>
                  <input
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    maxLength={EXTRA_DIRECTION_MAX}
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
                  <div
                    className={`videoCharacterCount ${
                      userPrompt.length >= EXTRA_DIRECTION_MAX * 0.9
                        ? "nearLimit"
                        : ""
                    }`}
                  >
                    {userPrompt.length}/{EXTRA_DIRECTION_MAX}
                  </div>
                </div>

                <div className="field">
                  <label>
                    Full Creative Direction
                    <InfoTip text="Detailed guidance for scene composition, motion, branding, and storytelling." />
                  </label>
                  <input
                    value={fullCreativeDirection}
                    onChange={(e) => setFullCreativeDirection(e.target.value)}
                    maxLength={FULL_CREATIVE_DIRECTION_MAX}
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
                  <div
                    className={`videoCharacterCount ${
                      fullCreativeDirection.length >=
                      FULL_CREATIVE_DIRECTION_MAX * 0.9
                        ? "nearLimit"
                        : ""
                    }`}
                  >
                    {fullCreativeDirection.length}/{FULL_CREATIVE_DIRECTION_MAX}
                  </div>
                </div>
              </div>

              <button
                className="primary"
                disabled={isGenerating || !canStartPrompt || scriptTooLong}
                onClick={async () => {
                  try {
                    await startPromptVideo();
                  } catch {}
                }}
                title={scriptTooLong ? "Shorten your voiceover script to fit the selected duration." : ""}
              >
                {isGenerating ? "Creating..." : "Create My Video"}
              </button>

              <div className="hint" style={{ marginTop: 8 }}>
                High-quality video generation can take up to 4 minutes.
              </div>
            </>
          )}
        </StepSection>
        </div>
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
          <h3>Latest Generation</h3>

          {jobId && (
            <div className="statusLine">
              <strong>Status:</strong> {status || "running"}
            </div>
          )}

          {error && <div className="error">{error}</div>}

          {videoLimitReached && (
            <button
              type="button"
              className="primary"
              onClick={() => navigate("/subscribe?upgrade=1")}
              style={{ marginTop: 12 }}
            >
              View Upgrade Options
            </button>
          )}

          {!finalVideoUrl && !error && (
            <div className="videoEmptyState">
              <p>No video generated yet.</p>
              <ul>
                <li>Preview your video</li>
                <li>Download the finished creative</li>
                <li>Save it to your Library</li>
              </ul>
            </div>
          )}

          {finalVideoUrl && (
            <>
              <video src={finalVideoUrl} controls className="videoPlayer" />
              <a className="primary linkBtn" href={finalVideoUrl} target="_blank" rel="noreferrer">
                Open / Download
              </a>
            </>
          )}
        </div>

        <div className="side-card">
          <h3>Video Specs</h3>
          <div className="videoSpecList">
            <div className="videoSpecRow">
              <span>Duration</span>
              <strong>{duration}s</strong>
            </div>

            <div className="videoSpecRow">
              <span>Format</span>
              <strong>{FORMAT_OPTIONS.find((o) => o.id === formatId)?.label || formatId}</strong>
            </div>

            <div className="videoSpecRow">
              <span>Voice</span>
              <strong>{voiceEnabled ? presetVoice : "Off"}</strong>
            </div>

            <div className="videoSpecRow">
              <span>Brand Kit</span>
              <strong className={`videoStatusPill ${useBrandKit ? "on" : "off"}`}>
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
        </div>
      </aside>
    </div>
  </div>
);
}