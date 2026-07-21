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
  onAddText,
  onAddShape,
  onAddAdElement,
  onCreateFromImage,
  onAddImageLayer,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  hasSelection,
}) {
  const [openPicker, setOpenPicker] = useState(null);

  const chooseShape = (type) => {
    onAddShape(type);
    setOpenPicker(null);
  };

  const chooseElement = (type) => {
    onAddAdElement(type);
    setOpenPicker(null);
  };

  const chooseImageAction = (action) => {
    if (action === "canvas") onCreateFromImage();
    else onAddImageLayer();
    setOpenPicker(null);
  };

  return (
    <aside className="csv4-toolbar" aria-label="Editor tools">
      <div className="csv4-toolbar__brand">CS</div>

      <button type="button" onClick={onAddText} title="Add text">
        <span className="csv4-toolbar__icon">T</span>
        <span>Text</span>
      </button>

      <PickerButton
        label="Shapes"
        icon="◇"
        open={openPicker === "shapes"}
        onToggle={() =>
          setOpenPicker((value) => (value === "shapes" ? null : "shapes"))
        }
      >
        <strong>Shapes</strong>
        <div className="csv4-shape-picker__grid">
          {SHAPES.map((shape) => (
            <button
              key={shape.type}
              type="button"
              onClick={() => chooseShape(shape.type)}
            >
              <span>{shape.icon}</span>
              <small>{shape.label}</small>
            </button>
          ))}
        </div>
      </PickerButton>

      <PickerButton
        label="Ad Elements"
        shortLabel="Elements"
        icon="✦"
        open={openPicker === "elements"}
        onToggle={() =>
          setOpenPicker((value) => (value === "elements" ? null : "elements"))
        }
        wide
      >
        <strong>Ad Elements</strong>
        <p className="csv4-picker-description">
          Ready-made, fully editable promotional components.
        </p>
        <div className="csv4-shape-picker__grid csv4-shape-picker__grid--elements">
          {AD_ELEMENT_PRESETS.map((element) => (
            <button
              key={element.type}
              type="button"
              onClick={() => chooseElement(element.type)}
            >
              <span>{element.icon}</span>
              <small>{element.label}</small>
            </button>
          ))}
        </div>
      </PickerButton>

      <PickerButton
        label="Images"
        icon="▧"
        open={openPicker === "images"}
        onToggle={() =>
          setOpenPicker((value) => (value === "images" ? null : "images"))
        }
        wide
      >
        <strong>Images</strong>
        <p className="csv4-picker-description">
          Start a design at the image&apos;s aspect ratio or add it as a movable layer.
        </p>
        <div className="csv4-image-action-list">
          <button type="button" onClick={() => chooseImageAction("canvas")}>
            <span className="csv4-image-action-list__icon">▣</span>
            <span>
              <strong>Create from Image</strong>
              <small>Resize the canvas to match the uploaded image.</small>
            </span>
          </button>
          <button type="button" onClick={() => chooseImageAction("layer")}>
            <span className="csv4-image-action-list__icon">▧</span>
            <span>
              <strong>Add Image Layer</strong>
              <small>Place an image over the current design.</small>
            </span>
          </button>
        </div>
      </PickerButton>

      <div className="csv4-toolbar__divider" />

      <button type="button" onClick={onDuplicate} disabled={!hasSelection} title="Duplicate selected layer">
        <span className="csv4-toolbar__icon">⧉</span>
        <span>Duplicate</span>
      </button>
      <button type="button" onClick={onBringForward} disabled={!hasSelection} title="Bring selected layer forward">
        <span className="csv4-toolbar__icon">↑</span>
        <span>Forward</span>
      </button>
      <button type="button" onClick={onSendBackward} disabled={!hasSelection} title="Send selected layer backward">
        <span className="csv4-toolbar__icon">↓</span>
        <span>Backward</span>
      </button>
      <button type="button" className="csv4-toolbar__danger" onClick={onDelete} disabled={!hasSelection} title="Delete selected layer">
        <span className="csv4-toolbar__icon">×</span>
        <span>Delete</span>
      </button>
    </aside>
  );
}

function PickerButton({ label, shortLabel, icon, open, onToggle, children, wide = false }) {
  return (
    <div className="csv4-toolbar__picker-wrap">
      <button type="button" onClick={onToggle} className={open ? "is-active" : ""} title={label}>
        <span className="csv4-toolbar__icon">{icon}</span>
        <span>{shortLabel || label}</span>
      </button>
      {open && (
        <div className={`csv4-shape-picker${wide ? " csv4-shape-picker--wide" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}
