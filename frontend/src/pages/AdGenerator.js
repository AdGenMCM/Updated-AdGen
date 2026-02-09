import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import { auth } from "../firebaseConfig";

function AdGenerator() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    product_name: "",
    description: "",
    audience: "",
    tone: "",
    platform: "",
    imageSize: "1024x1024",
    offer: "",
    goal: "Sales",
    stylePreset: "Minimal",
    productType: "auto",
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState(null);

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setUiError(null);

    await new Promise((r) => setTimeout(r, 0));

    if (!apiBase) {
      console.error("❌ Missing REACT_APP_API_BASE_URL at build time");
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

      // Force refresh so claims/tier changes reflect immediately
      const token = await user.getIdToken(true);

      const payload = {
        ...form,
        productType: form.productType === "auto" ? null : form.productType,
      };

      const response = await fetch(`${apiBase}/generate-ad`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      console.log("[AdGen] HTTP status:", response.status, response.statusText);

      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.warn("[AdGen] Could not parse JSON response:", parseErr);
      }

      console.log("[AdGen] API JSON:", data);

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

        if (response.status === 402) {
          setUiError({
            type: "sub",
            message: safeDetailMessage(detail) || "Subscription inactive. Please manage your subscription.",
            upgradePath: "/account",
          });
          return;
        }

        const msg = safeDetailMessage(detail) || `Request failed (${response.status})`;
        alert(msg);
        return;
      }

      if (!data) {
        alert("No data returned from server.");
        return;
      }

      if (!data.imageUrl) {
        console.warn("[AdGen] No imageUrl in response. Full payload:", data);
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

  return (
    <div className="adgen-container">
      <h1 className="app-title">AI Ad Generator</h1>
      <p className="description">
        Please fill out the fields below as accuratly as possible to allow for the best possible generation. It will
        return an AD Image and a description that will help increase post engagement!
      </p>

      <form className="adgen-form" onSubmit={handleSubmit}>
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
        <input
          name="audience"
          placeholder="Target Audience"
          value={form.audience}
          onChange={handleChange}
          disabled={loading}
        />
        <input
          name="tone"
          placeholder="Tone (e.g., energetic, friendly)"
          value={form.tone}
          onChange={handleChange}
          disabled={loading}
        />
        <input
          name="platform"
          placeholder="Ad Platform (e.g., Instagram)"
          value={form.platform}
          onChange={handleChange}
          disabled={loading}
        />

        <input
          name="offer"
          placeholder='Offer (e.g., "20% off", "Free trial")'
          value={form.offer}
          onChange={handleChange}
          disabled={loading}
        />

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
            <div className="field-label">Goal</div>
            <select name="goal" value={form.goal} onChange={handleChange} disabled={loading}>
              <option value="Sales">Sales</option>
              <option value="Leads">Leads</option>
              <option value="Traffic">Traffic</option>
              <option value="Awareness">Awareness</option>
              <option value="App Installs">App Installs</option>
            </select>
          </div>

          <div className="field">
            <div className="field-label">Style</div>
            <select name="stylePreset" value={form.stylePreset} onChange={handleChange} disabled={loading}>
              <option value="Minimal">Minimal (Studio)</option>
              <option value="Lifestyle">Lifestyle</option>
              <option value="UGC">UGC (Creator)</option>
              <option value="Premium">Premium (Luxury)</option>
              <option value="Bold">Bold (High-contrast)</option>
            </select>
          </div>

          <div className="field">
            <div className="field-label">Image Size</div>
            <select name="imageSize" value={form.imageSize} onChange={handleChange} disabled={loading}>
              <option value="1024x1024">Square (1024x1024)</option>
              <option value="1024x1792">Portrait (1024x1792)</option>
              <option value="1792x1024">Landscape (1792x1024)</option>
            </select>
          </div>
        </div>

        <div className="button-row">
          <button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate Ad"}
          </button>
        </div>
      </form>

      <div className={`loading-overlay ${loading ? "show" : ""}`} role="status" aria-live="polite">
        <div className="adgen-spinner" />
        <div className="loading-text">Generating your ad! Please Wait...</div>
      </div>

      {uiError && (
        <div className="result">
          <h2 className="notice">NOTICE:</h2>
          <p className="ad-text">{uiError.message}</p>

          <div className="result-container">
            <button className="download-button" onClick={() => navigate(uiError.upgradePath || "/account")}>
              {uiError.type === "auth" ? "Go to Login" : "Go to My Account"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="result">
          <h2>Generated Ad Copy:</h2>

          {result.copy ? (
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
          ) : (
            <p className="ad-text">{result.text}</p>
          )}

          {result.imageUrl && (
            <div className="result-container">
              <img
                src={result.imageUrl}
                alt="Generated Ad"
                className="generated-image"
                onError={() => alert("Image failed to load")}
              />

              <button
                className="download-button"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = result.imageUrl;
                  link.download = "adgen-image.png";
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
  );
}

export default AdGenerator;










