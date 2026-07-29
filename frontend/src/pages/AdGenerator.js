// src/pages/AdGenerator.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import { auth } from "../firebaseConfig";
import InfoTip from "../components/ui/InfoTip";
import PerformanceIntelligencePreview from "../components/PerformanceIntelligencePreview";
import StepSection from "../components/ui/StepSection";
import BrandKitSelector from "../components/BrandKitSelector";
import GenerationProgress from "../components/GenerationProgress";


const INITIAL_FORM = {
  companyName: "",
  product_name: "",
  description: "",
  audience: "",
  tone: "",
  platform: "",
  imageSize: "1024x1024",
  offer: "",
  cta: "",
  headline: "",
  primaryText: "",
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

const IMAGE_TEMPLATES = [
  {
    id: "skincare",
    icon: "🧴",
    name: "Skincare & Beauty",
    description: "Beauty, skincare, cosmetics, and self-care products",
    values: {
      companyName: "Luma Skin",
      product_name: "Vitamin C Glow Serum",
      description: "A lightweight vitamin C serum that brightens dull skin, supports an even-looking complexion, and leaves skin with a healthy glow.",
      audience: "Skincare shoppers looking for brighter, healthier-looking skin",
      tone: "Premium, confident, and reassuring",
      platform: "Instagram / Meta Feed",
      imageSize: "1024x1024",
      offer: "20% off your first order",
      cta: "Shop Now",
      headline: "Reveal Your Natural Glow",
      primaryText: "Brighter-looking skin starts with one simple daily step.",
      goal: "Sales",
      campaignObjective: "Product Launch",
      stylePreset: "Premium",
      productType: "Skincare / Beauty",
    },
  },
  {
    id: "food-beverage",
    icon: "☕",
    name: "Food & Beverage",
    description: "Restaurants, coffee, snacks, drinks, and food brands",
    values: {
      companyName: "Roast House",
      product_name: "Small-Batch Cold Brew",
      description: "A smooth small-batch cold brew made with premium beans for a rich, refreshing taste and an easy energy boost.",
      audience: "Busy professionals, students, and coffee lovers",
      tone: "Warm, energetic, and inviting",
      platform: "Instagram / Meta Feed",
      imageSize: "1024x1024",
      offer: "Buy one, get one 50% off",
      cta: "Order Now",
      headline: "Bold Flavor. Smooth Finish.",
      primaryText: "Your new go-to cold brew is ready when you are.",
      goal: "Sales",
      campaignObjective: "Limited-Time Offer",
      stylePreset: "Lifestyle",
      productType: "Beverage / Food",
    },
  },
  {
    id: "fashion",
    icon: "👕",
    name: "Fashion & Apparel",
    description: "Clothing, accessories, footwear, and fashion brands",
    values: {
      companyName: "Northline",
      product_name: "Everyday Performance Hoodie",
      description: "A modern premium hoodie designed with soft stretch fabric, a clean tailored fit, and all-day comfort for work, travel, or weekends.",
      audience: "Style-conscious shoppers who value comfort and versatility",
      tone: "Modern, bold, and confident",
      platform: "Instagram / Meta Feed",
      imageSize: "1024x1792",
      offer: "Free shipping this week",
      cta: "Shop the Drop",
      headline: "Built for Every Day",
      primaryText: "Premium comfort meets a clean, modern fit.",
      goal: "Sales",
      campaignObjective: "Product Launch",
      stylePreset: "Lifestyle",
      productType: "Apparel",
    },
  },
  {
    id: "fitness",
    icon: "🏋️",
    name: "Fitness & Wellness",
    description: "Gyms, supplements, coaching, and wellness services",
    values: {
      companyName: "Peak Method",
      product_name: "30-Day Strength Program",
      description: "A structured 30-day training program with guided workouts, progress tracking, and practical coaching for building strength and consistency.",
      audience: "Busy adults who want a clear and sustainable fitness plan",
      tone: "Motivational, direct, and encouraging",
      platform: "Instagram / Meta Feed",
      imageSize: "1024x1792",
      offer: "Start your first week free",
      cta: "Start Training",
      headline: "Your Stronger Start",
      primaryText: "A simple plan. Real progress. One month to build momentum.",
      goal: "Leads",
      campaignObjective: "Lead Generation",
      stylePreset: "Bold",
      productType: "Service",
    },
  },
  {
    id: "saas",
    icon: "💻",
    name: "Software & SaaS",
    description: "Apps, software platforms, AI tools, and B2B services",
    values: {
      companyName: "FlowPilot",
      product_name: "Workflow Automation Platform",
      description: "A simple workflow automation platform that helps small teams organize repetitive tasks, reduce manual work, and keep projects moving.",
      audience: "Small business owners, operations teams, and growing startups",
      tone: "Clear, professional, and helpful",
      platform: "LinkedIn",
      imageSize: "1792x1024",
      offer: "14-day free trial",
      cta: "Start Free Trial",
      headline: "Automate the Busywork",
      primaryText: "Give your team more time for the work that actually matters.",
      goal: "Leads",
      campaignObjective: "Lead Generation",
      stylePreset: "Minimal",
      productType: "App / Software",
    },
  },
  {
    id: "ecommerce",
    icon: "🛍️",
    name: "Retail & Ecommerce",
    description: "Online stores, consumer products, gifts, and marketplaces",
    values: {
      companyName: "Modern Market",
      product_name: "Portable LED Desk Lamp",
      description: "A compact rechargeable LED desk lamp with adjustable brightness, a clean modern design, and flexible lighting for work, reading, or travel.",
      audience: "Online shoppers, students, remote workers, and home office buyers",
      tone: "Practical, polished, and persuasive",
      platform: "Meta Feed",
      imageSize: "1024x1024",
      offer: "Save 15% today",
      cta: "Get Offer",
      headline: "Better Light, Anywhere",
      primaryText: "Portable, rechargeable, and ready for every workspace.",
      goal: "Sales",
      campaignObjective: "Evergreen",
      stylePreset: "Minimal",
      productType: "Electronics / Device",
    },
  },
  {
    id: "real-estate",
    icon: "🏠",
    name: "Real Estate",
    description: "Agents, brokerages, rentals, developments, and property services",
    values: {
      companyName: "Harbor & Key Realty",
      product_name: "Modern Downtown Residence",
      description: "A bright modern residence with open living spaces, premium finishes, natural light, and convenient access to dining, shopping, and transportation.",
      audience: "Homebuyers and renters searching for a modern, well-located property",
      tone: "Polished, trustworthy, and aspirational",
      platform: "Instagram / Meta Feed",
      imageSize: "1024x1792",
      offer: "Schedule a private tour",
      cta: "Book a Tour",
      headline: "Your Next Address Awaits",
      primaryText: "Modern living, thoughtful details, and a location that keeps you connected.",
      goal: "Leads",
      campaignObjective: "Lead Generation",
      stylePreset: "Premium",
      productType: "Real Estate",
    },
  },
  {
    id: "professional-services",
    icon: "💼",
    name: "Professional Services",
    description: "Agencies, consultants, finance, legal, and local services",
    values: {
      companyName: "Northstar Advisory",
      product_name: "Business Growth Consultation",
      description: "A practical strategy consultation that helps growing businesses identify priorities, improve operations, and build a clear plan for sustainable growth.",
      audience: "Business owners and decision-makers looking for experienced guidance",
      tone: "Professional, credible, and approachable",
      platform: "LinkedIn",
      imageSize: "1792x1024",
      offer: "Free 30-minute consultation",
      cta: "Book a Call",
      headline: "Build Your Next Stage",
      primaryText: "Clear strategy and practical guidance for your business's next move.",
      goal: "Leads",
      campaignObjective: "Lead Generation",
      stylePreset: "Minimal",
      productType: "Service",
    },
  },
];


function AdGenerator() {
  const navigate = useNavigate();
  const referenceInputRef = useRef(null);
  const firstWorkspaceSectionRef = useRef(null);

  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(true);
  const [brandKitAppliedFields, setBrandKitAppliedFields] = useState({});
  const [usePerformanceIntelligence, setUsePerformanceIntelligence] = useState(false);
  const [referenceImages, setReferenceImages] = useState([]);
  const [referenceImageMode, setReferenceImageMode] = useState("product_reference");
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState(null);
  const [progress, setProgress] = useState({
    stage: "queued",
    message: "Preparing your creative request.",
    percent: 5,
    failed: false,
  });
  const brandKitAppliedFieldsRef = useRef({});

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();
  const [isFreePlan, setIsFreePlan] = useState(false);
  const hasReferenceImages = referenceImages.length > 0;


  useEffect(() => {
    const loadPlan = async () => {
      try {
        const user = auth.currentUser;
        if (!user || !apiBase) return;
        const token = await user.getIdToken();
        const res = await fetch(`${apiBase}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const me = await res.json();
        setIsFreePlan(String(me.tier || "").toLowerCase() === "free");
      } catch {}
    };
    loadPlan();
  }, [apiBase]);



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
      companyName: brandKit.brandName || "",
      audience: brandKit.targetAudience || "",
      tone: brandKit.voice || brandKit.brandPersonality || "",
      platform,
      imageSize,
      offer: brandKit.offerStyle || "",
      cta: brandKit.preferredCta || "",
      stylePreset,
    };
  }, [brandKit]);

  useEffect(() => {
    const controlledFields = [
      "companyName",
      "audience",
      "tone",
      "platform",
      "imageSize",
      "offer",
      "cta",
      "stylePreset",
    ];

    setForm((previous) => {
      const next = { ...previous };

      controlledFields.forEach((key) => {
        const selectedBrandValue = brandKitDefaults[key];

        next[key] =
          useBrandKit && brandKit && selectedBrandValue !== undefined && selectedBrandValue !== null && selectedBrandValue !== ""
            ? selectedBrandValue
            : INITIAL_FORM[key];
      });

      return next;
    });

    const applied = {};

    if (useBrandKit && brandKit) {
      controlledFields.forEach((key) => {
        const value = brandKitDefaults[key];
        if (value !== undefined && value !== null && value !== "") {
          applied[key] = true;
        }
      });
    }

    brandKitAppliedFieldsRef.current = applied;
    setBrandKitAppliedFields(applied);
  }, [useBrandKit, brandKit, brandKitDefaults]);
  const handleChange = (e) => {
    const { name, value } = e.target;

    delete brandKitAppliedFieldsRef.current[name];

    setBrandKitAppliedFields((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const moveToFirstWorkspaceSection = () => {
    setTemplatesOpen(false);

    // Let the template panel collapse before moving the viewport. This keeps
    // the transition from feeling like the page is jumping in two directions.
    window.setTimeout(() => {
      firstWorkspaceSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 280);
  };

  const applyImageTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setUiError(null);
    setResult(null);

    setForm((previous) => ({
      ...previous,
      ...template.values,
    }));

    brandKitAppliedFieldsRef.current = {};
    setBrandKitAppliedFields({});
    moveToFirstWorkspaceSection();
  };

  const startImageFromScratch = () => {
    setSelectedTemplateId("scratch");
    setUiError(null);
    setResult(null);
    setForm(INITIAL_FORM);
    brandKitAppliedFieldsRef.current = {};
    setBrandKitAppliedFields({});
    moveToFirstWorkspaceSection();
  };

  const selectedImageTemplate = IMAGE_TEMPLATES.find(
    (template) => template.id === selectedTemplateId
  );

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };


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

  const pollImageJob = async (jobId, token) => {
    for (;;) {
      const statusRes = await fetch(`${apiBase}/image/status/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusData = await statusRes.json().catch(() => null);

      if (!statusRes.ok) {
        throw new Error(
          safeDetailMessage(statusData?.detail) ||
            `Could not load generation status (${statusRes.status})`
        );
      }

      setProgress({
        stage: statusData.progressStage || "queued",
        message: statusData.progressMessage || "Creating your ad.",
        percent: statusData.progressPercent ?? 5,
        failed: statusData.status === "failed",
      });

      if (statusData.status === "succeeded") {
        await new Promise((resolve) => setTimeout(resolve, 450));
        return statusData.result;
      }

      if (statusData.status === "failed") {
        const detail = statusData.error;
        const error = new Error(
          safeDetailMessage(detail) || "Creative generation failed."
        );
        error.detail = detail;
        await new Promise((resolve) => setTimeout(resolve, 650));
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProgress({
      stage: "queued",
      message: "Preparing your creative request.",
      percent: 5,
      failed: false,
    });
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
        headline: form.headline.trim() || null,
        primary_text: form.primaryText.trim() || null,
        useBrandKit: isFreePlan ? false : useBrandKit,
        brandKitId: isFreePlan ? null : brandKitId,
        campaignObjective: form.campaignObjective,
        referenceImageUrls: referenceImages.map((img) => img.url).filter(Boolean),
        referenceImageMode,
        productType: form.productType === "auto" ? null : form.productType,
        usePerformanceIntelligence:
          !isFreePlan && usePerformanceIntelligence,
      };


      const response = await fetch(`${apiBase}/image/start`, {
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
          const cap = detail?.cap;
          const isFreeLimit = Number(cap) === 2;

          setUiError({
            type: "cap",
            message: isFreeLimit
              ? "You've used your 2 free image generations. Upgrade to continue creating."
              : safeDetailMessage(detail) ||
                "You've reached your image generation limit.",
            upgradePath: "/subscribe?upgrade=1",
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

      if (!data?.jobId) {
        alert("No generation job was returned from server.");
        return;
      }

      data = await pollImageJob(data.jobId, token);

      if (!data?.imageUrl) {
        alert("Ad copy generated, but no image URL was returned.");
      }

      setResult(data);
    } catch (err) {
      console.error("[AdGen] Generation error:", err);

      const detail = err?.detail;
      const message =
        safeDetailMessage(detail) ||
        err?.message ||
        "Creative generation failed.";

      const used = detail?.used;
      const cap = detail?.cap;

      const isLimitError =
        detail?.status === 429 ||
        detail?.statusCode === 429 ||
        detail?.status_code === 429 ||
        detail?.code === "usage_limit_reached" ||
        detail?.code === "limit_reached" ||
        used != null ||
        cap != null ||
        /limit|quota|credits|generation cap/i.test(message);

      if (isLimitError) {
        const isFreeLimit = Number(cap) === 2;

        setUiError({
          type: "cap",
          message: isFreeLimit
            ? `You've used your 2 free image generations. Upgrade to continue creating.`
            : used != null && cap != null
              ? `${message} (${used}/${cap} used)`
              : message,
          upgradePath: "/subscribe?upgrade=1",
        });

        setProgress({
          stage: "failed",
          message: isFreeLimit
            ? "Free generation limit reached."
            : "Generation limit reached.",
          percent: 100,
          failed: true,
        });

        return;
      }

      setUiError({
        type: "error",
        message,
        upgradePath: null,
      });

      setProgress({
        stage: "failed",
        message,
        percent: 100,
        failed: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const editInCreativeStudio = () => {
    if (!result?.imageUrl) return;

    navigate("/creative-studio", {
      state: {
        creativeStudio: {
          sourceType: "ad_generator",
          sourceImageJobId: result.imageJobId || null,
          imageUrl: result.imageUrl,
          title: form.product_name || "Generated creative",
          copy: result.copy || {},
        },
      },
    });
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

          {!isFreePlan && (
          <BrandKitSelector
            value={brandKitId}
            onChange={setBrandKitId}
            onKitChange={(selectedKit) => {
              setBrandKit(selectedKit);
              setBrandKitLoading(false);
            }}
            disabled={loading || !useBrandKit}
          />
          )}

          <section className={`template-starter ${templatesOpen ? "is-open" : "is-collapsed"}`} aria-labelledby="image-template-title">
            <button
              type="button"
              className="template-starter-toggle"
              onClick={() => setTemplatesOpen((open) => !open)}
              aria-expanded={templatesOpen}
              aria-controls="image-template-options"
            >
              <span className="template-starter-heading">
                <span>
                  <span className="template-eyebrow">Need inspiration?</span>
                  <span id="image-template-title" className="template-title">Start with a Template</span>
                  <span className="template-description">
                    Choose an industry and ADGen will prepare the workspace for you. 8 templates available.
                  </span>
                </span>

                <span className="template-heading-actions">
                  {selectedTemplateId && (
                    <span className="template-loaded-pill">
                      {selectedTemplateId === "scratch"
                        ? "Blank setup selected"
                        : `✓ ${selectedImageTemplate?.name || "Template"} template`}
                    </span>
                  )}
                  <span className="template-chevron" aria-hidden="true">⌄</span>
                </span>
              </span>
            </button>

            <div id="image-template-options" className="template-options" hidden={!templatesOpen}>
            <div className="template-card-grid">
              {IMAGE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`template-card ${
                    selectedTemplateId === template.id ? "selected" : ""
                  }`}
                  onClick={() => applyImageTemplate(template)}
                  disabled={loading || referenceUploading}
                  aria-pressed={selectedTemplateId === template.id}
                >
                  <span className="template-card-icon" aria-hidden="true">
                    {template.icon}
                  </span>
                  <span className="template-card-copy">
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </span>
                  <span className="template-card-action">
                    Use template
                  </span>
                </button>
              ))}

              <button
                type="button"
                className={`template-card template-card-scratch ${
                  selectedTemplateId === "scratch" ? "selected" : ""
                }`}
                onClick={startImageFromScratch}
                disabled={loading || referenceUploading}
                aria-pressed={selectedTemplateId === "scratch"}
              >
                <span className="template-card-icon" aria-hidden="true">✨</span>
                <span className="template-card-copy">
                  <strong>Start From Scratch</strong>
                  <small>Open a blank setup and build your creative your way.</small>
                </span>
                <span className="template-card-action">
                  {selectedTemplateId === "scratch" ? "Selected ✓" : "Use blank setup"}
                </span>
              </button>
            </div>

            <div className="template-helper-note">
              <span aria-hidden="true">✨</span>
              <span>Templates prefill the workspace only. Brand Kit, reference images, Performance Intelligence, and every current field remain available.</span>
            </div>
            </div>
          </section>

          <form className="adgen-form" onSubmit={handleSubmit}>
            <div ref={firstWorkspaceSectionRef} className="template-scroll-target">
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
            </div>

            <StepSection
              step="2"
              title="Creative Copy"
              description="Optionally provide exact copy for the creative, or leave these fields blank and let AdGen write it for you."
            >
              <div className="field">
                <div className="field-label">
                  Headline <span className="field-optional">Optional</span>
                  <InfoTip text="Enter a specific headline to preserve it. Leave blank and AdGen will generate one for you." />
                </div>
                <input
                  name="headline"
                  placeholder="Leave blank to let AdGen generate a headline"
                  value={form.headline}
                  onChange={handleChange}
                  disabled={loading}
                  maxLength={35}
                />
                <small className="field-helper">
                  {form.headline.length}/35 characters · Best results are usually under 30 characters.
                </small>
              </div>

              <div className="field">
                <div className="field-label">
                  Body Text <span className="field-optional">Optional</span>
                  <InfoTip text="Enter supporting copy you want preserved in the creative. Leave blank and AdGen will write it for you." />
                </div>
                <textarea
                  name="primaryText"
                  placeholder="Leave blank to let AdGen write the body text"
                  value={form.primaryText}
                  onChange={handleChange}
                  disabled={loading}
                  maxLength={100}
                />
                <small className="field-helper">
                  {form.primaryText.length}/100 characters · Shorter copy creates cleaner, more readable ads.
                </small>
              </div>

              <div className="field">
                <div className="field-label">
                  Call to Action {fieldBadge("cta")} <span className="field-optional">Optional</span>
                  <InfoTip text="Enter the action you want viewers to take such as Learn More, Shop now, Get Offer, ect... Brand Kit can fill this automatically, or AdGen can choose one when left blank." />
                </div>
                <input
                  name="cta"
                  placeholder="Leave blank to let AdGen choose a CTA"
                  value={form.cta}
                  onChange={handleChange}
                  disabled={loading}
                  maxLength={20}
                />
                <small className="field-helper">
                  {form.cta.length}/20 characters · Keep CTAs concise and action-oriented.
                </small>
              </div>
            </StepSection>

            <StepSection
              step="3"
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
              step="4"
              title="Brand & Assets"
              description="Apply your Brand Kit and upload optional reference images."
            >


              <div className="enhancement-grid">
                <div className="option-card enhancement-card">
                  {isFreePlan ? (
                    <div>
                      <strong>🔒 Brand Kit</strong>
                      <small>  Available on paid plans.</small>
                    </div>
                  ) : (
                  <label className="option-toggle">
                    <input type="checkbox" checked={useBrandKit} onChange={(e) => setUseBrandKit(e.target.checked)} disabled={loading} />
                    <span>
                      <strong>
                        Apply Brand Kit <InfoTip text="Uses your saved logo, colors, fonts, brand voice, website, and brand defaults to keep generated ads consistent." />
                      </strong>
                      <small>{brandKitLoading ? "Checking saved Brand Kit..." : useBrandKit ? "Brand guidance enabled" : "Brand guidance disabled"}</small>
                    </span>
                  </label>
                  )}
                </div>

                <div className={`option-card enhancement-card performance-intelligence-option ${
                  usePerformanceIntelligence ? "enabled" : ""
                }`}>
                  {isFreePlan ? (
                    <div className="performance-intelligence-locked">
                      <strong>🔒 Performance Intelligence</strong>
                      <small>Available on Pro &amp; Business plans.</small>
                    </div>
                  ) : (
                    <label className="option-toggle">
                      <input
                        type="checkbox"
                        checked={usePerformanceIntelligence}
                        onChange={(e) =>
                          setUsePerformanceIntelligence(e.target.checked)
                        }
                        disabled={loading}
                      />
                      <span>
                        <strong>
                          Apply Performance Intelligence{" "}
                          <InfoTip text="Applies the colors, visual styles, compositions, messaging patterns, CTA language, and headline structure AdGen has learned from your qualified performance data." />
                        </strong>
                        <small>
                          {usePerformanceIntelligence
                            ? "Learned creative patterns will guide this generation"
                            : "Use what AdGen has learned from your performance"}
                        </small>
                      </span>
                    </label>
                  )}

                  {!isFreePlan && (
                    <PerformanceIntelligencePreview
                      enabled={usePerformanceIntelligence}
                      mode="image"
                    />
                  )}
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
              <button type="submit" disabled={loading || referenceUploading}>
                {loading ? "Creating..." : referenceUploading ? "Uploading..." : "✨ Create My Ad"}
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

                {uiError.upgradePath && (
                  <button
                    type="button"
                    className="download-button"
                    onClick={() => navigate(uiError.upgradePath)}
                  >
                    {uiError.type === "auth"
                      ? "Go to Login"
                      : uiError.type === "cap"
                        ? "View Upgrade Options"
                        : "Go to My Account"}
                  </button>
                )}
              </>
            )}

            {result && (
              <>
                {result.imageUrl && (
                  <img
                    src={result.imageUrl}
                    alt="Generated Ad"
                    className="generated-image"
                  />
                )}

                <button
                  className="download-button"
                  onClick={editInCreativeStudio}
                >
                  Edit in Creative Studio
                </button>

                <button
                  className="download-button"
                  onClick={downloadImage}
                >
                  Download Image
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <GenerationProgress
        open={loading}
        type="image"
        stage={progress.stage}
        message={progress.message}
        percent={progress.percent}
        failed={progress.failed}
      />
    </div>
  );
}

export default AdGenerator;


















