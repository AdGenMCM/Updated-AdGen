import React, { useEffect, useRef, useState } from "react";

import EditorToolbar from "./EditorToolbar";
import ImageUploadModal from "./ImageUploadModal";
import LibraryImageModal from "./LibraryImageModal";
import ImagePlacementModal from "./ImagePlacementModal";
import BrandKitPanel from "./BrandKitPanel";
import ExportModal from "./ExportModal";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import KonvaCanvas from "../canvas/KonvaCanvas";
import useEditor from "../hooks/useEditor";
import { serializeProject } from "../services/imageAssetService";
import { ensureBrandFontLoaded } from "../services/brandKitService";

const IMAGE_UPLOAD_MODES = {
  CANVAS: "canvas",
  LAYER: "layer",
  REPLACE: "replace",
};

export default function Editor({
  uploadImageAsset,
  fetchLibraryImages,
  hydrateLibraryAsset,
  fetchBrandKits,
  hydrateBrandLogo,
  saveProject,
  initialAsset = null,
  initialProject = null,
  sourceImageJobId = "",
  projectId = "",
  initialTitle = "Creative Studio design",
  storageUsedBytes = 0,
  storageLimitBytes = 0,
  startWithNewProject = false,
  onBackToProjects,
  onNewProject,
  onProjectSaved,
}) {
  const editor = useEditor({ initialProject });
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rulersEnabled, setRulersEnabled] = useState(true);
  const [guidesEnabled, setGuidesEnabled] = useState(true);
  const [safeZonesEnabled, setSafeZonesEnabled] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [libraryPicker, setLibraryPicker] = useState({ open: false, mode: IMAGE_UPLOAD_MODES.LAYER });
  const [libraryItems, setLibraryItems] = useState([]);
  const [pendingLibraryAsset, setPendingLibraryAsset] = useState(null);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);
  const [brandKits, setBrandKits] = useState([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [addingLogoId, setAddingLogoId] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [selectingLibraryId, setSelectingLibraryId] = useState("");
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [uploadMode, setUploadMode] = useState(IMAGE_UPLOAD_MODES.LAYER);
  const [uploadError, setUploadError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [currentProjectId, setCurrentProjectId] = useState(projectId || "");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const initialAssetIdRef = useRef(null);

  useEffect(() => {
    if (!initialAsset || initialAssetIdRef.current === initialAsset.id) return;
    initialAssetIdRef.current = initialAsset.id;
    if (initialProject?.layers?.length) return;
    editor.createFromImageAsset(initialAsset);
  }, [editor, initialAsset, initialProject]);

  const processImageFile = async (file, mode) => {
    if (!file || uploading) return;
    try {
      setUploading(true);
      setUploadError("");
      setSaveNotice("");
      const asset = await uploadImageAsset(file);
      if (mode === IMAGE_UPLOAD_MODES.REPLACE) editor.replaceSelectedImage(asset);
      else if (mode === IMAGE_UPLOAD_MODES.CANVAS) {
        editor.createFromImageAsset(asset);
        setZoom(1);
      } else editor.addImageAsset(asset);
      setShowUploadModal(false);
    } catch (error) {
      setUploadError(error?.message || "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const loadLibraryItems = async ({ force = false } = {}) => {
    if (!fetchLibraryImages || libraryLoading) return;
    if (!force && libraryItems.length) return;
    try {
      setLibraryLoading(true);
      setLibraryError("");
      const items = await fetchLibraryImages();
      setLibraryItems(Array.isArray(items) ? items : []);
    } catch (error) {
      setLibraryError(error?.message || "Your Library images could not be loaded.");
    } finally {
      setLibraryLoading(false);
    }
  };

  const openLibraryPicker = (mode = IMAGE_UPLOAD_MODES.LAYER) => {
    setUploadError("");
    setSaveNotice("");
    setLibraryPicker({ open: true, mode });
    loadLibraryItems();
  };

  const chooseLibraryImage = async (item) => {
    if (!item || !hydrateLibraryAsset || selectingLibraryId) return;
    try {
      setSelectingLibraryId(item.id);
      setLibraryError("");
      const asset = await hydrateLibraryAsset(item);
      if (libraryPicker.mode === IMAGE_UPLOAD_MODES.REPLACE) {
        editor.replaceSelectedImage(asset);
        setLibraryPicker((current) => ({ ...current, open: false }));
      } else if (libraryPicker.mode === IMAGE_UPLOAD_MODES.CANVAS) {
        editor.createFromImageAsset(asset);
        setZoom(1);
        setLibraryPicker((current) => ({ ...current, open: false }));
      } else {
        setPendingLibraryAsset(asset);
        setLibraryPicker((current) => ({ ...current, open: false }));
      }
    } catch (error) {
      setLibraryError(error?.message || "The selected Library image could not be loaded.");
    } finally {
      setSelectingLibraryId("");
    }
  };


  const loadBrandKits = async ({ force = false } = {}) => {
    if (!fetchBrandKits || brandLoading) return;
    if (!force && brandKits.length) return;
    try {
      setBrandLoading(true);
      setBrandError("");
      const kits = await fetchBrandKits();
      setBrandKits(Array.isArray(kits) ? kits : []);
    } catch (error) {
      setBrandError(error?.message || "Your Brand Kits could not be loaded.");
    } finally {
      setBrandLoading(false);
    }
  };

  const openBrandPanel = () => {
    setBrandPanelOpen(true);
    loadBrandKits();
  };

  const addBrandLogo = async (logo) => {
    if (!logo || !hydrateBrandLogo || addingLogoId) return;
    try {
      setAddingLogoId(logo.id);
      setBrandError("");
      const asset = await hydrateBrandLogo(logo);
      editor.addImageAsset({ ...asset, filename: logo.name || asset.filename || "Brand logo" });
    } catch (error) {
      setBrandError(error?.message || "The selected logo could not be loaded.");
    } finally {
      setAddingLogoId("");
    }
  };

  const applyBrandColor = (color) => {
    const layer = editor.selectedLayer;
    if (!layer) { editor.updateCanvas({ background: color, transparent: false }); return; }
    if (layer.type === "image") editor.updateSelectedLayer({ borderColor: color });
    else if (["ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"].includes(layer.type)) {
      editor.updateSelectedLayer(layer.textColor ? { textColor: color } : { fill: color });
    } else editor.updateSelectedLayer({ fill: color });
  };

  const applyBrandFont = (fontFamily) => {
    if (!editor.selectedLayer) return;
    ensureBrandFontLoaded(fontFamily);
    editor.updateSelectedLayer({ fontFamily });
  };

  const beginImageUpload = (mode) => {
    setUploadMode(mode);
    const hideNotice = window.localStorage.getItem("creativeStudioHideStorageNotice") === "true";
    if (hideNotice || noticeAccepted || mode === IMAGE_UPLOAD_MODES.REPLACE) {
      fileInputRef.current?.click();
      return;
    }
    setShowUploadModal(true);
  };

  const handleNewProject = () => {
    if (editor.layers.length && !window.confirm("Start a new project? Unsaved changes in the current design will be lost.")) return;
    onNewProject?.();
  };

  const safeFilename = (value) => (value || "creative-studio-design").trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "creative-studio-design";

  const handleExport = async ({ format, scale, quality }) => {
    if (!canvasRef.current || exporting) return;
    try {
      setExporting(true);
      setUploadError("");
      editor.clearSelection();
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
      const dataUrl = canvasRef.current.toDataURL({ pixelRatio: scale, mimeType, quality });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${safeFilename(title)}.${format === "jpeg" ? "jpg" : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportOpen(false);
      setSaveNotice("Export downloaded ✓");
    } catch (error) {
      setUploadError(error?.message || "The design could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  const resolveSavedProjectId = (result) => String(
    result?.item?.id || result?.projectId || result?.project_id || result?.id || currentProjectId || ""
  );

  const saveCurrentProject = async ({ saveAs = false } = {}) => {
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
      const cleanTitle = title.trim() || "Untitled design";
      if (cleanTitle !== title) setTitle(cleanTitle);
      const project = { ...serializeProject(editor.canvas, editor.layers), title: cleanTitle, metadata: { title: cleanTitle } };
      const result = await saveProject({
        blob,
        project,
        title: cleanTitle,
        sourceImageJobId,
        projectId: saveAs ? "" : currentProjectId,
        saveAs,
      });
      const savedId = resolveSavedProjectId(result);
      if (savedId) setCurrentProjectId(savedId);
      await onProjectSaved?.({ ...result, id: savedId, title: cleanTitle });
      setSaveNotice(saveAs ? "Saved as a new project ✓" : currentProjectId ? "Project updated ✓" : "Project saved ✓");
    } catch (error) {
      setUploadError(error?.message || "The design could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => saveCurrentProject({ saveAs: false });
  const handleSaveAs = () => saveCurrentProject({ saveAs: true });

  return (
    <main className="csv4">
      <header className="csv4__header">
        <div>
          <span className="csv4__eyebrow">Creative Studio</span>
          <h1>Design editor</h1>
        </div>
        <div className="csv4__header-actions">
          <button type="button" className="csv4-header-button" onClick={onBackToProjects}>Projects</button>
          <input className="csv4-title-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-label="Design title" />
          <button type="button" className="csv4-header-button" onClick={handleNewProject}>New Project</button>
          <button type="button" className="csv4-header-button" onClick={editor.undo} disabled={!editor.canUndo}>Undo</button>
          <button type="button" className="csv4-header-button" onClick={editor.redo} disabled={!editor.canRedo}>Redo</button>
          <button type="button" className="csv4-header-button" onClick={() => setExportOpen(true)}>Export</button>
          <button type="button" className="csv4-header-button" onClick={handleSaveAs} disabled={saving}>Save As</button>
          <button type="button" className="csv4-header-button csv4-header-button--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : currentProjectId ? "Save Changes" : "Save Project"}</button>
          <div className="csv4__status"><span className="csv4__status-dot" />Live storage</div>
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
          onImportFromLibrary={() => openLibraryPicker(IMAGE_UPLOAD_MODES.LAYER)}
          onOpenBrandKit={openBrandPanel}
          onDelete={editor.deleteSelected}
          onDuplicate={editor.duplicateSelected}
          onBringForward={editor.bringForward}
          onSendBackward={editor.sendBackward}
          onGroup={editor.groupSelected}
          onUngroup={editor.ungroupSelected}
          hasSelection={editor.selectedLayerIds.length > 0}
          canGroup={editor.canGroup}
          canUngroup={editor.canUngroup}
          disabled={uploading}
        />

        <LayersPanel
          layers={editor.layers}
          selectedLayerIds={editor.selectedLayerIds}
          onSelect={editor.selectLayer}
          onToggleVisibility={editor.toggleLayerVisibility}
          onToggleLock={editor.toggleLayerLock}
          onRename={editor.renameLayer}
        />

        <section className="csv4__stage-shell">
          <CanvasTopbar
            zoom={zoom}
            onZoomChange={setZoom}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled((current) => !current)}
            rulersEnabled={rulersEnabled}
            onToggleRulers={() => setRulersEnabled((current) => !current)}
            guidesEnabled={guidesEnabled}
            onToggleGuides={() => setGuidesEnabled((current) => !current)}
            safeZonesEnabled={safeZonesEnabled}
            onToggleSafeZones={() => setSafeZonesEnabled((current) => !current)}
            onAddVerticalGuide={() => editor.addGuide("vertical")}
            onAddHorizontalGuide={() => editor.addGuide("horizontal")}
            onClearGuides={editor.clearGuides}
          />
          <KonvaCanvas
            ref={canvasRef}
            canvas={editor.canvas}
            layers={editor.layers}
            selectedLayerIds={editor.selectedLayerIds}
            zoom={zoom}
            snapEnabled={snapEnabled}
            rulersEnabled={rulersEnabled}
            guidesEnabled={guidesEnabled}
            safeZonesEnabled={safeZonesEnabled}
            onSelectLayer={editor.selectLayer}
            onClearSelection={editor.clearSelection}
            onCommitLayer={editor.updateLayer}
            onCommitLayers={editor.updateLayers}
            onUpdateGuide={editor.updateGuide}
            onRemoveGuide={editor.removeGuide}
          />
        </section>

        <PropertiesPanel
          canvas={editor.canvas}
          selectedLayer={editor.selectedLayer}
          selectedCount={editor.selectedLayerIds.length}
          onChange={editor.updateSelectedLayer}
          onReplaceImage={() => beginImageUpload(IMAGE_UPLOAD_MODES.REPLACE)}
          onReplaceFromLibrary={() => openLibraryPicker(IMAGE_UPLOAD_MODES.REPLACE)}
          onCanvasChange={editor.updateCanvas}
          onResizeCanvas={editor.resizeCanvas}
          onApplyPreset={editor.applyCanvasPreset}
        />
      </div>

      <BrandKitPanel
        open={brandPanelOpen}
        kits={brandKits}
        loading={brandLoading || Boolean(addingLogoId)}
        error={brandError}
        selectedLayer={editor.selectedLayer}
        onClose={() => setBrandPanelOpen(false)}
        onRefresh={() => loadBrandKits({ force: true })}
        onAddLogo={addBrandLogo}
        onApplyColor={applyBrandColor}
        onApplyCanvasColor={(background) => editor.updateCanvas({ background, transparent: false })}
        onApplyFont={applyBrandFont}
      />

      <input ref={fileInputRef} className="csv4-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) processImageFile(file, uploadMode);
      }} />

      <ImagePlacementModal
        open={Boolean(pendingLibraryAsset)}
        asset={pendingLibraryAsset}
        onClose={() => setPendingLibraryAsset(null)}
        onLayer={() => { editor.addImageAsset(pendingLibraryAsset); setPendingLibraryAsset(null); }}
        onCanvas={() => { editor.createFromImageAsset(pendingLibraryAsset); setZoom(1); setPendingLibraryAsset(null); }}
      />

      <LibraryImageModal
        open={libraryPicker.open}
        mode={libraryPicker.mode}
        items={libraryItems}
        loading={libraryLoading}
        error={libraryError}
        selectingId={selectingLibraryId}
        onClose={() => setLibraryPicker((current) => ({ ...current, open: false }))}
        onRefresh={() => loadLibraryItems({ force: true })}
        onSelect={chooseLibraryImage}
      />

      <ImageUploadModal
        open={showUploadModal}
        mode={uploadMode}
        onClose={() => setShowUploadModal(false)}
        onChooseFile={(file) => { setNoticeAccepted(true); processImageFile(file, uploadMode); }}
        storageUsedBytes={storageUsedBytes}
        storageLimitBytes={storageLimitBytes}
        uploading={uploading}
      />


      <ExportModal
        open={exportOpen}
        canvas={editor.canvas}
        exporting={exporting}
        onClose={() => setExportOpen(false)}
        onExport={handleExport}
      />

      {uploading && (
        <div className="csv4-upload-loading" role="status" aria-live="polite">
          <div className="csv4-upload-loading__card"><span className="csv4-spinner" aria-hidden="true" /><div><strong>Uploading image</strong><span>Adding it to your Creative Studio and Library...</span></div></div>
        </div>
      )}
    </main>
  );
}

function CanvasTopbar({
  zoom, onZoomChange, snapEnabled, onToggleSnap,
  rulersEnabled, onToggleRulers, guidesEnabled, onToggleGuides,
  safeZonesEnabled, onToggleSafeZones,
  onAddVerticalGuide, onAddHorizontalGuide, onClearGuides,
}) {
  const zoomOut = () => onZoomChange((current) => Math.max(0.25, Number((current - 0.25).toFixed(2))));
  const zoomIn = () => onZoomChange((current) => Math.min(2, Number((current + 0.25).toFixed(2))));
  return (
    <div className="csv4-canvas-topbar">
      <button type="button" onClick={zoomOut} aria-label="Zoom out">−</button>
      <button type="button" className="csv4-canvas-topbar__zoom" onClick={() => onZoomChange(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
      <span className="csv4-canvas-topbar__divider" />
      <button type="button" className={snapEnabled ? "is-active" : ""} onClick={onToggleSnap}>Snap</button>
      <button type="button" className={rulersEnabled ? "is-active" : ""} onClick={onToggleRulers}>Rulers</button>
      <button type="button" className={guidesEnabled ? "is-active" : ""} onClick={onToggleGuides}>Guides</button>
      <button type="button" className={safeZonesEnabled ? "is-active" : ""} onClick={onToggleSafeZones}>Safe zone</button>
      <span className="csv4-canvas-topbar__divider" />
      <button type="button" onClick={onAddVerticalGuide} title="Add vertical guide">+V</button>
      <button type="button" onClick={onAddHorizontalGuide} title="Add horizontal guide">+H</button>
      <button type="button" onClick={onClearGuides} title="Clear guides">Clear</button>
    </div>
  );
}
