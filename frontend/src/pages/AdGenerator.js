import React, { useState } from "react";
import "./AdGenerator.css";

function AdGenerator() {
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

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    // Use env var in production; fallback to localhost for local dev
    const apiBase = process.env.REACT_APP_API_URL?.trim();

if (!apiBase) {
  console.error("❌ Missing REACT_APP_API_URL at build time");
  alert("Config error: API URL is missing. App must be rebuilt.");
  setLoading(false);
  return;
}

console.log("✅ API URL:", apiBase);


    try {
      console.log("API URL:", apiBase);

      const response = await fetch(`${apiBase}/generate-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        // FastAPI often returns { detail: "..." }
        const msg =
          (data && (data.detail || data.error || data.message)) ||
          `Request failed (${response.status})`;
        alert(msg);
        return;
      }

      if (!data) {
        alert("No data returned from server.");
        return;
      }

      if (!data.imageUrl) {
        console.warn("[AdGen] No imageUrl in response. Full payload:", data);
        // Not fatal if your backend returns text-only sometimes, but warn the user
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
      <p className="decription">
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
        <div className="spinner" />
        <div className="loading-text">Generating your ad…</div>
      </div>

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
