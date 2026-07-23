import React, { useState } from "react";

const TYPE_ICONS = {
  text: "T", image: "▧", rect: "□", roundedRect: "▢", circle: "○", triangle: "△",
  line: "—", arrow: "→", star: "☆", ctaButton: "↗", saleBadge: "%", priceTag: "$",
  ratingStars: "★", promoPill: "●", ribbon: "◆", productCard: "▣", frame: "▢",
};

function layerLabel(layer) {
  if (layer.name) return layer.name;
  if (layer.type === "text") return layer.text || "Text";
  if (layer.type === "roundedRect") return "Rounded rectangle";
  return layer.type.charAt(0).toUpperCase() + layer.type.slice(1);
}

export default function LayersPanel({
  layers,
  selectedLayerIds,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRename,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState("");

  const beginRename = (layer) => {
    setRenamingId(layer.id);
    setDraftName(layerLabel(layer));
  };

  const finishRename = () => {
    if (renamingId) onRename(renamingId, draftName);
    setRenamingId(null);
    setDraftName("");
  };

  return (
    <aside className="csv4-panel csv4-layers">
      <div className="csv4-panel__header">
        <strong>Layers</strong>
        <span>{layers.length}</span>
      </div>

      <div className="csv4-layers__list">
        {layers.length === 0 ? (
          <div className="csv4-empty">Add text, shapes, images, or ad elements to begin.</div>
        ) : (
          [...layers].reverse().map((layer) => {
            const selected = selectedLayerIds.includes(layer.id);
            return (
              <div
                key={layer.id}
                className={`csv4-layer-row${selected ? " is-selected" : ""}${layer.visible === false ? " is-hidden" : ""}`}
                role="button"
                tabIndex={0}
                onClick={(event) => onSelect(layer.id, { additive: event.shiftKey || event.metaKey || event.ctrlKey })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(layer.id, { additive: event.shiftKey });
                }}
              >
                <span className="csv4-layer-row__type">{TYPE_ICONS[layer.type] || "•"}</span>

                <span className="csv4-layer-row__content">
                  {renamingId === layer.id ? (
                    <input
                      autoFocus
                      className="csv4-layer-row__rename"
                      value={draftName}
                      maxLength={80}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") finishRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="csv4-layer-row__name" onDoubleClick={(event) => { event.stopPropagation(); beginRename(layer); }}>
                      {layerLabel(layer)}
                    </span>
                  )}
                  <span className="csv4-layer-row__meta">
                    {layer.groupId && <small>Grouped</small>}
                    {layer.locked && <small>Locked</small>}
                  </span>
                </span>

                <span className="csv4-layer-row__actions">
                  <button
                    type="button"
                    title={layer.visible === false ? "Show layer" : "Hide layer"}
                    aria-label={layer.visible === false ? "Show layer" : "Hide layer"}
                    onClick={(event) => { event.stopPropagation(); onToggleVisibility(layer.id); }}
                  >
                    {layer.visible === false ? "◌" : "◉"}
                  </button>
                  <button
                    type="button"
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                    onClick={(event) => { event.stopPropagation(); onToggleLock(layer.id); }}
                  >
                    {layer.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    type="button"
                    title="Rename layer"
                    aria-label="Rename layer"
                    onClick={(event) => { event.stopPropagation(); beginRename(layer); }}
                  >
                    ✎
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="csv4-layers__hint">Shift-click layers to select more than one.</div>
    </aside>
  );
}
