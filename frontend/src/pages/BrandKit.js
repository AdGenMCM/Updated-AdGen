import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import { auth } from "../firebaseConfig";
import googleFonts from "../data/googleFonts";
import "./BrandKit.css";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InfoTip from "../components/ui/InfoTip";
import FieldLabel from "../components/ui/FieldLabel";

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
    primary: "",
    secondary: "",
    accent: "",
    },

 colorEnabled: {
    primary: false,
    secondary: false,
    accent: false,
    },

 fonts: {
  headline: "",
  body: "",
  cta: "",
},

fontEnabled: {
  headline: false,
  body: false,
  cta: false,
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
  const [kits, setKits] = useState([]);
  const [selectedKitId, setSelectedKitId] = useState(null);
  const [kitLimit, setKitLimit] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState("");

  const brandCompletion = useMemo(() => {
  const checks = [
    { label: "Brand name", done: !!kit.brandName },
    { label: "Logo", done: !!kit.logoUrl },
    { label: "Website", done: !!kit.websiteUrl },
    { label: "Industry", done: !!kit.industry },
    { label: "Audience", done: !!kit.targetAudience },
    { label: "Brand DNA", done: !!kit.brandDna },
    { label: "Colors", done: !!(kit.colors?.primary || kit.colors?.secondary || kit.colors?.accent) },
    { label: "Fonts", done: !!(kit.fonts?.headline || kit.fonts?.body || kit.fonts?.cta) },
    { label: "Voice", done: !!kit.voice },
    { label: "Rules", done: !!(kit.doList || kit.dontList || kit.complianceRules) },
  ];

  const completed = checks.filter((item) => item.done).length;
  const score = Math.round((completed / checks.length) * 100);

  return {
    score,
    completed,
    total: checks.length,
    checks,
    missing: checks.filter((item) => !item.done),
  };
}, [kit]);

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
        kit.fonts.headline || "Inter",
        kit.fonts.body || "Open Sans",
        kit.fonts.cta || "Poppins",
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

  const loadBrandKits = React.useCallback(async (preferredKitId = null) => {
    const user = auth.currentUser;
    if (!user || !apiBase) return;

    const token = await user.getIdToken();
    const res = await fetch(`${apiBase}/brand-kits`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail?.message || data?.detail || "Could not load Brand Kits.");

    const items = Array.isArray(data?.items) ? data.items : [];
    setKits(items);
    setKitLimit(data?.limit || 1);
    setIsAdmin(Boolean(data?.isAdmin));

    const nextId =
      preferredKitId ||
      data?.defaultBrandKitId ||
      items[0]?.id ||
      null;

    setSelectedKitId(nextId);

    const selected = items.find((item) => item.id === nextId) || items[0] || null;
    if (selected) {
      setKit({
        ...defaultKit,
        ...selected,
        colors: { ...defaultKit.colors, ...(selected.colors || {}) },
        colorEnabled: { ...defaultKit.colorEnabled, ...(selected.colorEnabled || {}) },
        fonts: { ...defaultKit.fonts, ...(selected.fonts || {}) },
        fontEnabled: { ...defaultKit.fontEnabled, ...(selected.fontEnabled || {}) },
      });
    } else {
      setKit(defaultKit);
    }
  }, [apiBase]);

  useEffect(() => {
    loadBrandKits().catch((err) => setSaveMsg(err.message || "Could not load Brand Kits."));
  }, [loadBrandKits]);

  const selectBrandKit = (id) => {
    setSelectedKitId(id);
    const selected = kits.find((item) => item.id === id);
    if (!selected) return;
    setKit({
      ...defaultKit,
      ...selected,
      colors: { ...defaultKit.colors, ...(selected.colors || {}) },
      colorEnabled: { ...defaultKit.colorEnabled, ...(selected.colorEnabled || {}) },
      fonts: { ...defaultKit.fonts, ...(selected.fonts || {}) },
      fontEnabled: { ...defaultKit.fontEnabled, ...(selected.fontEnabled || {}) },
    });
    setSaveMsg("");
  };

  const openCreateBrandKit = () => {
    if (!isAdmin && kits.length >= kitLimit) {
      setSaveMsg(`You have reached your ${kitLimit} Brand Kit limit. Upgrade to create another brand.`);
      return;
    }

    setNewBrandName(`Brand ${kits.length + 1}`);
    setCreateOpen(true);
    setSaveMsg("");
  };

  const createBrandKit = async () => {
    const name = newBrandName.trim();
    if (!name) {
      setSaveMsg("Enter a name for the new brand.");
      return;
    }

    if (!isAdmin && kits.length >= kitLimit) {
      setCreateOpen(false);
      setSaveMsg(`You have reached your ${kitLimit} Brand Kit limit.`);
      return;
    }

    const user = auth.currentUser;
    if (!user) throw new Error("Please log in to create a Brand Kit.");

    try {
      setCreating(true);
      const token = await user.getIdToken(true);
      const res = await fetch(`${apiBase}/brand-kits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: { ...defaultKit, brandName: name } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail?.message || data?.detail || "Could not create Brand Kit.");

      setCreateOpen(false);
      setNewBrandName("");
      await loadBrandKits(data.id);
      setSaveMsg(`${name} was created and selected.`);
    } finally {
      setCreating(false);
    }
  };

  const setDefaultBrandKit = async () => {
    if (!selectedKitId) return;
    const user = auth.currentUser;
    const token = await user.getIdToken(true);
    const res = await fetch(`${apiBase}/brand-kits/${selectedKitId}/set-default`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not set default Brand Kit.");
    await loadBrandKits(selectedKitId);
    setSaveMsg("Default Brand Kit updated.");
  };

  const deleteBrandKit = async () => {
    if (!selectedKitId || kits.length <= 1) return;
    if (!window.confirm("Delete this Brand Kit? This cannot be undone.")) return;
    const user = auth.currentUser;
    const token = await user.getIdToken(true);
    const res = await fetch(`${apiBase}/brand-kits/${selectedKitId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || "Could not delete Brand Kit.");
    await loadBrandKits(data?.defaultBrandKitId || null);
  };

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

      if (!selectedKitId) throw new Error("No Brand Kit selected.");
      const token = await user.getIdToken(true);
      const res = await fetch(`${apiBase}/brand-kits/${selectedKitId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            (kit.brandName || "").trim() ||
            (kit.name || "").trim() ||
            `Brand ${Math.max(
              1,
              kits.findIndex((item) => item.id === selectedKitId) + 1
            )}`,
          data: {
            ...kit,
            name:
              (kit.brandName || "").trim() ||
              (kit.name || "").trim() ||
              `Brand ${Math.max(
                1,
                kits.findIndex((item) => item.id === selectedKitId) + 1
              )}`,
            id: undefined,
            createdAt: undefined,
            updatedAt: undefined,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Could not save Brand Kit.");
      setKits((prev) => prev.map((item) => item.id === selectedKitId ? data : item));
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

      const res = await fetch(`${apiBase}/brand-kits/${selectedKitId}/logo`, {
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

  const selectedKit = useMemo(
    () => kits.find((item) => item.id === selectedKitId) || null,
    [kits, selectedKitId]
  );

  const atBrandLimit = !isAdmin && kits.length >= kitLimit;
  const selectedIsDefault = Boolean(selectedKit?.isDefault);

  const FontSelect = ({ label, fontKey, fallback, value, onChange }) => {
  const enabled = !!kit.fontEnabled?.[fontKey];
  const selectedValue = value || fallback;

  return (
    <div className="brandkit-field brandkit-font-card">
      <label className="brandkit-color-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const checked = e.target.checked;

            updateKit(`fontEnabled.${fontKey}`, checked);
            updateKit(
              `fonts.${fontKey}`,
              checked ? (kit.fonts?.[fontKey] || fallback) : ""
            );
          }}
        />
        <span>{label}</span>
      </label>

      <Select
        options={fontOptions}
        value={getSelectValue(selectedValue)}
        onChange={(option) => onChange(option?.value || "")}
        placeholder="Search Google Fonts..."
        classNamePrefix="brandkit-select"
        styles={selectStyles}
        formatOptionLabel={formatFontOption}
        isSearchable
        openMenuOnFocus
        isDisabled={!enabled}
      />

      <small className="brandkit-helper-text">
        {enabled ? selectedValue : "Disabled — this font will not influence AI generation"}
      </small>
    </div>
  );
};

  return (
    <div className="brandkit-page">
      <div className="brandkit-shell">
        <PageHeader
          eyebrow="BRAND KIT"
          title="Build your AI Brand Identity"
          description="Upload your logo, colors, fonts, messaging, audience, and creative preferences once. AdGen uses your Brand Kit across Image Generation, Video Ads, the Optimizer, and future platform features."
        />

        <Card className="brandkit-managerCard">
          <div className="brandkit-managerTop">
            <div className="brandkit-managerHeading">
              <span className="brandkit-managerEyebrow">Brand workspace</span>
              <h2>Your Brands</h2>
              <p>Choose the brand identity you want to edit and use across AdGen.</p>
            </div>

            <div className="brandkit-managerMeta">
              <span className="brandkit-usagePill">
                {isAdmin
                  ? `${kits.length} brand${kits.length === 1 ? "" : "s"} · Admin access`
                  : `${kits.length} of ${kitLimit} brands`}
              </span>
            </div>
          </div>

          <div className="brandkit-managerBody">
            <div className="brandkit-managerSelectWrap">
              <label htmlFor="brandKitManagerSelect">Active brand</label>
              <select
                id="brandKitManagerSelect"
                value={selectedKitId || ""}
                onChange={(e) => selectBrandKit(e.target.value)}
              >
                {kits.map((item, index) => {
                  const liveSelectedName =
                    item.id === selectedKitId
                      ? (kit.brandName || "").trim()
                      : "";

                  const savedName = (
                    item.brandName ||
                    item.name ||
                    ""
                  ).trim();

                  const displayName =
                    liveSelectedName ||
                    savedName ||
                    `Brand ${index + 1}`;

                  return (
                    <option key={item.id} value={item.id}>
                      {displayName}
                      {item.isDefault ? " — Default" : ""}
                    </option>
                  );
                })}
              </select>
              <p>Edits below apply only to the selected brand.</p>
            </div>

            <div className="brandkit-managerActions">
              <button
                type="button"
                className="brandkit-small-btn brandkit-primary-action"
                onClick={openCreateBrandKit}
                disabled={atBrandLimit}
                title={atBrandLimit ? `Your plan includes ${kitLimit} Brand Kit${kitLimit === 1 ? "" : "s"}.` : "Create a new Brand Kit"}
              >
                + New Brand
              </button>

              {!selectedIsDefault && (
                <button
                  type="button"
                  className="brandkit-small-btn"
                  onClick={() => setDefaultBrandKit().catch((e) => setSaveMsg(e.message))}
                >
                  Make Default
                </button>
              )}

              {selectedIsDefault && (
                <span className="brandkit-defaultBadge">Default brand</span>
              )}

              {kits.length > 1 && (
                <button
                  type="button"
                  className="brandkit-small-btn brandkit-remove-btn"
                  onClick={() => deleteBrandKit().catch((e) => setSaveMsg(e.message))}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {atBrandLimit && (
            <div className="brandkit-limitNotice">
              Your plan includes {kitLimit} Brand Kit{kitLimit === 1 ? "" : "s"}. Upgrade to create another brand.
            </div>
          )}
        </Card>

        {createOpen && (
          <div className="brandkit-modalOverlay" role="dialog" aria-modal="true" aria-labelledby="new-brand-title">
            <div className="brandkit-modalCard">
              <div className="brandkit-modalHeader">
                <div>
                  <span>Create brand</span>
                  <h2 id="new-brand-title">New Brand Kit</h2>
                </div>
                <button
                  type="button"
                  className="brandkit-modalClose"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <label className="brandkit-modalField">
                <span>Brand name</span>
                <input
                  autoFocus
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createBrandKit().catch((err) => setSaveMsg(err.message));
                    }
                  }}
                  placeholder="Example: Acme Coffee"
                  maxLength={80}
                />
              </label>

              <p className="brandkit-modalHelp">
                You can add the logo, colors, fonts, voice, and brand rules after creating it.
              </p>

              <div className="brandkit-modalActions">
                <button type="button" className="brandkit-small-btn" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="brandkit-small-btn brandkit-primary-action"
                  onClick={() => createBrandKit().catch((err) => setSaveMsg(err.message))}
                  disabled={creating || !newBrandName.trim()}
                >
                  {creating ? "Creating..." : "Create Brand"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="brandkit-topGrid">
          <Card className="brandkit-healthCard">
            <div className="brandkit-healthTop">
              <div>
                <span>Brand Kit Health</span>
                <h2>{brandCompletion.score}%</h2>
                <p>{brandCompletion.completed}/{brandCompletion.total} identity signals configured</p>
              </div>

              <div className="brandkit-healthRing">
                {brandCompletion.score}%
              </div>
            </div>

            <div className="brandkit-progressTrack">
              <div style={{ width: `${brandCompletion.score}%` }} />
            </div>

            <div className="brandkit-checkGrid">
              {brandCompletion.checks.map((item) => (
                <div key={item.label} className={item.done ? "complete" : ""}>
                  <span>{item.done ? "✓" : "○"}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </Card>

          <Card className="brandkit-aiCard">
            <h3>
              AI Brand Usage
              <InfoTip text="AdGen uses these fields to keep generated images, videos, optimizer outputs, and future recommendations on-brand." />
            </h3>

            <p>
              Your Brand Kit is automatically available inside the Image Generator,
              Video Ads, and Ad Optimizer whenever Brand Kit is enabled.
            </p>

            <ul>
              <li>Applies logo, colors, and fonts when available</li>
              <li>Preserves brand voice and messaging rules</li>
              <li>Improves creative consistency across campaigns</li>
              <li>Supports future Meta and Google Ads intelligence</li>
            </ul>
          </Card>
        </div>

        <div className="brandkit-grid">
          <section className="brandkit-card">
            <div className="brandkit-section">
              <h2>Brand Identity</h2>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="brandName"
                  label="Brand Name"
                  info="The public name AdGen should use when understanding your company and keeping creatives consistent."
                />
                <input
                  id="brandName"
                  value={kit.brandName}
                  onChange={(e) => updateKit("brandName", e.target.value)}
                  placeholder="Example: AdGen MCM"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="websiteUrl"
                  label="Website URL"
                  optional
                  info="Used for future website import and extra brand context. AdGen can eventually use this to detect your logo, colors, products, and messaging."
                />
                <input
                  id="websiteUrl"
                  value={kit.websiteUrl}
                  onChange={(e) => updateKit("websiteUrl", e.target.value)}
                  placeholder="https://yourbrand.com"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  label="Logo"
                  info="Upload your brand logo so AdGen can use it as a visual reference when Brand Kit is enabled."
                />

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
                    <img src={kit.logoUrl} alt="Brand logo" className="brandkit-logo-preview" />
                  ) : (
                    <>
                      <span>{logoUploading ? "Uploading..." : "Upload Logo"}</span>
                      <small>Recommended: transparent PNG or SVG, 1000 × 1000 px or larger.</small>
                    </>
                  )}
                </div>

                {kit.logoUrl && (
                  <div className="brandkit-logo-actions">
                    <button
                      type="button"
                      className="brandkit-small-btn"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                    >
                      {logoUploading ? "Uploading..." : "Change Logo"}
                    </button>

                    <button
                      type="button"
                      className="brandkit-small-btn brandkit-remove-btn"
                      onClick={() => updateKit("logoUrl", "")}
                      disabled={logoUploading}
                    >
                      Remove Logo
                    </button>
                  </div>
                )}

                {logoErr && <p className="brandkit-error">{logoErr}</p>}
              </div>

              <div className="brandkit-import-disabled">
                <div>
                  <h3>
                    Import Brand from Website
                    <InfoTip text="Coming later: AdGen will scan your website to detect brand colors, fonts, products, tone, and messaging automatically." />
                  </h3>
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
                <FieldLabel
                  htmlFor="industry"
                  label="Industry"
                  optional
                  info="Helps AdGen understand your market, category norms, customer expectations, and common ad patterns."
                />
                <input
                  id="industry"
                  value={kit.industry}
                  onChange={(e) => updateKit("industry", e.target.value)}
                  placeholder="Example: Fitness, SaaS, Real Estate, Skincare"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="brandPersonality"
                  label="Brand Personality"
                  optional
                  info="Defines how your brand should feel visually and verbally, such as premium, bold, friendly, trustworthy, luxury, or playful."
                />
                <input
                  id="brandPersonality"
                  value={kit.brandPersonality}
                  onChange={(e) => updateKit("brandPersonality", e.target.value)}
                  placeholder="Example: Premium, bold, trustworthy, modern"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="targetAudience"
                  label="Target Audience"
                  optional
                  info="Helps AdGen shape hooks, messaging, visuals, offers, and CTAs around the people most likely to buy."
                />
                <textarea
                  id="targetAudience"
                  value={kit.targetAudience}
                  onChange={(e) => updateKit("targetAudience", e.target.value)}
                  placeholder="Example: Busy professionals aged 30–50 who want simple, premium solutions."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="brandDna"
                  label="Brand DNA"
                  optional
                  info="A deeper description of your positioning, values, messaging style, and what makes your company different."
                />
                <textarea
                  id="brandDna"
                  value={kit.brandDna}
                  onChange={(e) => updateKit("brandDna", e.target.value)}
                  placeholder="Example: We are a premium fitness brand. We speak like a coach, not a salesperson. We emphasize science-backed results, simplicity, and trust."
                />
              </div>
            </div>

            <div className="brandkit-section">
              <h2>
                Colors <span className="section-optional">Optional</span>
              </h2>

              <p className="brandkit-helper-text">
                Enable only the colors you want AdGen to use. Disabled colors will not be injected into AI prompts.
              </p>

              <div className="brandkit-color-row">
                {[
                  {
                    key: "primary",
                    label: "Primary",
                    fallback: "#111827",
                    info: "Your main brand color. AdGen can use this for dominant accents, branded layouts, and visual identity.",
                  },
                  {
                    key: "secondary",
                    label: "Secondary",
                    fallback: "#ffffff",
                    info: "Your supporting brand color. AdGen can use this for backgrounds, contrast, and secondary design elements.",
                  },
                  {
                    key: "accent",
                    label: "Accent",
                    fallback: "#2563eb",
                    info: "Your highlight color. AdGen can use this for CTA buttons, badges, emphasis, and key conversion elements.",
                  },
                ].map((color) => {
                  const enabled = !!kit.colorEnabled?.[color.key];
                  const value = kit.colors?.[color.key] || color.fallback;

                  return (
                    <div className="brandkit-field brandkit-color-card" key={color.key}>
                      <label className="brandkit-color-toggle">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => {
                            const checked = e.target.checked;

                            updateKit(`colorEnabled.${color.key}`, checked);
                            updateKit(
                              `colors.${color.key}`,
                              checked ? kit.colors[color.key] || color.fallback : ""
                            );
                          }}
                        />
                        <span>{color.label}</span>
                        <InfoTip text={color.info} />
                      </label>

                      <input
                        className="brandkit-color-input"
                        type="color"
                        value={value}
                        disabled={!enabled}
                        onChange={(e) => updateKit(`colors.${color.key}`, e.target.value)}
                      />

                      <small className="brandkit-helper-text">
                        {enabled ? value : "Disabled — this color will not influence AI generation"}
                      </small>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="brandkit-section">
              <h2>
                Brand Typography
                <InfoTip text="Fonts help AdGen understand the visual style your ads should reference when Brand Kit is enabled." />
              </h2>

              <FontSelect
                label="Headline Font"
                fontKey="headline"
                fallback="Inter"
                value={kit.fonts.headline}
                onChange={(value) => updateKit("fonts.headline", value)}
              />

              <FontSelect
                label="Body Font"
                fontKey="body"
                fallback="Open Sans"
                value={kit.fonts.body}
                onChange={(value) => updateKit("fonts.body", value)}
              />

              <FontSelect
                label="CTA Font"
                fontKey="cta"
                fallback="Poppins"
                value={kit.fonts.cta}
                onChange={(value) => updateKit("fonts.cta", value)}
              />

              <div
                className="font-preview-card"
                style={{
                  borderColor: kit.colors.accent || "#2563eb",
                }}
              >
                <span
                  className="font-preview-label"
                  style={{
                    color: kit.colors.accent || "#2563eb",
                  }}
                >
                  Quick Preview
                </span>

                <h3
                  style={{
                    fontFamily: kit.fonts.headline,
                    color: kit.colors.primary || "#ffffff",
                  }}
                >
                  The perfect ad starts here.
                </h3>

                <p
                  style={{
                    fontFamily: kit.fonts.body,
                    color: kit.colors.primary || "#ffffff",
                  }}
                >
                  This is how supporting ad copy and brand messaging could appear in your creatives.
                </p>

                <button
                  type="button"
                  style={{
                    fontFamily: kit.fonts.cta,
                    background: kit.colors.accent || "#2563eb",
                    color: kit.colors.secondary || "#ffffff",
                  }}
                >
                  {kit.preferredCta || "CTA Preview"}
                </button>
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Generation Defaults <span className="section-optional">Optional</span></h2>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="preferredCta"
                  label="Default CTA"
                  optional
                  info="If set, AdGen can use this as your preferred call-to-action when Brand Kit is enabled."
                />

                <select
                  id="preferredCta"
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
                (!COMMON_CTAS.includes(kit.preferredCta) && kit.preferredCta !== "")) && (
                <div className="brandkit-field">
                  <FieldLabel
                    htmlFor="customCta"
                    label="Custom CTA"
                    info="Use this only if your brand has a specific call-to-action that is not in the default list."
                  />

                  <input
                    id="customCta"
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
                <FieldLabel
                  htmlFor="preferredPlatform"
                  label="Default Platform"
                  optional
                  info="Lets AdGen bias creative recommendations toward the advertising platform you most often use."
                />

                <select
                  id="preferredPlatform"
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
                <FieldLabel
                  htmlFor="aspectRatioPreference"
                  label="Default Aspect Ratio"
                  optional
                  info="Lets AdGen use your preferred image format by default, such as square, portrait, or landscape."
                />

                <select
                  id="aspectRatioPreference"
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
                <FieldLabel
                  htmlFor="imageStyle"
                  label="Default Image Style"
                  optional
                  info="Gives AdGen a preferred visual direction for future creatives when Brand Kit is enabled."
                />

                <select
                  id="imageStyle"
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
                <FieldLabel
                  htmlFor="offerStyle"
                  label="Offer Style"
                  optional
                  info="Helps AdGen understand how your brand usually frames offers, such as discounts, free trials, demos, bundles, or consultations."
                />

                <input
                  id="offerStyle"
                  value={kit.offerStyle}
                  onChange={(e) => updateKit("offerStyle", e.target.value)}
                  placeholder="Example: Free trial, discount, demo, appointment, bundle"
                />
              </div>
            </div>

            <div className="brandkit-section">
              <h2>Advanced AI Controls <span className="section-optional">Optional</span></h2>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="voice"
                  label="Voice"
                  optional
                  info="Controls how AdGen writes headlines, body copy, CTAs, and messaging for your brand."
                />
                <textarea
                  id="voice"
                  value={kit.voice}
                  onChange={(e) => updateKit("voice", e.target.value)}
                  placeholder="Example: Modern, confident, friendly, premium, and conversion-focused."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="notes"
                  label="Extra Instructions"
                  optional
                  info="Extra creative rules AdGen should follow when Brand Kit is enabled."
                />
                <textarea
                  id="notes"
                  value={kit.notes}
                  onChange={(e) => updateKit("notes", e.target.value)}
                  placeholder="Example: Always use clean backgrounds. Never crop the logo. Avoid red. Mention free shipping when relevant."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="doList"
                  label="Do List"
                  optional
                  info="Things AdGen should actively include or prioritize in future creatives."
                />
                <textarea
                  id="doList"
                  value={kit.doList}
                  onChange={(e) => updateKit("doList", e.target.value)}
                  placeholder="Example: Use bright backgrounds, show product in use, include clear CTA buttons."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="dontList"
                  label="Don't List"
                  optional
                  info="Things AdGen should avoid, such as styles, claims, colors, layouts, or restricted creative elements."
                />
                <textarea
                  id="dontList"
                  value={kit.dontList}
                  onChange={(e) => updateKit("dontList", e.target.value)}
                  placeholder="Example: No cartoon style, no children, no fake testimonials, no clutter."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="brandKeywords"
                  label="Brand Keywords"
                  optional
                  info="Words and themes that represent your brand and can guide copy, visual tone, and positioning."
                />
                <input
                  id="brandKeywords"
                  value={kit.brandKeywords}
                  onChange={(e) => updateKit("brandKeywords", e.target.value)}
                  placeholder="Example: innovation, trust, performance, simplicity"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="negativeKeywords"
                  label="Negative Keywords"
                  optional
                  info="Words, claims, or themes AdGen should avoid using in generated copy or creative direction."
                />
                <input
                  id="negativeKeywords"
                  value={kit.negativeKeywords}
                  onChange={(e) => updateKit("negativeKeywords", e.target.value)}
                  placeholder="Example: cheap, risky, aggressive, medical claims"
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="complianceRules"
                  label="Compliance Rules"
                  optional
                  info="Important for regulated categories or brands that need to avoid certain claims, wording, guarantees, or imagery."
                />
                <textarea
                  id="complianceRules"
                  value={kit.complianceRules}
                  onChange={(e) => updateKit("complianceRules", e.target.value)}
                  placeholder="Example: Never mention guaranteed results. Always avoid before/after claims. Include disclaimers when needed."
                />
              </div>

              <div className="brandkit-field">
                <FieldLabel
                  htmlFor="productsServices"
                  label="Products / Services Notes"
                  optional
                  info="Helps AdGen understand your main products, secondary offers, bundles, services, and positioning."
                />
                <textarea
                  id="productsServices"
                  value={kit.productsServices}
                  onChange={(e) => updateKit("productsServices", e.target.value)}
                  placeholder="Example: Main product is a premium coaching plan. Secondary offer is a free consultation."
                />
              </div>

              <Button
                type="button"
                className="brandkit-save-btn"
                onClick={saveBrandKit}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save & Apply Across AdGen"}
              </Button>

              {saveMsg && <p className="brandkit-save-message">{saveMsg}</p>}
            </div>
          </section>

          <aside className="brandkit-preview">
            <h2>Brand Preview</h2>

            <div
                className="preview-logo"
                style={{
                    background: kit.colors.secondary || "#ffffff",
                    color: kit.colors.primary || "#ffffff",
                    borderColor: kit.colors.accent || "#2563eb",
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
                    color: kit.colors.primary || "#ffffff",
                }}
            >
              {kit.brandName || "Your Brand"}
            </h3>

            <div className="preview-swatches">
                {kit.colors.primary && (
                    <div><span style={{ background: kit.colors.primary }} /> Primary</div>
                )}

                {kit.colors.secondary && (
                    <div><span style={{ background: kit.colors.secondary, border: "1px solid #d1d5db" }} /> Secondary</div>
                )}

                {kit.colors.accent && (
                    <div><span style={{ background: kit.colors.accent }} /> Accent</div>
                )}

                {!kit.colors.primary && !kit.colors.secondary && !kit.colors.accent && (
                    <p>No brand colors enabled.</p>
                )}
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