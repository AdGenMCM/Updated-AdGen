import React, { useMemo, useState } from "react";

export default function BrandKitPanel({ open, kits, loading, error, selectedLayer, onClose, onRefresh, onAddLogo, onApplyColor, onApplyCanvasColor, onApplyFont }) {
  const [selectedKitId, setSelectedKitId] = useState("");
  const activeKit = useMemo(() => kits.find((kit) => kit.id === selectedKitId) || kits[0] || null, [kits, selectedKitId]);
  if (!open) return null;

  return (
    <div className="csv4-brand-panel" role="dialog" aria-modal="false" aria-label="Brand Assets">
      <div className="csv4-brand-panel__header">
        <div><strong>Brand Assets</strong><span>Apply your saved identity directly to this design.</span></div>
        <button type="button" onClick={onClose} aria-label="Close Brand Assets">×</button>
      </div>
      <div className="csv4-brand-panel__controls">
        <label><span>Brand Kit</span><select value={activeKit?.id || ""} onChange={(event) => setSelectedKitId(event.target.value)} disabled={!kits.length}>{kits.length ? kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>) : <option value="">No Brand Kits</option>}</select></label>
        <button type="button" onClick={onRefresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {error && <div className="csv4-brand-panel__error">{error}</div>}
      {!loading && !activeKit && <div className="csv4-brand-panel__empty"><strong>No Brand Kit found</strong><span>Create a Brand Kit first, then refresh this panel.</span></div>}
      {activeKit && <div className="csv4-brand-panel__body">
        <section>
          <div className="csv4-brand-panel__section-title"><strong>Logos</strong><span>Add as a transparent editable image layer.</span></div>
          {activeKit.logos.length ? <div className="csv4-brand-logo-grid">{activeKit.logos.map((logo) => <button key={logo.id} type="button" onClick={() => onAddLogo(logo)}><span className="csv4-brand-logo-grid__preview"><img src={logo.url} alt="" /></span><span>{logo.name}</span><small>Add logo</small></button>)}</div> : <p className="csv4-brand-panel__muted">No logo is saved in this Brand Kit.</p>}
        </section>
        <section>
          <div className="csv4-brand-panel__section-title"><strong>Brand colors</strong><span>Click a swatch to apply it contextually.</span></div>
          {activeKit.colors.length ? <div className="csv4-brand-color-list">{activeKit.colors.map((color) => <div key={color.id} className="csv4-brand-color-row"><button type="button" className="csv4-brand-color-swatch" style={{ background: color.value }} onClick={() => onApplyColor(color.value)} title={`Apply ${color.label}`} /><div><strong>{color.label}</strong><span>{color.value}</span></div><button type="button" onClick={() => onApplyColor(color.value)}>{selectedLayer ? "Apply to layer" : "Apply"}</button><button type="button" onClick={() => onApplyCanvasColor(color.value)}>Canvas</button></div>)}</div> : <p className="csv4-brand-panel__muted">No colors are saved in this Brand Kit.</p>}
        </section>
        <section>
          <div className="csv4-brand-panel__section-title"><strong>Brand fonts</strong><span>Select a text layer, then apply a saved font.</span></div>
          {activeKit.fonts.length ? <div className="csv4-brand-font-list">{activeKit.fonts.map((font) => <button key={`${font.role}-${font.value}`} type="button" onClick={() => onApplyFont(font.value)} disabled={!selectedLayer}><span>{font.label}</span><strong style={{ fontFamily: font.value }}>{font.value}</strong><small>{selectedLayer ? "Apply to selected text" : "Select a text layer first"}</small></button>)}</div> : <p className="csv4-brand-panel__muted">No fonts are saved in this Brand Kit.</p>}
        </section>
      </div>}
    </div>
  );
}
