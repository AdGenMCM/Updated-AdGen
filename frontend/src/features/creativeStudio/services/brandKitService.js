const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function firstArray(...values) { return values.find(Array.isArray) || []; }
function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function colorEntry(label, value) {
  const normalized = clean(value);
  return normalized ? { id: `${label}-${normalized}`, label, value: normalized } : null;
}
function fontEntry(role, value) {
  const normalized = clean(value);
  return normalized ? { role, label: role.charAt(0).toUpperCase() + role.slice(1), value: normalized } : null;
}
function logoEntry(item, index, kitName) {
  if (!item) return null;
  if (typeof item === "string") return { id: `logo-${index}-${item}`, name: `${kitName} logo`, url: item };
  const url = clean(item.url || item.imageUrl || item.image_url || item.downloadURL || item.downloadUrl || item.storageUrl || item.logoUrl);
  if (!url) return null;
  return { id: String(item.id || item.assetId || `logo-${index}-${url}`), name: clean(item.name || item.filename || item.label) || `${kitName} logo`, url };
}

export function normalizeBrandKit(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const name = clean(raw.brandName || raw.brand_name || raw.name || raw.title) || `Brand ${index + 1}`;
  const colorsObject = raw.colors || raw.brandColors || raw.brand_colors || {};
  const colors = [
    colorEntry("Primary", raw.primaryColor || raw.primary_color || colorsObject.primary),
    colorEntry("Secondary", raw.secondaryColor || raw.secondary_color || colorsObject.secondary),
    colorEntry("Accent", raw.accentColor || raw.accent_color || colorsObject.accent),
  ].filter(Boolean);
  if (Array.isArray(colorsObject)) {
    colorsObject.forEach((entry, colorIndex) => {
      const value = typeof entry === "string" ? entry : entry?.value || entry?.hex || entry?.color;
      const label = typeof entry === "object" ? entry.label || entry.name || `Brand ${colorIndex + 1}` : `Brand ${colorIndex + 1}`;
      const normalized = colorEntry(label, value);
      if (normalized && !colors.some((color) => color.value.toLowerCase() === normalized.value.toLowerCase())) colors.push(normalized);
    });
  }

  const fontsObject = raw.fonts || raw.brandFonts || raw.brand_fonts || {};
  const fonts = [
    fontEntry("headline", raw.headlineFont || raw.headline_font || fontsObject.headline),
    fontEntry("body", raw.bodyFont || raw.body_font || fontsObject.body),
    fontEntry("cta", raw.ctaFont || raw.cta_font || fontsObject.cta),
  ].filter(Boolean);

  const logoCandidates = firstArray(raw.logos, raw.logoAssets, raw.logo_assets, raw.assets?.logos);
  if (!logoCandidates.length) {
    const singleLogo = raw.logoUrl || raw.logo_url || raw.logo?.url || raw.logo;
    if (singleLogo) logoCandidates.push(singleLogo);
  }
  const logos = logoCandidates.map((item, logoIndex) => logoEntry(item, logoIndex, name)).filter(Boolean);

  return {
    id: String(raw.id || raw.brandId || raw.brand_id || raw.kitId || raw.kit_id || `brand-${index}`),
    name,
    colors,
    fonts,
    logos,
    raw,
  };
}

export function normalizeBrandKits(value) {
  const candidates = Array.isArray(value)
    ? value
    : firstArray(value?.items, value?.kits, value?.brandKits, value?.brand_kits, value?.brands, value?.data);
  return candidates.map(normalizeBrandKit).filter(Boolean);
}

export async function listCreativeStudioBrandKits(token) {
  if (!token) throw new Error("You must be signed in to load Brand Kits.");
  const endpoints = ["/brand-kits", "/brandkit/kits", "/brand-kit/kits", "/brands"];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 404 || response.status === 405) continue;
      const data = await safeJson(response);
      if (!response.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === "string" ? detail : detail?.message || "Brand Kits could not be loaded.");
      }
      return normalizeBrandKits(data);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Brand Kits could not be loaded.");
}

export function ensureBrandFontLoaded(fontFamily) {
  const family = clean(fontFamily).split(",")[0].replace(/["']/g, "");
  if (!family || ["Arial", "Helvetica", "Georgia", "Verdana", "Times New Roman", "Courier New", "Trebuchet MS"].includes(family)) return;
  const id = `csv4-font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(link);
}
