import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VideoAds.css";
import "./AdGenerator.css"; // ✅ reuse AdGenerator overlay + spinner styles
import { auth } from "../firebaseConfig";
import { useWinnersProfile } from "../hooks/useWinnersProfile";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

const RUNWAY_VOICES = [
  "Maya","Arjun","Serene","Bernard","Billy","Mark","Clint","Mabel","Chad","Leslie",
  "Eleanor","Elias","Elliot","Grungle","Brodie","Sandra","Kirk","Kylie","Lara","Lisa",
  "Malachi","Marlene","Martin","Miriam","Paula","Pip","Rusty","Ragnar","Xylar","Maggie",
  "Jack","Katie","Noah","James","Rina","Ella","Mariah","Frank","Claudia","Niki","Vincent",
  "Kendrick","Myrna","Tom","Wanda","Benjamin","Kiana","Rachel"
];

// ✅ One dropdown: Platform + Aspect Ratio
// Backend expects ratio strings like "1080:1350"
const FORMAT_OPTIONS = [
  { id: "tiktok_9x16_720",  label: "TikTok / Reels / Shorts — 9:16 (720×1280)",   platform: "TikTok / Reels / Shorts",  ratio: "720:1280" },
  { id: "tiktok_9x16_1080", label: "TikTok / Reels / Shorts — 9:16 (1080×1920)",  platform: "TikTok / Reels / Shorts",  ratio: "1080:1920" },

  { id: "yt_16x9_720",      label: "YouTube — 16:9 (1280×720)",                   platform: "YouTube", ratio: "1280:720" },
  { id: "yt_16x9_1080",     label: "YouTube — 16:9 (1920×1080)",                  platform: "YouTube", ratio: "1920:1080" },

  { id: "meta_1x1",         label: "Meta Feed — 1:1 (1080×1080)",                 platform: "Meta Feed",    ratio: "1080:1080" },
  { id: "meta_4x5",         label: "Meta Feed — 4:5 (1080×1350)",                 platform: "Meta Feed",    ratio: "1080:1350" },
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

  const canUseWinners = useMemo(() => {
    if (me.isAdmin) return true;
    const t = String(me.tier || "").toLowerCase();
    return t === "pro_monthly" || t === "business_monthly";
  }, [me]);

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

  // scroll target
  const statusRef = useRef(null);

  const canUseVideoAds = useMemo(() => {
    if (me.isAdmin) return true;
    const t = String(me.tier || "").toLowerCase();
    return t === "early_access" || t === "pro_monthly" || t === "business_monthly";
  }, [me]);

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

    const res = await fetch(`${API_BASE}/upload-creatives`, {
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
        throw new Error(data?.detail?.message || safeDetailMessage(data?.detail) || "Failed to start video job");
      }

      setJobId(data.jobId);
      setStatus(data.status || "running");
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
        throw new Error(data?.detail?.message || safeDetailMessage(data?.detail) || "Failed to start video job");
      }

      setJobId(data.jobId);
      setStatus(data.status || "running");
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

        if (data.status === "succeeded" && data.finalVideoUrl) {
          setFinalVideoUrl(data.finalVideoUrl);
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Video generation failed.");
          return;
        }

        timer = setTimeout(poll, 4000);
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
          <h2>🔒 Early Access, Pro, & Business only</h2>
          <p>Upgrade to unlock Video Ads.</p>
          <button className="primary" onClick={() => navigate("/account")}>Upgrade</button>
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="videoAds">
      {/* ✅ Spinner overlay (same as AdGenerator) */}
      <div className={`loading-overlay ${isGenerating ? "show" : ""}`} role="status" aria-live="polite">
        <div className="adgen-spinner" />
        <div className="loading-text">Generating your video… please wait</div>
      </div>

      <div className="videoAdsHeader">
        <h1>Video Ads</h1>
        <p>Create 6s or 10s video ads with optional AI voiceover.</p>
      </div>

      <div className="videoTabs">
        <button
          type="button"
          disabled={isGenerating}
          className={tab === "image" ? "active" : ""}
          onClick={() => { setTab("image"); resetJob(); }}
        >
          Image → Video
        </button>
        <button
          type="button"
          disabled={isGenerating}
          className={tab === "prompt" ? "active" : ""}
          onClick={() => { setTab("prompt"); resetJob(); }}
        >
          Prompt → Video
        </button>
      </div>

      <div className="videoPanel">
        {/* Shared settings row */}
        <div className="row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              disabled={isGenerating}
            />
            AI voiceover
          </label>

          <div className="field">
            <label>Voice</label>
            <select
              value={presetVoice}
              onChange={(e) => setPresetVoice(e.target.value)}
              disabled={!voiceEnabled || isGenerating}
            >
              {RUNWAY_VOICES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={isGenerating}
            >
              <option value={6}>6 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </div>

          <div className="field">
            <label>Format</label>
            <select
              value={formatId}
              onChange={(e) => setFormatId(e.target.value)}
              disabled={isGenerating}
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ✅ NEW: Use my winners (Pro/Business only) */}
        <div className="box" style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <label className="checkbox" style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={useWinners}
                onChange={(e) => setUseWinners(e.target.checked)}
                disabled={!canUseWinners || isGenerating || winnersLoading}
              />
              Use my winners (Pro/Business)
            </label>

            {winnersLoading ? (
              <div className="hint">Loading winners…</div>
            ) : (
              <div className="hint">
                Adds guidance from your best-performing creatives (no metric text).
              </div>
            )}
          </div>

          {!canUseWinners && (
            <div className="hint" style={{ marginTop: 6 }}>
              Available on <strong>Pro & Business</strong>. (Early Access can generate videos, but won’t use winners guidance.)
            </div>
          )}

          {!!winnerGuidance && useWinners && canUseWinners && (
            <div className="hint" style={{ marginTop: 8 }}>
              <strong>Applied guidance:</strong> {winnerGuidance}
            </div>
          )}
        </div>

        {/* Voiceover script + preview */}
        <div className={`box voBox ${!voiceEnabled ? "voBoxDisabled" : ""}`}>
          <div className="voiceHeader">
            <div>
              <div className="boxTitle">Voiceover Script</div>
              <div className="hint">If enabled, the voice will read this script.</div>
            </div>

            <button
              className="secondary miniBtn"
              disabled={!voiceEnabled || previewLoading || isGenerating || !(voiceoverScript || "").trim()}
              onClick={() => previewVoice()}
              type="button"
            >
              {previewLoading ? "Previewing..." : "Preview Voice"}
            </button>
          </div>

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
                onClick={() => { try { audioRef.current?.play(); } catch {} }}
                style={{ marginLeft: 10 }}
                disabled={isGenerating}
              >
                Play
              </button>
            </div>
          )}
        </div>

        {tab === "image" && (
          <>
            <div
              className={`dropzone ${dragOver ? "dragOver" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                  <div className="dzTitle">Drag & drop an image</div>
                  <div className="dzSub">or click to upload (PNG/JPG/WEBP)</div>
                </div>
              ) : (
                <div className="previewWrap">
                  <img src={imagePreview} alt="preview" className="previewImg" />
                  <div className="previewMeta">
                    <div className="previewName">{imageFile?.name}</div>
                    <button
                      className="secondary"
                      onClick={(e) => { e.stopPropagation(); onPickFile(null); }}
                      type="button"
                      disabled={isGenerating}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="field">
              <label>Prompt Text</label>
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
              onClick={async () => { try { await startImageVideo(); } catch {} }}
              title={scriptTooLong ? "Shorten your voiceover script to fit the selected duration." : ""}
            >
              {isGenerating ? "Generating..." : "Generate Video"}
            </button>

            <div className="hint" style={{ marginTop: 8 }}>
              Typical time: ~30–90 seconds (can vary by demand).
            </div>
          </>
        )}

        {tab === "prompt" && (
          <>
            <div className="grid2">
              <div className="field">
                <label>Product Name</label>
                <input value={productName} onChange={(e) => setProductName(e.target.value)} disabled={isGenerating} />
              </div>
              <div className="field">
                <label>Platform</label>
                <input value={platform} readOnly />
              </div>
            </div>

            <div className="field">
              <label>Video Prompt & Product Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={isGenerating} />
            </div>

            <div className="grid2">
              <div className="field">
                <label>Offer</label>
                <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Optional" disabled={isGenerating} />
              </div>
              <div className="field">
                <label>Audience</label>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Optional" disabled={isGenerating} />
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Goal</label>
                <select value={goal} onChange={(e) => setGoal(e.target.value)} disabled={isGenerating}>
                  <option value="conversions">Conversions</option>
                  <option value="leads">Leads</option>
                  <option value="traffic">Traffic</option>
                  <option value="awareness">Awareness</option>
                </select>
              </div>
              <div className="field">
                <label>Tone</label>
                <input value={tone} onChange={(e) => setTone(e.target.value)} disabled={isGenerating} />
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Hook Style</label>
                <select value={hookStyle} onChange={(e) => setHookStyle(e.target.value)} disabled={isGenerating}>
                  <option value="bold claim">Bold claim</option>
                  <option value="question">Question</option>
                  <option value="problem solution">Problem → Solution</option>
                  <option value="social proof">Social proof</option>
                  <option value="before after">Before / After</option>
                </select>
              </div>
              <div className="field">
                <label>Pace</label>
                <select value={pace} onChange={(e) => setPace(e.target.value)} disabled={isGenerating}>
                  <option value="fast">Fast (scroll-stopping)</option>
                  <option value="medium">Medium</option>
                  <option value="slow cinematic">Slow / cinematic</option>
                </select>
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Scene Style</label>
                <select value={sceneStyle} onChange={(e) => setSceneStyle(e.target.value)} disabled={isGenerating}>
                  <option value="studio product">Studio product</option>
                  <option value="lifestyle">Lifestyle</option>
                  <option value="ugc">UGC style</option>
                  <option value="cinematic">Cinematic</option>
                  <option value="minimal abstract">Minimal / abstract</option>
                </select>
              </div>
              <div className="field">
                <label>Camera Motion</label>
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
                <label>Lighting</label>
                <select value={lightingStyle} onChange={(e) => setLightingStyle(e.target.value)} disabled={isGenerating}>
                  <option value="bright clean">Bright / clean</option>
                  <option value="natural">Natural</option>
                  <option value="dramatic">Dramatic</option>
                  <option value="high contrast">High contrast</option>
                </select>
              </div>
              <div className="field">
                <label>Call to Action</label>
                <input value={callToAction} onChange={(e) => setCallToAction(e.target.value)} disabled={isGenerating} />
              </div>
            </div>

            <div className="grid2">
              <div className="field">
                <label>Extra direction (short)</label>
                <input value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} placeholder="Optional" disabled={isGenerating} />
              </div>
              <div className="field">
                <label>Full creative direction (detailed)</label>
                <input value={fullCreativeDirection} onChange={(e) => setFullCreativeDirection(e.target.value)} placeholder="Optional" disabled={isGenerating} />
              </div>
            </div>

            <button
              className="primary"
              disabled={isGenerating || !canStartPrompt || scriptTooLong}
              onClick={async () => { try { await startPromptVideo(); } catch {} }}
              title={scriptTooLong ? "Shorten your voiceover script to fit the selected duration." : ""}
            >
              {isGenerating ? "Generating..." : "Generate Video"}
            </button>

            <div className="hint" style={{ marginTop: 8 }}>
              Typical time: ~30–90 seconds (can vary by demand).
            </div>
          </>
        )}

        <div className="statusBlock" ref={statusRef}>
          {jobId && (
            <div className="statusLine">
              <strong>Job:</strong> {jobId} &nbsp; <strong>Status:</strong> {status || "running"}
            </div>
          )}
          {error && <div className="error">{error}</div>}
          {finalVideoUrl && (
            <div className="result">
              <video src={finalVideoUrl} controls className="videoPlayer" />
              <a className="primary linkBtn" href={finalVideoUrl} target="_blank" rel="noreferrer">
                Open / Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}