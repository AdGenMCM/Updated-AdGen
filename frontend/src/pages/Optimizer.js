// src/pages/Optimizer.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Optimizer.css";
import { auth } from "../firebaseConfig";
import PageHeader from "../components/ui/PageHeader";
import StepSection from "../components/ui/StepSection";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InfoTip from "../components/ui/InfoTip";
import BrandKitSelector from "../components/BrandKitSelector";
import GenerationProgress from "../components/GenerationProgress";





export default function Optimizer() {
  const navigate = useNavigate();
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  const [me, setMe] = useState({ tier: null, status: null, isAdmin: false });

  const [form, setForm] = useState({
    product_name: "",
    description: "",
    audience: "",
    tone: "",
    platform: "meta",
    offer: "",
    goal: "sales",
    audience_temp: "cold",
    notes: "",

    // extra inputs
    flight_start: "",
    flight_end: "",
    placements: "",
    objective: "",
    audience_size: "",
    budget_type: "",
    conversion_event: "",
    geo: "",
    device: "",

    // current creative (paste)
    current_headline: "",
    current_primary_text: "",
    current_cta: "",
    current_image_prompt: "",

    // metrics
    ctr: "",
    cpc: "",
    cpa: "",
    spend: "",
    impressions: "",
    clicks: "",
    conversions: "",
    roas: "",
    frequency: "",
    cpm: "",
  });

  // Upload state
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]); // File[]
  const [uploadedUrls, setUploadedUrls] = useState([]); // string[]
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  // Optimize state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);

  // Regenerate state
  const [regenSize, setRegenSize] = useState("1024x1024");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenErr, setRegenErr] = useState(null);
  const [regenResult, setRegenResult] = useState(null); // { copy, imageUrl, usage }

const [progress, setProgress] = useState({
  type: "optimizer",
  stage: "queued",
  message: "Preparing campaign analysis.",
  percent: 5,
  failed: false,
});


  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };

  const canUseOptimizer = useMemo(() => {
    if (me.isAdmin) return true;
    const t = (me.tier || "").toLowerCase();
    return t === "pro_monthly" || t === "business_monthly";
  }, [me]);

  useEffect(() => {
    const run = async () => {
      if (!apiBase) return;
      const user = auth.currentUser;
      if (!user) return;

      try {
        const token = await user.getIdToken(true);
        const res = await fetch(`${apiBase}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
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
  }, [apiBase]);

  // --- Selected-option explanations (dynamic) ---
  const platformHelpMap = useMemo(
    () => ({
      meta:
        "Meta (Facebook/Instagram): Best for creative testing + direct response. Strong hook, clear offer, thumb-stopping visuals. Works well with broad + retargeting.",
      google:
        "Google (Search/YouTube/Display): Prioritize intent + clarity. Make the benefit obvious fast and align tightly to the landing page and keywords.",
      tiktok:
        "TikTok: Fast-paced, creator-style. Hook in the first second, show product in action, keep copy short and punchy.",
      linkedin:
        "LinkedIn: Great for B2B. Emphasize outcomes, proof, and credibility. CTAs like Demo/Consultation/Download work well.",
      other:
        "Other: General best practices. Focus on clarity, hook strength, offer alignment, and reducing friction to conversion.",
    }),
    []
  );

  const goalHelpMap = useMemo(
    () => ({
      sales:
        "Sales: Optimizes for purchases/revenue. Strong offer + urgency, clear value prop, fewer distractions. Best for ecommerce and direct-response.",
      leads:
        "Leads: Optimizes for form fills/calls. Emphasize problem → solution, trust, and a low-friction CTA (Get quote, Book call, Get info).",
      traffic:
        "Traffic: Optimizes for clicks/visits. Use a curiosity hook + clear promise and ensure the landing page matches the ad message.",
      awareness:
        "Awareness: Optimizes for reach/recall. Keep one simple message and a clean visual. Focus on memorability and clarity.",
      engagement:
        "Engagement: Optimizes for likes/comments/saves. Use a strong POV, relatable hook, and questions that invite interaction.",
      app_installs:
        "App Installs: Optimizes for installs. Highlight the main use-case and outcome (before → after). Keep CTA focused (Download/Install).",
    }),
    []
  );

  const tempHelpMap = useMemo(
    () => ({
      cold:
        "Cold: New audience. Needs more context: clear value prop, proof, and a strong hook. Explain what it is + why it matters quickly.",
      warm:
        "Warm: They’ve seen you before. Tighten copy, emphasize benefits, and reinforce with proof. Remind + reduce hesitation.",
      retargeting:
        "Retargeting: High intent. Focus on objections, urgency, offer clarity, and trust (guarantee, reviews, FAQs). Make CTA direct.",
    }),
    []
  );

  const selectedPlatformHelp = platformHelpMap[form.platform] || "";
  const selectedGoalHelp = goalHelpMap[form.goal] || "";
  const selectedTempHelp = tempHelpMap[form.audience_temp] || "";

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    setUploadErr(null);
    setRegenResult(null);
  };

  const uploadCreatives = async () => {
    if (!apiBase) {
      setUploadErr("Config error: REACT_APP_API_BASE_URL is missing.");
      return;
    }
    if (!selectedFiles.length) {
      setUploadErr("Select 1–6 images first.");
      return;
    }

    setUploading(true);
    setUploadErr(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/login");
        return;
      }

      const token = await user.getIdToken(true);

      const fd = new FormData();
      selectedFiles.slice(0, 6).forEach((f) => fd.append("files", f));

      const res = await fetch(`${apiBase}/upload-creatives`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data?.message;

        if (res.status === 401) {
          setUploadErr("Session expired. Please log in again.");
          return;
        }
        if (res.status === 402) {
          setUploadErr("Subscription inactive. Please manage your subscription.");
          return;
        }
        if (res.status === 403) {
          setUploadErr("Uploads are available on Pro and Business plans.");
          return;
        }

        setUploadErr(safeDetailMessage(detail) || `Upload failed (${res.status})`);
        return;
      }

      const urls = Array.isArray(data?.urls) ? data.urls : [];
      if (!urls.length) {
        setUploadErr("Upload succeeded but no URLs were returned.");
        return;
      }

      setUploadedUrls(urls);
    } catch {
      setUploadErr("Something went wrong uploading creatives. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const pollProgressJob = async ({ jobId, token, statusPath, type }) => {
    for (;;) {
      const res = await fetch(`${apiBase}${statusPath}/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          safeDetailMessage(data?.detail) ||
            `Could not load progress (${res.status})`
        );
      }

      setProgress({
        type,
        stage: data.progressStage || "queued",
        message: data.progressMessage || "Working on your request.",
        percent: data.progressPercent ?? 5,
        failed: data.status === "failed",
      });

      if (data.status === "succeeded") {
        await new Promise((resolve) => setTimeout(resolve, 450));
        return data.result;
      }

      if (data.status === "failed") {
        const error = new Error(
          safeDetailMessage(data.error) || "The request failed."
        );
        error.detail = data.error;
        await new Promise((resolve) => setTimeout(resolve, 650));
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const handleOptimize = async (e) => {
    e?.preventDefault?.();

    if (!apiBase) {
      alert("Config error: REACT_APP_API_BASE_URL is missing. Restart frontend after setting it.");
      return;
    }

    setLoading(true);
    setProgress({
      type: "optimizer",
      stage: "queued",
      message: "Preparing campaign analysis.",
      percent: 5,
      failed: false,
    });
    setErr(null);
    setResult(null);
    setRegenResult(null);
    setRegenErr(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/login");
        return;
      }

      const token = await user.getIdToken(true);

      const payload = {
        useBrandKit,
        brandKitId,
        product_name: form.product_name,
        description: form.description,
        audience: form.audience,
        tone: form.tone,
        platform: form.platform || "meta",
        offer: form.offer || null,
        goal: form.goal || null,
        audience_temp: form.audience_temp || "cold",
        notes: form.notes || null,

        flight_start: form.flight_start || null,
        flight_end: form.flight_end || null,
        placements: form.placements || null,
        objective: form.objective || null,
        audience_size: form.audience_size ? Number(form.audience_size) : null,
        budget_type: form.budget_type || null,
        conversion_event: form.conversion_event || null,
        geo: form.geo || null,
        device: form.device || null,

        creative_image_urls: uploadedUrls.length ? uploadedUrls : null,

        current_headline: form.current_headline || null,
        current_primary_text: form.current_primary_text || null,
        current_cta: form.current_cta || null,
        current_image_prompt: form.current_image_prompt || null,

        metrics: {
          ctr: form.ctr ? Number(form.ctr) : null,
          cpc: form.cpc ? Number(form.cpc) : null,
          cpa: form.cpa ? Number(form.cpa) : null,
          spend: form.spend ? Number(form.spend) : null,
          impressions: form.impressions ? Number(form.impressions) : null,
          clicks: form.clicks ? Number(form.clicks) : null,
          conversions: form.conversions ? Number(form.conversions) : null,
          roas: form.roas ? Number(form.roas) : null,
          frequency: form.frequency ? Number(form.frequency) : null,
          cpm: form.cpm ? Number(form.cpm) : null,
        },
      };

      const res = await fetch(`${apiBase}/optimizer/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data?.message;
        setErr(safeDetailMessage(detail) || `Optimization failed (${res.status})`);
        return;
      }

      if (!data?.jobId) {
        setErr("No optimization job was returned from the server.");
        return;
      }

      const optimizedResult = await pollProgressJob({
        jobId: data.jobId,
        token,
        statusPath: "/optimizer/status",
        type: "optimizer",
      });

      setResult(optimizedResult);
    } catch (error) {
      setErr(error?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewCreative = async () => {
    if (!apiBase) {
      setRegenErr("Config error: REACT_APP_API_BASE_URL is missing.");
      return;
    }
    if (!result) {
      setRegenErr("Run Analyze & Improve first.");
      return;
    }

    setRegenLoading(true);
    setProgress({
      type: "optimizerGeneration",
      stage: "queued",
      message: "Preparing optimized creative.",
      percent: 5,
      failed: false,
    });
    setRegenErr(null);
    setRegenResult(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/login");
        return;
      }

      const token = await user.getIdToken(true);

      const payload = {
        // Brand Kit
        useBrandKit,
        brandKitId,

        // Campaign context
        companyName: form.companyName,
        product_name: form.product_name,
        description: form.description,
        productType: form.productType,
        stylePreset: form.stylePreset,
        tone: form.tone,
        goal: form.goal,
        platform: form.platform,

        // Optimized creative
        improved_headline: result.improved_headline,
        improved_primary_text: result.improved_primary_text,
        improved_cta: result.improved_cta,
        improved_image_prompt: result.improved_image_prompt,

        // Generation options
        imageSize: regenSize,
        creative_image_urls: uploadedUrls.length ? uploadedUrls : null,
      };

      const res = await fetch(`${apiBase}/optimizer/generate/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data?.message;

        if (res.status === 429) {
          const msg = safeDetailMessage(detail) || "You’ve reached your monthly limit.";
          setRegenErr(msg);
          return;
        }

        setRegenErr(safeDetailMessage(detail) || `Generation failed (${res.status})`);
        return;
      }

      if (!data?.jobId) {
        setRegenErr("No generation job was returned from the server.");
        return;
      }

      const generatedResult = await pollProgressJob({
        jobId: data.jobId,
        token,
        statusPath: "/optimizer/generate/status",
        type: "optimizerGeneration",
      });

      setRegenResult(generatedResult);
    } catch (error) {
      setRegenErr(
        error?.message ||
          "Something went wrong generating a new creative. Please try again."
      );
    } finally {
      setRegenLoading(false);
    }
  };

  const downloadOptimizedImage = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    const token = await user.getIdToken(true);

    const response = await fetch(
      `${apiBase}/download-image/${regenResult.imageJobId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Download request failed.");
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `adgen-optimized-${regenResult.imageJobId}.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error(err);
    alert("Download failed. Please try again.");
  }
};

  return (
  <div className="opt-page">
    <GenerationProgress
      open={loading || regenLoading}
      type={progress.type}
      stage={progress.stage}
      message={progress.message}
      percent={progress.percent}
      failed={progress.failed}
    />

    <div className="opt-shell">
      <main className="opt-main">
        <PageHeader
          eyebrow="AI CREATIVE STUDIO"
          title="Optimize Ad"
          description="Analyze an existing ad, identify weak points, and generate stronger copy, creative direction, and performance-focused recommendations."
        />

        {auth.currentUser && canUseOptimizer && (
          <BrandKitSelector
            value={brandKitId}
            onChange={setBrandKitId}
            disabled={loading || regenLoading || !useBrandKit}
          />
        )}

        {!auth.currentUser ? (
          <Card className="opt-authCard">
            <p className="opt-text">Please log in to use the optimizer.</p>
            <Button type="button" onClick={() => navigate("/login")}>
              Go to Login
            </Button>
          </Card>
        ) : !canUseOptimizer ? (
          <Card className="opt-authCard">
            <div className="opt-lockHeader">
              <span className="step-badge">🔒</span>
              <div>
                <h2>Optimizer Locked</h2>
                <p>Upgrade to unlock Ad Performance Optimization.</p>
              </div>
            </div>

            <Button type="button" onClick={() => navigate("/account")}>
              Upgrade Plan
            </Button>

            {err && <p className="opt-error">{err}</p>}
          </Card>
        ) : (
          <form className="adgen-form opt-form" onSubmit={handleOptimize}>
            <StepSection
              step="1"
              title={
                <>
                  Campaign Details
                  <InfoTip text="Add product, audience, offer, platform, and campaign goal so AdGen can diagnose the ad accurately." />
                </>
              }
              description="Provide the campaign context AdGen should use for analysis."
            >
              <div className="opt-grid">
                <input name="product_name" placeholder="Product / Offer name" value={form.product_name} onChange={handleChange} />
                <input name="audience" placeholder="Audience" value={form.audience} onChange={handleChange} />
                <input name="tone" placeholder="Tone (e.g. confident, friendly)" value={form.tone} onChange={handleChange} />

                <select name="platform" value={form.platform} onChange={handleChange}>
                  <option value="meta">Meta</option>
                  <option value="google">Google</option>
                  <option value="tiktok">TikTok</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="other">Other</option>
                </select>

                <input name="offer" placeholder="Offer (optional)" value={form.offer} onChange={handleChange} />

                <select name="goal" value={form.goal} onChange={handleChange}>
                  <option value="sales">Sales</option>
                  <option value="leads">Leads</option>
                  <option value="traffic">Traffic</option>
                  <option value="awareness">Awareness</option>
                  <option value="engagement">Engagement</option>
                  <option value="app_installs">App Installs</option>
                </select>
              </div>

              <div className="opt-helpRow">
                <div className="opt-helpItem">
                  <span className="opt-helpLabel">Platform: {String(form.platform || "").toUpperCase()}</span>
                  <span className="opt-helpText">{selectedPlatformHelp}</span>
                </div>
                <div className="opt-helpItem">
                  <span className="opt-helpLabel">Goal: {String(form.goal || "").replaceAll("_", " ").toUpperCase()}</span>
                  <span className="opt-helpText">{selectedGoalHelp}</span>
                </div>
              </div>

              <textarea
                className="opt-textarea"
                name="description"
                placeholder="Product description (what it is, why it’s better, key benefit)"
                value={form.description}
                onChange={handleChange}
                rows={4}
              />

              <div className="opt-grid">
                <select name="audience_temp" value={form.audience_temp} onChange={handleChange}>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="retargeting">Retargeting</option>
                </select>
                <input name="placements" placeholder="Placements (optional)" value={form.placements} onChange={handleChange} />
                <input name="objective" placeholder="Objective (optional)" value={form.objective} onChange={handleChange} />
              </div>

              <div className="opt-helpRow">
                <div className="opt-helpItem">
                  <span className="opt-helpLabel">Audience temp: {String(form.audience_temp || "").toUpperCase()}</span>
                  <span className="opt-helpText">{selectedTempHelp}</span>
                </div>
              </div>

              <div className="opt-grid">
                <input name="flight_start" placeholder="Flight start (YYYY-MM-DD)" value={form.flight_start} onChange={handleChange} />
                <input name="flight_end" placeholder="Flight end (YYYY-MM-DD)" value={form.flight_end} onChange={handleChange} />
                <input name="audience_size" placeholder="Audience size (optional)" value={form.audience_size} onChange={handleChange} />
                <input name="budget_type" placeholder="Budget type (Daily/Lifetime)" value={form.budget_type} onChange={handleChange} />
                <input name="conversion_event" placeholder="Conversion event (optional)" value={form.conversion_event} onChange={handleChange} />
                <input name="geo" placeholder="Geo (optional)" value={form.geo} onChange={handleChange} />
                <input name="device" placeholder="Device (optional)" value={form.device} onChange={handleChange} />
              </div>

              <textarea
                className="opt-textarea"
                name="notes"
                placeholder="Notes (optional): what you tested, what’s not working, constraints, etc."
                value={form.notes}
                onChange={handleChange}
                rows={3}
              />
            </StepSection>

            <StepSection
              step="2"
              title={
                <>
                  Current Creative
                  <InfoTip text="Upload the actual ad creative or paste current copy so AdGen can find what may be hurting performance." />
                </>
              }
              description="Upload the creative you are running or paste the existing ad copy."
            >
              <div className="opt-uploadBox">
                <input
                  ref={fileInputRef}
                  className="opt-file"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  multiple
                  onChange={onPickFiles}
                />

                <Button
                  type="button"
                  className="opt-secondaryBtn"
                  onClick={uploadCreatives}
                  disabled={uploading || !selectedFiles.length}
                >
                  {uploading ? "Uploading..." : "Upload Creatives"}
                </Button>
              </div>

              {uploadErr && <p className="opt-error">{uploadErr}</p>}

              {uploadedUrls.length > 0 && (
                <div className="opt-thumbGrid">
                  {uploadedUrls.map((u, i) => (
                    <img key={i} src={u} alt={`Creative ${i + 1}`} className="opt-thumb" />
                  ))}
                </div>
              )}

              <div className="opt-grid">
                <input name="current_headline" placeholder="Headline (optional)" value={form.current_headline} onChange={handleChange} />
                <input name="current_cta" placeholder="CTA (optional)" value={form.current_cta} onChange={handleChange} />
                <input name="current_image_prompt" placeholder="Creative notes (optional)" value={form.current_image_prompt} onChange={handleChange} />
              </div>

              <textarea
                className="opt-textarea"
                name="current_primary_text"
                placeholder="Primary text (optional)"
                value={form.current_primary_text}
                onChange={handleChange}
                rows={3}
              />
            </StepSection>

            <StepSection
              step="3"
              title={
                <>
                  Performance Metrics
                  <InfoTip text="CTR, CPM, CPC, CPA, ROAS, impressions, clicks, and conversions help AdGen make stronger recommendations." />
                </>
              }
              description="Add any available performance data. Partial metrics still help."
            >
              <div className="opt-grid">
                <input name="ctr" placeholder="CTR %" value={form.ctr} onChange={handleChange} />
                <input name="cpc" placeholder="CPC" value={form.cpc} onChange={handleChange} />
                <input name="cpa" placeholder="CPA" value={form.cpa} onChange={handleChange} />
                <input name="cpm" placeholder="CPM" value={form.cpm} onChange={handleChange} />
                <input name="spend" placeholder="Spend" value={form.spend} onChange={handleChange} />
                <input name="impressions" placeholder="Impressions" value={form.impressions} onChange={handleChange} />
                <input name="clicks" placeholder="Clicks" value={form.clicks} onChange={handleChange} />
                <input name="conversions" placeholder="Conversions" value={form.conversions} onChange={handleChange} />
                <input name="roas" placeholder="ROAS" value={form.roas} onChange={handleChange} />
                <input name="frequency" placeholder="Frequency" value={form.frequency} onChange={handleChange} />
              </div>
            </StepSection>

            <StepSection
              step="4"
              title={
                <>
                  AI Enhancements
                  <InfoTip text="Brand Kit lets AdGen use your saved logo, colors, fonts, voice, audience, and brand rules during optimization." />
                </>
              }
              description="Choose which intelligence layers AdGen should use during optimization."
            >

              <div className="opt-enhancementGrid">
                <div className="opt-enhancementCard">
                  <label className="opt-toggle">
                    <input
                      type="checkbox"
                      checked={useBrandKit}
                      onChange={(e) => setUseBrandKit(e.target.checked)}
                      disabled={loading || regenLoading}
                    />
                    <span>
                      <strong>Apply Brand Kit</strong>
                      <small>Recommended</small>
                    </span>
                  </label>
                </div>
              </div>
            </StepSection>

            <Button className="opt-mainCta" type="submit" disabled={loading}>
              {loading ? "Analyzing..." : "✨ Analyze & Improve"}
            </Button>

            {err && <p className="opt-error">{err}</p>}

            {result && (
              <Card className="opt-resultsPanel">
                <div className="section-heading">
                  <span className="step-badge">5</span>
                  <div>
                    <h2>
                      Optimization Results
                      <InfoTip text="These results include diagnosis, recommendations, improved copy, and a stronger image prompt." />
                    </h2>
                    <p>Review AdGen’s diagnosis, recommendations, and improved creative direction.</p>
                  </div>
                </div>

                <div className="opt-resultGrid">
                  <Card className="opt-resultCard opt-resultWide">
                    <h3>Executive Summary</h3>
                    <p>{result.summary}</p>
                  </Card>

                  <Card className="opt-resultCard">
                    <h3>Likely Issues</h3>
                    <ul>
                      {result.likely_issues?.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </Card>

                  <Card className="opt-resultCard">
                    <h3>AI Recommendations</h3>
                    <ul>
                      {result.recommended_changes?.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </Card>

                  <Card className="opt-resultCard opt-resultWide">
                    <h3>Improved Copy</h3>
                    <div className="opt-copyBlock">
                      <span>Headline</span>
                      <p>{result.improved_headline}</p>
                    </div>
                    <div className="opt-copyBlock">
                      <span>Primary Text</span>
                      <p>{result.improved_primary_text}</p>
                    </div>
                    <div className="opt-copyBlock">
                      <span>CTA</span>
                      <p>{result.improved_cta}</p>
                    </div>
                  </Card>

                  <Card className="opt-resultCard opt-resultWide">
                    <h3>Optimized Image Prompt</h3>
                    <p>{result.improved_image_prompt}</p>
                  </Card>
                </div>

                {uploadedUrls.length > 0 ? (
                  <Card className="opt-generatePanel">
                    <h3>Generate Optimized Creative</h3>
                    <p>
                      Generate a new creative using the improved copy and image direction.
                      This will count toward your monthly generation limit.
                    </p>

                    <div className="opt-grid">
                      <select value={regenSize} onChange={(e) => setRegenSize(e.target.value)}>
                        <option value="1024x1024">Square (1024x1024)</option>
                        <option value="1024x1792">Portrait (1024x1792)</option>
                        <option value="1792x1024">Landscape (1792x1024)</option>
                      </select>
                    </div>

                    <Button
                      type="button"
                      onClick={handleGenerateNewCreative}
                      disabled={regenLoading}
                    >
                      {regenLoading ? "Generating..." : "Generate New Creative"}
                    </Button>

                    {regenErr && <p className="opt-error">{regenErr}</p>}

                    {regenResult?.imageUrl && (
                      <Card className="opt-updatedCreativeCard">
                        <div className="opt-updatedCreativeHeader">
                          <div>
                            <p className="opt-miniKicker">UPDATED CREATIVE</p>
                            <h3>Optimized Creative Ready</h3>
                            <p>
                              This creative was generated from your optimization results,
                              improved copy, Brand Kit settings, and selected aspect ratio.
                            </p>
                          </div>
                        </div>

                        <img
                          src={regenResult.imageUrl}
                          alt="Regenerated creative"
                          className="opt-generated"
                          onError={() => alert("Image failed to load")}
                        />

                        <div className="opt-updatedCopyGrid">
                          <div>
                            <span>Headline</span>
                            <p>{result.improved_headline}</p>
                          </div>

                          <div>
                            <span>CTA</span>
                            <p>{result.improved_cta}</p>
                          </div>

                          <div className="opt-copyWide">
                            <span>Primary Text</span>
                            <p>{result.improved_primary_text}</p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          className="opt-secondaryBtn"
                          onClick={downloadOptimizedImage}
                        >
                          Download Image
                        </Button>

                        {regenResult?.usage && (
                          <p className="opt-subtext">
                            Usage: {regenResult.usage.used}/{regenResult.usage.cap}{" "}
                            remaining {regenResult.usage.remaining}
                          </p>
                        )}
                      </Card>
                    )}
                  </Card>
                ) : (
                  <p className="opt-subtext">
                    Upload at least one creative above to unlock one-click “Generate New Creative”.
                  </p>
                )}
              </Card>
            )}
          </form>
        )}
      </main>

      <aside className="opt-side">
        <Card className="opt-sideCard">
          <h3>Tips for better analysis</h3>
          <p>
            The more campaign context and performance data you include, the stronger the recommendations will be.
          </p>
          <ul>
            <li>Upload the actual creative you are running</li>
            <li>Include CTR, CPM, CPC, CPA, and ROAS when available</li>
            <li>Add placement, objective, and audience details</li>
            <li>Describe what feels weak or underperforming</li>
          </ul>
        </Card>

        <Card className="opt-sideCard">
          <h3>Analysis Preview</h3>
          <p>
            {result
              ? "Your optimization results are ready below."
              : "Your AI recommendations will appear after analysis."}
          </p>
        </Card>
      </aside>
    </div>
  </div>
);
}








