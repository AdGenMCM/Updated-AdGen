export const FONT_OPTIONS = [
  { value: "Inter, Arial, sans-serif", label: "Inter" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', Arial, sans-serif", label: "Trebuchet MS" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "Impact, Haettenschweiler, sans-serif", label: "Impact" },
];

export const FONT_WEIGHT_OPTIONS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
  { value: 900, label: "Black" },
];

export const TEXT_PRESETS = [
  {
    id: "display-headline",
    label: "Display Headline",
    description: "Large, bold campaign headline",
    updates: {
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 800,
      fontStyleMode: "normal",
      fontSize: 92,
      letterSpacing: -1,
      lineHeight: 0.95,
      align: "left",
      textTransform: "none",
    },
  },
  {
    id: "section-heading",
    label: "Section Heading",
    description: "Strong supporting headline",
    updates: {
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 700,
      fontStyleMode: "normal",
      fontSize: 64,
      letterSpacing: 0,
      lineHeight: 1.05,
      align: "left",
      textTransform: "none",
    },
  },
  {
    id: "body-copy",
    label: "Body Copy",
    description: "Readable marketing copy",
    updates: {
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 400,
      fontStyleMode: "normal",
      fontSize: 36,
      letterSpacing: 0,
      lineHeight: 1.35,
      align: "left",
      textTransform: "none",
    },
  },
  {
    id: "eyebrow",
    label: "Eyebrow Label",
    description: "Compact uppercase campaign label",
    updates: {
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 700,
      fontStyleMode: "normal",
      fontSize: 28,
      letterSpacing: 4,
      lineHeight: 1.1,
      align: "left",
      textTransform: "uppercase",
    },
  },
  {
    id: "centered-promo",
    label: "Centered Promo",
    description: "Centered promotional statement",
    updates: {
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 800,
      fontStyleMode: "normal",
      fontSize: 68,
      letterSpacing: 0.5,
      lineHeight: 1,
      align: "center",
      textTransform: "uppercase",
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Serif-led premium treatment",
    updates: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: 600,
      fontStyleMode: "italic",
      fontSize: 70,
      letterSpacing: 0,
      lineHeight: 1.1,
      align: "left",
      textTransform: "none",
    },
  },
];

export function typographyDefaults(layer = {}) {
  return {
    fontFamily: layer.fontFamily || "Inter, Arial, sans-serif",
    fontWeight: Number(layer.fontWeight || 700),
    fontStyleMode: layer.fontStyleMode || "normal",
    letterSpacing: Number.isFinite(Number(layer.letterSpacing))
      ? Number(layer.letterSpacing)
      : 0,
    lineHeight: Number.isFinite(Number(layer.lineHeight))
      ? Number(layer.lineHeight)
      : 1,
    align: layer.align || "left",
    textTransform: layer.textTransform || "none",
    textDecoration: layer.textDecoration || "",
    textShadowEnabled: Boolean(layer.textShadowEnabled),
    textShadowColor: layer.textShadowColor || "#000000",
    textShadowBlur: Number(layer.textShadowBlur || 12),
    textShadowOpacity: Number.isFinite(Number(layer.textShadowOpacity))
      ? Number(layer.textShadowOpacity)
      : 0.3,
    textShadowOffsetX: Number(layer.textShadowOffsetX || 0),
    textShadowOffsetY: Number(layer.textShadowOffsetY || 6),
    textOutlineEnabled: Boolean(layer.textOutlineEnabled),
    textOutlineColor: layer.textOutlineColor || "#ffffff",
    textOutlineWidth: Number(layer.textOutlineWidth || 2),
  };
}
