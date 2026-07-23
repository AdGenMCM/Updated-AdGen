import React, { useState } from "react";
import { AD_ELEMENT_PRESETS } from "../data/adElementPresets";

const SHAPES = [
  { type: "rect", label: "Rectangle", icon: "□" },
  { type: "roundedRect", label: "Rounded", icon: "▢" },
  { type: "circle", label: "Circle", icon: "○" },
  { type: "triangle", label: "Triangle", icon: "△" },
  { type: "line", label: "Line", icon: "—" },
  { type: "arrow", label: "Arrow", icon: "→" },
  { type: "star", label: "Star", icon: "☆" },
];

export default function EditorToolbar({
  onAddText, onAddShape, onAddAdElement, onCreateFromImage, onAddImageLayer, onImportFromLibrary, onOpenBrandKit,
  onDelete, onDuplicate, onBringForward, onSendBackward,
  onGroup, onUngroup, hasSelection, canGroup, canUngroup, disabled,
}) {
  const [openPicker, setOpenPicker] = useState(null);
  const chooseShape = (type) => { onAddShape(type); setOpenPicker(null); };
  const chooseElement = (type) => { onAddAdElement(type); setOpenPicker(null); };
  const chooseImageAction = (action) => {
    if (action === "canvas") onCreateFromImage();
    else if (action === "library") onImportFromLibrary();
    else onAddImageLayer();
    setOpenPicker(null);
  };

  return (
    <aside className="csv4-toolbar" aria-label="Editor tools">
      <div className="csv4-toolbar__brand">CS</div>
      <button type="button" onClick={onAddText} title="Add text" disabled={disabled}><span className="csv4-toolbar__icon">T</span><span>Text</span></button>

      <PickerButton label="Shapes" icon="◇" open={openPicker === "shapes"} onToggle={() => setOpenPicker((value) => value === "shapes" ? null : "shapes")}>
        <strong>Shapes</strong>
        <div className="csv4-shape-picker__grid">
          {SHAPES.map((shape) => <button key={shape.type} type="button" onClick={() => chooseShape(shape.type)}><span>{shape.icon}</span><small>{shape.label}</small></button>)}
        </div>
      </PickerButton>

      <PickerButton label="Ad Elements" shortLabel="Elements" icon="✦" open={openPicker === "elements"} onToggle={() => setOpenPicker((value) => value === "elements" ? null : "elements")} wide>
        <strong>Ad Elements</strong>
        <p className="csv4-picker-description">Ready-made, fully editable promotional components.</p>
        <div className="csv4-shape-picker__grid csv4-shape-picker__grid--elements">
          {AD_ELEMENT_PRESETS.map((element) => <button key={element.type} type="button" onClick={() => chooseElement(element.type)}><span>{element.icon}</span><small>{element.label}</small></button>)}
        </div>
      </PickerButton>

      <PickerButton label="Images" icon="▧" open={openPicker === "images"} onToggle={() => setOpenPicker((value) => value === "images" ? null : "images")} wide>
        <strong>Images</strong>
        <p className="csv4-picker-description">Start at an image’s aspect ratio or add it as a movable layer.</p>
        <div className="csv4-image-action-list">
          <button type="button" onClick={() => chooseImageAction("canvas")}><span className="csv4-image-action-list__icon">▣</span><span><strong>Create from Image</strong><small>Resize the canvas to match the uploaded image.</small></span></button>
          <button type="button" onClick={() => chooseImageAction("layer")}><span className="csv4-image-action-list__icon">▧</span><span><strong>Add Image Layer</strong><small>Place an image over the current design.</small></span></button>
          <button type="button" onClick={() => chooseImageAction("library")}><span className="csv4-image-action-list__icon">▤</span><span><strong>Import from Library</strong><small>Use a generated image or previous upload without uploading it again.</small></span></button>
        </div>
      </PickerButton>

      <button type="button" onClick={onOpenBrandKit} title="Open Brand Assets"><span className="csv4-toolbar__icon">B</span><span>Brand</span></button>

      <div className="csv4-toolbar__divider" />
      <button type="button" onClick={onGroup} disabled={!canGroup} title="Group selected layers (Cmd/Ctrl+G)"><span className="csv4-toolbar__icon">⌘</span><span>Group</span></button>
      <button type="button" onClick={onUngroup} disabled={!canUngroup} title="Ungroup selected layers (Cmd/Ctrl+Shift+G)"><span className="csv4-toolbar__icon">⌁</span><span>Ungroup</span></button>
      <button type="button" onClick={onDuplicate} disabled={!hasSelection} title="Duplicate selected layers"><span className="csv4-toolbar__icon">⧉</span><span>Duplicate</span></button>
      <button type="button" onClick={onBringForward} disabled={!hasSelection} title="Bring selected layers forward"><span className="csv4-toolbar__icon">↑</span><span>Forward</span></button>
      <button type="button" onClick={onSendBackward} disabled={!hasSelection} title="Send selected layers backward"><span className="csv4-toolbar__icon">↓</span><span>Backward</span></button>
      <button type="button" className="csv4-toolbar__danger" onClick={onDelete} disabled={!hasSelection} title="Delete selected layers"><span className="csv4-toolbar__icon">×</span><span>Delete</span></button>
    </aside>
  );
}

function PickerButton({ label, shortLabel, icon, open, onToggle, children, wide = false }) {
  return (
    <div className="csv4-toolbar__picker-wrap">
      <button type="button" onClick={onToggle} className={open ? "is-active" : ""} title={label}><span className="csv4-toolbar__icon">{icon}</span><span>{shortLabel || label}</span></button>
      {open && <div className={`csv4-shape-picker${wide ? " csv4-shape-picker--wide" : ""}`}>{children}</div>}
    </div>
  );
}
