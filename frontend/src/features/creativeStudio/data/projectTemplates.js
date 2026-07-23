const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const text = (name, value, x, y, width, fontSize, fill = "#ffffff", extra = {}) => ({
  id: makeId("text"), type: "text", name, text: value, x, y, width,
  height: Math.max(60, Math.round(fontSize * 1.6)), rotation: 0, opacity: 1,
  fill, fontSize, fontFamily: "Inter", fontWeight: 700, fontStyle: "normal",
  letterSpacing: 0, lineHeight: 1.08, align: "left", textDecoration: "",
  visible: true, locked: false, groupId: null, ...extra,
});

const rect = (name, x, y, width, height, fill, extra = {}) => ({
  id: makeId("roundedRect"), type: "roundedRect", name, x, y, width, height,
  rotation: 0, opacity: 1, fill, cornerRadius: 32, visible: true, locked: false,
  groupId: null, ...extra,
});

const circle = (name, x, y, size, fill, extra = {}) => ({
  id: makeId("circle"), type: "circle", name, x, y, width: size, height: size,
  rotation: 0, opacity: 1, fill, visible: true, locked: false, groupId: null, ...extra,
});

const cta = (x, y, width, label, fill = "#2563eb", extra = {}) => ({
  id: makeId("ctaButton"), type: "ctaButton", name: "CTA Button", x, y, width,
  height: 86, rotation: 0, opacity: 1, fill, text: label, textColor: "#ffffff",
  fontSize: 28, fontFamily: "Inter", fontWeight: 800, fontStyle: "normal",
  letterSpacing: 0, lineHeight: 1, align: "center", cornerRadius: 24,
  visible: true, locked: false, groupId: null, ...extra,
});

export const PROJECT_FORMATS = [
  { id: "instagram-square", category: "Social", name: "Instagram Post", width: 1080, height: 1080, description: "Square social post or ad." },
  { id: "instagram-portrait", category: "Social", name: "Instagram Portrait", width: 1080, height: 1350, description: "Portrait feed post with more vertical space." },
  { id: "instagram-story", category: "Social", name: "Story / Reel", width: 1080, height: 1920, description: "Full-screen vertical creative." },
  { id: "social-landscape", category: "Social", name: "Facebook / LinkedIn Ad", width: 1200, height: 628, description: "Wide social advertising format." },
  { id: "linkedin-square", category: "Social", name: "LinkedIn Square", width: 1200, height: 1200, description: "Professional square post." },
  { id: "youtube-thumbnail", category: "Social", name: "YouTube Thumbnail", width: 1280, height: 720, description: "Video thumbnail format." },
  { id: "email-header", category: "Email", name: "Email Header", width: 1200, height: 400, description: "Wide promotional email header." },
  { id: "display-medium-rectangle", category: "Display", name: "Display 300 × 250", width: 300, height: 250, description: "Standard medium rectangle." },
  { id: "display-half-page", category: "Display", name: "Display 300 × 600", width: 300, height: 600, description: "Tall half-page unit." },
  { id: "display-leaderboard", category: "Display", name: "Display 728 × 90", width: 728, height: 90, description: "Desktop leaderboard." },
  { id: "mobile-banner", category: "Display", name: "Mobile Banner", width: 320, height: 50, description: "Compact mobile banner." },
  { id: "custom", category: "Custom", name: "Custom Size", width: 1080, height: 1080, description: "Choose your own dimensions." },
];

export const PROJECT_LAYOUTS = [
  { id: "blank", name: "Blank", description: "Start with an empty canvas." },
  { id: "product-focus", name: "Product Focus", description: "Large image area, headline, body, and CTA." },
  { id: "split", name: "Split Layout", description: "Image and messaging in a balanced split." },
  { id: "offer", name: "Offer", description: "Prominent promotional message and CTA." },
  { id: "headline", name: "Headline Focus", description: "Typography-led creative with a strong statement." },
  { id: "testimonial", name: "Testimonial", description: "Quote-driven layout with supporting attribution." },
  { id: "feature-list", name: "Feature List", description: "Headline with three concise product benefits." },
  { id: "launch", name: "Launch", description: "Announcement layout for a new product or campaign." },
];

export const PROJECT_STYLES = [
  { id: "minimal", name: "Minimal", background: "#f8fafc", surface: "#ffffff", accent: "#2563eb", text: "#0f172a", muted: "#475569", radius: 24 },
  { id: "midnight", name: "Midnight", background: "#08111f", surface: "#132238", accent: "#3b82f6", text: "#ffffff", muted: "#b8c4d6", radius: 34 },
  { id: "luxury", name: "Luxury", background: "#17130e", surface: "#292117", accent: "#d6b36a", text: "#fffaf0", muted: "#dbcdb6", radius: 14 },
  { id: "bold", name: "Bold", background: "#171717", surface: "#f4f000", accent: "#ff3d00", text: "#ffffff", muted: "#d4d4d4", radius: 8 },
  { id: "violet", name: "Violet", background: "#18112b", surface: "#30204f", accent: "#9b6cff", text: "#ffffff", muted: "#ded3ff", radius: 32 },
  { id: "organic", name: "Organic", background: "#eef3e7", surface: "#dce8cf", accent: "#557a46", text: "#1e3522", muted: "#5d705f", radius: 44 },
  { id: "coral", name: "Warm Coral", background: "#fff0e8", surface: "#ffd8c7", accent: "#ef5b42", text: "#421f19", muted: "#7f4a40", radius: 30 },
  { id: "tech", name: "Tech", background: "#071423", surface: "#0d2a40", accent: "#22d3ee", text: "#ecfeff", muted: "#9edbe3", radius: 18 },
];

export const PROJECT_BACKGROUNDS = [
  { id: "solid", name: "Solid", description: "A clean single-color background." },
  { id: "split", name: "Split Color", description: "Two editable color panels." },
  { id: "glow", name: "Soft Glow", description: "Large translucent glow shapes." },
  { id: "geometric", name: "Geometric", description: "Editable angular accent blocks." },
  { id: "waves", name: "Abstract Shapes", description: "Layered organic circles and panels." },
  { id: "framed", name: "Framed Card", description: "A centered surface over the background." },
  { id: "transparent", name: "Transparent", description: "No canvas background." },
];

function canvasFor(format, style, backgroundId) {
  return {
    width: format.width,
    height: format.height,
    presetId: format.id,
    background: backgroundId === "transparent" ? "#ffffff" : style.background,
    transparent: backgroundId === "transparent",
    safeZone: { top: Math.round(format.height * 0.05), right: Math.round(format.width * 0.05), bottom: Math.round(format.height * 0.05), left: Math.round(format.width * 0.05) },
    guides: [],
  };
}

function backgroundLayers(format, style, backgroundId) {
  const { width: w, height: h } = format;
  if (backgroundId === "solid" || backgroundId === "transparent") return [];
  if (backgroundId === "split") return [
    rect("Background panel", Math.round(w * .52), 0, Math.round(w * .48), h, style.surface, { cornerRadius: 0, locked: true }),
  ];
  if (backgroundId === "glow") return [
    circle("Glow 1", Math.round(w * .62), Math.round(h * -.08), Math.round(Math.min(w, h) * .62), style.accent, { opacity: .28, locked: true }),
    circle("Glow 2", Math.round(w * -.15), Math.round(h * .62), Math.round(Math.min(w, h) * .48), style.surface, { opacity: .7, locked: true }),
  ];
  if (backgroundId === "geometric") return [
    rect("Geometric block", Math.round(w * .68), Math.round(h * -.08), Math.round(w * .42), Math.round(h * .56), style.accent, { rotation: 12, opacity: .85, cornerRadius: 12, locked: true }),
    rect("Geometric surface", Math.round(w * -.12), Math.round(h * .72), Math.round(w * .52), Math.round(h * .34), style.surface, { rotation: -8, cornerRadius: 18, locked: true }),
  ];
  if (backgroundId === "waves") return [
    circle("Abstract shape 1", Math.round(w * .58), Math.round(h * -.12), Math.round(Math.min(w, h) * .72), style.surface, { opacity: .9, locked: true }),
    circle("Abstract shape 2", Math.round(w * .76), Math.round(h * .18), Math.round(Math.min(w, h) * .35), style.accent, { opacity: .48, locked: true }),
    circle("Abstract shape 3", Math.round(w * -.18), Math.round(h * .68), Math.round(Math.min(w, h) * .48), style.surface, { opacity: .65, locked: true }),
  ];
  if (backgroundId === "framed") return [
    rect("Background card", Math.round(w * .055), Math.round(h * .055), Math.round(w * .89), Math.round(h * .89), style.surface, { cornerRadius: style.radius + 18, locked: true }),
  ];
  return [];
}

function layoutLayers(format, layoutId, style, backgroundId) {
  const w = format.width;
  const h = format.height;
  const pad = Math.max(18, Math.round(Math.min(w, h) * .075));
  const bodySize = Math.max(14, Math.round(Math.min(w, h) * .03));
  const titleSize = Math.max(25, Math.round(Math.min(w, h) * .072));
  const buttonW = Math.min(Math.round(w * .32), 340);
  if (layoutId === "blank") return [];
  if (layoutId === "product-focus") return [
    rect("Image placeholder", Math.round(w * .52), pad, Math.round(w * .42) - pad, h - pad * 2, style.surface, { cornerRadius: style.radius }),
    text("Eyebrow", "YOUR BRAND", pad, Math.round(h * .16), Math.round(w * .38), Math.max(15, bodySize * .72), style.accent, { letterSpacing: 3 }),
    text("Headline", "Make the product the hero.", pad, Math.round(h * .25), Math.round(w * .42), titleSize, style.text),
    text("Body", "Add a concise benefit and replace the image placeholder with your creative.", pad, Math.round(h * .57), Math.round(w * .4), bodySize, style.muted, { fontWeight: 400, lineHeight: 1.35 }),
    cta(pad, Math.round(h * .78), buttonW, "SHOP NOW", style.accent, { cornerRadius: style.radius }),
  ];
  if (layoutId === "split") return [
    rect("Image placeholder", 0, 0, Math.round(w * .48), h, style.surface, { cornerRadius: 0 }),
    text("Eyebrow", "CAMPAIGN MESSAGE", Math.round(w * .55), Math.round(h * .18), Math.round(w * .37), Math.max(14, bodySize * .7), style.accent, { letterSpacing: 3 }),
    text("Headline", "A clean split between image and message.", Math.round(w * .55), Math.round(h * .29), Math.round(w * .37), titleSize * .82, style.text),
    cta(Math.round(w * .55), Math.round(h * .73), buttonW, "LEARN MORE", style.accent),
  ];
  if (layoutId === "offer") return [
    text("Offer", "25% OFF", pad, Math.round(h * .16), w - pad * 2, titleSize * 1.6, style.text, { align: "center", fontWeight: 900 }),
    text("Headline", "A limited-time offer worth noticing.", Math.round(w * .14), Math.round(h * .43), Math.round(w * .72), titleSize * .68, style.text, { align: "center" }),
    text("Body", "Replace this text with your offer details.", Math.round(w * .18), Math.round(h * .61), Math.round(w * .64), bodySize, style.muted, { align: "center", fontWeight: 400 }),
    cta(Math.round((w - buttonW) / 2), Math.round(h * .76), buttonW, "CLAIM OFFER", style.accent),
  ];
  if (layoutId === "headline") return [
    text("Eyebrow", "INTRODUCING", pad, Math.round(h * .16), w - pad * 2, Math.max(14, bodySize * .72), style.accent, { letterSpacing: 4 }),
    text("Headline", "One bold idea.\nOne clear action.", pad, Math.round(h * .29), w - pad * 2, titleSize * 1.05, style.text),
    cta(pad, Math.round(h * .77), buttonW, "GET STARTED", style.accent),
  ];
  if (layoutId === "testimonial") return [
    text("Quote", "“This is where your strongest customer proof belongs.”", pad, Math.round(h * .22), w - pad * 2, titleSize * .78, style.text, { align: "center" }),
    text("Attribution", "CUSTOMER NAME · COMPANY", Math.round(w * .2), Math.round(h * .65), Math.round(w * .6), Math.max(14, bodySize * .72), style.accent, { align: "center", letterSpacing: 2 }),
  ];
  if (layoutId === "feature-list") return [
    text("Headline", "Three reasons to choose your product.", pad, Math.round(h * .13), Math.round(w * .78), titleSize * .8, style.text),
    ...["Clear primary benefit", "Supporting differentiator", "Strong final proof point"].flatMap((label, index) => {
      const y = Math.round(h * (.42 + index * .15));
      return [circle(`Feature ${index + 1}`, pad, y, Math.max(28, bodySize * 1.4), style.accent), text(`Feature text ${index + 1}`, label, pad + Math.max(52, bodySize * 2), y, Math.round(w * .72), bodySize, style.text, { fontWeight: 600 })];
    }),
  ];
  return [
    text("Eyebrow", "NOW AVAILABLE", pad, Math.round(h * .14), Math.round(w * .72), Math.max(14, bodySize * .72), style.accent, { letterSpacing: 3 }),
    text("Headline", "Launch your next campaign with confidence.", pad, Math.round(h * .26), Math.round(w * .78), titleSize, style.text),
    text("Body", "Add imagery, apply your Brand Kit, and customize every element.", pad, Math.round(h * .61), Math.round(w * .68), bodySize, style.muted, { fontWeight: 400 }),
    cta(pad, Math.round(h * .79), buttonW, "DISCOVER", style.accent),
  ];
}

export function createProjectFromTemplate(configuration = {}) {
  const format = PROJECT_FORMATS.find((item) => item.id === configuration.formatId) || PROJECT_FORMATS[0];
  const width = configuration.formatId === "custom" ? Math.max(90, Math.min(4096, Number(configuration.customWidth) || 1080)) : format.width;
  const height = configuration.formatId === "custom" ? Math.max(90, Math.min(4096, Number(configuration.customHeight) || 1080)) : format.height;
  const resolvedFormat = { ...format, width, height };
  const style = PROJECT_STYLES.find((item) => item.id === configuration.styleId) || PROJECT_STYLES[0];
  const backgroundId = configuration.backgroundId || "solid";
  const layoutId = configuration.layoutId || "blank";
  const title = (configuration.projectName || "Untitled design").trim() || "Untitled design";
  return {
    version: 3,
    title,
    metadata: { title, formatId: resolvedFormat.id, layoutId, styleId: style.id, backgroundId },
    canvas: canvasFor(resolvedFormat, style, backgroundId),
    layers: [...backgroundLayers(resolvedFormat, style, backgroundId), ...layoutLayers(resolvedFormat, layoutId, style, backgroundId)],
  };
}
