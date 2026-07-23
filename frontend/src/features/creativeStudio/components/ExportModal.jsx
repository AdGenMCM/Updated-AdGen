import React, { useState } from "react";

export default function ExportModal({ open, canvas, onClose, onExport, exporting }) {
  const [format, setFormat] = useState("png");
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(0.92);
  if (!open) return null;
  const supportsQuality = format === "jpeg" || format === "webp";
  return <div className="csv4-project-backdrop" role="dialog" aria-modal="true" aria-label="Export design">
    <div className="csv4-export-modal">
      <header><div><span>Projects & Export</span><h2>Export design</h2><p>Download a production-ready copy without changing your editable project.</p></div><button type="button" onClick={onClose}>×</button></header>
      <div className="csv4-export-modal__body">
        <label>File format<select value={format} onChange={(e) => setFormat(e.target.value)}><option value="png">PNG — best for transparency</option><option value="jpeg">JPG — smaller file</option><option value="webp">WebP — web optimized</option></select></label>
        <label>Export scale<select value={scale} onChange={(e) => setScale(Number(e.target.value))}><option value={1}>1× — {canvas.width} × {canvas.height}</option><option value={2}>2× — {canvas.width * 2} × {canvas.height * 2}</option><option value={3}>3× — {canvas.width * 3} × {canvas.height * 3}</option></select></label>
        {supportsQuality && <label>Quality <span>{Math.round(quality * 100)}%</span><input type="range" min="0.4" max="1" step="0.02" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></label>}
        <div className="csv4-export-summary"><span>Output</span><strong>{canvas.width * scale} × {canvas.height * scale} {format.toUpperCase()}</strong>{canvas.transparent && format === "jpeg" && <small>JPG does not support transparency; transparent areas will export against white.</small>}</div>
      </div>
      <footer><button type="button" className="csv4-header-button" onClick={onClose}>Cancel</button><button type="button" className="csv4-header-button csv4-header-button--primary" disabled={exporting} onClick={() => onExport({ format, scale, quality })}>{exporting ? "Exporting..." : "Download export"}</button></footer>
    </div>
  </div>;
}
