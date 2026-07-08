// src/pages/AdGenerator.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useWinnersProfile } from "../hooks/useWinnersProfile";
import InfoTip from "../components/ui/InfoTip";
import StepSection from "../components/ui/StepSection";

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
const LOADING_MESSAGES = [
  "Analyzing your product...",
  "Understanding your audience...",
  "Applying your Brand Kit if selected...",
  "Applying Winner Profile if selected...",
  "Building high-converting copy...",
  "Designing your creative...",
  "Rendering your advertisement...",
  "Putting on the finishing touches..."
];

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
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();
  const hasReferenceImages = referenceImages.length > 0;

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
        setBrandKit(snap.data()?.brandKit || null);
      } catch (err) {
        console.error("Failed to load Brand Kit:", err);
        setBrandKit(null);
      } finally {
        setBrandKitLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
  if (!loading) {
    setLoadingMessage(LOADING_MESSAGES[0]);
    return;
  }

  let index = 0;

  const interval = setInterval(() => {
    index = (index + 1) % LOADING_MESSAGES.length;
    setLoadingMessage(LOADING_MESSAGES[index]);
  }, 2200);

  return () => clearInterval(interval);
}, [loading]);

  const brandKitDefaults = useMemo(() => {
    if (!brandKit) return {};

    const platformRaw = brandKit.preferredPlatform || "";
    const platform = PLATFORM_LABELS[platformRaw] || platformRaw || "";
    const stylePreset = STYLE_MAP[brandKit.imageStyle || ""] || "";

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
        if (!value || touchedFields[key]) return;
        if (!prev[key] || prev[key] === INITIAL_FORM[key]) {
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

  const { winnersProfile, winnerGuidance, winnersLoading, refreshWinners } =
    useWinnersProfile({
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
        headers: { Authorization: `Bearer ${token}` },
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
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  };

  const removeReferenceImage = (id) => {
    setReferenceImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
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
          setUiError({
            type: "cap",
            message:
              detail?.used != null && detail?.cap != null
                ? `${msg} (${detail.used}/${detail.cap} used this month)`
                : msg,
            upgradePath: detail?.upgradePath || "/account",
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

      if (!response.ok) throw new Error("Download request failed.");

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
      <div className="adgen-dashboard">
        <main className="adgen-main">
          <div className="adgen-hero">
            <div>
              <span className="adgen-kicker">AI Creative Studio</span>
              <h1 className="app-title">Generate Ad</h1>
              <p className="description">
                Create scroll-stopping ads using your Brand Kit, reference images, and performance insights.
              </p>
            </div>
          </div>

          <form className="adgen-form" onSubmit={handleSubmit}>
            <StepSection
              step="1"
              title="Product & Audience"
              description="Tell AdGen what you are promoting and who the ad is for."
            >

              <div className="field-grid">
                <div className="field">
                  <div className="field-label">Company Name</div>
                  <input name="companyName" placeholder="Hydrate Energy" value={form.companyName} onChange={handleChange} disabled={loading} />
                </div>

                <div className="field">
                  <div className="field-label">Product Name</div>
                  <input name="product_name" placeholder="Hydrate Energy Drink" value={form.product_name} onChange={handleChange} disabled={loading} />
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  Product Description <InfoTip text="Describe what the product is, the main benefit, and what you want the ad to communicate." />
                </div>
                <textarea name="description" placeholder="Describe the product, offer, and creative direction..." value={form.description} onChange={handleChange} disabled={loading} />
              </div>

              <div className="field-grid">
                <div className="field">
                  <div className="field-label">
                    Target Audience {fieldBadge("audience")} <InfoTip text="Who the ad is for. Example: fitness enthusiasts, busy parents, small business owners, or skincare buyers." />
                  </div>
                  <input name="audience" placeholder="Fitness enthusiasts" value={form.audience} onChange={handleChange} disabled={loading} />
                </div>

                <div className="field">
                  <div className="field-label">
                    Platform {fieldBadge("platform")} <InfoTip text="Where this ad will run. This helps AdGen match format, tone, and creative style to the platform." />
                  </div>
                  <input name="platform" placeholder="Facebook / Instagram Feed" value={form.platform} onChange={handleChange} disabled={loading} />
                </div>

                <div className="field">
                  <div className="field-label">
                    Offer {fieldBadge("offer")} <InfoTip text="Any promotion, discount, free trial, bundle, or incentive you want included in the ad." />
                  </div>
                  <input name="offer" placeholder="20% off first order" value={form.offer} onChange={handleChange} disabled={loading} />
                </div>

                <div className="field">
                  <div className="field-label">
                    Goal <InfoTip text="Tells AdGen whether to prioritize sales, leads, traffic, awareness, or app installs." />
                  </div>
                  <select name="goal" value={form.goal} onChange={handleChange} disabled={loading}>
                    <option value="Sales">Sales</option>
                    <option value="Leads">Leads</option>
                    <option value="Traffic">Traffic</option>
                    <option value="Awareness">Awareness</option>
                    <option value="App Installs">App Installs</option>
                  </select>
                </div>
              </div>
            </StepSection>

            <StepSection
              step="2"
              title="Creative Details"
              description="Control the tone, visual style, and campaign format."
            >

              <div className="field-grid three">
                <div className="field">
                  <div className="field-label">
                    Tone {fieldBadge("tone")} <InfoTip text="Controls how the ad sounds. Example: motivational, luxury, friendly, bold, professional, or playful." />
                  </div>
                  <input name="tone" placeholder="Motivational" value={form.tone} onChange={handleChange} disabled={loading} />
                </div>

                <div className="field">
                  <div className="field-label">
                    Style {fieldBadge("stylePreset")} <InfoTip text="Controls the visual direction of the generated image, such as minimal, lifestyle, premium, UGC, or bold." />
                  </div>
                  <select name="stylePreset" value={form.stylePreset} onChange={handleChange} disabled={loading}>
                    <option value="Minimal">Minimal</option>
                    <option value="Lifestyle">Lifestyle</option>
                    <option value="UGC">UGC</option>
                    <option value="Premium">Premium</option>
                    <option value="Bold">Bold</option>
                  </select>
                </div>

                <div className="field">
                  <div className="field-label">
                    Aspect Ratio {fieldBadge("imageSize")} <InfoTip text="Choose the format based on where the ad will appear. Square for feeds, portrait for stories/reels, landscape for wide placements." />
                  </div>
                  <select name="imageSize" value={form.imageSize} onChange={handleChange} disabled={loading}>
                    <option value="1024x1024">1:1 Square</option>
                    <option value="1024x1792">9:16 Portrait</option>
                    <option value="1792x1024">16:9 Landscape</option>
                  </select>
                </div>
              </div>

              <div className="field-grid">
                <div className="field">
                  <div className="field-label">
                    Product Type <InfoTip text="Helps AdGen understand what kind of product or service you are promoting. Leave Auto-detect if unsure." />
                  </div>
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
                  <div className="field-label">
                    Campaign Objective <InfoTip text="Adds context about the campaign, such as launch, retargeting, seasonal promotion, or lead generation." />
                  </div>
                  <select name="campaignObjective" value={form.campaignObjective} onChange={handleChange} disabled={loading}>
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
            </StepSection>

            <StepSection
              step="3"
              title="Brand & Assets"
              description="Apply your Brand Kit and upload optional reference images."
            >

              <div className="enhancement-grid">
                <div className="option-card enhancement-card">
                  <label className="option-toggle">
                    <input type="checkbox" checked={useBrandKit} onChange={(e) => setUseBrandKit(e.target.checked)} disabled={loading} />
                    <span>
                      <strong>
                        Apply Brand Kit <InfoTip text="Uses your saved logo, colors, fonts, brand voice, website, and brand defaults to keep generated ads consistent." />
                      </strong>
                      <small>{brandKitLoading ? "Checking saved Brand Kit..." : useBrandKit ? "Brand guidance enabled" : "Brand guidance disabled"}</small>
                    </span>
                  </label>
                </div>

                <div className="option-card enhancement-card">
                  <label className="option-toggle">
                    <input type="checkbox" checked={useWinners} onChange={(e) => setUseWinners(e.target.checked)} disabled={loading} />
                    <span>
                      <strong>
                        Apply Winner Profile <InfoTip text="Uses patterns from your best-performing creatives, such as winning styles, hooks, platforms, and performance metrics. Available on Pro and Business." />
                      </strong>
                      <small>Pro/Business</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="reference-upload-card">
                <input ref={referenceInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple hidden onChange={(e) => uploadReferenceImages(e.target.files)} />

                <button type="button" className="reference-upload-btn" onClick={() => referenceInputRef.current?.click()} disabled={referenceUploading || loading}>
                  {referenceUploading ? "Uploading..." : `Upload Reference Images (${referenceImages.length}/${MAX_REFERENCE_IMAGES})`}
                </button>

                {referenceError && <div className="reference-error">{referenceError}</div>}

                {referenceImages.length > 0 && (
                  <div className="reference-preview-grid">
                    {referenceImages.map((img) => (
                      <div key={img.id} className="reference-preview-card">
                        <img src={img.previewUrl} alt={img.name} />
                        <button type="button" className="remove-reference-btn" onClick={() => removeReferenceImage(img.id)}>✕</button>
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
                      disabled={!hasReferenceImages}
                    />
                    Product Reference
                    <InfoTip
                      text={
                        hasReferenceImages
                          ? "Use this when the uploaded image shows the actual product, packaging, app, or item you want preserved in the generated ad."
                          : "Upload at least one reference image to choose how AdGen should use it."
                      }
                    />
                  </label>

                  <label>
                    <input
                      type="radio"
                      name="referenceMode"
                      value="style_inspiration"
                      checked={referenceImageMode === "style_inspiration"}
                      onChange={(e) => setReferenceImageMode(e.target.value)}
                      disabled={!hasReferenceImages}
                    />
                    Style Inspiration
                    <InfoTip
                      text={
                        hasReferenceImages
                          ? "Use this when the uploaded image is only for visual direction, such as lighting, mood, composition, colors, or layout style."
                          : "Upload at least one reference image to choose how AdGen should use it."
                      }
                    />
                  </label>
                </div>
              </div>
            </StepSection>

            <div className="button-row">
              <button type="submit" disabled={loading || winnersLoading || referenceUploading}>
                {loading ? "Generating..." : winnersLoading ? "Loading Winners..." : referenceUploading ? "Uploading..." : "✨ Generate Ad"}
              </button>
            </div>
          </form>
        </main>

        <aside className="adgen-side">
          <div className="side-card tips-card">
            <h3>Tips for better results</h3>
            <p>Be specific with your product description, benefits, audience, and desired creative direction.</p>
            <ul>
              <li>Include key benefits and features</li>
              <li>Add an offer if available</li>
              <li>Use reference images for style guidance</li>
            </ul>
          </div>

          <div className="side-card">
            <h3>Generated Preview</h3>
            {!result && !uiError && <p className="side-muted">Your generated ad will appear here after creation.</p>}

            {uiError && (
              <>
                <p>{uiError.message}</p>
                <button className="download-button" onClick={() => navigate(uiError.upgradePath || "/account")}>
                  {uiError.type === "auth" ? "Go to Login" : "Go to My Account"}
                </button>
              </>
            )}

            {result && (
              <>
                <div className="ad-copy">
                  <p><strong>Headline:</strong> {result.copy.headline}</p>
                  <p><strong>Primary Text:</strong> {result.copy.primary_text}</p>
                  <p><strong>CTA:</strong> {result.copy.cta}</p>
                </div>

                {result.imageUrl && <img src={result.imageUrl} alt="Generated Ad" className="generated-image" />}

                <button className="download-button" onClick={downloadImage}>
                  Download Image
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <div
        className={`loading-overlay ${loading ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className="loading-overlay-content">
          <div className="adgen-spinner" />
          <div className="loading-text">
            {loadingMessage}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdGenerator;











