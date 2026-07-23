import React from "react";

export default function ImagePlacementModal({ open, asset, onClose, onLayer, onCanvas }) {
  if (!open || !asset) return null;
  return <div className="csv4-placement-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="csv4-placement-modal" role="dialog" aria-modal="true" aria-labelledby="csv4-placement-title">
      <div className="csv4-placement-modal__header"><div><strong id="csv4-placement-title">How should this image be added?</strong><span>{asset.filename || "Selected Library image"}</span></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="csv4-placement-modal__preview"><img src={asset.url} alt="Selected Library asset preview" /></div>
      <div className="csv4-placement-modal__choices">
        <button type="button" onClick={onLayer}><span className="csv4-placement-modal__icon">▧</span><strong>Add as Layer</strong><small>Keep the current canvas size and place the image as an editable layer.</small></button>
        <button type="button" onClick={onCanvas}><span className="csv4-placement-modal__icon">▣</span><strong>Use Image Dimensions</strong><small>Resize the canvas to the image’s natural width and height and use it as the base.</small></button>
      </div>
    </section>
  </div>;
}
