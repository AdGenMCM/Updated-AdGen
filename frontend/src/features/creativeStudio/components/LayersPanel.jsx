import React from "react";

const TYPE_ICONS = {
  text: "T",
  rect: "□",
  roundedRect: "▢",
  circle: "○",
  triangle: "△",
  line: "—",
  arrow: "→",
  star: "☆",
  ctaButton: "↗",
  saleBadge: "%",
  priceTag: "$",
  ratingStars: "★",
  promoPill: "●",
  ribbon: "◆",
  productCard: "▣",
  frame: "▢",
};

function layerLabel(layer) {
  if (layer.name) return layer.name;
  if (layer.type === "text") return layer.text || "Text";
  if (layer.type === "roundedRect") return "Rounded rectangle";
  return layer.type.charAt(0).toUpperCase() + layer.type.slice(1);
}

export default function LayersPanel({ layers, selectedLayerId, onSelect }) {
  return (
    <aside className="csv4-panel csv4-layers">
      <div className="csv4-panel__header">
        <strong>Layers</strong>
        <span>{layers.length}</span>
      </div>

      <div className="csv4-layers__list">
        {layers.length === 0 ? (
          <div className="csv4-empty">Add text, shapes, or ad elements to begin.</div>
        ) : (
          [...layers].reverse().map((layer) => (
            <button key={layer.id} type="button" className={layer.id === selectedLayerId ? "csv4-layer-row is-selected" : "csv4-layer-row"} onClick={() => onSelect(layer.id)}>
              <span className="csv4-layer-row__type">{TYPE_ICONS[layer.type] || "•"}</span>
              <span className="csv4-layer-row__name">{layerLabel(layer)}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
