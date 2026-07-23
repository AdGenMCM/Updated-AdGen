import React, { useMemo, useState } from "react";
import {
  PROJECT_BACKGROUNDS,
  PROJECT_FORMATS,
  PROJECT_LAYOUTS,
  PROJECT_STYLES,
} from "../data/projectTemplates";

const STEPS = ["Size", "Layout", "Style", "Background", "Name"];

export default function TemplateGallery({ onBack, onCreate }) {
  const [step, setStep] = useState(0);
  const [formatId, setFormatId] = useState(PROJECT_FORMATS[0].id);
  const [layoutId, setLayoutId] = useState("product-focus");
  const [styleId, setStyleId] = useState(PROJECT_STYLES[0].id);
  const [backgroundId, setBackgroundId] = useState("solid");
  const [projectName, setProjectName] = useState("");
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);

  const format = useMemo(() => PROJECT_FORMATS.find((item) => item.id === formatId) || PROJECT_FORMATS[0], [formatId]);
  const style = useMemo(() => PROJECT_STYLES.find((item) => item.id === styleId) || PROJECT_STYLES[0], [styleId]);
  const width = formatId === "custom" ? Number(customWidth) || 1080 : format.width;
  const height = formatId === "custom" ? Number(customHeight) || 1080 : format.height;

  const finish = () => onCreate({
    formatId,
    layoutId,
    styleId,
    backgroundId,
    projectName: projectName.trim() || `${format.name} design`,
    customWidth,
    customHeight,
  });

  const previewStyle = backgroundId === "transparent"
    ? { backgroundColor: "transparent" }
    : { backgroundColor: style.background };

  return (
    <main className="csv4 csv4-wizard-page">
      <header className="csv4-wizard-header">
        <div>
          <button type="button" className="csv4-back-link" onClick={onBack}>← Projects</button>
          <span className="csv4__eyebrow">Create New Project</span>
          <h1>Build your starting design</h1>
          <p>Choose the canvas, layout, visual direction, and editable background before entering the editor.</p>
        </div>
      </header>

      <nav className="csv4-wizard-steps" aria-label="Project setup steps">
        {STEPS.map((label, index) => (
          <button
            type="button"
            key={label}
            className={`${index === step ? "is-active" : ""} ${index < step ? "is-complete" : ""}`}
            onClick={() => setStep(index)}
          >
            <span>{index < step ? "✓" : index + 1}</span>
            <b>{label}</b>
          </button>
        ))}
      </nav>

      <div className="csv4-wizard-body">
        <section className="csv4-wizard-options">
          {step === 0 && (
            <>
              <div className="csv4-wizard-copy"><h2>What are you creating?</h2><p>Select the destination format first. You can still resize later inside the editor.</p></div>
              <div className="csv4-choice-grid csv4-choice-grid--formats">
                {PROJECT_FORMATS.map((item) => (
                  <button type="button" key={item.id} className={formatId === item.id ? "is-selected" : ""} onClick={() => setFormatId(item.id)}>
                    <span className="csv4-format-icon" style={{ aspectRatio: `${item.width}/${item.height}` }} />
                    <strong>{item.name}</strong>
                    <small>{item.id === "custom" ? "Your dimensions" : `${item.width} × ${item.height}`}</small>
                    <em>{item.description}</em>
                  </button>
                ))}
              </div>
              {formatId === "custom" && <div className="csv4-wizard-custom"><label>Width<input type="number" min="90" max="4096" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} /></label><span>×</span><label>Height<input type="number" min="90" max="4096" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} /></label></div>}
            </>
          )}

          {step === 1 && (
            <>
              <div className="csv4-wizard-copy"><h2>Choose a layout</h2><p>This controls the arrangement of editable text, CTA, and image-placeholder layers.</p></div>
              <div className="csv4-choice-grid csv4-choice-grid--layouts">
                {PROJECT_LAYOUTS.map((item) => (
                  <button type="button" key={item.id} className={layoutId === item.id ? "is-selected" : ""} onClick={() => setLayoutId(item.id)}>
                    <span className={`csv4-layout-thumb csv4-layout-thumb--${item.id}`}><i /><i /><i /></span>
                    <strong>{item.name}</strong><em>{item.description}</em>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="csv4-wizard-copy"><h2>Choose a visual style</h2><p>Style changes the palette, spacing feel, radii, and overall creative direction without changing the layout.</p></div>
              <div className="csv4-choice-grid csv4-choice-grid--styles">
                {PROJECT_STYLES.map((item) => (
                  <button type="button" key={item.id} className={styleId === item.id ? "is-selected" : ""} onClick={() => setStyleId(item.id)}>
                    <span className="csv4-style-swatch" style={{ background: item.background }}><i style={{ background: item.surface }} /><b style={{ background: item.accent }} /><em style={{ color: item.text }}>Aa</em></span>
                    <strong>{item.name}</strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="csv4-wizard-copy"><h2>Choose an editable background</h2><p>These are real canvas layers. You can recolor, move, hide, or delete them in the editor.</p></div>
              <div className="csv4-choice-grid csv4-choice-grid--backgrounds">
                {PROJECT_BACKGROUNDS.map((item) => (
                  <button type="button" key={item.id} className={backgroundId === item.id ? "is-selected" : ""} onClick={() => setBackgroundId(item.id)}>
                    <span className={`csv4-background-thumb csv4-background-thumb--${item.id}`} style={{ "--bg": style.background, "--surface": style.surface, "--accent": style.accent }}><i /><b /><em /></span>
                    <strong>{item.name}</strong><em>{item.description}</em>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <div className="csv4-wizard-name-step">
              <div className="csv4-wizard-copy"><h2>Name your project</h2><p>This name appears in the editor and on the Projects page. You can rename it later without creating a duplicate.</p></div>
              <label>Project name<input autoFocus value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} placeholder={`${format.name} design`} onKeyDown={(event) => { if (event.key === "Enter") finish(); }} /></label>
              <div className="csv4-wizard-summary"><span><b>Size</b>{width} × {height}</span><span><b>Layout</b>{PROJECT_LAYOUTS.find((item) => item.id === layoutId)?.name}</span><span><b>Style</b>{style.name}</span><span><b>Background</b>{PROJECT_BACKGROUNDS.find((item) => item.id === backgroundId)?.name}</span></div>
            </div>
          )}
        </section>

        <aside className="csv4-wizard-preview-panel">
          <div className={`csv4-wizard-preview ${backgroundId === "transparent" ? "is-transparent" : ""}`}>
            <div style={{ ...previewStyle, aspectRatio: `${width}/${height}` }} className={`csv4-wizard-preview__canvas csv4-wizard-preview__canvas--${backgroundId}`}>
              <span className="csv4-wizard-preview__surface" style={{ background: style.surface }} />
              <span className="csv4-wizard-preview__accent" style={{ background: style.accent }} />
              {layoutId !== "blank" && <><b style={{ color: style.text }}>Your campaign headline</b><em style={{ color: style.muted }}>Supporting message goes here.</em><i style={{ background: style.accent }}>CALL TO ACTION</i></>}
            </div>
          </div>
          <strong>{projectName.trim() || `${format.name} design`}</strong>
          <span>{width} × {height} · {style.name}</span>
        </aside>
      </div>

      <footer className="csv4-wizard-footer">
        <button type="button" className="csv4-header-button" onClick={() => step === 0 ? onBack() : setStep((value) => value - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
        <div><span>Step {step + 1} of {STEPS.length}</span>{step < STEPS.length - 1 ? <button type="button" className="csv4-header-button csv4-header-button--primary" onClick={() => setStep((value) => value + 1)}>Continue</button> : <button type="button" className="csv4-header-button csv4-header-button--primary" onClick={finish}>Open in Editor</button>}</div>
      </footer>
    </main>
  );
}
