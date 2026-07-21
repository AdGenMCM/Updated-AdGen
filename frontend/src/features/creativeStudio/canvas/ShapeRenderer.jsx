import React from "react";
import AdElementRenderer from "./renderers/AdElementRenderer";
import BasicShapeRenderer from "./renderers/BasicShapeRenderer";
import ImageRenderer from "./renderers/ImageRenderer";
import TextRenderer from "./renderers/TextRenderer";

const BASIC_SHAPE_TYPES = new Set([
  "rect",
  "roundedRect",
  "circle",
  "triangle",
  "line",
  "arrow",
  "star",
]);

const AD_ELEMENT_TYPES = new Set([
  "ctaButton",
  "saleBadge",
  "priceTag",
  "ratingStars",
  "promoPill",
  "ribbon",
  "productCard",
  "frame",
]);

export default function ShapeRenderer({ layer }) {
  if (layer.type === "text") {
    return <TextRenderer layer={layer} />;
  }

  if (layer.type === "image") {
    return <ImageRenderer layer={layer} />;
  }

  if (BASIC_SHAPE_TYPES.has(layer.type)) {
    return <BasicShapeRenderer layer={layer} />;
  }

  if (AD_ELEMENT_TYPES.has(layer.type)) {
    return <AdElementRenderer layer={layer} />;
  }

  return null;
}
