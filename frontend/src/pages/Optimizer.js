// src/pages/Optimizer.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Optimizer.css";
import { auth } from "../firebaseConfig";

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
    goal: "Sales",
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

  // Upload state (drag & drop)
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]); // File[]
  const [uploadedUrls, setUploadedUrls] = useState([]);   // string[] (Firebase download URLs)
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  // Results
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  // NEW: regenerate (counts usage)
  const [regenSize, setRegenSize] = useState("1024x1024");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenErr, setRegenErr] = useState(null);
  const [regenResult, setRegenResult] = useState(null);

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

  // --- Fetch /me for gating ---
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

  // --- Helpers: file accept rules ---
  const isAllowedImage = (file) => {
    const t = (file?.type || "").toLowerCase();
    return t === "image/png" || t === "image/jpeg" || t === "image/jpg" || t === "image/webp";
  };

  const addFiles = (filesLike) => {
    const incoming = Array.from(filesLike || []);
    const good = incoming.filter(isAllowedImage);

    if (incoming.length && good.length === 0) {
      setUploadErr("Please upload PNG, JPG, or WEBP images only.");
      return;
    }

    const MAX = 6;
    const next = [...selectedFiles, ...good].slice(0, MAX);

    setSelectedFiles(next);
    setUploadErr(null);

    // if selection changes, require re-upload
    setUploadedUrls([]);

    // new run should clear previous regen result (since creative changed)
    setRegenResult(null);
    setRegenErr(null);
  };

  const removeFileAt = (idx) => {
    const next = selectedFiles.filter((_, i) => i !== idx);
    setSelectedFiles(next);
    setUploadedUrls([]);

    setRegenResult(null);
    setRegenErr(null);
  };

  const clearUploads = () => {
    setSelectedFiles([]);
    setUploadedUrls([]);
    setUploadErr(null);

    setRegenResult(null);
    setRegenErr(null);
  };

  // --- Drag events ---
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // --- Upload to backend: /upload-creatives ---
  const uploadCreatives = async () => {
    if (!apiBase) {
      alert("Config error: REACT_APP_API_BASE_URL is missing. Restart frontend after setting it.");
      return;
    }
    if (!selectedFiles.length) {
      setUploadErr("Add at least one creative image to upload.");
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
      selectedFiles.forEach((f) => fd.append("files", f));

      const res = await fetch(`${apiBase}/upload-creatives`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    } catch (e) {
      setUploadErr("Something went wrong uploading creatives. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // --- Optimize (includes uploadedUrls if present) ---
  const handleOptimize = async () => {
    if (!apiBase) {
      alert("Config error: REACT_APP_API_BASE_URL is missing. Restart frontend after setting it.");
      return;
    }

    setLoading(true);
    setErr(null);
    setResult(null);

    // do not wipe uploads, but wipe old regen output for new analysis
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
        product_name: form.product_name,
        description: form.description,
        audience: form.audience,
        tone: form.tone,
        platform: form.platform || "meta",
        offer: form.offer || null,
        goal: form.goal || null,
        audience_temp: form.audience_temp,
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

        current_headline: form.current_headline || null,
        current_primary_text: form.current_primary_text || null,
        current_cta: form.current_cta || null,
        current_image_prompt: form.current_image_prompt || null,

        // uploaded creative image URLs
        creative_image_urls: uploadedUrls.length ? uploadedUrls : null,

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

      const res = await fetch(`${apiBase}/optimize-ad`, {
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

        if (res.status === 401) {
          setErr("Session expired. Please log in again.");
          return;
        }
        if (res.status === 402) {
          setErr("Subscription inactive. Please manage your subscription.");
          return;
        }
        if (res.status === 403) {
          setErr("Optimizer is available on Pro and Business plans.");
          return;
        }

        setErr(safeDetailMessage(detail) || `Optimization failed (${res.status})`);
        return;
      }

      setResult(data);
    } catch (e) {
      setErr("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- NEW: Regenerate new creative from optimizer (COUNTS usage) ---
  const handleRegenerate = async () => {
    if (!apiBase) {
      alert("Config error: REACT_APP_API_BASE_URL is missing. Restart frontend after setting it.");
      return;
    }
    if (!result?.improved_headline || !result?.improved_image_prompt) {
      setRegenErr("Run Analyze & Improve first.");
      return;
    }
    // fastest version: allow regenerate without uploads, but strongly encourage uploads
    // (button is still enabled; we show helper text if none uploaded)
    setRegenLoading(true);
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
        improved_headline: result.improved_headline,
        improved_primary_text: result.improved_primary_text,
        improved_cta: result.improved_cta,
        improved_image_prompt: result.improved_image_prompt,
        imageSize: regenSize,
        creative_image_urls: uploadedUrls.length ? uploadedUrls : null,
      };

      const res = await fetch(`${apiBase}/generate-from-optimizer`, {
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

        if (res.status === 401) {
          setRegenErr("Session expired. Please log in again.");
          return;
        }
        if (res.status === 402) {
          setRegenErr("Subscription inactive. Please manage your subscription.");
          return;
        }
        if (res.status === 403) {
          setRegenErr("Generation is available on Pro and Business plans.");
          return;
        }
        if (res.status === 429) {
          // handle both your string and dict detail styles
          const msg = safeDetailMessage(detail) || "You’ve reached your monthly generation limit.";
          setRegenErr(msg);
          return;
        }

        setRegenErr(safeDetailMessage(detail) || `Regenerate failed (${res.status})`);
        return;
      }

      // backend returns { copy, imageUrl, usage? }
      setRegenResult(data);
    } catch (e) {
      setRegenErr("Something went wrong generating the new creative.");
    } finally {
      setRegenLoading(false);
    }
  };

  const uploadStatusText = useMemo(() => {
    if (!selectedFiles.length) return "Drag & drop creatives here (PNG/JPG/WEBP) — up to 6.";
    if (uploadedUrls.length) return `Uploaded ${uploadedUrls.length} creative(s).`;
    return `${selectedFiles.length} file(s) selected. Upload to include in analysis.`;
  }, [selectedFiles.length, uploadedUrls.length]);

  return (
    <div className="opt-container">
      <h1 className="opt-title">Ad Optimizer</h1>

      {!auth.currentUser ? (
        <div className="opt-card">
          <p className="opt-text">Please log in to use the optimizer.</p>
          <button className="opt-btn" onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      ) : !canUseOptimizer ? (
        <div className="opt-card">
          <h2 className="opt-h2">🔒 Pro & Business only</h2>
          <p className="opt-text">Upgrade to unlock Ad Performance Optimization.</p>
          <button className="opt-btn" onClick={() => navigate("/account")}>Upgrade</button>
          {err && <p className="opt-error">{err}</p>}
        </div>
      ) : (
        <>
          {/* -------- Campaign context -------- */}
          <div className="opt-card">
            <h2 className="opt-h2">Campaign context</h2>

            <div className="opt-grid">
              <input name="product_name" placeholder="Product / Offer Name" value={form.product_name} onChange={handleChange} />
              <input name="audience" placeholder="Audience" value={form.audience} onChange={handleChange} />
              <input name="tone" placeholder="Tone" value={form.tone} onChange={handleChange} />
              <select name="platform" value={form.platform} onChange={handleChange}>
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
                <option value="other">Other</option>
              </select>
              <input name="offer" placeholder="Offer (optional)" value={form.offer} onChange={handleChange} />
              <input name="goal" placeholder="Goal (optional)" value={form.goal} onChange={handleChange} />
            </div>

            <textarea
              className="opt-textarea"
              name="description"
              placeholder="Product description"
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
              <input name="cpm" placeholder="CPM (optional)" value={form.cpm} onChange={handleChange} />
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
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={handleChange}
              rows={3}
            />
          </div>

          {/* -------- Upload creatives (drag & drop) -------- */}
          <div className="opt-card">
            <h2 className="opt-h2">Upload current creative(s)</h2>
            <p className="opt-text">
              Upload the image(s) you’re currently running so the AI can analyze the creative and recommend improvements.
            </p>

            <div
              className={`opt-dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? openFilePicker() : null)}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                multiple
                style={{ display: "none" }}
                onChange={(e) => addFiles(e.target.files)}
              />

              <div className="opt-dropzone-title">{uploadStatusText}</div>
              <div className="opt-dropzone-sub">Click to select files • Drag & drop supported</div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="opt-upload-list">
                {selectedFiles.map((f, idx) => (
                  <div className="opt-upload-item" key={`${f.name}-${idx}`}>
                    <div className="opt-upload-name">{f.name}</div>
                    <button
                      type="button"
                      className="opt-btn opt-btn-secondary"
                      onClick={() => removeFileAt(idx)}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="opt-actions">
              {!uploadedUrls.length ? (
                <button className="opt-btn" onClick={uploadCreatives} disabled={uploading || !selectedFiles.length}>
                  {uploading ? "Uploading..." : "Upload creatives"}
                </button>
              ) : (
                <button className="opt-btn opt-btn-secondary" onClick={clearUploads} disabled={uploading}>
                  Replace uploads
                </button>
              )}
            </div>

            {uploadErr && <p className="opt-error">{uploadErr}</p>}
            {uploadedUrls.length > 0 && (
              <p className="opt-text" style={{ marginTop: 10 }}>✅ Uploaded and ready to analyze.</p>
            )}
          </div>

          {/* -------- Current creative (paste) -------- */}
          <div className="opt-card">
            <h2 className="opt-h2">Current creative (paste)</h2>

            <div className="opt-grid">
              <input name="current_headline" placeholder="Headline" value={form.current_headline} onChange={handleChange} />
              <input name="current_cta" placeholder="CTA" value={form.current_cta} onChange={handleChange} />
            </div>

            <textarea
              className="opt-textarea"
              name="current_primary_text"
              placeholder="Primary text"
              value={form.current_primary_text}
              onChange={handleChange}
              rows={3}
            />
            <textarea
              className="opt-textarea"
              name="current_image_prompt"
              placeholder="Image notes/prompt (optional)"
              value={form.current_image_prompt}
              onChange={handleChange}
              rows={2}
            />
          </div>

          {/* -------- Performance metrics -------- */}
          <div className="opt-card">
            <h2 className="opt-h2">Performance metrics</h2>

            <div className="opt-grid">
              <input name="ctr" placeholder="CTR %" value={form.ctr} onChange={handleChange} />
              <input name="cpc" placeholder="CPC" value={form.cpc} onChange={handleChange} />
              <input name="cpa" placeholder="CPA" value={form.cpa} onChange={handleChange} />
              <input name="spend" placeholder="Spend" value={form.spend} onChange={handleChange} />
              <input name="impressions" placeholder="Impressions" value={form.impressions} onChange={handleChange} />
              <input name="clicks" placeholder="Clicks" value={form.clicks} onChange={handleChange} />
              <input name="conversions" placeholder="Conversions" value={form.conversions} onChange={handleChange} />
              <input name="roas" placeholder="ROAS" value={form.roas} onChange={handleChange} />
              <input name="frequency" placeholder="Frequency" value={form.frequency} onChange={handleChange} />
            </div>

            <button className="opt-btn" onClick={handleOptimize} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze & Improve"}
            </button>

            {err && <p className="opt-error">{err}</p>}
          </div>

          {/* -------- Results + one-click regenerate -------- */}
          {result && (
            <div className="opt-card">
              <h2 className="opt-h2">Results</h2>
              <p className="opt-text">{result.summary}</p>

              <h3 className="opt-h3">Likely issues</h3>
              <ul className="opt-list">
                {result.likely_issues?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>

              <h3 className="opt-h3">Recommended changes</h3>
              <ul className="opt-list">
                {result.recommended_changes?.map((x, i) => <li key={i}>{x}</li>)}
              </ul>

              <h3 className="opt-h3">Improved copy</h3>
              <p className="opt-text"><strong>Headline:</strong> {result.improved_headline}</p>
              <p className="opt-text"><strong>Primary Text:</strong> {result.improved_primary_text}</p>
              <p className="opt-text"><strong>CTA:</strong> {result.improved_cta}</p>

              <h3 className="opt-h3">Improved image prompt</h3>
              <p className="opt-text">{result.improved_image_prompt}</p>

              {/* NEW: One-click regenerate block */}
              <div className="opt-divider" />
              <h3 className="opt-h3">Regenerate new creative</h3>

              {!uploadedUrls.length && (
                <p className="opt-text opt-callout">
                  Tip: Upload your current creative above to get the best “before → after” improvements.
                </p>
              )}

              <div className="opt-grid">
                <select value={regenSize} onChange={(e) => setRegenSize(e.target.value)} disabled={regenLoading}>
                  <option value="1024x1024">Square (1024x1024)</option>
                  <option value="1024x1792">Portrait (1024x1792)</option>
                  <option value="1792x1024">Landscape (1792x1024)</option>
                </select>
              </div>

              <button className="opt-btn" onClick={handleRegenerate} disabled={regenLoading}>
                {regenLoading ? "Generating..." : "Generate New Creative (uses 1 credit)"}
              </button>

              {regenErr && <p className="opt-error">{regenErr}</p>}

              {regenResult?.copy && (
                <div className="opt-card opt-inner" style={{ marginTop: 12 }}>
                  <h3 className="opt-h3">New creative</h3>
                  <p className="opt-text"><strong>Headline:</strong> {regenResult.copy.headline}</p>
                  <p className="opt-text"><strong>Primary Text:</strong> {regenResult.copy.primary_text}</p>
                  <p className="opt-text"><strong>CTA:</strong> {regenResult.copy.cta}</p>

                  {regenResult.imageUrl && (
                    <div className="opt-image-wrap">
                      <img
                        src={regenResult.imageUrl}
                        alt="Generated creative"
                        className="opt-image"
                        onError={() => alert("Image failed to load")}
                      />
                      <button
                        className="opt-btn opt-btn-secondary"
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = regenResult.imageUrl;
                          link.download = "adgen-optimized.png";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        Download Image
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}


