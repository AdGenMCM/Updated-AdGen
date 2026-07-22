import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VideoAds.css";
import "./AdGenerator.css"; // ✅ reuse AdGenerator overlay + spinner styles
import { auth } from "../firebaseConfig";
import { useWinnersProfile } from "../hooks/useWinnersProfile";
import StepSection from "../components/ui/StepSection";
import InfoTip from "../components/ui/InfoTip";
import BrandKitSelector from "../components/BrandKitSelector";
import GenerationProgress from "../components/GenerationProgress";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

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
    label: "Meta Feed — Square (960×960)",
    platform: "Meta Feed",
    ratio: "960:960",
  },
  {
    id: "meta_portrait",
    label: "Meta Feed — Portrait (832×1104)",
    platform: "Meta Feed",
    ratio: "832:1104",
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

  const [me, setMe] = useState({ tier: null, status: null, isAdmin: false });

  const [tab, setTab] = useState("image"); // "image" | "prompt"
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

  // ========== Winners guidance (Shared Hook) ==========
  const [useWinners, setUseWinners] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const lastVideoBrandDefaultsRef = useRef({});

  const canUseWinners = useMemo(() => {
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

  const { winnersProfile, winnerGuidance, winnersLoading } = useWinnersProfile({
    kind: "video",
    enabled: useWinners && canUseWinners, // only fetch when entitled + toggle on
    apiBase: API_BASE,
    limit: 200,
    minSpend: 0,
  });

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

  // ✅ winners guidance should be Pro/Business only (admin allowed)

  // If user toggles winners on without entitlement, auto-disable it
  useEffect(() => {
    if (useWinners && !canUseWinners) {
      setUseWinners(false);
    }
  }, [useWinners, canUseWinners]);

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

        // ✅ NEW: winners guidance injected lightly (Pro/Business only)
        winnerGuidance: (useWinners && canUseWinners) ? (winnerGuidance || "").trim() : null,
        winnerProfile: (useWinners && canUseWinners) ? (winnersProfile || null) : null,
        winnersApply: (useWinners && canUseWinners) ? ["tone", "platform", "ratio"] : null,
        winnersInfluence: (useWinners && canUseWinners) ? 0.6 : null,
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

        // ✅ NEW: winners guidance injected lightly (Pro/Business only)
        winnerGuidance: (useWinners && canUseWinners) ? (winnerGuidance || "").trim() : null,
        winnerProfile: (useWinners && canUseWinners) ? (winnersProfile || null) : null,
        winnersApply: (useWinners && canUseWinners) ? ["tone", "platform", "ratio"] : null,
        winnersInfluence: (useWinners && canUseWinners) ? 0.6 : null,
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
      <div className="hint" style={{ marginBottom: 16 }}>
        Brand Kit is available on paid plans. Your complimentary video can still be created without it.
      </div>
    )}

    <div className="videoAdsLayout">
      <main className="videoAdsMain">
        <div className="videoAdsForm">
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

            <div className="videoEnhancementCard">
              {isFreePlan ? (
                <div className="videoToggleCopy">
                  <span className="videoToggleTitle">
                    <span>🔒 Winner Profile</span>
                  </span>
                  <small>  Available on Pro &amp; Business plans.</small>
                </div>
              ) : (
                <label className="videoToggle">
                  <input
                    type="checkbox"
                    checked={useWinners}
                    onChange={(e) => setUseWinners(e.target.checked)}
                    disabled={!canUseWinners || isGenerating || winnersLoading}
                  />

                  <span className="videoToggleCopy">
                    <span className="videoToggleTitle">
                      <span>Apply Winner Profile</span>
                      <InfoTip text="Uses your highest-performing videos to guide pacing, scene direction, and creative style." />
                    </span>
                    <small>Pro/Business</small>
                  </span>
                </label>
              )}
            </div>
          </div>

          {useWinners && winnersLoading && (
            <div className="hint" style={{ marginTop: 10 }}>
              Loading your winners…
            </div>
          )}

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
                  disabled={isGenerating}
                />
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
                {isGenerating ? "Generating..." : "Generate Video"}
              </button>

              <div className="hint" style={{ marginTop: 8 }}>
                High-quality video generation can take up to 3 minutes.
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
                  disabled={isGenerating}
                />
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
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
                </div>

                <div className="field">
                  <label>
                    Full Creative Direction
                    <InfoTip text="Detailed guidance for scene composition, motion, branding, and storytelling." />
                  </label>
                  <input
                    value={fullCreativeDirection}
                    onChange={(e) => setFullCreativeDirection(e.target.value)}
                    placeholder="Optional"
                    disabled={isGenerating}
                  />
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
                {isGenerating ? "Generating..." : "Generate Video"}
              </button>

              <div className="hint" style={{ marginTop: 8 }}>
                High-quality video generation can take up to 3 minutes.
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
              <span>Winner Profile</span>
              <strong className={`videoStatusPill ${useWinners ? "on" : "off"}`}>
                {useWinners ? "Enabled" : "Disabled"}
              </strong>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
);
}