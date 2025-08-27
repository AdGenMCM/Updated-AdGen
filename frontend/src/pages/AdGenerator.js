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

  try {
    const response = await fetch("http://localhost:8000/generate-ad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    console.log("[AdGen] HTTP status:", response.status, response.statusText);

    const data = await response.json();
    console.log("[AdGen] API JSON:", data);

    if (!response.ok) {
      // Backend returned an HTTP error; surface the message if available
      console.error("[AdGen] Error payload:", data);
      alert(data?.detail || "Generation failed. Check server logs.");
      return;
    }

    if (!data?.imageUrl) {
      console.warn("[AdGen] No imageUrl in response. Full payload:", data);
      alert("No image returned. Check backend logs for Ideogram errors.");
    }

    setResult(data);
  } catch (err) {
    alert("Something went wrong. Please try again.");
    console.error("[AdGen] Fetch error:", err);
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="adgen-container">
      <h1 className="app-title">AI Ad Generator</h1>
      <p className="decription"> Please fill out the fields below as accuratly as possible to allow for the best possible generation. It will return an AD Image and a description that will help increase post engagement!</p>

      <form className="adgen-form" onSubmit={handleSubmit}>
        <input
          name="product_name"
          placeholder="Product Name"
          value={form.product_name}
          onChange={handleChange}
        />
        <textarea
          name="description"
          placeholder="Product Description"
          value={form.description}
          onChange={handleChange}
        />
        <input
          name="audience"
          placeholder="Target Audience"
          value={form.audience}
          onChange={handleChange}
        />
        <input
          name="tone"
          placeholder="Tone (e.g., energetic, friendly)"
          value={form.tone}
          onChange={handleChange}
        />
        <input
          name="platform"
          placeholder="Ad Platform (e.g., Instagram)"
          value={form.platform}
          onChange={handleChange}
        />
        <label className="image-size-label">
          Image Size:
          <select name="imageSize" value={form.imageSize} onChange={handleChange}>
            <option value="1024x1024">Square (1024x1024)</option>
            <option value="1024x1792">Portrait (1024x1792)</option>
            <option value="1792x1024">Landscape (1792x1024)</option>
          </select>
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Generating..." : "Generate Ad"}
        </button>
      </form>

      {loading && <div className="spinner"></div>}

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