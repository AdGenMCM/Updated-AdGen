import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../firebaseConfig";
import googleFonts from "../data/googleFonts";
import "./BrandKit.css";

const db = getFirestore();

const COMMON_CTAS = [
  "Shop Now",
  "Learn More",
  "Sign Up",
  "Get Offer",
  "Download",
  "Contact Us",
  "Book Now",
  "Start Free Trial",
  "Schedule Demo",
];

const defaultKit = {
  brandName: "",
  logoUrl: "",
  websiteUrl: "",

  industry: "",
  brandPersonality: "",
  targetAudience: "",
  preferredCta: "",
  imageStyle: "",
  preferredPlatform: "",
  aspectRatioPreference: "",
  offerStyle: "",

  colors: {
    primary: "#111827",
    secondary: "#ffffff",
    accent: "#2563eb",
  },

  fonts: {
    headline: "Inter",
    body: "Open Sans",
    cta: "Poppins",
  },

  voice: "",
  notes: "",
  brandDna: "",

  doList: "",
  dontList: "",
  brandKeywords: "",
  negativeKeywords: "",
  complianceRules: "",
  productsServices: "",
};

function buildGoogleFontUrl(fonts) {
  const uniqueFonts = [...new Set(fonts.filter(Boolean))];
  if (!uniqueFonts.length) return "";

  const families = uniqueFonts
    .map(
      (font) =>
        `family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;600;700`
    )
    .join("&");

  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

export default function BrandKit() {
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();
  const logoInputRef = useRef(null);

  const [kit, setKit] = useState(defaultKit);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState("");

  const fontOptions = useMemo(() => {
    return googleFonts.map((font) => ({
      value: font.family,
      label: font.family,
      favorite: !!font.favorite,
      category: font.category,
      tags: font.tags || [],
    }));
  }, []);

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 48,
      borderRadius: 12,
      borderColor: state.isFocused ? "#2563eb" : "#d1d5db",
      boxShadow: state.isFocused
        ? "0 0 0 3px rgba(37, 99, 235, 0.12)"
        : "none",
      "&:hover": {
        borderColor: state.isFocused ? "#2563eb" : "#9ca3af",
      },
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: "#111827",
    }),
    option: (base, state) => ({
      ...base,
      fontSize: 15,
      padding: "10px 12px",
      backgroundColor: state.isSelected
        ? "#2563eb"
        : state.isFocused
        ? "#eff6ff"
        : "#ffffff",
      color: state.isSelected ? "#ffffff" : "#111827",
      cursor: "pointer",
    }),
    menu: (base) => ({
      ...base,
      zIndex: 100,
      borderRadius: 12,
      overflow: "hidden",
    }),
  };

  const loadedFontUrl = useMemo(() => {
    return buildGoogleFontUrl([
      kit.fonts.headline,
      kit.fonts.body,
      kit.fonts.cta,
    ]);
  }, [kit.fonts]);

  useEffect(() => {
    if (!loadedFontUrl) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = loadedFontUrl;
    document.head.appendChild(link);

    return () => document.head.removeChild(link);
  }, [loadedFontUrl]);

  useEffect(() => {
    async function loadBrandKit() {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      const existing = snap.data()?.brandKit;

      if (existing) {
        setKit({
          ...defaultKit,
          ...existing,
          colors: { ...defaultKit.colors, ...(existing.colors || {}) },
          fonts: { ...defaultKit.fonts, ...(existing.fonts || {}) },
        });
      }
    }

    loadBrandKit();
  }, []);

  const updateKit = (path, value) => {
    setSaveMsg("");

    setKit((prev) => {
      if (path.includes(".")) {
        const [group, field] = path.split(".");
        return {
          ...prev,
          [group]: {
            ...prev[group],
            [field]: value,
          },
        };
      }

      return {
        ...prev,
        [path]: value,
      };
    });
  };

  const getSelectValue = (fontName) => {
    return (
      fontOptions.find((option) => option.value === fontName) || {
        value: fontName,
        label: fontName,
      }
    );
  };

  const formatFontOption = (option, meta) => {
    const showStar = option.favorite && meta.context === "menu";
    return (
      <span className="brandkit-font-option">
        {showStar && <span className="brandkit-font-star">⭐</span>}
        <span>{option.label}</span>
      </span>
    );
  };

  const saveBrandKit = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSaveMsg("Please log in to save your Brand Kit.");
      return;
    }

    try {
      setSaving(true);
      setSaveMsg("");

      await setDoc(
        doc(db, "users", user.uid),
        {
          brandKit: {
            ...kit,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );

      setSaveMsg("Brand Kit saved and ready for future creatives.");
    } catch (err) {
      console.error("Failed to save Brand Kit:", err);
      setSaveMsg("Could not save Brand Kit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;

    if (!apiBase) {
      setLogoErr("Config error: REACT_APP_API_BASE_URL is missing.");
      return;
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowedTypes.includes(file.type)) {
      setLogoErr("Use PNG, JPG, WEBP, or SVG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoErr("Logo too large. Max 5MB.");
      return;
    }

    try {
      setLogoUploading(true);
      setLogoErr("");
      setSaveMsg("");

      const user = auth.currentUser;
      if (!user) {
        setLogoErr("Please log in to upload a logo.");
        return;
      }

      const token = await user.getIdToken(true);
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${apiBase}/upload-brand-logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setLogoErr(data?.detail || "Logo upload failed.");
        return;
      }

      updateKit("logoUrl", data.logoUrl);
      setSaveMsg("Logo uploaded and saved to your Brand Kit.");
    } catch (err) {
      console.error("Logo upload failed:", err);
      setLogoErr("Logo upload failed. Please try again.");
    } finally {
      setLogoUploading(false);
    }
  };

  const FontSelect = ({ label, value, onChange }) => (
    <div className="brandkit-field">
      <label>{label}</label>
      <Select
        options={fontOptions}
        value={getSelectValue(value)}
        onChange={(option) => onChange(option?.value || "")}
        placeholder="Search Google Fonts..."
        classNamePrefix="brandkit-select"
        styles={selectStyles}
        formatOptionLabel={formatFontOption}
        isSearchable
        openMenuOnFocus
      />
    </div>
  );

  return (
    <div className="brandkit-page">
      <div className="brandkit-shell">
        <section className="brandkit-hero">
          <div>
            <p className="brandkit-eyebrow">Brand Kit</p>
            <h1>Keep every creative on-brand.</h1>
            <p>
              Configure your Brand Kit once and AdGen can apply it across Image
              Generation, Video Ads, the Ad Optimizer, and future platform features.
              Defaults are optional and only used when filled in.
            </p>
          </div>
        </section>

        <section className="brandkit-tips">
          <h2>💡 Best Practices</h2>
          <div className="tips-grid">
            <p><strong>✓ Use a transparent PNG or SVG logo</strong><br />Transparent logos blend naturally into ads without white boxes.</p>
            <p><strong>✓ Upload a high-resolution logo</strong><br />Recommended minimum size: 1000 × 1000 pixels.</p>
            <p><strong>✓ Select official brand colors</strong><br />These help AdGen keep future creatives visually consistent.</p>
            <p><strong>✓ Choose Google Fonts</strong><br />AdGen can better reference known fonts or close visual matches.</p>
            <p><strong>✓ Optional defaults are safe to leave blank</strong><br />Blank defaults will not influence generation.</p>
            <p><strong>✓ Keep your Brand Kit updated</strong><br />Changes will apply to future generated creatives.</p>
          </div>
        </section>

        <div className="brandkit-grid">
          <section className="brandkit-card">
            <div className="brandkit-section">
              <h2>Brand Identity</h2>

              <div className="brandkit-field">
                <label>Brand Name</label>
                <input
                  value={kit.brandName}
                  onChange={(e) => updateKit("brandName", e.target.value)}
                  placeholder="Example: AdGen MCM"
                />
              </div>

              <div className="brandkit-field">
                <label>Website URL <span className="optional-label">Optional</span></label>
                <input
                  value={kit.websiteUrl}
                  onChange={(e) => updateKit("websiteUrl", e.target.value)}
                  placeholder="https://yourbrand.com"
                />
              </div>

              <div className="brandkit-field">
                <label>Logo</label>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />

                <div
                  className="logo-upload-box"
                  onClick={() => logoInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  {kit.logoUrl ? (
                    <img
                      src={kit.logoUrl}
                      alt="Brand logo"
                      className="brandkit-logo-preview"
                    />
                  ) : (
                    <>
                      <span>{logoUploading ? "Uploading..." : "Upload Logo"}</span>
                      <small>
                        Recommended: transparent PNG or SVG, 1000 × 1000 px or larger.
                      </small>
                    </>
                  )}
                </div>

                {kit.logoUrl && (
                  <button
                    type="button"
                    className="brandkit-small-btn"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? "Uploading..." : "Change Logo"}
                  </button>
                )}

                {logoErr && <p className="brandkit-error">{logoErr}</p>}
              </div>

              <div className="brandkit-import-disabled">
                <div>
                  <h3>Import Brand from Website</h3>
                  <p>
                    Paste your website URL and AdGen will detect your logo, colors,
                    fonts, products, and brand voice.
                  </p>
                </div>

                <input disabled placeholder="https://yourbrand.com" />
                <button disabled>Import Brand</button>
                <span className="coming-soon">Coming Soon</span>
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Brand Strategy <span className="section-optional">Optional</span></h2>

              <div className="brandkit-field">
                <label>Industry <span className="optional-label">Optional</span></label>
                <input
                  value={kit.industry}
                  onChange={(e) => updateKit("industry", e.target.value)}
                  placeholder="Example: Fitness, SaaS, Real Estate, Skincare"
                />
              </div>

              <div className="brandkit-field">
                <label>Brand Personality <span className="optional-label">Optional</span></label>
                <input
                  value={kit.brandPersonality}
                  onChange={(e) => updateKit("brandPersonality", e.target.value)}
                  placeholder="Example: Premium, bold, trustworthy, modern"
                />
              </div>

              <div className="brandkit-field">
                <label>Target Audience <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.targetAudience}
                  onChange={(e) => updateKit("targetAudience", e.target.value)}
                  placeholder="Example: Busy professionals aged 30–50 who want simple, premium solutions."
                />
              </div>

              <div className="brandkit-field">
                <label>Brand DNA <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.brandDna}
                  onChange={(e) => updateKit("brandDna", e.target.value)}
                  placeholder="Example: We are a premium fitness brand. We speak like a coach, not a salesperson. We emphasize science-backed results, simplicity, and trust."
                />
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Colors</h2>

              <div className="brandkit-color-row">
                <div className="brandkit-field">
                  <label>Primary</label>
                  <input
                    className="brandkit-color-input"
                    type="color"
                    value={kit.colors.primary}
                    onChange={(e) => updateKit("colors.primary", e.target.value)}
                  />
                </div>

                <div className="brandkit-field">
                  <label>Secondary</label>
                  <input
                    className="brandkit-color-input"
                    type="color"
                    value={kit.colors.secondary}
                    onChange={(e) => updateKit("colors.secondary", e.target.value)}
                  />
                </div>

                <div className="brandkit-field">
                  <label>Accent</label>
                  <input
                    className="brandkit-color-input"
                    type="color"
                    value={kit.colors.accent}
                    onChange={(e) => updateKit("colors.accent", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Brand Typography</h2>

              <FontSelect
                label="Headline Font"
                value={kit.fonts.headline}
                onChange={(value) => updateKit("fonts.headline", value)}
              />

              <FontSelect
                label="Body Font"
                value={kit.fonts.body}
                onChange={(value) => updateKit("fonts.body", value)}
              />

              <FontSelect
                label="CTA Font"
                value={kit.fonts.cta}
                onChange={(value) => updateKit("fonts.cta", value)}
              />

              <div
                className="font-preview-card"
                style={{ borderColor: kit.colors.accent }}
              >
                <span
                  className="font-preview-label"
                  style={{ color: kit.colors.accent }}
                >
                  Quick Preview
                </span>
                <h3
                  style={{
                    fontFamily: kit.fonts.headline,
                    color: kit.colors.primary,
                  }}
                >
                  The perfect ad starts here.
                </h3>
                <p
                  style={{
                    fontFamily: kit.fonts.body,
                    color: kit.colors.primary,
                  }}
                >
                  This is how supporting ad copy and brand messaging could appear in your creatives.
                </p>
                <button
                  type="button"
                  style={{
                    fontFamily: kit.fonts.cta,
                    background: kit.colors.accent,
                    color: kit.colors.secondary,
                  }}
                >
                  {kit.preferredCta || "CTA Preview"}
                </button>
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Generation Defaults <span className="section-optional">Optional</span></h2>

              <div className="brandkit-field">
                <label>Default CTA <span className="optional-label">Optional</span></label>

                <select
                  value={
                    kit.preferredCta === ""
                      ? ""
                      : COMMON_CTAS.includes(kit.preferredCta)
                      ? kit.preferredCta
                      : "__custom__"
                  }
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      updateKit("preferredCta", "");
                    } else {
                      updateKit("preferredCta", e.target.value);
                    }
                  }}
                >
                  <option value="">No default — choose each time</option>
                  {COMMON_CTAS.map((cta) => (
                    <option key={cta} value={cta}>
                      {cta}
                    </option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>

                <small className="brandkit-helper-text">
                  Leave blank if you do not want Brand Kit to influence CTAs.
                </small>
              </div>

              {(kit.preferredCta === "" ||
                (!COMMON_CTAS.includes(kit.preferredCta) &&
                  kit.preferredCta !== "")) && (
                <div className="brandkit-field">
                  <label>Custom CTA</label>

                  <input
                    type="text"
                    value={kit.preferredCta}
                    onChange={(e) => updateKit("preferredCta", e.target.value)}
                    placeholder="Example: Get My Free Quote"
                    maxLength={40}
                  />

                  <small className="brandkit-helper-text">
                    Use this only if you want a custom default CTA.
                  </small>
                </div>
              )}

              <div className="brandkit-field">
                <label>Default Platform <span className="optional-label">Optional</span></label>
                <select
                  value={kit.preferredPlatform}
                  onChange={(e) => updateKit("preferredPlatform", e.target.value)}
                >
                  <option value="">No default — choose each time</option>
                  <option value="meta">Meta</option>
                  <option value="tiktok">TikTok</option>
                  <option value="google">Google</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="pinterest">Pinterest</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="brandkit-field">
                <label>Default Aspect Ratio <span className="optional-label">Optional</span></label>
                <select
                  value={kit.aspectRatioPreference}
                  onChange={(e) => updateKit("aspectRatioPreference", e.target.value)}
                >
                  <option value="">No default — choose each time</option>
                  <option value="1024x1024">Square (1024×1024)</option>
                  <option value="1024x1792">Portrait (1024×1792)</option>
                  <option value="1792x1024">Landscape (1792×1024)</option>
                </select>

                <small className="brandkit-helper-text">
                  Leave blank if you do not want Brand Kit to influence image size.
                </small>
              </div>

              <div className="brandkit-field">
                <label>Default Image Style <span className="optional-label">Optional</span></label>
                <select
                  value={kit.imageStyle}
                  onChange={(e) => updateKit("imageStyle", e.target.value)}
                >
                  <option value="">No default — choose each time</option>
                  <option>Premium</option>
                  <option>Minimal</option>
                  <option>Bold</option>
                  <option>Lifestyle</option>
                  <option>UGC</option>
                  <option>Luxury</option>
                  <option>Studio Product</option>
                  <option>Photorealistic</option>
                  <option>Dark & Cinematic</option>
                  <option>Bright & Clean</option>
                </select>
              </div>

              <div className="brandkit-field">
                <label>Offer Style <span className="optional-label">Optional</span></label>
                <input
                  value={kit.offerStyle}
                  onChange={(e) => updateKit("offerStyle", e.target.value)}
                  placeholder="Example: Free trial, discount, demo, appointment, bundle"
                />
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Advanced AI Controls <span className="section-optional">Optional</span></h2>

              <div className="brandkit-field">
                <label>Voice <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.voice}
                  onChange={(e) => updateKit("voice", e.target.value)}
                  placeholder="Example: Modern, confident, friendly, premium, and conversion-focused."
                />
              </div>

              <div className="brandkit-field">
                <label>Extra Instructions <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.notes}
                  onChange={(e) => updateKit("notes", e.target.value)}
                  placeholder="Example: Always use clean backgrounds. Never crop the logo. Avoid red. Mention free shipping when relevant."
                />
              </div>

              <div className="brandkit-field">
                <label>Do List <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.doList}
                  onChange={(e) => updateKit("doList", e.target.value)}
                  placeholder="Example: Use bright backgrounds, show product in use, include clear CTA buttons."
                />
              </div>

              <div className="brandkit-field">
                <label>Don't List <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.dontList}
                  onChange={(e) => updateKit("dontList", e.target.value)}
                  placeholder="Example: No cartoon style, no children, no fake testimonials, no clutter."
                />
              </div>

              <div className="brandkit-field">
                <label>Brand Keywords <span className="optional-label">Optional</span></label>
                <input
                  value={kit.brandKeywords}
                  onChange={(e) => updateKit("brandKeywords", e.target.value)}
                  placeholder="Example: innovation, trust, performance, simplicity"
                />
              </div>

              <div className="brandkit-field">
                <label>Negative Keywords <span className="optional-label">Optional</span></label>
                <input
                  value={kit.negativeKeywords}
                  onChange={(e) => updateKit("negativeKeywords", e.target.value)}
                  placeholder="Example: cheap, risky, aggressive, medical claims"
                />
              </div>

              <div className="brandkit-field">
                <label>Compliance Rules <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.complianceRules}
                  onChange={(e) => updateKit("complianceRules", e.target.value)}
                  placeholder="Example: Never mention guaranteed results. Always avoid before/after claims. Include disclaimers when needed."
                />
              </div>

              <div className="brandkit-field">
                <label>Products / Services Notes <span className="optional-label">Optional</span></label>
                <textarea
                  value={kit.productsServices}
                  onChange={(e) => updateKit("productsServices", e.target.value)}
                  placeholder="Example: Main product is a premium coaching plan. Secondary offer is a free consultation."
                />
              </div>

              <button
                className="brandkit-save-btn"
                onClick={saveBrandKit}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save & Apply Across AdGen"}
              </button>

              {saveMsg && <p className="brandkit-save-message">{saveMsg}</p>}
            </div>
          </section>

          <aside className="brandkit-preview">
            <h2>Brand Preview</h2>

            <div
              className="preview-logo"
              style={{
                background: kit.colors.secondary,
                color: kit.colors.primary,
                borderColor: kit.colors.accent,
              }}
            >
              {kit.logoUrl ? (
                <img
                  src={kit.logoUrl}
                  alt="Brand logo"
                  className="preview-logo-img"
                />
              ) : (
                "LOGO"
              )}
            </div>

            <h3
              style={{
                fontFamily: kit.fonts.headline,
                color: kit.colors.primary,
              }}
            >
              {kit.brandName || "Your Brand"}
            </h3>

            <div className="preview-swatches">
              <div><span style={{ background: kit.colors.primary }} /> Primary</div>
              <div><span style={{ background: kit.colors.secondary, border: "1px solid #d1d5db" }} /> Secondary</div>
              <div><span style={{ background: kit.colors.accent }} /> Accent</div>
            </div>

            <div className="preview-block">
              <h4>Typography</h4>
              <p>Headline: {kit.fonts.headline}</p>
              <p>Body: {kit.fonts.body}</p>
              <p>CTA: {kit.fonts.cta}</p>
            </div>

            <div className="preview-block">
              <h4>Strategy</h4>
              <p>Industry: {kit.industry || "Not set"}</p>
              <p>Personality: {kit.brandPersonality || "Not set"}</p>
              <p>Default CTA: {kit.preferredCta || "No default"}</p>
              <p>Default Platform: {kit.preferredPlatform || "No default"}</p>
              <p>Default Aspect Ratio: {kit.aspectRatioPreference || "No default"}</p>
              <p>Default Image Style: {kit.imageStyle || "No default"}</p>
            </div>

            <div className="preview-block">
              <h4>Generation Context</h4>
              <p>Audience: {kit.targetAudience ? "Configured" : "Not set"}</p>
              <p>Brand DNA: {kit.brandDna ? "Configured" : "Not set"}</p>
              <p>Rules: {kit.doList || kit.dontList ? "Configured" : "Not set"}</p>
              <p>Compliance: {kit.complianceRules ? "Configured" : "Not set"}</p>
            </div>

            <div className="preview-block">
              <h4>Status</h4>
              <p className="status-ready">✓ Ready for Image Generation</p>
              <p className="status-ready">✓ Ready for Video Ads</p>
              <p className="status-ready">✓ Ready for Ad Optimizer</p>
              <p className="status-ready">✓ Ready for Future Features</p>
            </div>

            <div className="preview-block muted">
              <h4>Future Assets</h4>
              <p>○ Website Import</p>
              <p>○ Product Catalog</p>
              <p>○ Brand Images</p>
              <p>○ Design Guidelines</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}