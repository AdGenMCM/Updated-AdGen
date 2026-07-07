// src/pages/AdGenerator.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useWinnersProfile } from "../hooks/useWinnersProfile";

const db = getFirestore();

const INITIAL_FORM = {
  companyName: "",
  product_name: "",
  description: "",
  audience: "",
  tone: "",
  platform: "",
  imageSize: "1024x1024",
  offer: "",
  goal: "Sales",
  campaignObjective: "Auto",
  stylePreset: "Minimal",
  productType: "auto",
};

const PLATFORM_LABELS = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  other: "Other",
};

const STYLE_MAP = {
  Premium: "Premium",
  Minimal: "Minimal",
  Bold: "Bold",
  Lifestyle: "Lifestyle",
  UGC: "UGC",
  Luxury: "Premium",
  "Studio Product": "Premium",
  Photorealistic: "Premium",
  "Dark & Cinematic": "Premium",
  "Bright & Clean": "Minimal",
};

const MAX_REFERENCE_IMAGES = 3;

function AdGenerator() {
  const navigate = useNavigate();
  const referenceInputRef = useRef(null);

  const [form, setForm] = useState(INITIAL_FORM);

  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(true);
  const [brandKitAppliedFields, setBrandKitAppliedFields] = useState({});
  const [touchedFields, setTouchedFields] = useState({});

  const [useWinners, setUseWinners] = useState(false);

  const [referenceImages, setReferenceImages] = useState([]);
  const [referenceImageMode, setReferenceImageMode] = useState("product_reference");
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState("");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState(null);

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setBrandKit(null);
        setBrandKitLoading(false);
        return;
      }

      try {
        setBrandKitLoading(true);
        const snap = await getDoc(doc(db, "users", user.uid));
        const kit = snap.data()?.brandKit || null;
        setBrandKit(kit);
      } catch (err) {
        console.error("Failed to load Brand Kit:", err);
        setBrandKit(null);
      } finally {
        setBrandKitLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const brandKitDefaults = useMemo(() => {
    if (!brandKit) return {};

    const platformRaw = brandKit.preferredPlatform || "";
    const platform = PLATFORM_LABELS[platformRaw] || platformRaw || "";

    const imageStyle = brandKit.imageStyle || "";
    const stylePreset = STYLE_MAP[imageStyle] || "";

    const imageSize = ["1024x1024", "1024x1792", "1792x1024"].includes(
      brandKit.aspectRatioPreference
    )
      ? brandKit.aspectRatioPreference
      : "";

    return {
      audience: brandKit.targetAudience || "",
      tone: brandKit.voice || brandKit.brandPersonality || "",
      platform,
      imageSize,
      offer: brandKit.offerStyle || "",
      stylePreset,
    };
  }, [brandKit]);

  useEffect(() => {
    if (!useBrandKit || !brandKit) return;

    setForm((prev) => {
      const next = { ...prev };
      const applied = {};

      Object.entries(brandKitDefaults).forEach(([key, value]) => {
        if (!value) return;
        if (touchedFields[key]) return;

        const currentValue = prev[key];
        const initialValue = INITIAL_FORM[key];

        if (!currentValue || currentValue === initialValue) {
          next[key] = value;
          applied[key] = true;
        }
      });

      if (Object.keys(applied).length) {
        setBrandKitAppliedFields((old) => ({ ...old, ...applied }));
      }

      return next;
    });
  }, [useBrandKit, brandKit, brandKitDefaults, touchedFields]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setBrandKitAppliedFields((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };

  const {
    winnersProfile,
    winnerGuidance,
    winnersLoading,
    refreshWinners,
  } = useWinnersProfile({
    kind: "image",
    enabled: useWinners,
    apiBase,
    limit: 200,
    minSpend: 0,
  });

  const fieldBadge = (name) => {
    if (!useBrandKit || !brandKitAppliedFields[name]) return null;
    return <span className="brandkit-default-badge">Brand Kit Default</span>;
  };

  const uploadReferenceImages = async (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return;

    setReferenceError("");

    const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (remainingSlots <= 0) {
      setReferenceError("You can upload up to 3 reference images.");
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    const invalid = filesToUpload.find((file) => !file.type?.startsWith("image/"));
    if (invalid) {
      setReferenceError("Reference images must be PNG, JPG, JPEG, or WEBP files.");
      return;
    }

    if (!apiBase) {
      setReferenceError("Config error: API URL is missing. App must be rebuilt.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/login");
        return;
      }

      setReferenceUploading(true);

      const token = await user.getIdToken(true);
      const fd = new FormData();
      filesToUpload.forEach((file) => fd.append("files", file));

      const res = await fetch(`${apiBase}/upload-reference-images`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setReferenceError(data?.detail || "Reference image upload failed.");
        return;
      }

      const newUrls = data?.urls || [];

      const previews = filesToUpload.slice(0, newUrls.length).map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        url: newUrls[index],
        previewUrl: URL.createObjectURL(file),
      }));

      setReferenceImages((prev) => [...prev, ...previews].slice(0, MAX_REFERENCE_IMAGES));
    } catch (err) {
      console.error("Reference upload failed:", err);
      setReferenceError("Reference image upload failed. Please try again.");
    } finally {
      setReferenceUploading(false);
      if (referenceInputRef.current) {
        referenceInputRef.current.value = "";
      }
    }
  };

  const removeReferenceImage = (id) => {
    setReferenceImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      referenceImages.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, [referenceImages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setUiError(null);

    await new Promise((r) => setTimeout(r, 0));

    if (!apiBase) {
      alert("Config error: API URL is missing. App must be rebuilt.");
      setLoading(false);
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in to generate an ad.");
        setLoading(false);
        navigate("/login");
        return;
      }

      const token = await user.getIdToken(true);

      const payload = {
        ...form,
        useBrandKit,
        campaignObjective: form.campaignObjective,
        referenceImageUrls: referenceImages.map((img) => img.url).filter(Boolean),
        referenceImageMode,
        productType: form.productType === "auto" ? null : form.productType,
      };

      if (useWinners) {
        try {
          const profile = winnersProfile || (await refreshWinners());

          if (profile) {
            payload.winnerProfile = profile;
            payload.winnersApply = ["tone", "platform", "ratio", "style", "do", "avoid"];
            payload.winnersInfluence = 0.6;

            if (winnerGuidance) {
              payload.winnerGuidance = winnerGuidance.slice(0, 1000);
            }
          }
        } catch (err) {
          setUiError({
            type: "sub",
            message:
              err?.message ||
              "Winners insights are available on Pro & Business plans. Upgrade to use this feature.",
            upgradePath: "/account",
          });
          return;
        }
      }

      const response = await fetch(`${apiBase}/generate-ad`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.warn("[AdGen] Could not parse JSON response:", parseErr);
      }

      if (!response.ok) {
        const detail = data?.detail ?? data?.error ?? data?.message;

        if (response.status === 429) {
          const msg = safeDetailMessage(detail) || "You’ve reached your monthly limit.";
          const upgradePath = detail?.upgradePath || "/account";
          const used = detail?.used;
          const cap = detail?.cap;

          setUiError({
            type: "cap",
            message: used != null && cap != null ? `${msg} (${used}/${cap} used this month)` : msg,
            upgradePath,
          });
          return;
        }

        if (response.status === 401) {
          setUiError({
            type: "auth",
            message: safeDetailMessage(detail) || "Session expired. Please log in again.",
            upgradePath: "/login",
          });
          return;
        }

        if (response.status === 402 || response.status === 403) {
          setUiError({
            type: "sub",
            message: safeDetailMessage(detail) || "This feature requires an active plan.",
            upgradePath: "/account",
          });
          return;
        }

        alert(safeDetailMessage(detail) || `Request failed (${response.status})`);
        return;
      }

      if (!data) {
        alert("No data returned from server.");
        return;
      }

      if (!data.imageUrl) {
        alert("Ad copy generated, but no image URL was returned.");
      }

      setResult(data);
    } catch (err) {
      console.error("[AdGen] Fetch error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };
    const downloadImage = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/login");
        return;
      }

      const token = await user.getIdToken(true);

      const response = await fetch(`${apiBase}/download-image/${result.imageJobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Download request failed.");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `adgen-${result.imageJobId || "image"}.png`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed. Please try again.");
    }
  };

  return (
    <div className="adgen-container adgenPage">
      <h1 className="app-title">AI Ad Generator</h1>
      <p className="description">
        Create brand-aware ad copy and polished ad images using your campaign details, Brand Kit,
        reference images, and optional performance insights.
      </p>

      <form className="adgen-form" onSubmit={handleSubmit}>
        <section className="form-section">
          <div className="section-heading">
            <h2>AI Enhancements</h2>
            <p>Choose which intelligence layers AdGen should apply to this generation.</p>
          </div>

          <div className="enhancement-grid">
            <div className="option-card enhancement-card">
              <label className="option-toggle">
                <input
                  type="checkbox"
                  checked={useBrandKit}
                  onChange={(e) => setUseBrandKit(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  <strong>Apply Brand Kit</strong>
                  <small>
                    {brandKitLoading
                      ? "Checking saved Brand Kit..."
                      : useBrandKit
                      ? "Brand guidance enabled"
                      : "Brand guidance disabled"}
                  </small>
                </span>
              </label>

              <p>
                Applies your saved logo, colors, fonts, messaging, audience, design preferences,
                and creative rules to keep this ad consistent with your brand.
              </p>
            </div>

            <div className="option-card enhancement-card">
              <label className="option-toggle">
                <input
                  type="checkbox"
                  checked={useWinners}
                  onChange={(e) => setUseWinners(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  <strong>Apply Winner Profile</strong>
                  <small>Pro/Business</small>
                </span>
              </label>

              <p>
                Uses patterns from your highest-performing creatives to influence this generation
                without copying previous campaigns.
              </p>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>Campaign Details</h2>
            <p>Tell AdGen what you are promoting and who the ad is for.</p>
          </div>

          <input
            name="companyName"
            placeholder="Company Name"
            value={form.companyName}
            onChange={handleChange}
            disabled={loading}
          />
          
          <input
            name="product_name"
            placeholder="Product Name"
            value={form.product_name}
            onChange={handleChange}
            disabled={loading}
          />

          <textarea
            name="description"
            placeholder="Product Description or Image Prompt you'd like to generate"
            value={form.description}
            onChange={handleChange}
            disabled={loading}
          />

          <div className="field">
            <div className="field-label">Target Audience {fieldBadge("audience")}</div>
            <input
              name="audience"
              placeholder="Target Audience"
              value={form.audience}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field">
            <div className="field-label">Tone {fieldBadge("tone")}</div>
            <input
              name="tone"
              placeholder="Tone (e.g., energetic, friendly)"
              value={form.tone}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field">
            <div className="field-label">Offer {fieldBadge("offer")}</div>
            <input
              name="offer"
              placeholder='Offer (e.g., "20% off", "Free trial")'
              value={form.offer}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <div className="field-label">Campaign Goal</div>
              <select name="goal" value={form.goal} onChange={handleChange} disabled={loading}>
                <option value="Sales">Sales</option>
                <option value="Leads">Leads</option>
                <option value="Traffic">Traffic</option>
                <option value="Awareness">Awareness</option>
                <option value="App Installs">App Installs</option>
              </select>
            </div>

            <div className="field">
              <div className="field-label">Campaign Objective</div>
              <select
                name="campaignObjective"
                value={form.campaignObjective}
                onChange={handleChange}
                disabled={loading}
              >
                <option value="Auto">Auto</option>
                <option value="Product Launch">Product Launch</option>
                <option value="Seasonal Promotion">Seasonal Promotion</option>
                <option value="Limited-Time Offer">Limited-Time Offer</option>
                <option value="Brand Awareness">Brand Awareness</option>
                <option value="Retargeting">Retargeting</option>
                <option value="Lead Generation">Lead Generation</option>
                <option value="App Promotion">App Promotion</option>
                <option value="Event">Event</option>
                <option value="Evergreen">Evergreen</option>
              </select>
            </div>
          </div>

          <div className="section-helper-card">
            <strong>Campaign Objective</strong>
            <p>
              Adds extra context about the type of campaign you are running. A product launch,
              retargeting ad, and limited-time offer should each feel different.
            </p>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>Creative Settings</h2>
            <p>Control the format, style, and creative direction of the generated ad.</p>
          </div>

          <div className="field">
            <div className="field-label">Ad Platform {fieldBadge("platform")}</div>
            <input
              name="platform"
              placeholder="Ad Platform (e.g., Instagram)"
              value={form.platform}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <div className="field-label">Product Type</div>
              <select name="productType" value={form.productType} onChange={handleChange} disabled={loading}>
                <option value="auto">Auto-detect</option>
                <option value="App / Software">App / Software</option>
                <option value="Electronics / Device">Electronics / Device</option>
                <option value="Home Appliance">Home Appliance</option>
                <option value="Skincare / Beauty">Skincare / Beauty</option>
                <option value="Supplement">Supplement</option>
                <option value="Beverage / Food">Beverage / Food</option>
                <option value="Apparel">Apparel</option>
                <option value="Service">Service</option>
                <option value="Other Physical Product">Other Physical Product</option>
              </select>
            </div>

            <div className="field">
              <div className="field-label">Style {fieldBadge("stylePreset")}</div>
              <select name="stylePreset" value={form.stylePreset} onChange={handleChange} disabled={loading}>
                <option value="Minimal">Minimal (Studio)</option>
                <option value="Lifestyle">Lifestyle</option>
                <option value="UGC">UGC (Creator)</option>
                <option value="Premium">Premium (Luxury)</option>
                <option value="Bold">Bold (High-contrast)</option>
              </select>
            </div>

            <div className="field">
              <div className="field-label">Image Size {fieldBadge("imageSize")}</div>
              <select name="imageSize" value={form.imageSize} onChange={handleChange} disabled={loading}>
                <option value="1024x1024">Square (1024x1024)</option>
                <option value="1024x1792">Portrait (1024x1792)</option>
                <option value="1792x1024">Landscape (1792x1024)</option>
              </select>
            </div>
          </div>

          <div className="helper-card-grid compact">
            <div className="helper-card">
              <strong>Product Type</strong>
              <p>Helps AdGen understand what kind of product, service, app, or offer it should prioritize visually.</p>
            </div>
            <div className="helper-card">
              <strong>Style</strong>
              <p>Controls the overall creative direction, such as studio, lifestyle, UGC, premium, or bold.</p>
            </div>
            <div className="helper-card">
              <strong>Image Size</strong>
              <p>Choose the aspect ratio based on where the advertisement will be displayed.</p>
            </div>
            <div className="helper-card">
              <strong>Campaign Goal</strong>
              <p>Tells the AI whether to optimize the ad for sales, leads, traffic, awareness, or app installs.</p>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <h2>Reference Images</h2>
            <p>
              Upload up to three images to help AdGen better understand your
              product or desired creative direction.
            </p>
          </div>

          <div className="reference-upload-card">

            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              multiple
              hidden
              onChange={(e) => uploadReferenceImages(e.target.files)}
            />

            <button
              type="button"
              className="reference-upload-btn"
              onClick={() => referenceInputRef.current?.click()}
              disabled={referenceUploading || loading}
            >
              {referenceUploading
                ? "Uploading..."
                : `Upload Reference Images (${referenceImages.length}/${MAX_REFERENCE_IMAGES})`}
            </button>

            <p className="reference-help">
              Great for product photos, existing advertisements, packaging,
              app screenshots, or inspiration images.
            </p>

            {referenceError && (
              <div className="reference-error">
                {referenceError}
              </div>
            )}

            {referenceImages.length > 0 && (
              <div className="reference-preview-grid">
                {referenceImages.map((img) => (
                  <div key={img.id} className="reference-preview-card">
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                    />

                    <button
                      type="button"
                      className="remove-reference-btn"
                      onClick={() => removeReferenceImage(img.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="reference-mode">
              <label>
                <input
                  type="radio"
                  name="referenceMode"
                  value="product_reference"
                  checked={referenceImageMode === "product_reference"}
                  onChange={(e) => setReferenceImageMode(e.target.value)}
                />
                Product Reference
              </label>

              <label>
                <input
                  type="radio"
                  name="referenceMode"
                  value="style_inspiration"
                  checked={referenceImageMode === "style_inspiration"}
                  onChange={(e) => setReferenceImageMode(e.target.value)}
                />
                Style Inspiration
              </label>
            </div>

            <div className="section-helper-card">
              <strong>Reference Images</strong>

              <p>
                <strong>Product Reference</strong> preserves the uploaded
                product, packaging, or app while creating a new advertisement.
              </p>

              <p>
                <strong>Style Inspiration</strong> uses the uploaded images
                only for composition, lighting, mood, colors, framing, and
                design inspiration.
              </p>
            </div>

          </div>
        </section>

        <div className="button-row">
          <button
            type="submit"
            disabled={
              loading ||
              winnersLoading ||
              referenceUploading
            }
          >
            {loading
              ? "Generating..."
              : winnersLoading
              ? "Loading Winners..."
              : referenceUploading
              ? "Uploading..."
              : "Generate Ad"}
          </button>
        </div>

      </form>

      <div
        className={`loading-overlay ${loading ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className="adgen-spinner" />
        <div className="loading-text">
          Generating your advertisement...
        </div>
      </div>

      {uiError && (
        <div className="result">
          <h2 className="notice">NOTICE</h2>

          <p className="ad-text">
            {uiError.message}
          </p>

          <div className="result-container">
            <button
              className="download-button"
              onClick={() =>
                navigate(uiError.upgradePath || "/account")
              }
            >
              {uiError.type === "auth"
                ? "Go to Login"
                : "Go to My Account"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="result">

          <h2>Generated Ad Copy</h2>

          <div className="ad-copy">

            <p className="ad-text">
              <strong>Headline:</strong> {result.copy.headline}
            </p>

            <p className="ad-text">
              <strong>Primary Text:</strong> {result.copy.primary_text}
            </p>

            <p className="ad-text">
              <strong>CTA:</strong> {result.copy.cta}
            </p>

          </div>

          <div className="result-container">

            <img
              src={result.imageUrl}
              alt="Generated Ad"
              className="generated-image"
            />

            <button
              className="download-button"
              onClick={downloadImage}
            >
              Download Image
            </button>

          </div>

        </div>
      )}

    </div>
  );
}

export default AdGenerator;











