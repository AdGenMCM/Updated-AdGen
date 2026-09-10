// src/pages/AdGenerator.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdGenerator.css";
import GenerationFeedback from "../components/GenerationFeedback";
import { auth } from "../firebaseConfig";
import InfoTip from "../components/ui/InfoTip";
import PerformanceIntelligencePreview from "../components/PerformanceIntelligencePreview";
import StepSection from "../components/ui/StepSection";
import BrandKitSelector from "../components/BrandKitSelector";
import GenerationProgress from "../components/GenerationProgress";
import FeatureTutorial from "../components/FeatureTutorial";
import { useWorkspace } from "../context/WorkspaceContext";
import CreditPackModal from "../components/billing/CreditPackModal";
import { Crown, ShoppingCart } from "lucide-react";


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
const IMAGE_GENERATOR_MODE_KEY = "adgen:image-generator-mode";

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


async function claimFirstGeneration(apiBase, kind, jobId, token) {
  if (!apiBase || !jobId || !token) return;

  try {
    const response = await fetch(`${apiBase}/analytics/claim-first-generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, jobId }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.track) return;

    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "first_generation", {
        generation_type: kind,
      });
    }
  } catch (error) {
    console.warn("[ADGen] First-generation analytics could not be recorded:", error);
  }
}


function AdGenerator() {
  const navigate = useNavigate();
  const { refreshWorkspace, usage: workspaceImageUsage } = useWorkspace() || {};
  const referenceInputRef = useRef(null);
  const firstWorkspaceSectionRef = useRef(null);
  const templateSectionRef = useRef(null);

  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasGeneratedBefore, setHasGeneratedBefore] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [imageLimitReached, setImageLimitReached] = useState(false);
  const [purchasedImageCredits, setPurchasedImageCredits] = useState(0);
  const [creditPacksOpen, setCreditPacksOpen] = useState(false);
  const [imageUsageUsed, setImageUsageUsed] = useState(null);
  const [imageUsageCap, setImageUsageCap] = useState(null);

  // Keep this page's local limit state in sync with the shared workspace usage.
  // This is especially important after Stripe returns from a credit-pack purchase:
  // WorkspaceContext confirms the grant, refreshes /usage, and this immediately
  // removes the limit warning without requiring a browser refresh.
  useEffect(() => {
    if (!workspaceImageUsage) return;

    const used = Number(workspaceImageUsage?.used ?? 0);
    const rawCap = workspaceImageUsage?.cap ?? null;
    const cap =
      rawCap === null || rawCap === undefined || rawCap === ""
        ? null
        : Number(rawCap);
    const purchased = Math.max(
      0,
      Number(workspaceImageUsage?.purchasedRemaining ?? 0)
    );
    const hasFiniteCap = Number.isFinite(cap) && cap >= 0;

    setPurchasedImageCredits(purchased);
    setImageUsageUsed(Number.isFinite(used) ? used : null);
    setImageUsageCap(hasFiniteCap ? cap : null);
    setImageLimitReached(
      Boolean(
        hasFiniteCap &&
          Number.isFinite(used) &&
          used >= cap &&
          purchased <= 0
      )
    );
  }, [workspaceImageUsage]);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [brandKitId, setBrandKitId] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const [brandKitLoading, setBrandKitLoading] = useState(true);
  const [selectedBrandProductName, setSelectedBrandProductName] = useState("");
  const [selectedBrandTemplateId, setSelectedBrandTemplateId] = useState("");
  const [creativeElements, setCreativeElements] = useState({
    headline: true,
    body: true,
    cta: true,
  });
  const [logoMode, setLogoMode] = useState("none");
  const [quickAdElementsEnabled, setQuickAdElementsEnabled] = useState(true);
  const [quickLogoMode, setQuickLogoMode] = useState("none");
  const [brandKitAppliedFields, setBrandKitAppliedFields] = useState({});
  const [usePerformanceIntelligence, setUsePerformanceIntelligence] = useState(false);
  const [referenceImages, setReferenceImages] = useState([]);
  const [referenceImageMode, setReferenceImageMode] = useState("product_reference");
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [progress, setProgress] = useState({
    stage: "queued",
    message: "Preparing your creative request.",
    percent: 5,
    failed: false,
  });
  const brandKitAppliedFieldsRef = useRef({});

  const apiBase = process.env.REACT_APP_API_BASE_URL?.trim();
  const [isFreePlan, setIsFreePlan] = useState(false);
  const [canUsePerformanceIntelligence, setCanUsePerformanceIntelligence] = useState(false);
  const hasReferenceImages = referenceImages.length > 0;
  const hasBrandKit = Boolean(brandKit);
  const hasBrandKitLogo = Boolean(brandKit?.logoUrl);
  const canUseBrandKitLogo = Boolean(
    !isFreePlan &&
    useBrandKit &&
    hasBrandKitLogo
  );
  const brandKitProducts = Array.isArray(brandKit?.products)
    ? brandKit.products.filter((item) => item && item.name)
    : [];
  const brandKitTemplates = useMemo(() => {
    const saved = Array.isArray(brandKit?.imageTemplates)
      ? brandKit.imageTemplates.filter((item) => item && item.referenceImageUrl)
      : [];

    if (saved.length) return saved;

    if (brandKit?.templateReferenceUrl) {
      return [{
        id: "legacy-template",
        name: "Brand Template",
        referenceImageUrl: brandKit.templateReferenceUrl,
        consistency: brandKit.templateConsistency === "follow_closely" ? "follow_closely" : "inspiration",
        creativeDirection: "",
        isDefault: true,
      }];
    }
    return [];
  }, [brandKit]);
  const hasBrandTemplates = brandKitTemplates.length > 0;
  const selectedBrandTemplate = brandKitTemplates.find(
    (item) => String(item?.id || "") === String(selectedBrandTemplateId || "")
  ) || null;
  const brandCreativeStyle =
    brandKit?.imageStyle || brandKit?.preferredAdLayout || "";
  const brandCreativeLayout = brandKit?.preferredAdLayout || "";


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
        const resolvedTier = String(me.tier || "").toLowerCase();

        setIsFreePlan(resolvedTier === "free");
        setCanUsePerformanceIntelligence(
          Boolean(me.isAdmin) ||
            resolvedTier === "pro_monthly" ||
            resolvedTier === "business_monthly"
        );
      } catch {}
    };
    loadPlan();
  }, [apiBase]);

  useEffect(() => {
    const loadUsageAndPreference = async () => {
      try {
        const user = auth.currentUser;
        if (!user || !apiBase) {
          setUsageLoaded(true);
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${apiBase}/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json().catch(() => null);
        const used = Number(
          data?.used ??
          data?.imageUsed ??
          data?.image_used ??
          data?.usage ??
          0
        );
        const rawCap =
          data?.cap ??
          data?.limit ??
          data?.imageCap ??
          data?.image_cap ??
          null;
        const cap =
          rawCap === null || rawCap === undefined || rawCap === ""
            ? null
            : Number(rawCap);
        const hasFiniteCap = Number.isFinite(cap) && cap >= 0;
        const purchased = Math.max(0, Number(data?.purchasedRemaining || 0));
        const exhausted =
          response.ok &&
          hasFiniteCap &&
          Number.isFinite(used) &&
          used >= cap && purchased <= 0;
        const hasPreviousGeneration =
          response.ok && Number.isFinite(used) && used > 0;

        setPurchasedImageCredits(purchased);
        setImageUsageUsed(Number.isFinite(used) ? used : null);
        setImageUsageCap(hasFiniteCap ? cap : null);
        setImageLimitReached(exhausted);
        setHasGeneratedBefore(hasPreviousGeneration);

        if (hasPreviousGeneration) {
          const savedMode = window.localStorage.getItem(
            IMAGE_GENERATOR_MODE_KEY
          );

          if (savedMode === "advanced") {
            setAdvancedOpen(true);
          }
        }
      } catch {
        // Usage detection is only for presentation. Generation remains available.
      } finally {
        setUsageLoaded(true);
      }
    };

    loadUsageAndPreference();
  }, [apiBase]);

  useEffect(() => {
    if (!usageLoaded) return;

    window.localStorage.setItem(
      IMAGE_GENERATOR_MODE_KEY,
      advancedOpen ? "advanced" : "quick"
    );
  }, [advancedOpen, usageLoaded]);

  useEffect(() => {
    if (
      usePerformanceIntelligence &&
      !canUsePerformanceIntelligence
    ) {
      setUsePerformanceIntelligence(false);
    }
  }, [
    usePerformanceIntelligence,
    canUsePerformanceIntelligence,
  ]);

  useEffect(() => {
    setLogoMode((current) => {
      if (canUseBrandKitLogo) {
        return current === "none" ? "brand_kit" : current;
      }
      return current === "brand_kit" ? "none" : current;
    });

    setQuickLogoMode((current) => {
      if (canUseBrandKitLogo) {
        return current === "none" ? "brand_kit" : current;
      }
      return current === "brand_kit" ? "none" : current;
    });
  }, [canUseBrandKitLogo]);

  useEffect(() => {
    setSelectedBrandProductName("");
    setSelectedBrandTemplateId("");
  }, [brandKitId, isFreePlan, useBrandKit]);



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
    setAdvancedOpen(true);
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
    setAdvancedOpen(true);
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

  const applySavedBrandProduct = (productName) => {
    setSelectedBrandProductName(productName);

    const product = brandKitProducts.find(
      (item) => String(item?.name || "") === String(productName || "")
    );

    if (!product) return;

    setForm((previous) => ({
      ...previous,
      product_name: product.name || previous.product_name,
      description: product.description || previous.description,
    }));
  };

  const safeDetailMessage = (detail) => {
    if (!detail) return null;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
    return String(detail);
  };

  const customerSafeMessage = (detail, fallback = "Something went wrong. Please try again.") => {
    const message = safeDetailMessage(detail);
    if (!message) return fallback;

    const blockedTechnicalTerms =
      /runway|openai|open ai|gpt(?:-|\s)?(?:image|\d)|gen4|model[_\s-]?id|api[_\s-]?key|api error|provider|firebase|firestore|storage\.googleapis|httpx|uvicorn|pydantic|ffmpeg|ffprobe|traceback|stack trace|exception|internal server error|chat\.completions|client\.images|b64_json/i;

    const looksLikeRawPayload =
      /^[[{]/.test(message.trim()) ||
      /(?:status[_\s-]?code|request[_\s-]?id|error[_\s-]?code|response body|raw response)/i.test(message);

    if (blockedTechnicalTerms.test(message) || looksLikeRawPayload) {
      return fallback;
    }

    return message;
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
          customerSafeMessage(
            statusData?.detail,
            "We couldn't check your generation status. Please try again."
          )
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
        // A terminal failed job has completed its backend rollback/refund path.
        void refreshWorkspace?.();
        const detail = statusData.error;
        const error = new Error(
          customerSafeMessage(
            detail,
            "We couldn't create your ad. Please try again."
          )
        );
        error.detail = detail;
        await new Promise((resolve) => setTimeout(resolve, 650));
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  };

  const handleCreativeElementToggle = (element) => {
    setCreativeElements((current) => ({
      ...current,
      [element]: !current[element],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (imageLimitReached) {
      setUiError({
        type: "cap",
        message: `You've used all available image generations${
          Number.isFinite(imageUsageCap)
            ? ` (${imageUsageUsed ?? imageUsageCap}/${imageUsageCap})`
            : ""
        }. Upgrade to continue creating.`,
        upgradePath: "/subscribe?upgrade=1",
      });
      return;
    }

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

      const effectiveCreativeElements = advancedOpen
        ? creativeElements
        : {
            headline: quickAdElementsEnabled,
            body: quickAdElementsEnabled,
            cta: quickAdElementsEnabled,
          };

      const effectiveLogoMode = advancedOpen ? logoMode : quickLogoMode;

      const payload = {
        ...form,
        headline: effectiveCreativeElements.headline
          ? form.headline.trim() || null
          : null,
        primary_text: effectiveCreativeElements.body
          ? form.primaryText.trim() || null
          : null,
        cta: effectiveCreativeElements.cta
          ? form.cta.trim() || null
          : null,
        useBrandKit: isFreePlan ? false : useBrandKit,
        brandKitId: isFreePlan ? null : brandKitId,
        brandProductName:
          !isFreePlan && useBrandKit ? selectedBrandProductName || null : null,
        brandTemplateId:
          !isFreePlan && useBrandKit && selectedBrandTemplateId
            ? selectedBrandTemplateId
            : null,
        useBrandTemplate:
          !isFreePlan && useBrandKit && Boolean(selectedBrandTemplateId),
        campaignObjective: form.campaignObjective,
        referenceImageUrls: referenceImages.map((img) => img.url).filter(Boolean),
        referenceImageMode,
        productType: form.productType === "auto" ? null : form.productType,
        usePerformanceIntelligence:
          canUsePerformanceIntelligence &&
          usePerformanceIntelligence,
        includeHeadline: effectiveCreativeElements.headline,
        includeBody: effectiveCreativeElements.body,
        includeCta: effectiveCreativeElements.cta,
        logoMode: effectiveLogoMode,
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
          const used = detail?.used;
          const isFreeLimit = Number(cap) === 2;

          setImageLimitReached(true);
          if (Number.isFinite(Number(used))) setImageUsageUsed(Number(used));
          if (Number.isFinite(Number(cap))) setImageUsageCap(Number(cap));

          setUiError({
            type: "cap",
            message: isFreeLimit
              ? "You've used your 2 free image generations. Upgrade to continue creating."
              : customerSafeMessage(
                  detail,
                  "You've reached your image generation limit."
                ),
            upgradePath: "/subscribe?upgrade=1",
          });

          return;
        }

        if (response.status === 401) {
          setUiError({
            type: "auth",
            message: customerSafeMessage(
              detail,
              "Session expired. Please log in again."
            ),
            upgradePath: "/login",
          });
          return;
        }

        if (response.status === 402 || response.status === 403) {
          setUiError({
            type: "sub",
            message: customerSafeMessage(
              detail,
              "This feature requires an active plan."
            ),
            upgradePath: "/account",
          });
          return;
        }

        alert(
          customerSafeMessage(
            detail,
            "We couldn't start your ad generation. Please try again."
          )
        );
        return;
      }

      if (!data?.jobId) {
        alert("No generation job was returned from server.");
        return;
      }

      data = await pollImageJob(data.jobId, token);

      // The backend has confirmed success and finalized the credit deduction.
      // Refresh shared usage immediately so the sidebar/dashboard stay current.
      void refreshWorkspace?.();

      if (data?.imageJobId) {
        void claimFirstGeneration(apiBase, "image", data.imageJobId, token);
      }

      if (!data?.imageUrl) {
        alert("Ad copy generated, but no image URL was returned.");
      }

      setResult(data);
      setFeedbackOpen(true);
      setHasGeneratedBefore(true);
      setImageUsageUsed((current) => {
        const next = Number.isFinite(current) ? current + 1 : current;
        if (
          Number.isFinite(next) &&
          Number.isFinite(imageUsageCap) &&
          next >= imageUsageCap &&
          purchasedImageCredits <= 0
        ) {
          setImageLimitReached(true);
        }
        return next;
      });
    } catch (err) {
      console.error("[AdGen] Generation error:", err);

      const detail = err?.detail;
      const message =
        customerSafeMessage(
          detail || err?.message,
          "We couldn't create your ad. Please try again."
        );

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

        setImageLimitReached(true);
        if (Number.isFinite(Number(used))) setImageUsageUsed(Number(used));
        if (Number.isFinite(Number(cap))) setImageUsageCap(Number(cap));

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
              <div className="adgen-title-row">
                <h1 className="app-title">Generate Ad</h1>
                <FeatureTutorial
                  feature="imageGenerator"
                  title="Learn Image Generator in 2 minutes"
                  description="See how to create your first image ad with Quick Create and explore the Full Creative Workspace."
                  durationLabel="2-minute walkthrough"
                  videoSrc="/tutorials/image-generator-demo.mp4"
                />
              </div>
              <p className="description">
                Create scroll-stopping ads using your Brand Kit, reference images, and performance insights.
              </p>
            </div>
          </div>

          {imageLimitReached && (
            <div className="generatorLimitTop">
              <div className="generatorUsageLimitCard generatorUsageLimitCardV2" role="alert">
                <div className="generatorLimitIntro">
                  <strong>Image generations used</strong>
                  
                <p className="generatorLimitSummary">
                  You've used all available image generations
                  {Number.isFinite(imageUsageCap)
                    ? ` (${imageUsageUsed ?? imageUsageCap}/${imageUsageCap})`
                    : ""}.
                </p>
                  <p>
                    Choose how you want to keep creating. Purchased credits are a one-time add-on and never expire.
                  </p>
                </div>

                <div className="generatorLimitChoices">
                  <button
                    type="button"
                    className="generatorLimitChoice generatorLimitChoiceUpgrade"
                    onClick={() => navigate("/subscribe?upgrade=1")}
                  >
                    <span className="generatorLimitChoiceIcon" aria-hidden="true">
                      <Crown size={20} />
                    </span>
                    <span className="generatorLimitChoiceCopy">
                      <strong>Upgrade your plan</strong>
                      <small>Get more included credits plus additional ADGen features.</small>
                    </span>
                    <span className="generatorLimitChoiceAction">Upgrade Plan</span>
                  </button>

                  <span className="generatorLimitOr" aria-hidden="true">OR</span>

                  <button
                    type="button"
                    className="generatorLimitChoice generatorLimitChoiceCredits"
                    onClick={() => setCreditPacksOpen(true)}
                  >
                    <span className="generatorLimitChoiceIcon" aria-hidden="true">
                      <ShoppingCart size={20} />
                    </span>
                    <span className="generatorLimitChoiceCopy">
                      <strong>Buy more image credits</strong>
                      <small>One-time purchase. Credits remain available until you use them.</small>
                    </span>
                    <span className="generatorLimitChoiceAction">Buy Image Credits</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {advancedOpen ? (
            <section className="adgen-quick-collapsed" aria-label="Quick Create">
              <div>
                <span className="adgen-quick-start-kicker">Quick Create</span>
                <h2>Full Creative Workspace is open</h2>
                <p>
                  The simplified inputs are hidden so there is only one active
                  generation path and one Create button.
                </p>
              </div>

              <button
                type="button"
                className="adgen-switch-quick-button"
                onClick={() => {
                  setAdvancedOpen(false);
                  setTemplatesOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={loading || referenceUploading}
              >
                Switch to Quick Create
                <span aria-hidden="true">↑</span>
              </button>
            </section>
          ) : (
            <section className="adgen-quick-start" aria-labelledby="quick-start-title">
              <div className="adgen-quick-start-head">
                <div>
                  <span className="adgen-quick-start-kicker">
                    {hasGeneratedBefore ? "Quick Create" : "Fastest way to begin"}
                  </span>
                  <h2 id="quick-start-title">
                    {hasGeneratedBefore
                      ? "Create Another Ad"
                      : "Create Your First Ad"}
                  </h2>
                  <p>
                    {hasGeneratedBefore
                      ? "Add the essentials for a fast generation, or open the full creative workspace for complete control."
                      : "Add the essentials and generate immediately. The full creative workspace is available below whenever you need more control."}
                  </p>
                </div>
              </div>

              <form className="adgen-quick-form" onSubmit={handleSubmit}>
                {!isFreePlan && (
                  <div className="adgen-brandkit-state-loader" aria-hidden="true">
                    <BrandKitSelector
                      value={brandKitId}
                      onChange={setBrandKitId}
                      onKitChange={(selectedKit) => {
                        setBrandKit(selectedKit);
                        setBrandKitLoading(false);
                      }}
                      disabled={loading}
                    />
                  </div>
                )}

                <div className="adgen-quick-fields">
                  <label className="field">
                    <span className="field-label">Company / Brand Name</span>
                    <input
                      name="companyName"
                      placeholder="Example: Luma Skin"
                      value={form.companyName}
                      onChange={handleChange}
                      disabled={loading}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Product or Service</span>
                    <input
                      name="product_name"
                      placeholder="What are you advertising?"
                      value={form.product_name}
                      onChange={handleChange}
                      disabled={loading}
                      required
                    />
                  </label>

                  <label className="field adgen-quick-description">
                    <span className="field-label">What are you promoting?</span>
                    <textarea
                      name="description"
                      placeholder="Describe the product, service, offer, or main benefit."
                      value={form.description}
                      onChange={handleChange}
                      disabled={loading}
                      maxLength={3000}
                      required
                    />
                    <small className="field-helper">
                      {form.description.length}/3,000 characters · Detailed creative direction is supported.
                    </small>
                  </label>

                  <label className="field">
                    <span className="field-label">Who is this for?</span>
                    <input
                      name="audience"
                      placeholder="Example: busy parents, skincare shoppers, small businesses"
                      value={form.audience}
                      onChange={handleChange}
                      disabled={loading}
                      required
                    />
                  </label>
                </div>

                <div className="adgen-quick-aspect-ratio">
                  <div className="adgen-quick-elements-copy">
                    <strong>Aspect Ratio</strong>
                    <small>Choose the format for the placement you are creating.</small>
                  </div>

                  <div
                    className="adgen-quick-aspect-selector"
                    role="group"
                    aria-label="Quick Create aspect ratio"
                  >
                    <button
                      type="button"
                      className={form.imageSize === "1024x1024" ? "active" : ""}
                      onClick={() => handleChange({ target: { name: "imageSize", value: "1024x1024" } })}
                      disabled={loading || referenceUploading}
                      aria-pressed={form.imageSize === "1024x1024"}
                    >
                      Square 1:1
                    </button>
                    <button
                      type="button"
                      className={form.imageSize === "1024x1792" ? "active" : ""}
                      onClick={() => handleChange({ target: { name: "imageSize", value: "1024x1792" } })}
                      disabled={loading || referenceUploading}
                      aria-pressed={form.imageSize === "1024x1792"}
                    >
                      Portrait 9:16
                    </button>
                    <button
                      type="button"
                      className={form.imageSize === "1792x1024" ? "active" : ""}
                      onClick={() => handleChange({ target: { name: "imageSize", value: "1792x1024" } })}
                      disabled={loading || referenceUploading}
                      aria-pressed={form.imageSize === "1792x1024"}
                    >
                      Landscape 16:9
                    </button>
                  </div>
                </div>

                <div className="adgen-quick-elements">
                  <div className="adgen-quick-elements-copy">
                    <strong>Standard Ad Elements</strong>
                    <small>
                      Turn off to create a cleaner scene without a standard headline,
                      body copy, or CTA. Text you explicitly request inside the scene
                      can still appear.
                    </small>
                  </div>

                  <div
                    className="adgen-quick-elements-selector"
                    role="group"
                    aria-label="Standard ad elements"
                  >
                    <button
                      type="button"
                      className={quickAdElementsEnabled ? "active" : ""}
                      onClick={() => setQuickAdElementsEnabled(true)}
                      disabled={loading || referenceUploading}
                      aria-pressed={quickAdElementsEnabled}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      className={!quickAdElementsEnabled ? "active" : ""}
                      onClick={() => setQuickAdElementsEnabled(false)}
                      disabled={loading || referenceUploading}
                      aria-pressed={!quickAdElementsEnabled}
                    >
                      Off
                    </button>
                  </div>
                </div>

                <div className="adgen-quick-elements adgen-quick-logo">
                  <div className="adgen-quick-elements-copy">
                    <strong>Logo</strong>
                    <small>
                      Choose whether ADGen should omit a logo, generate one, or use your
                      Active Brand logo when available.
                    </small>
                  </div>

                  <div
                    className="adgen-quick-logo-selector"
                    role="group"
                    aria-label="Quick Create logo mode"
                  >
                    <button
                      type="button"
                      className={quickLogoMode === "none" ? "active" : ""}
                      onClick={() => setQuickLogoMode("none")}
                      disabled={loading || referenceUploading}
                      aria-pressed={quickLogoMode === "none"}
                    >
                      No Logo
                    </button>
                    <button
                      type="button"
                      className={quickLogoMode === "generate" ? "active" : ""}
                      onClick={() => setQuickLogoMode("generate")}
                      disabled={loading || referenceUploading}
                      aria-pressed={quickLogoMode === "generate"}
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      className={quickLogoMode === "brand_kit" ? "active" : ""}
                      onClick={() => setQuickLogoMode("brand_kit")}
                      disabled={
                        loading ||
                        referenceUploading ||
                        !canUseBrandKitLogo
                      }
                      aria-pressed={quickLogoMode === "brand_kit"}
                    >
                      Brand Kit
                    </button>
                  </div>

                  {!isFreePlan && hasBrandKit && !hasBrandKitLogo && (
                    <small className="adgen-logo-availability-note">
                      Your Active Brand does not have a logo yet. Upload a logo in Brand Kit to enable this option.
                    </small>
                  )}

                  {!isFreePlan && hasBrandKitLogo && !useBrandKit && (
                    <small className="adgen-logo-availability-note">
                      A Brand Kit logo is available. Enable Apply Brand Kit to access this option.
                    </small>
                  )}
                </div>

                <div className="adgen-quick-divider">
                  <span>or</span>
                </div>

                <div className="adgen-quick-template-action">
                  <button
                    type="button"
                    className="adgen-quick-secondary"
                    onClick={() => {
                      setTemplatesOpen(true);

                      window.setTimeout(() => {
                        templateSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 120);
                    }}
                    disabled={loading || referenceUploading}
                    aria-expanded={templatesOpen}
                    aria-controls="image-template-options"
                  >
                    Need Inspiration? 🎨 Start with a Template
                  </button>
                </div>

                <div className="adgen-full-workspace-callout">
                  <div className="adgen-full-workspace-copy">
                    <span className="adgen-full-workspace-kicker">
                      Full creative workspace
                    </span>
                    <h3>Need complete creative control?</h3>
                    <p>
                      Configure copy, style, platform, aspect ratio, Brand Kit,
                      Performance Intelligence, reference images, campaign details,
                      and every advanced image-generation setting.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="adgen-full-workspace-button"
                    onClick={() => {
                      setTemplatesOpen(false);
                      setAdvancedOpen(true);
                      window.setTimeout(() => {
                        firstWorkspaceSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 80);
                    }}
                    disabled={loading || referenceUploading}
                    aria-expanded={advancedOpen}
                    aria-controls="adgen-advanced-workspace"
                  >
                    Open Full Creative Workspace
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {(!advancedOpen ? templatesOpen : true) && (
          <section
            ref={templateSectionRef}
            className={`template-starter ${
              templatesOpen ? "is-open" : "is-collapsed"
            }`}
            aria-labelledby="image-template-title"
          >
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
          )}

          {advancedOpen && (
          <div id="adgen-advanced-workspace" className="adgen-advanced-workspace">
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
                <textarea
                  name="description"
                  placeholder="Describe the product, offer, and creative direction..."
                  value={form.description}
                  onChange={handleChange}
                  disabled={loading}
                  maxLength={3000}
                />
                <small className="field-helper">
                  {form.description.length}/3,000 characters · Detailed creative direction is supported.
                </small>
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
              title="Brand & Assets"
              description="Apply your Brand Kit and upload optional reference images."
            >


              <div className={`brandkit-workspace-section ${isFreePlan ? "is-locked" : ""}`}>
                <div className="brandkit-workspace-head">
                  <div>
                    <span className="brandkit-workspace-kicker">Brand Kit</span>
                    <h3>Brand Creative Context</h3>
                    <p>Choose the brand, then optionally apply a saved product or image template for this creative.</p>
                  </div>
                  {isFreePlan && <span className="brandkit-control-lock">🔒 Paid plans</span>}
                </div>

                <div className="brandkit-workspace-toggle">
                  {isFreePlan ? (
                    <div className="brandkit-workspace-locked-copy">
                      <strong>Apply Brand Kit</strong>
                      <small>Upgrade to a paid plan to use Brand Kit, saved products, and image templates.</small>
                    </div>
                  ) : (
                    <label className="option-toggle">
                      <input
                        type="checkbox"
                        checked={useBrandKit}
                        onChange={(e) => setUseBrandKit(e.target.checked)}
                        disabled={loading}
                      />
                      <span>
                        <strong>
                          Apply Brand Kit <InfoTip text="Uses your saved logo, colors, fonts, brand voice, creative direction, products, and image templates to keep generated ads consistent." />
                        </strong>
                        <small>{brandKitLoading ? "Checking saved Brand Kit..." : useBrandKit ? "Brand guidance enabled" : "Turn this on before choosing a saved product or template"}</small>
                      </span>
                    </label>
                  )}
                </div>

                <div className="brandkit-workspace-selector">
                  {!isFreePlan ? (
                    <BrandKitSelector
                      value={brandKitId}
                      onChange={setBrandKitId}
                      onKitChange={(selectedKit) => {
                        setBrandKit(selectedKit);
                        setBrandKitLoading(false);
                      }}
                      disabled={loading}
                    />
                  ) : (
                    <div className="brandkit-workspace-disabled-field">Brand selection is available on paid plans.</div>
                  )}
                </div>

                <div className="brandkit-generation-controls-grid">
                  <label className="field">
                    <span className="field-label">Saved Product / Service</span>
                    <select
                      value={selectedBrandProductName}
                      onChange={(e) => applySavedBrandProduct(e.target.value)}
                      disabled={
                        isFreePlan || loading || !useBrandKit || !hasBrandKit || brandKitProducts.length === 0
                      }
                    >
                      <option value="">
                        {!useBrandKit
                          ? "Enable Brand Kit first"
                          : brandKitProducts.length
                            ? "No saved offering / use current brief"
                            : "No saved offerings"}
                      </option>
                      {brandKitProducts.map((product, index) => (
                        <option key={`${product.name}-${index}`} value={product.name}>
                          {product.name}{product.isPrimary ? " · Primary" : ""}
                        </option>
                      ))}
                    </select>
                    <small className="field-helper">Selecting one fills the Product Name and saved description. Its reference image can guide generation.</small>
                  </label>

                  <label className="field">
                    <span className="field-label">Image Template</span>
                    <select
                      value={selectedBrandTemplateId}
                      onChange={(e) => setSelectedBrandTemplateId(e.target.value)}
                      disabled={isFreePlan || loading || !useBrandKit || !hasBrandKit || !hasBrandTemplates}
                    >
                      <option value="">
                        {!useBrandKit
                          ? "Enable Brand Kit first"
                          : hasBrandTemplates
                            ? "No image template"
                            : "No saved image templates"}
                      </option>
                      {brandKitTemplates.map((template, index) => (
                        <option key={template.id || `${template.name}-${index}`} value={template.id || `template-${index + 1}`}>
                          {template.name || `Template ${index + 1}`}{template.isDefault ? " · Default" : ""}
                        </option>
                      ))}
                    </select>
                    <small className="field-helper">
                      {selectedBrandTemplate
                        ? `${selectedBrandTemplate.consistency === "follow_closely" ? "Follow layout closely" : "Style inspiration"}${selectedBrandTemplate.creativeDirection ? ` · ${selectedBrandTemplate.creativeDirection}` : ""}`
                        : "Choose a saved image-ad layout only when you want this generation to use it."}
                    </small>
                  </label>
                </div>

                {!isFreePlan && useBrandKit && hasBrandKit && (
                  <div className="brandkit-generation-summary">
                    <strong>Brand Guidance</strong>
                    <span>
                      {[
                        brandCreativeStyle,
                        brandCreativeLayout && brandCreativeLayout !== brandCreativeStyle ? brandCreativeLayout : "",
                        selectedBrandProductName ? `Product: ${selectedBrandProductName}` : "",
                        selectedBrandTemplate ? `Template: ${selectedBrandTemplate.name}` : "",
                      ].filter(Boolean).join(" · ") || "Brand identity, voice, and guardrails"}
                    </span>
                  </div>
                )}
              </div>

              <div className="enhancement-grid">
                <div className={`option-card enhancement-card performance-intelligence-option ${
                  usePerformanceIntelligence ? "enabled" : ""
                }`}>
                  {!canUsePerformanceIntelligence ? (
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

                  {canUsePerformanceIntelligence && (
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
                  {referenceUploading ? "Uploading..." : `Add References for This Ad (${referenceImages.length}/${MAX_REFERENCE_IMAGES})`}
                </button>

                <div className="reference-scope-note">
                  These references apply only to this generation and take priority over saved Brand Kit references.
                </div>

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
                          ? "Keep the actual product, packaging, app, or subject visually consistent in this generation."
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
                          ? "Use the uploaded image as visual inspiration for lighting, mood, composition, colors, or layout style."
                          : "Upload at least one reference image to choose how AdGen should use it."
                      }
                    />
                  </label>
                </div>
              </div>
            </StepSection>

            <StepSection
              step="3"
              title="Creative Copy"
              description="Choose which standard ad elements to include, then optionally provide exact copy for any enabled text element."
            >
              <div className="creative-elements-card">
                <div className="creative-elements-heading">
                  <div>
                    <strong>Ad Elements</strong>
                    <small>
                      Choose which standard elements ADGen should include in the finished creative.
                    </small>
                  </div>
                </div>

                <div className="creative-elements-grid">
                  <label className="creative-element-toggle">
                    <input
                      type="checkbox"
                      checked={creativeElements.headline}
                      onChange={() => handleCreativeElementToggle("headline")}
                      disabled={loading}
                    />
                    <span>
                      <strong>Headline</strong>
                      <small>Adds a primary ad headline to the creative.</small>
                    </span>
                  </label>

                  <label className="creative-element-toggle">
                    <input
                      type="checkbox"
                      checked={creativeElements.body}
                      onChange={() => handleCreativeElementToggle("body")}
                      disabled={loading}
                    />
                    <span>
                      <strong>Body Text</strong>
                      <small>Adds a short supporting message below or near the headline.</small>
                    </span>
                  </label>

                  <label className="creative-element-toggle">
                    <input
                      type="checkbox"
                      checked={creativeElements.cta}
                      onChange={() => handleCreativeElementToggle("cta")}
                      disabled={loading}
                    />
                    <span>
                      <strong>Call to Action</strong>
                      <small>Adds an action-focused CTA such as “Shop Now” or “Learn More.”</small>
                    </span>
                  </label>

                  <div className="creative-element-toggle creative-logo-mode-card">
                    <span className="creative-logo-mode-copy">
                      <strong>Logo</strong>
                      <small>
                        Choose whether to omit a logo, generate one, or use your Active Brand logo.
                      </small>
                    </span>

                    <div
                      className="creative-logo-mode-selector"
                      role="group"
                      aria-label="Logo mode"
                    >
                      <button
                        type="button"
                        className={logoMode === "none" ? "active" : ""}
                        onClick={() => setLogoMode("none")}
                        disabled={loading}
                        aria-pressed={logoMode === "none"}
                      >
                        No Logo
                      </button>
                      <button
                        type="button"
                        className={logoMode === "generate" ? "active" : ""}
                        onClick={() => setLogoMode("generate")}
                        disabled={loading}
                        aria-pressed={logoMode === "generate"}
                      >
                        Generate Logo
                      </button>
                      <button
                        type="button"
                        className={logoMode === "brand_kit" ? "active" : ""}
                        onClick={() => setLogoMode("brand_kit")}
                        disabled={
                          loading ||
                          !canUseBrandKitLogo
                        }
                        aria-pressed={logoMode === "brand_kit"}
                      >
                        Brand Kit Logo
                      </button>
                    </div>

                    <small className="creative-logo-mode-help">
                      {logoMode === "none" &&
                        "ADGen will not invent or render a standard logo or brand mark."}
                      {logoMode === "generate" &&
                        "ADGen may create a simple logo or wordmark based on the company or product name."}
                      {logoMode === "brand_kit" &&
                        canUseBrandKitLogo &&
                        "ADGen will use and preserve the logo from your selected Active Brand."}

                      {!isFreePlan && hasBrandKit && !hasBrandKitLogo &&
                        " Your Active Brand does not have a logo yet. Upload one in Brand Kit to enable Brand Kit Logo."}

                      {!isFreePlan && hasBrandKitLogo && !useBrandKit &&
                        " A Brand Kit logo is available. Enable Apply Brand Kit to access Brand Kit Logo."}

                      {!isFreePlan && !hasBrandKit &&
                        " Create or select a Brand Kit with an uploaded logo to enable Brand Kit Logo."}

                      {isFreePlan &&
                        " Brand Kit Logo is available on paid plans with a saved Brand Kit logo."}

                      {canUseBrandKitLogo && logoMode !== "brand_kit" &&
                        " Brand Kit Logo is available from your Active Brand."}
                    </small>
                  </div>
                </div>

                <div className="creative-elements-note">
                  Turning Headline, Body Text, or CTA off only removes that standard ad-copy
                  element. The Logo setting controls standard logo treatment separately. Text you
                  explicitly request in the scene—such as speech bubbles, signs, labels, packaging,
                  or interface text—can still be included.
                </div>
              </div>

              {creativeElements.headline && (
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
                    maxLength={50}
                  />
                  <small className="field-helper">
                    {form.headline.length}/50 characters · Best results are usually under 35 characters.
                  </small>
                </div>
              )}

              {creativeElements.body && (
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
                    maxLength={150}
                  />
                  <small className="field-helper">
                    {form.primaryText.length}/150 characters · Shorter copy creates cleaner, more readable ads.
                  </small>
                </div>
              )}

              {creativeElements.cta && (
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
                    maxLength={25}
                  />
                  <small className="field-helper">
                    {form.cta.length}/25 characters · Keep CTAs concise and action-oriented.
                  </small>
                </div>
              )}
            </StepSection>

            <StepSection
              step="4"
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

            <div className="button-row">
              <button type="submit" disabled={loading || referenceUploading || imageLimitReached}>
                {loading ? "Creating..." : referenceUploading ? "Uploading..." : "✨ Create My Ad"}
              </button>
            </div>
          </form>
          </div>
          )}
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

                <button
                  type="button"
                  className="download-button"
                  onClick={() => setFeedbackOpen(true)}
                >
                  View & Rate Result
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <GenerationFeedback
        open={feedbackOpen && !!result?.imageJobId}
        onClose={() => setFeedbackOpen(false)}
        apiBase={apiBase}
        resourceType="image"
        resourceId={result?.imageJobId}
        mediaUrl={result?.imageUrl}
        mediaType="image"
        title="Your image is ready"
        question="How was this result?"
        onDownload={downloadImage}
      />

      <GenerationProgress
        open={loading}
        type="image"
        stage={progress.stage}
        message={progress.message}
        percent={progress.percent}
        failed={progress.failed}
      />
      <CreditPackModal open={creditPacksOpen} onClose={() => setCreditPacksOpen(false)} />
    </div>
  );
}

export default AdGenerator;


















