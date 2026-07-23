import React, { useEffect, useMemo, useState } from "react";
import { CANVAS_PRESETS } from "../hooks/useEditor";
import { FONT_OPTIONS, FONT_WEIGHT_OPTIONS, TEXT_PRESETS } from "../data/typographyPresets";

const TEXT_TYPES = new Set(["text", "ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"]);
const FILL_TYPES = new Set(["text", "rect", "roundedRect", "circle", "triangle", "star", "ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"]);

function NumberField({ label, value, onChange, min, max, step = 1, disabled = false }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ColorField({ label, value, onChange, disabled = false }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({ label, value, onChange, rows = 2, disabled = false }) {
  return (
    <label className="csv4-field">
      <span>{label}</span>
      <textarea rows={rows} value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TypographyControls({ layer, onChange, disabled }) {
  const [presetId, setPresetId] = useState("");

  const applyPreset = (nextPresetId) => {
    setPresetId(nextPresetId);
    const preset = TEXT_PRESETS.find((item) => item.id === nextPresetId);
    if (preset) onChange(preset.updates);
  };

  return (
    <section className="csv4-typography-section">
      <div className="csv4-section-title">Typography</div>

      <label className="csv4-field">
        <span>Text preset</span>
        <select value={presetId} disabled={disabled} onChange={(event) => applyPreset(event.target.value)}>
          <option value="">Custom</option>
          {TEXT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>

      <label className="csv4-field">
        <span>Font</span>
        <select value={layer.fontFamily || FONT_OPTIONS[0].value} disabled={disabled} onChange={(event) => onChange({ fontFamily: event.target.value })}>
          {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
        </select>
      </label>

      <div className="csv4-properties__grid">
        <label className="csv4-field">
          <span>Weight</span>
          <select value={Number(layer.fontWeight || 700)} disabled={disabled} onChange={(event) => onChange({ fontWeight: Number(event.target.value) })}>
            {FONT_WEIGHT_OPTIONS.map((weight) => <option key={weight.value} value={weight.value}>{weight.label}</option>)}
          </select>
        </label>
        <label className="csv4-field">
          <span>Style</span>
          <select value={layer.fontStyleMode || "normal"} disabled={disabled} onChange={(event) => onChange({ fontStyleMode: event.target.value })}>
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </label>
      </div>

      <div className="csv4-properties__grid">
        <NumberField label="Font size" value={layer.fontSize} min={8} max={320} disabled={disabled} onChange={(fontSize) => onChange({ fontSize })} />
        <NumberField label="Letter spacing" value={layer.letterSpacing} min={-10} max={40} step={0.25} disabled={disabled} onChange={(letterSpacing) => onChange({ letterSpacing })} />
        <NumberField label="Line height" value={layer.lineHeight || 1} min={0.6} max={3} step={0.05} disabled={disabled} onChange={(lineHeight) => onChange({ lineHeight })} />
      </div>

      <div className="csv4-segmented" role="group" aria-label="Text alignment">
        {[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }, { value: "justify", label: "Justify" }].map((option) => (
          <button key={option.value} type="button" disabled={disabled} className={(layer.align || "left") === option.value ? "is-active" : ""} onClick={() => onChange({ align: option.value })}>{option.label}</button>
        ))}
      </div>

      <div className="csv4-properties__grid">
        <label className="csv4-field">
          <span>Text case</span>
          <select value={layer.textTransform || "none"} disabled={disabled} onChange={(event) => onChange({ textTransform: event.target.value })}>
            <option value="none">Original</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </label>
        <label className="csv4-field">
          <span>Decoration</span>
          <select value={layer.textDecoration || ""} disabled={disabled} onChange={(event) => onChange({ textDecoration: event.target.value })}>
            <option value="">None</option>
            <option value="underline">Underline</option>
            <option value="line-through">Strikethrough</option>
          </select>
        </label>
      </div>

      <div className="csv4-section-title">Text effects</div>
      <label className="csv4-check-field">
        <input type="checkbox" checked={Boolean(layer.textShadowEnabled)} disabled={disabled} onChange={(event) => onChange({ textShadowEnabled: event.target.checked })} />
        <span>Text shadow</span>
      </label>
      {layer.textShadowEnabled && (
        <div className="csv4-effect-box">
          <ColorField label="Shadow color" value={layer.textShadowColor || "#000000"} disabled={disabled} onChange={(textShadowColor) => onChange({ textShadowColor })} />
          <div className="csv4-properties__grid">
            <NumberField label="Blur" value={layer.textShadowBlur || 12} min={0} max={100} disabled={disabled} onChange={(textShadowBlur) => onChange({ textShadowBlur })} />
            <NumberField label="Opacity" value={layer.textShadowOpacity ?? 0.3} min={0} max={1} step={0.05} disabled={disabled} onChange={(textShadowOpacity) => onChange({ textShadowOpacity })} />
            <NumberField label="Offset X" value={layer.textShadowOffsetX || 0} min={-100} max={100} disabled={disabled} onChange={(textShadowOffsetX) => onChange({ textShadowOffsetX })} />
            <NumberField label="Offset Y" value={layer.textShadowOffsetY || 6} min={-100} max={100} disabled={disabled} onChange={(textShadowOffsetY) => onChange({ textShadowOffsetY })} />
          </div>
        </div>
      )}

      <label className="csv4-check-field">
        <input type="checkbox" checked={Boolean(layer.textOutlineEnabled)} disabled={disabled} onChange={(event) => onChange({ textOutlineEnabled: event.target.checked })} />
        <span>Text outline</span>
      </label>
      {layer.textOutlineEnabled && (
        <div className="csv4-effect-box">
          <ColorField label="Outline color" value={layer.textOutlineColor || "#ffffff"} disabled={disabled} onChange={(textOutlineColor) => onChange({ textOutlineColor })} />
          <NumberField label="Outline width" value={layer.textOutlineWidth || 2} min={0.5} max={20} step={0.5} disabled={disabled} onChange={(textOutlineWidth) => onChange({ textOutlineWidth })} />
        </div>
      )}
    </section>
  );
}

function CanvasSettings({ canvas, onCanvasChange, onResizeCanvas, onApplyPreset }) {
  const [width, setWidth] = useState(canvas.width);
  const [height, setHeight] = useState(canvas.height);
  const [scaleLayers, setScaleLayers] = useState(true);

  useEffect(() => { setWidth(canvas.width); setHeight(canvas.height); }, [canvas.height, canvas.width]);

  const activePreset = useMemo(
    () => CANVAS_PRESETS.find((preset) => preset.id === canvas.presetId)?.id || "custom",
    [canvas.presetId],
  );

  return (
    <div className="csv4-properties__body">
      <div className="csv4-section-title">Canvas</div>
      <label className="csv4-field">
        <span>Preset</span>
        <select value={activePreset} onChange={(event) => event.target.value !== "custom" && onApplyPreset(event.target.value, scaleLayers)}>
          <option value="custom">Custom size</option>
          {CANVAS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} — {preset.width} × {preset.height}</option>)}
        </select>
      </label>

      <div className="csv4-properties__grid">
        <NumberField label="Width" value={width} min={90} max={4096} onChange={setWidth} />
        <NumberField label="Height" value={height} min={90} max={4096} onChange={setHeight} />
      </div>

      <label className="csv4-check-field">
        <input type="checkbox" checked={scaleLayers} onChange={(event) => setScaleLayers(event.target.checked)} />
        <span>Scale layers with canvas</span>
      </label>

      <button type="button" className="csv4-properties-button" onClick={() => onResizeCanvas({ width, height, scaleLayers, presetId: "custom", safeZone: null })}>
        Resize design
      </button>

      <label className="csv4-check-field">
        <input type="checkbox" checked={Boolean(canvas.transparent)} onChange={(event) => onCanvasChange({ transparent: event.target.checked })} />
        <span>Transparent canvas</span>
      </label>

      {!canvas.transparent && <ColorField label="Background color" value={canvas.background || "#ffffff"} onChange={(background) => onCanvasChange({ background })} />}

      <div className="csv4-canvas-summary">
        <strong>{canvas.width} × {canvas.height}px</strong>
        <span>{canvas.transparent ? "Transparent background" : "Solid background"}</span>
      </div>
    </div>
  );
}


function ImageControls({ layer, onChange, onReplaceImage, onReplaceFromLibrary, disabled }) {
  const resetImageEdits = () => onChange({
    fit: "cover",
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageRotation: 0,
    flipX: false,
    flipY: false,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blurRadius: 0,
    filterPreset: "none",
    cornerRadius: 0,
    borderWidth: 0,
    borderColor: "#ffffff",
    borderStyle: "solid",
    shadowEnabled: false,
    shadowBlur: 20,
    shadowOpacity: 0.2,
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    shadowColor: "#000000",
  });

  return (
    <section className="csv4-image-edit-section">
      <div className="csv4-image-properties__summary">
        <strong>{layer.filename || "Image"}</strong>
        <span>{formatBytes(layer.sizeBytes)}</span>
      </div>

      <div className="csv4-image-edit-actions">
        <button type="button" className="csv4-properties-button" onClick={onReplaceImage} disabled={disabled}>Replace with upload</button>
        <button type="button" className="csv4-properties-button" onClick={onReplaceFromLibrary} disabled={disabled}>Replace from Library</button>
        <button type="button" className="csv4-properties-button csv4-properties-button--secondary csv4-image-edit-actions__wide" onClick={resetImageEdits} disabled={disabled}>Reset image edits</button>
      </div>

      <div className="csv4-section-title">Crop & position</div>
      <label className="csv4-field">
        <span>Image fit</span>
        <select value={layer.fit || "cover"} disabled={disabled} onChange={(event) => onChange({ fit: event.target.value, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })}>
          <option value="cover">Fill frame</option>
          <option value="contain">Fit inside</option>
          <option value="stretch">Stretch</option>
        </select>
      </label>

      <RangeField label="Image zoom" value={Number(layer.imageScale || 1)} min={0.1} max={5} step={0.05} suffix="×" disabled={disabled} onChange={(imageScale) => onChange({ imageScale })} />
      <div className="csv4-properties__grid">
        <NumberField label="Horizontal position" value={layer.imageOffsetX || 0} min={-4096} max={4096} disabled={disabled} onChange={(imageOffsetX) => onChange({ imageOffsetX })} />
        <NumberField label="Vertical position" value={layer.imageOffsetY || 0} min={-4096} max={4096} disabled={disabled} onChange={(imageOffsetY) => onChange({ imageOffsetY })} />
      </div>
      <NumberField label="Image rotation" value={layer.imageRotation || 0} min={-360} max={360} disabled={disabled} onChange={(imageRotation) => onChange({ imageRotation })} />

      <div className="csv4-segmented" role="group" aria-label="Flip image">
        <button type="button" disabled={disabled} className={layer.flipX ? "is-active" : ""} onClick={() => onChange({ flipX: !layer.flipX })}>Flip horizontal</button>
        <button type="button" disabled={disabled} className={layer.flipY ? "is-active" : ""} onClick={() => onChange({ flipY: !layer.flipY })}>Flip vertical</button>
      </div>

      <label className="csv4-check-field">
        <input type="checkbox" checked={layer.lockAspectRatio !== false} disabled={disabled} onChange={(event) => onChange({ lockAspectRatio: event.target.checked })} />
        <span>Lock frame aspect ratio</span>
      </label>

      <div className="csv4-section-title">Adjustments</div>
      <label className="csv4-field">
        <span>Filter</span>
        <select value={layer.filterPreset || "none"} disabled={disabled} onChange={(event) => onChange({ filterPreset: event.target.value })}>
          <option value="none">None</option>
          <option value="grayscale">Grayscale</option>
          <option value="sepia">Sepia</option>
          <option value="invert">Invert</option>
        </select>
      </label>
      <RangeField label="Brightness" value={Number(layer.brightness || 0)} min={-100} max={100} step={1} suffix="%" disabled={disabled} onChange={(brightness) => onChange({ brightness })} />
      <RangeField label="Contrast" value={Number(layer.contrast || 0)} min={-100} max={100} step={1} suffix="%" disabled={disabled} onChange={(contrast) => onChange({ contrast })} />
      <RangeField label="Saturation" value={Number(layer.saturation || 0)} min={-1} max={1} step={0.05} disabled={disabled} onChange={(saturation) => onChange({ saturation })} />
      <RangeField label="Blur" value={Number(layer.blurRadius || 0)} min={0} max={100} step={1} suffix="px" disabled={disabled} onChange={(blurRadius) => onChange({ blurRadius })} />

      <div className="csv4-section-title">Frame & border</div>
      <NumberField label="Corner radius" value={layer.cornerRadius || 0} min={0} max={500} disabled={disabled} onChange={(cornerRadius) => onChange({ cornerRadius })} />
      <div className="csv4-properties__grid">
        <NumberField label="Border width" value={layer.borderWidth || 0} min={0} max={80} disabled={disabled} onChange={(borderWidth) => onChange({ borderWidth })} />
        <label className="csv4-field">
          <span>Border style</span>
          <select value={layer.borderStyle || "solid"} disabled={disabled || !(layer.borderWidth > 0)} onChange={(event) => onChange({ borderStyle: event.target.value })}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
        </label>
      </div>
      {(layer.borderWidth || 0) > 0 && <ColorField label="Border color" value={layer.borderColor || "#ffffff"} disabled={disabled} onChange={(borderColor) => onChange({ borderColor })} />}

      <label className="csv4-check-field">
        <input type="checkbox" checked={Boolean(layer.shadowEnabled)} disabled={disabled} onChange={(event) => onChange({ shadowEnabled: event.target.checked })} />
        <span>Drop shadow</span>
      </label>
      {layer.shadowEnabled && (
        <div className="csv4-effect-box">
          <ColorField label="Shadow color" value={layer.shadowColor || "#000000"} disabled={disabled} onChange={(shadowColor) => onChange({ shadowColor })} />
          <div className="csv4-properties__grid">
            <NumberField label="Blur" value={layer.shadowBlur || 20} min={0} max={100} disabled={disabled} onChange={(shadowBlur) => onChange({ shadowBlur })} />
            <NumberField label="Opacity" value={layer.shadowOpacity ?? 0.2} min={0} max={1} step={0.05} disabled={disabled} onChange={(shadowOpacity) => onChange({ shadowOpacity })} />
            <NumberField label="Offset X" value={layer.shadowOffsetX || 0} min={-200} max={200} disabled={disabled} onChange={(shadowOffsetX) => onChange({ shadowOffsetX })} />
            <NumberField label="Offset Y" value={layer.shadowOffsetY || 0} min={-200} max={200} disabled={disabled} onChange={(shadowOffsetY) => onChange({ shadowOffsetY })} />
          </div>
        </div>
      )}
    </section>
  );
}

function RangeField({ label, value, min, max, step, suffix = "", disabled = false, onChange }) {
  return (
    <label className="csv4-field csv4-range-field">
      <span><span>{label}</span><strong>{Number(value).toFixed(step < 1 ? 2 : 0)}{suffix}</strong></span>
      <input type="range" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function PropertiesPanel({
  canvas,
  selectedLayer,
  selectedCount,
  onChange,
  onReplaceImage,
  onReplaceFromLibrary,
  onCanvasChange,
  onResizeCanvas,
  onApplyPreset,
}) {
  const locked = Boolean(selectedLayer?.locked);

  return (
    <aside className="csv4-panel csv4-properties">
      <div className="csv4-panel__header">
        <strong>Properties</strong>
        {selectedCount > 1 ? <span>{selectedCount} selected</span> : selectedLayer?.name && <span>{selectedLayer.name}</span>}
      </div>

      {!selectedLayer ? (
        selectedCount > 1 ? (
          <div className="csv4-empty">Multiple layers are selected. Move, group, duplicate, reorder, or delete them together.</div>
        ) : (
          <CanvasSettings canvas={canvas} onCanvasChange={onCanvasChange} onResizeCanvas={onResizeCanvas} onApplyPreset={onApplyPreset} />
        )
      ) : (
        <div className="csv4-properties__body">
          {locked && <div className="csv4-locked-notice">Unlock this layer in the Layers panel to edit it.</div>}

          {selectedLayer.type === "image" && (
            <ImageControls
              layer={selectedLayer}
              onChange={onChange}
              onReplaceImage={onReplaceImage}
              onReplaceFromLibrary={onReplaceFromLibrary}
              disabled={locked}
            />
          )}

          {selectedLayer.type === "productCard" && <><TextField label="Title" value={selectedLayer.title} disabled={locked} onChange={(title) => onChange({ title })} /><TextField label="Description" value={selectedLayer.text} disabled={locked} onChange={(text) => onChange({ text })} rows={3} /><TextField label="Price" value={selectedLayer.price} disabled={locked} onChange={(price) => onChange({ price })} rows={1} /></>}
          {selectedLayer.type === "priceTag" && <><TextField label="Price" value={selectedLayer.text} disabled={locked} onChange={(text) => onChange({ text })} rows={1} /><TextField label="Supporting text" value={selectedLayer.subtext} disabled={locked} onChange={(subtext) => onChange({ subtext })} rows={1} /></>}
          {TEXT_TYPES.has(selectedLayer.type) && !["productCard", "priceTag", "ratingStars"].includes(selectedLayer.type) && <TextField label="Text" value={selectedLayer.text} disabled={locked} onChange={(text) => onChange({ text })} rows={selectedLayer.type === "saleBadge" ? 3 : 2} />}
          {selectedLayer.type === "ratingStars" && <><NumberField label="Rating" value={selectedLayer.rating} min={1} max={5} disabled={locked} onChange={(rating) => onChange({ rating })} /><TextField label="Rating label" value={selectedLayer.text} disabled={locked} onChange={(text) => onChange({ text })} rows={1} /><label className="csv4-check-field"><input type="checkbox" checked={selectedLayer.showRatingText !== false} disabled={locked} onChange={(event) => onChange({ showRatingText: event.target.checked })} /><span>Show rating label</span></label></>}
          {TEXT_TYPES.has(selectedLayer.type) && <TypographyControls layer={selectedLayer} onChange={onChange} disabled={locked} />}
          {FILL_TYPES.has(selectedLayer.type) && <ColorField label={selectedLayer.type === "ratingStars" ? "Star color" : "Fill"} value={selectedLayer.fill || "#2563eb"} disabled={locked} onChange={(fill) => onChange({ fill })} />}
          {selectedLayer.textColor && <ColorField label="Text color" value={selectedLayer.textColor} disabled={locked} onChange={(textColor) => onChange({ textColor })} />}
          {selectedLayer.accentColor && <ColorField label="Accent color" value={selectedLayer.accentColor} disabled={locked} onChange={(accentColor) => onChange({ accentColor })} />}
          {["line", "arrow", "frame"].includes(selectedLayer.type) && <><ColorField label="Stroke" value={selectedLayer.stroke || "#2563eb"} disabled={locked} onChange={(stroke) => onChange({ stroke })} /><NumberField label="Stroke width" value={selectedLayer.strokeWidth} min={1} max={80} disabled={locked} onChange={(strokeWidth) => onChange({ strokeWidth })} /></>}
          {["roundedRect", "ctaButton", "promoPill", "productCard", "frame"].includes(selectedLayer.type) && <NumberField label="Corner radius" value={selectedLayer.cornerRadius} min={0} max={240} disabled={locked} onChange={(cornerRadius) => onChange({ cornerRadius })} />}

          <div className="csv4-properties__grid">
            <NumberField label="X" value={selectedLayer.x} disabled={locked} onChange={(x) => onChange({ x })} />
            <NumberField label="Y" value={selectedLayer.y} disabled={locked} onChange={(y) => onChange({ y })} />
            <NumberField label="Width" value={selectedLayer.width} min={10} disabled={locked} onChange={(width) => onChange({ width })} />
            <NumberField label="Height" value={selectedLayer.height} min={10} disabled={locked} onChange={(height) => onChange({ height })} />
          </div>
          <NumberField label="Rotation" value={selectedLayer.rotation} min={-360} max={360} disabled={locked} onChange={(rotation) => onChange({ rotation })} />
          <label className="csv4-field"><span>Opacity</span><input type="range" min="0" max="1" step="0.01" value={selectedLayer.opacity} disabled={locked} onChange={(event) => onChange({ opacity: Number(event.target.value) })} /></label>
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
