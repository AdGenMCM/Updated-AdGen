import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import { auth } from "../firebaseConfig"; // ✅ adjust ONLY if your firebaseConfig path differs


function AdGenerator() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    product_name: "",
    description: "",
    audience: "",
    tone: "",
    platform: "",
    imageSize: "1024x1024",
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // For cap / auth errors
  const [uiError, setUiError] = useState(null);


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") {
      return detail.message || detail.error || JSON.stringify(detail);
    }
    return String(detail);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setUiError(null);

    // ✅ Give React a frame to paint the loading overlay before alerts/returns/navigation
    await new Promise((r) => setTimeout(r, 0));

    // Use env var in production; fallback to localhost for local dev
    const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();

    if (!apiBase) {
      console.error("❌ Missing REACT_APP_API_BASE_URL at build time");
      alert("Config error: API URL is missing. App must be rebuilt.");
      setLoading(false);
      return;
    }

    try {
      // ✅ Firebase token required by your new backend
      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in to generate an ad.");
        setLoading(false); // ✅ ensure spinner stops before redirect
        navigate("/login");
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch(`${apiBase}/generate-ad`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ required
        },
        body: JSON.stringify(form),
      });

      console.log("[AdGen] HTTP status:", response.status, response.statusText);

      // Try to parse JSON even on non-200 responses so we can show useful errors
      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.warn("[AdGen] Could not parse JSON response:", parseErr);
      }

      console.log("[AdGen] API JSON:", data);

      if (!response.ok) {
        // FastAPI often returns { detail: "..." } or { detail: { message, cap, used, upgradePath } }
        const detail = data?.detail ?? data?.error ?? data?.message;

        // ✅ Cap reached case from our backend: status 429 with detail object
        if (response.status === 429) {
          const msg = safeDetailMessage(detail) || "You’ve reached your monthly limit.";
          const upgradePath = detail?.upgradePath || "/account";
          const used = detail?.used;
          const cap = detail?.cap;

          setUiError({
            type: "cap",
            message:
              used != null && cap != null
                ? `${msg} (${used}/${cap} used this month)`
                : msg,
            upgradePath,
          });
          return;
        }

        // ✅ Auth cases
        if (response.status === 401) {
          setUiError({
            type: "auth",
            message: safeDetailMessage(detail) || "Session expired. Please log in again.",
            upgradePath: "/login",
          });
          return;
        }

        // ✅ Subscription inactive (if you return 402)
        if (response.status === 402) {
          setUiError({
            type: "sub",
            message:
              safeDetailMessage(detail) ||
              "Subscription inactive. Please manage your subscription.",
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
        Please fill out the fields below as accuratly as possible to allow for
        the best possible generation. It will return an AD Image and a
        description that will help increase post engagement!
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
          placeholder="Product Description"
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

        <label className="image-size-label">
          Image Size: &nbsp;
          <select
            name="imageSize"
            value={form.imageSize}
            onChange={handleChange}
            disabled={loading}
          >
            <option value="1024x1024">Square (1024x1024)</option>
            <option value="1024x1792">Portrait (1024x1792)</option>
            <option value="1792x1024">Landscape (1792x1024)</option>
          </select>
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Generating..." : "Generate Ad"}
        </button>
      </form>

      <div
        className={`loading-overlay ${loading ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
        <div className="adgen-spinner" />
        <div className="loading-text">Generating your ad! Please Wait...</div>
      </div>

      {/* ✅ Cap / auth / subscription messages (keeps your styling) */}
      {uiError && (
        <div className="result">
          <h2 className="notice">NOTICE:</h2>
          <p className="ad-text">{uiError.message}</p>

          <div className="result-container">
            <button
              className="download-button"
              onClick={() => navigate(uiError.upgradePath || "/account")}
            >
              {uiError.type === "auth" ? "Go to Login" : "Go to My Account"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="result">
          <h2>Generated Ad Copy:</h2>
          <p className="ad-text">{result.text}</p>

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



