import React from "react";

const TEXT_TYPES = new Set(["text", "ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"]);
const FILL_TYPES = new Set(["text", "rect", "roundedRect", "circle", "triangle", "star", "ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"]);

function NumberField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({ label, value, onChange, rows = 2 }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function PropertiesPanel({ selectedLayer, onChange, onReplaceImage }) {
  return (
    <aside className="csv4-panel csv4-properties">
      <div className="csv4-panel__header">
        <strong>Properties</strong>
        {selectedLayer?.name && <span>{selectedLayer.name}</span>}
      </div>

      {!selectedLayer ? (
        <div className="csv4-empty">Select a layer to edit its properties.</div>
      ) : (
        <div className="csv4-properties__body">
          {selectedLayer.type === "image" && (
            <>
              <div className="csv4-image-properties__summary">
                <strong>{selectedLayer.filename || "Image"}</strong>
                <span>{formatBytes(selectedLayer.sizeBytes)}</span>
              </div>

              <button type="button" className="csv4-properties-button" onClick={onReplaceImage}>Replace image</button>

              <label className="csv4-field">
                <span>Image fit</span>
                <select value={selectedLayer.fit || "cover"} onChange={(event) => onChange({ fit: event.target.value })}>
                  <option value="cover">Cover</option>
                  <option value="contain">Fit</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>

              <label className="csv4-check-field">
                <input type="checkbox" checked={selectedLayer.lockAspectRatio !== false} onChange={(event) => onChange({ lockAspectRatio: event.target.checked })} />
                <span>Lock aspect ratio</span>
              </label>

              <NumberField label="Corner radius" value={selectedLayer.cornerRadius} min={0} max={500} onChange={(cornerRadius) => onChange({ cornerRadius })} />
              <NumberField label="Border width" value={selectedLayer.borderWidth} min={0} max={80} onChange={(borderWidth) => onChange({ borderWidth })} />
              {(selectedLayer.borderWidth || 0) > 0 && <ColorField label="Border color" value={selectedLayer.borderColor || "#ffffff"} onChange={(borderColor) => onChange({ borderColor })} />}

              <label className="csv4-check-field">
                <input type="checkbox" checked={Boolean(selectedLayer.shadowEnabled)} onChange={(event) => onChange({ shadowEnabled: event.target.checked })} />
                <span>Drop shadow</span>
              </label>

              {selectedLayer.shadowEnabled && (
                <>
                  <NumberField label="Shadow blur" value={selectedLayer.shadowBlur} min={0} max={100} onChange={(shadowBlur) => onChange({ shadowBlur })} />
                  <NumberField label="Shadow opacity" value={selectedLayer.shadowOpacity} min={0} max={1} step={0.05} onChange={(shadowOpacity) => onChange({ shadowOpacity })} />
                </>
              )}
            </>
          )}

          {selectedLayer.type === "productCard" && (
            <>
              <TextField label="Title" value={selectedLayer.title} onChange={(title) => onChange({ title })} />
              <TextField label="Description" value={selectedLayer.text} onChange={(text) => onChange({ text })} rows={3} />
              <TextField label="Price" value={selectedLayer.price} onChange={(price) => onChange({ price })} rows={1} />
            </>
          )}

          {selectedLayer.type === "priceTag" && (
            <>
              <TextField label="Price" value={selectedLayer.text} onChange={(text) => onChange({ text })} rows={1} />
              <TextField label="Supporting text" value={selectedLayer.subtext} onChange={(subtext) => onChange({ subtext })} rows={1} />
            </>
          )}

          {TEXT_TYPES.has(selectedLayer.type) && !["productCard", "priceTag", "ratingStars"].includes(selectedLayer.type) && (
            <TextField label="Text" value={selectedLayer.text} onChange={(text) => onChange({ text })} rows={selectedLayer.type === "saleBadge" ? 3 : 2} />
          )}

          {selectedLayer.type === "ratingStars" && (
            <>
              <NumberField label="Rating" value={selectedLayer.rating} min={1} max={5} onChange={(rating) => onChange({ rating })} />
              <TextField label="Rating label" value={selectedLayer.text} onChange={(text) => onChange({ text })} rows={1} />
              <label className="csv4-check-field"><input type="checkbox" checked={selectedLayer.showRatingText !== false} onChange={(event) => onChange({ showRatingText: event.target.checked })} /><span>Show rating label</span></label>
            </>
          )}

          {TEXT_TYPES.has(selectedLayer.type) && <NumberField label="Font size" value={selectedLayer.fontSize} min={8} max={240} onChange={(fontSize) => onChange({ fontSize })} />}
          {FILL_TYPES.has(selectedLayer.type) && <ColorField label={selectedLayer.type === "ratingStars" ? "Star color" : "Fill"} value={selectedLayer.fill || "#2563eb"} onChange={(fill) => onChange({ fill })} />}
          {selectedLayer.textColor && <ColorField label="Text color" value={selectedLayer.textColor} onChange={(textColor) => onChange({ textColor })} />}
          {selectedLayer.accentColor && <ColorField label="Accent color" value={selectedLayer.accentColor} onChange={(accentColor) => onChange({ accentColor })} />}

          {["line", "arrow", "frame"].includes(selectedLayer.type) && (
            <>
              <ColorField label="Stroke" value={selectedLayer.stroke || "#2563eb"} onChange={(stroke) => onChange({ stroke })} />
              <NumberField label="Stroke width" value={selectedLayer.strokeWidth} min={1} max={80} onChange={(strokeWidth) => onChange({ strokeWidth })} />
            </>
          )}

          {["roundedRect", "ctaButton", "promoPill", "productCard", "frame"].includes(selectedLayer.type) && (
            <NumberField label="Corner radius" value={selectedLayer.cornerRadius} min={0} max={240} onChange={(cornerRadius) => onChange({ cornerRadius })} />
          )}

          <div className="csv4-properties__grid">
            <NumberField label="X" value={selectedLayer.x} onChange={(x) => onChange({ x })} />
            <NumberField label="Y" value={selectedLayer.y} onChange={(y) => onChange({ y })} />
            <NumberField label="Width" value={selectedLayer.width} min={10} onChange={(width) => onChange({ width })} />
            <NumberField label="Height" value={selectedLayer.height} min={10} onChange={(height) => onChange({ height })} />
          </div>

          <NumberField label="Rotation" value={selectedLayer.rotation} min={-360} max={360} onChange={(rotation) => onChange({ rotation })} />
          <label className="csv4-field"><span>Opacity</span><input type="range" min="0" max="1" step="0.01" value={selectedLayer.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} /></label>
        </div>
      )}
    </aside>
  );
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "Stored with your account";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
