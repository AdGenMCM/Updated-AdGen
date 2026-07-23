import { typographyDefaults } from "../data/typographyPresets";

export function transformText(text, transform = "none") {
  const value = String(text ?? "");

  if (transform === "uppercase") return value.toUpperCase();
  if (transform === "lowercase") return value.toLowerCase();
  if (transform === "capitalize") {
    return value.replace(/\b\w/g, (character) => character.toUpperCase());
  }

  return value;
}

function clampFontWeight(value) {
  const weight = Number(value);
  if (!Number.isFinite(weight)) return 700;
  return Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
}

function buildFontStyle(fontWeight, fontStyleMode) {
  const weight = clampFontWeight(fontWeight);
  const italic = fontStyleMode === "italic";

  // Canvas/Konva expects CSS font shorthand order:
  // font-style first, then font-weight. "700 italic" is invalid.
  return italic ? `italic ${weight}` : String(weight);
}

export function getTypographyProps(layer, overrides = {}) {
  const settings = typographyDefaults(layer);

  return {
    fontFamily: settings.fontFamily,
    fontStyle: buildFontStyle(
      settings.fontWeight,
      settings.fontStyleMode,
    ),
    letterSpacing: settings.letterSpacing,
    lineHeight: settings.lineHeight,
    align: settings.align,
    textDecoration: settings.textDecoration || "",
    shadowEnabled: settings.textShadowEnabled,
    shadowColor: settings.textShadowColor,
    shadowBlur: settings.textShadowBlur,
    shadowOpacity: settings.textShadowOpacity,
    shadowOffsetX: settings.textShadowOffsetX,
    shadowOffsetY: settings.textShadowOffsetY,
    stroke: settings.textOutlineEnabled
      ? settings.textOutlineColor
      : undefined,
    strokeWidth: settings.textOutlineEnabled
      ? settings.textOutlineWidth
      : 0,
    fillAfterStrokeEnabled: true,
    ...overrides,
  };
}
