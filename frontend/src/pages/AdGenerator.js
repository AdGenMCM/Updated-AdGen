import React, { useEffect, useState } from "react";
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

  // Tier + admin info
  const [userTier, setUserTier] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Optimizer state
  const [optAudienceTemp, setOptAudienceTemp] = useState("cold");
  const [optCtr, setOptCtr] = useState("");
  const [optCpc, setOptCpc] = useState("");
  const [optCpa, setOptCpa] = useState("");
  const [optSpend, setOptSpend] = useState("");
  const [optNotes, setOptNotes] = useState("");

  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState(null);
  const [optResult, setOptResult] = useState(null);

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };

  // Fetch tier/admin once (best effort)
  useEffect(() => {
    const run = async () => {
      if (!apiBase) return;
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Force refresh so custom claims (admin role) show up immediately
        const token = await user.getIdToken(true);
        const res = await fetch(`${apiBase}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          setUserTier(data.tier || null);
          setIsAdmin(!!data.isAdmin);
        }
      } catch (e) {
        // non-fatal
      }
    };

    run();
  }, [apiBase]);

  const canUseOptimizer = (() => {
    if (isAdmin) return true;
    const t = (userTier || "").toLowerCase();
    return t === "pro_monthly" || t === "business_monthly";
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setUiError(null);

    // reset optimizer results when generating a new ad
    setOptResult(null);
    setOptError(null);

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

      // refresh tier/admin after generation (in case they upgraded / claim changed)
      try {
        const token2 = await user.getIdToken(true);
        const res2 = await fetch(`${apiBase}/me`, {
          headers: { Authorization: `Bearer ${token2}` },
        });
        const me = await res2.json().catch(() => null);
        if (res2.ok && me) {
          setUserTier(me.tier || null);
          setIsAdmin(!!me.isAdmin);
        }
      } catch (e) {
        // non-fatal
      }
    } catch (err) {
      console.error("[AdGen] Fetch error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!apiBase) {
      alert("Config error: API URL is missing. App must be rebuilt.");
      return;
    }
    if (!result?.copy) {
      alert("Generate an ad first so we can optimize it.");
      return;
    }

    try {
      setOptLoading(true);
      setOptError(null);
      setOptResult(null);

      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in.");
        navigate("/login");
        return;
      }

      // Force refresh so admin claim is honored immediately
      const token = await user.getIdToken(true);

      const p = (form.platform || "").toLowerCase();
      const platform =
        p.includes("google")
          ? "google"
          : p.includes("tiktok")
          ? "tiktok"
          : p.includes("linkedin")
          ? "linkedin"
          : p.includes("meta") || p.includes("facebook") || p.includes("instagram")
          ? "meta"
          : "other";

      const payload = {
        product_name: form.product_name,
        description: form.description,
        audience: form.audience,
        tone: form.tone,
        platform,
        offer: form.offer || null,
        goal: form.goal || null,
        audience_temp: optAudienceTemp,
        notes: optNotes || null,

        current_headline: result.copy.headline || "",
        current_primary_text: result.copy.primary_text || "",
        current_cta: result.copy.cta || "",
        current_image_prompt: result?.meta?.imagePrompt || "",

        metrics: {
          ctr: optCtr ? Number(optCtr) : null,
          cpc: optCpc ? Number(optCpc) : null,
          cpa: optCpa ? Number(optCpa) : null,
          spend: optSpend ? Number(optSpend) : null,
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

        if (res.status === 403) {
          const msg = safeDetailMessage(detail) || "Available on Pro and Business plans.";
          setOptError(msg);
          return;
        }

        if (res.status === 401) {
          setOptError("Session expired. Please log in again.");
          return;
        }

        if (res.status === 402) {
          setOptError("Subscription inactive. Please manage your subscription.");
          return;
        }

        setOptError(safeDetailMessage(detail) || `Optimization failed (${res.status})`);
        return;
      }

      if (!data) {
        setOptError("No data returned from server.");
        return;
      }

      setOptResult(data);
    } catch (e) {
      setOptError("Something went wrong. Please try again.");
    } finally {
      setOptLoading(false);
    }
  };

  const applyOptimized = () => {
    if (!optResult) return;
    setResult((prev) => ({
      ...prev,
      copy: {
        ...prev.copy,
        headline: optResult.improved_headline,
        primary_text: optResult.improved_primary_text,
        cta: optResult.improved_cta,
      },
    }));
  };

  return (
    <div className="adgen-container">
      <h1 className="app-title">AI Ad Generator</h1>
      <p className="description">
        Please fill out the fields below as accuratly as possible to allow for the best possible generation. It will
        return an AD Image and a description that will help increase post engagement!
      </p>

      <form className="adgen-form" onSubmit={handleSubmit}>
        <input name="product_name" placeholder="Product Name" value={form.product_name} onChange={handleChange} disabled={loading} />
        <textarea name="description" placeholder="Product Description or Image Prompt you'd like to generate" value={form.description} onChange={handleChange} disabled={loading} />
        <input name="audience" placeholder="Target Audience" value={form.audience} onChange={handleChange} disabled={loading} />
        <input name="tone" placeholder="Tone (e.g., energetic, friendly)" value={form.tone} onChange={handleChange} disabled={loading} />
        <input name="platform" placeholder="Ad Platform (e.g., Instagram)" value={form.platform} onChange={handleChange} disabled={loading} />

        <input name="offer" placeholder='Offer (e.g., "20% off", "Free trial")' value={form.offer} onChange={handleChange} disabled={loading} />

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
              <img src={result.imageUrl} alt="Generated Ad" className="generated-image" onError={() => alert("Image failed to load")} />

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

          {/* =======================
              Optimizer (Pro/Business OR Admin)
          ======================= */}
          <div className="optimizer-card">
            <h2>Ad Performance Optimization</h2>
            <p className="ad-text">Paste your metrics and we’ll recommend fixes + generate an improved version.</p>

            {!canUseOptimizer ? (
              <div className="optimizer-locked">
                <p className="ad-text">
                  🔒 <strong>Pro & Business only.</strong> Upgrade to unlock performance optimization.
                </p>

                <div className="button-row">
                  <button className="download-button" onClick={() => navigate("/account")}>
                    Upgrade to Unlock
                  </button>
                </div>

                {optError && (
                  <p className="ad-text" style={{ color: "#b91c1c" }}>
                    {optError}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="field-grid">
                  <div className="field">
                    <div className="field-label">Audience</div>
                    <select value={optAudienceTemp} onChange={(e) => setOptAudienceTemp(e.target.value)} disabled={optLoading}>
                      <option value="cold">Cold</option>
                      <option value="warm">Warm</option>
                      <option value="retargeting">Retargeting</option>
                    </select>
                  </div>

                  <div className="field">
                    <div className="field-label">CTR %</div>
                    <input value={optCtr} onChange={(e) => setOptCtr(e.target.value)} disabled={optLoading} placeholder="e.g. 1.2" />
                  </div>

                  <div className="field">
                    <div className="field-label">CPC</div>
                    <input value={optCpc} onChange={(e) => setOptCpc(e.target.value)} disabled={optLoading} placeholder="e.g. 0.85" />
                  </div>

                  <div className="field">
                    <div className="field-label">CPA</div>
                    <input value={optCpa} onChange={(e) => setOptCpa(e.target.value)} disabled={optLoading} placeholder="e.g. 18.50" />
                  </div>

                  <div className="field">
                    <div className="field-label">Spend</div>
                    <input value={optSpend} onChange={(e) => setOptSpend(e.target.value)} disabled={optLoading} placeholder="e.g. 120" />
                  </div>
                </div>

                <div className="field">
                  <div className="field-label">Notes (optional)</div>
                  <textarea
                    value={optNotes}
                    onChange={(e) => setOptNotes(e.target.value)}
                    disabled={optLoading}
                    placeholder="Placements, hook tested, audience details, etc."
                    rows={3}
                  />
                </div>

                <div className="button-row">
                  <button className="download-button" onClick={handleOptimize} disabled={optLoading}>
                    {optLoading ? "Analyzing..." : "Analyze & Improve"}
                  </button>
                </div>

                {optError && (
                  <p className="ad-text" style={{ color: "#b91c1c" }}>
                    {optError}
                  </p>
                )}

                {optResult && (
                  <div className="result" style={{ marginTop: 12 }}>
                    <h2>Optimization Results</h2>
                    <p className="ad-text">{optResult.summary}</p>

                    <h3>Likely issues</h3>
                    <ul>{optResult.likely_issues?.map((x, i) => <li key={i}>{x}</li>)}</ul>

                    <h3>Recommended changes</h3>
                    <ul>{optResult.recommended_changes?.map((x, i) => <li key={i}>{x}</li>)}</ul>

                    <h3>Improved Copy</h3>
                    <p className="ad-text">
                      <strong>Headline:</strong> {optResult.improved_headline}
                    </p>
                    <p className="ad-text">
                      <strong>Primary Text:</strong> {optResult.improved_primary_text}
                    </p>
                    <p className="ad-text">
                      <strong>CTA:</strong> {optResult.improved_cta}
                    </p>

                    <h3>Improved Image Prompt</h3>
                    <p className="ad-text">{optResult.improved_image_prompt}</p>

                    <div className="button-row">
                      <button className="download-button" onClick={applyOptimized}>
                        Use Improved Copy
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdGenerator;









