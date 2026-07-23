import React, { useMemo, useState } from "react";
import { PROJECT_TEMPLATE_CATEGORIES, PROJECT_TEMPLATES } from "../data/projectTemplates";

export default function NewProjectModal({ open, onClose, onCreate, required = false }) {
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState(PROJECT_TEMPLATES[0].id);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [customOpen, setCustomOpen] = useState(false);
  const templates = useMemo(() => category === "All" ? PROJECT_TEMPLATES : PROJECT_TEMPLATES.filter((item) => item.category === category), [category]);
  const selected = PROJECT_TEMPLATES.find((item) => item.id === selectedId) || PROJECT_TEMPLATES[0];
  if (!open) return null;

  const createCustom = () => onCreate({
    id: "custom", name: "Custom Design", category: "Blank", description: "Custom canvas",
    canvas: { width: Math.max(90, Math.min(4096, Number(customWidth) || 1080)), height: Math.max(90, Math.min(4096, Number(customHeight) || 1080)), background: "#ffffff", transparent: false, presetId: "custom", safeZone: null, guides: [] }, layers: [],
  });

  return <div className="csv4-project-backdrop" role="dialog" aria-modal="true" aria-label="Create new project">
    <div className="csv4-project-modal">
      <header className="csv4-project-modal__header">
        <div><span>Creative Studio</span><h2>Create a new project</h2><p>Choose a template first, then customize every layer in the editor.</p></div>
        {!required && <button type="button" onClick={onClose} aria-label="Close">×</button>}
      </header>
      <nav className="csv4-template-tabs" aria-label="Template categories">
        {PROJECT_TEMPLATE_CATEGORIES.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
        <button type="button" className={customOpen ? "is-active" : ""} onClick={() => setCustomOpen((value) => !value)}>Custom size</button>
      </nav>
      {customOpen && <div className="csv4-custom-project"><label>Width<input type="number" min="90" max="4096" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} /></label><span>×</span><label>Height<input type="number" min="90" max="4096" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} /></label><button type="button" onClick={createCustom}>Create custom canvas</button></div>}
      <div className="csv4-template-grid">
        {templates.map((template) => <button key={template.id} type="button" className={`csv4-template-card ${selectedId === template.id ? "is-selected" : ""}`} onClick={() => setSelectedId(template.id)} onDoubleClick={() => onCreate(template)}>
          <span className="csv4-template-card__preview" style={{ background: template.canvas.background }}><span style={{ aspectRatio: `${template.canvas.width}/${template.canvas.height}` }}><b>{template.name}</b></span></span>
          <span className="csv4-template-card__content"><strong>{template.name}</strong><small>{template.canvas.width} × {template.canvas.height}</small><em>{template.description}</em></span>
        </button>)}
      </div>
      <footer className="csv4-project-modal__footer"><div><strong>{selected.name}</strong><span>{selected.canvas.width} × {selected.canvas.height}</span></div><button type="button" className="csv4-header-button csv4-header-button--primary" onClick={() => onCreate(selected)}>Use this template</button></footer>
    </div>
  </div>;
}
