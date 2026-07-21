import React, { useEffect, useRef, useState } from "react";

import EditorToolbar from "./EditorToolbar";
import ImageUploadModal from "./ImageUploadModal";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import KonvaCanvas from "../canvas/KonvaCanvas";
import useEditor from "../hooks/useEditor";
import { serializeProject } from "../services/imageAssetService";

const IMAGE_UPLOAD_MODES = {
  CANVAS: "canvas",
  LAYER: "layer",
  REPLACE: "replace",
};

export default function Editor({
  uploadImageAsset,
  saveProject,
  initialAsset = null,
  initialProject = null,
  sourceImageJobId = "",
  initialTitle = "Creative Studio design",
  storageUsedBytes = 0,
  storageLimitBytes = 0,
}) {
  const editor = useEditor({ initialProject });
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [uploadMode, setUploadMode] = useState(IMAGE_UPLOAD_MODES.LAYER);
  const [uploadError, setUploadError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const initialAssetIdRef = useRef(null);

  useEffect(() => {
    if (!initialAsset || initialAssetIdRef.current === initialAsset.id) return;

    initialAssetIdRef.current = initialAsset.id;

    if (initialProject?.layers?.length) {
      return;
    }

    editor.createFromImageAsset(initialAsset);
  }, [editor, initialAsset, initialProject]);

  const processImageFile = async (file, mode) => {
    if (!file || uploading) return;

    try {
      setUploading(true);
      setUploadError("");
      setSaveNotice("");
      const asset = await uploadImageAsset(file);

      if (mode === IMAGE_UPLOAD_MODES.REPLACE) {
        editor.replaceSelectedImage(asset);
      } else if (mode === IMAGE_UPLOAD_MODES.CANVAS) {
        editor.createFromImageAsset(asset);
        setZoom(1);
      } else {
        editor.addImageAsset(asset);
      }

      setShowUploadModal(false);
    } catch (error) {
      setUploadError(error?.message || "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const beginImageUpload = (mode) => {
    setUploadMode(mode);

    const hideNotice =
      window.localStorage.getItem("creativeStudioHideStorageNotice") === "true";

    if (hideNotice || noticeAccepted || mode === IMAGE_UPLOAD_MODES.REPLACE) {
      fileInputRef.current?.click();
      return;
    }

    setShowUploadModal(true);
  };

  const handleSave = async () => {
    if (!saveProject || saving) return;

    try {
      setSaving(true);
      setSaveNotice("");
      setUploadError("");

      editor.clearSelection();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      const dataUrl = canvasRef.current?.toDataURL({ pixelRatio: 1 });
      if (!dataUrl) throw new Error("The canvas could not be rendered.");

      const blob = await (await fetch(dataUrl)).blob();
      const project = serializeProject(editor.canvas, editor.layers);

      await saveProject({
        blob,
        project,
        title,
        sourceImageJobId,
      });

      setSaveNotice("Saved to your Library ✓");
    } catch (error) {
      setUploadError(error?.message || "The design could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="csv4">
      <header className="csv4__header">

        <div className="csv4__header-actions">
          <input
            className="csv4-title-input"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Design title"
          />
          <button type="button" className="csv4-header-button" onClick={editor.undo} disabled={!editor.canUndo}>
            Undo
          </button>
          <button type="button" className="csv4-header-button" onClick={editor.redo} disabled={!editor.canRedo}>
            Redo
          </button>
          <button type="button" className="csv4-header-button csv4-header-button--primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save to Library"}
          </button>
          <div className="csv4__status">
            <span className="csv4__status-dot" />
            Live storage
          </div>
        </div>
      </header>

      {uploadError && <div className="csv4-upload-error">{uploadError}</div>}
      {saveNotice && <div className="csv4-save-notice">{saveNotice}</div>}

      <div className="csv4__workspace">
        <EditorToolbar
          onAddText={editor.addText}
          onAddShape={editor.addShape}
          onAddAdElement={editor.addAdElement}
          onCreateFromImage={() => beginImageUpload(IMAGE_UPLOAD_MODES.CANVAS)}
          onAddImageLayer={() => beginImageUpload(IMAGE_UPLOAD_MODES.LAYER)}
          onDelete={editor.deleteSelected}
          onDuplicate={editor.duplicateSelected}
          onBringForward={editor.bringForward}
          onSendBackward={editor.sendBackward}
          hasSelection={Boolean(editor.selectedLayer)}
          disabled={uploading}
        />

        <LayersPanel
          layers={editor.layers}
          selectedLayerId={editor.selectedLayerId}
          onSelect={editor.selectLayer}
        />

        <section className="csv4__stage-shell">
          <CanvasTopbar
            zoom={zoom}
            onZoomChange={setZoom}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled((current) => !current)}
          />
          <KonvaCanvas
            ref={canvasRef}
            canvas={editor.canvas}
            layers={editor.layers}
            selectedLayerId={editor.selectedLayerId}
            zoom={zoom}
            snapEnabled={snapEnabled}
            onSelectLayer={editor.selectLayer}
            onClearSelection={editor.clearSelection}
            onCommitLayer={editor.updateLayer}
          />
        </section>

        <PropertiesPanel
          selectedLayer={editor.selectedLayer}
          onChange={editor.updateSelectedLayer}
          onReplaceImage={() => beginImageUpload(IMAGE_UPLOAD_MODES.REPLACE)}
        />
      </div>

      <input
        ref={fileInputRef}
        className="csv4-visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) processImageFile(file, uploadMode);
        }}
      />

      <ImageUploadModal
        open={showUploadModal}
        mode={uploadMode}
        onClose={() => setShowUploadModal(false)}
        onChooseFile={(file) => {
          setNoticeAccepted(true);
          processImageFile(file, uploadMode);
        }}
        storageUsedBytes={storageUsedBytes}
        storageLimitBytes={storageLimitBytes}
        uploading={uploading}
      />

      {uploading && (
        <div className="csv4-upload-loading" role="status" aria-live="polite">
          <div className="csv4-upload-loading__card">
            <span className="csv4-spinner" aria-hidden="true" />
            <div>
              <strong>Uploading image</strong>
              <span>Adding it to your Creative Studio and Library...</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CanvasTopbar({ zoom, onZoomChange, snapEnabled, onToggleSnap }) {
  const zoomOut = () =>
    onZoomChange((current) =>
      Math.max(0.25, Number((current - 0.25).toFixed(2))),
    );
  const zoomIn = () =>
    onZoomChange((current) =>
      Math.min(2, Number((current + 0.25).toFixed(2))),
    );

  return (
    <div className="csv4-canvas-topbar">
      <button type="button" onClick={zoomOut} aria-label="Zoom out">
        −
      </button>
      <button
        type="button"
        className="csv4-canvas-topbar__zoom"
        onClick={() => onZoomChange(1)}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={zoomIn} aria-label="Zoom in">
        +
      </button>
      <span className="csv4-canvas-topbar__divider" />
      <button
        type="button"
        className={snapEnabled ? "is-active" : ""}
        onClick={onToggleSnap}
      >
        Snap
      </button>
    </div>
  );
}
