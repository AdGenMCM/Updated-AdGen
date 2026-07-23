import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAdElementLayer } from "../data/adElementPresets";
import { typographyDefaults } from "../data/typographyPresets";

const HISTORY_LIMIT = 50;
const MIN_CANVAS_SIZE = 90;
const MAX_CANVAS_SIZE = 4096;

export const CANVAS_PRESETS = [
  { id: "instagram-square", label: "Instagram Square", width: 1080, height: 1080, safeZone: { top: 54, right: 54, bottom: 54, left: 54 } },
  { id: "instagram-portrait", label: "Instagram Portrait", width: 1080, height: 1350, safeZone: { top: 68, right: 54, bottom: 68, left: 54 } },
  { id: "instagram-story", label: "Instagram Story", width: 1080, height: 1920, safeZone: { top: 250, right: 70, bottom: 250, left: 70 } },
  { id: "facebook-feed", label: "Facebook Feed", width: 1200, height: 1500, safeZone: { top: 75, right: 60, bottom: 75, left: 60 } },
  { id: "facebook-landscape", label: "Facebook Landscape", width: 1200, height: 628, safeZone: { top: 32, right: 60, bottom: 32, left: 60 } },
  { id: "linkedin-square", label: "LinkedIn Square", width: 1200, height: 1200, safeZone: { top: 60, right: 60, bottom: 60, left: 60 } },
  { id: "linkedin-landscape", label: "LinkedIn Landscape", width: 1200, height: 627, safeZone: { top: 32, right: 60, bottom: 32, left: 60 } },
  { id: "display-medium-rectangle", label: "Display 300 × 250", width: 300, height: 250, safeZone: { top: 12, right: 12, bottom: 12, left: 12 } },
  { id: "display-leaderboard", label: "Display 728 × 90", width: 728, height: 90, safeZone: { top: 5, right: 18, bottom: 5, left: 18 } },
  { id: "display-skyscraper", label: "Display 160 × 600", width: 160, height: 600, safeZone: { top: 15, right: 8, bottom: 15, left: 8 } },
  { id: "email-header", label: "Email Header", width: 1200, height: 400, safeZone: { top: 20, right: 60, bottom: 20, left: 60 } },
];

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const INITIAL_CANVAS = {
  width: 1080,
  height: 1080,
  background: "#ffffff",
  transparent: false,
  presetId: "instagram-square",
  safeZone: CANVAS_PRESETS[0].safeZone,
  guides: [],
};

function imageEditingDefaults(layer = {}) {
  return {
    imageBackground: "transparent",
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
    borderStyle: "solid",
    shadowColor: "#000000",
    shadowOffsetX: 0,
    ...layer,
  };
}

function normalizeLayer(layer) {
  const typography = layer.type === "text" || ["ctaButton", "saleBadge", "priceTag", "ratingStars", "promoPill", "ribbon", "productCard"].includes(layer.type)
    ? typographyDefaults(layer)
    : {};

  const imageEditing = layer.type === "image" ? imageEditingDefaults(layer) : {};

  return {
    ...typography,
    ...imageEditing,
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    groupId: layer.groupId || null,
    ...layer,
  };
}

function normalizeCanvas(canvas = {}) {
  return {
    ...INITIAL_CANVAS,
    ...canvas,
    width: Math.max(1, Number(canvas.width || INITIAL_CANVAS.width)),
    height: Math.max(1, Number(canvas.height || INITIAL_CANVAS.height)),
    transparent: Boolean(canvas.transparent),
    guides: Array.isArray(canvas.guides) ? canvas.guides : [],
  };
}

function normalizeProject(initialProject) {
  return {
    canvas: normalizeCanvas(initialProject?.canvas),
    layers: Array.isArray(initialProject?.layers)
      ? initialProject.layers.map(normalizeLayer)
      : [],
  };
}

function createShapeLayer(type) {
  const common = {
    id: createId(type),
    type,
    name: type === "roundedRect" ? "Rounded rectangle" : `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    x: 340,
    y: 390,
    width: 400,
    height: 300,
    rotation: 0,
    opacity: 1,
    fill: "#2563eb",
    visible: true,
    locked: false,
    groupId: null,
  };

  if (type === "roundedRect") return { ...common, cornerRadius: 48 };
  if (type === "circle") return { ...common, width: 300, height: 300 };
  if (type === "triangle") return { ...common, width: 320, height: 300 };
  if (type === "line") return { ...common, width: 420, height: 40, stroke: "#2563eb", strokeWidth: 12, fill: undefined };
  if (type === "arrow") return { ...common, width: 420, height: 60, stroke: "#2563eb", strokeWidth: 12, fill: undefined };
  if (type === "star") return { ...common, width: 320, height: 320 };
  return common;
}

function imageLayerMetadata(asset) {
  return {
    assetId: asset.id,
    src: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes || 0,
    storagePath: asset.storagePath || null,
    imageJobId: asset.imageJobId || null,
    remoteUrl: asset.remoteUrl || null,
    naturalWidth: Math.max(1, asset.width || 1),
    naturalHeight: Math.max(1, asset.height || 1),
  };
}

function createImageLayer(asset, canvas) {
  const naturalWidth = Math.max(1, asset.width || 1);
  const naturalHeight = Math.max(1, asset.height || 1);
  const maxDimension = Math.min(canvas.width, canvas.height) * 0.62;
  const scale = Math.min(maxDimension / naturalWidth, maxDimension / naturalHeight, 1);
  const width = Math.max(80, Math.round(naturalWidth * scale));
  const height = Math.max(80, Math.round(naturalHeight * scale));

  return {
    id: createId("image"), type: "image", role: "layer",
    name: asset.filename || "Uploaded image", ...imageLayerMetadata(asset),
    x: Math.round((canvas.width - width) / 2), y: Math.round((canvas.height - height) / 2),
    width, height, rotation: 0, opacity: 1, fit: "cover", lockAspectRatio: true,
    cornerRadius: 0, borderWidth: 0, borderColor: "#ffffff",
    shadowEnabled: false, shadowBlur: 20, shadowOpacity: 0.2, shadowOffsetY: 8,
    ...imageEditingDefaults(),
    visible: true, locked: false, groupId: null,
  };
}

function createBackgroundImageLayer(asset) {
  const width = Math.max(1, Math.round(asset.width || 1));
  const height = Math.max(1, Math.round(asset.height || 1));
  return {
    id: createId("background-image"), type: "image", role: "background",
    name: asset.filename ? `Background: ${asset.filename}` : "Background image",
    ...imageLayerMetadata(asset), x: 0, y: 0, width, height,
    rotation: 0, opacity: 1, fit: "cover", lockAspectRatio: true,
    cornerRadius: 0, borderWidth: 0, borderColor: "#ffffff",
    shadowEnabled: false, shadowBlur: 0, shadowOpacity: 0, shadowOffsetY: 0,
    ...imageEditingDefaults(),
    visible: true, locked: true, groupId: null,
  };
}

function clampCanvasDimension(value) {
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Math.round(Number(value) || MIN_CANVAS_SIZE)));
}

export default function useEditor({ initialProject = null } = {}) {
  const initialSnapshot = normalizeProject(initialProject);
  const [canvas, setCanvas] = useState(initialSnapshot.canvas);
  const [layers, setLayers] = useState(initialSnapshot.layers);
  const [assets, setAssets] = useState([]);
  const [selectedLayerIds, setSelectedLayerIds] = useState([]);
  const [history, setHistory] = useState([initialSnapshot]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const loadedProjectRef = useRef(initialProject);

  useEffect(() => {
    if (!initialProject || loadedProjectRef.current === initialProject) return;
    const snapshot = normalizeProject(initialProject);
    loadedProjectRef.current = initialProject;
    setCanvas(snapshot.canvas); setLayers(snapshot.layers); setHistory([snapshot]); setHistoryIndex(0); setSelectedLayerIds([]);
  }, [initialProject]);

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  const selectedLayers = useMemo(
    () => layers.filter((layer) => selectedLayerIds.includes(layer.id)),
    [layers, selectedLayerIds],
  );
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const uploadedBytes = useMemo(() => assets.reduce((total, asset) => total + (asset.sizeBytes || 0), 0), [assets]);

  const commitProject = useCallback((updater) => {
    const currentSnapshot = historyRef.current[historyIndexRef.current] || normalizeProject(null);
    const next = typeof updater === "function" ? updater(currentSnapshot) : updater;
    if (!next || next === currentSnapshot) return;
    const nextSnapshot = {
      canvas: normalizeCanvas(next.canvas || currentSnapshot.canvas),
      layers: (next.layers || currentSnapshot.layers).map(normalizeLayer),
    };
    const baseHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    const nextHistory = [...baseHistory, nextSnapshot].slice(-HISTORY_LIMIT);
    const nextIndex = nextHistory.length - 1;
    historyRef.current = nextHistory; historyIndexRef.current = nextIndex;
    setHistory(nextHistory); setHistoryIndex(nextIndex); setCanvas(nextSnapshot.canvas); setLayers(nextSnapshot.layers);
  }, []);

  const replaceProject = useCallback((project) => {
    const snapshot = normalizeProject(project);
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    setHistory([snapshot]);
    setHistoryIndex(0);
    setCanvas(snapshot.canvas);
    setLayers(snapshot.layers);
    setSelectedLayerIds([]);
    setAssets([]);
  }, []);

  const commitLayers = useCallback((updater) => {
    commitProject((current) => {
      const nextLayers = typeof updater === "function" ? updater(current.layers) : updater;
      return nextLayers === current.layers ? current : { ...current, layers: nextLayers };
    });
  }, [commitProject]);

  const selectLayer = useCallback((layerId, options = {}) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer || layer.visible === false) return;
    const additive = Boolean(options.additive);
    const groupIds = layer.groupId
      ? layers.filter((item) => item.groupId === layer.groupId && item.visible !== false).map((item) => item.id)
      : [layerId];
    setSelectedLayerIds((current) => {
      if (!additive) return groupIds;
      const allSelected = groupIds.every((id) => current.includes(id));
      return allSelected ? current.filter((id) => !groupIds.includes(id)) : [...new Set([...current, ...groupIds])];
    });
  }, [layers]);

  const clearSelection = useCallback(() => setSelectedLayerIds([]), []);

  const addText = useCallback(() => {
    const layer = { id: createId("text"), type: "text", name: "Text", text: "Edit this text", x: 290, y: 460, width: 500, height: 150, rotation: 0, opacity: 1, fill: "#111827", fontSize: 72, ...typographyDefaults({ fontWeight: 700, lineHeight: 1.05 }), visible: true, locked: false, groupId: null };
    commitLayers((current) => [...current, layer]); setSelectedLayerIds([layer.id]);
  }, [commitLayers]);

  const addShape = useCallback((type) => { const layer = createShapeLayer(type); commitLayers((current) => [...current, layer]); setSelectedLayerIds([layer.id]); }, [commitLayers]);
  const addAdElement = useCallback((type) => { const layer = normalizeLayer(createAdElementLayer(type, createId)); commitLayers((current) => [...current, layer]); setSelectedLayerIds([layer.id]); }, [commitLayers]);
  const addImageAsset = useCallback((asset) => { const layer = createImageLayer(asset, canvas); setAssets((current) => [...current, asset]); commitLayers((current) => [...current, layer]); setSelectedLayerIds([layer.id]); return layer; }, [canvas, commitLayers]);

  const createFromImageAsset = useCallback((asset) => {
    const nextCanvas = normalizeCanvas({ width: asset.width, height: asset.height, background: "#ffffff", transparent: false, presetId: "custom", safeZone: null, guides: [] });
    const backgroundLayer = createBackgroundImageLayer(asset);
    setAssets((current) => [...current, asset]);
    commitProject((current) => ({ canvas: nextCanvas, layers: [backgroundLayer, ...current.layers.filter((layer) => layer.role !== "background")] }));
    setSelectedLayerIds([backgroundLayer.id]); return backgroundLayer;
  }, [commitProject]);

  const updateLayer = useCallback((layerId, updates) => {
    commitLayers((current) => current.map((layer) => {
      if (layer.id !== layerId || layer.locked) return layer;
      const resolved = typeof updates === "function" ? updates(layer) : updates;
      return { ...layer, ...resolved };
    }));
  }, [commitLayers]);

  const updateLayers = useCallback((updatesById) => {
    commitLayers((current) => current.map((layer) => {
      const updates = updatesById[layer.id];
      return !updates || layer.locked ? layer : { ...layer, ...updates };
    }));
  }, [commitLayers]);

  const updateSelectedLayer = useCallback((updates) => { if (selectedLayerId) updateLayer(selectedLayerId, updates); }, [selectedLayerId, updateLayer]);
  const updateCanvas = useCallback((updates) => commitProject((current) => ({ ...current, canvas: { ...current.canvas, ...updates } })), [commitProject]);

  const resizeCanvas = useCallback(({ width, height, scaleLayers = true, presetId = "custom", safeZone = null }) => {
    const nextWidth = clampCanvasDimension(width); const nextHeight = clampCanvasDimension(height);
    commitProject((current) => {
      const scaleX = nextWidth / current.canvas.width; const scaleY = nextHeight / current.canvas.height;
      return {
        canvas: { ...current.canvas, width: nextWidth, height: nextHeight, presetId, safeZone, guides: [] },
        layers: current.layers.map((layer) => scaleLayers ? {
          ...layer, x: Math.round(layer.x * scaleX), y: Math.round(layer.y * scaleY),
          width: Math.max(20, Math.round(layer.width * scaleX)), height: Math.max(20, Math.round(layer.height * scaleY)),
          fontSize: layer.fontSize ? Math.max(8, Math.round(layer.fontSize * Math.min(scaleX, scaleY))) : layer.fontSize,
        } : layer),
      };
    });
  }, [commitProject]);

  const applyCanvasPreset = useCallback((presetId, scaleLayers = true) => {
    const preset = CANVAS_PRESETS.find((item) => item.id === presetId); if (!preset) return;
    resizeCanvas({ ...preset, presetId: preset.id, scaleLayers });
  }, [resizeCanvas]);

  const addGuide = useCallback((orientation) => {
    const guide = { id: createId("guide"), orientation, position: orientation === "vertical" ? canvas.width / 2 : canvas.height / 2 };
    updateCanvas({ guides: [...canvas.guides, guide] });
  }, [canvas.guides, canvas.height, canvas.width, updateCanvas]);
  const updateGuide = useCallback((guideId, position) => updateCanvas({ guides: canvas.guides.map((guide) => guide.id === guideId ? { ...guide, position: Math.round(position) } : guide) }), [canvas.guides, updateCanvas]);
  const removeGuide = useCallback((guideId) => updateCanvas({ guides: canvas.guides.filter((guide) => guide.id !== guideId) }), [canvas.guides, updateCanvas]);
  const clearGuides = useCallback(() => updateCanvas({ guides: [] }), [updateCanvas]);

  const replaceSelectedImage = useCallback((asset) => {
    if (!selectedLayerId) return; setAssets((current) => [...current, asset]);
    const current = layers.find((layer) => layer.id === selectedLayerId);
    updateLayer(selectedLayerId, {
      ...imageLayerMetadata(asset),
      name: current?.role === "background" ? `Background: ${asset.filename || "image"}` : asset.filename || "Uploaded image",
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
    });
  }, [layers, selectedLayerId, updateLayer]);

  const deleteSelected = useCallback(() => {
    if (!selectedLayerIds.length) return;
    commitLayers((current) => current.filter((layer) => !selectedLayerIds.includes(layer.id) || layer.locked));
    setSelectedLayerIds([]);
  }, [commitLayers, selectedLayerIds]);

  const duplicateSelected = useCallback(() => {
    if (!selectedLayers.length) return;
    const groupMap = new Map();
    const duplicates = selectedLayers.map((layer) => {
      let groupId = null;
      if (layer.groupId) { if (!groupMap.has(layer.groupId)) groupMap.set(layer.groupId, createId("group")); groupId = groupMap.get(layer.groupId); }
      return { ...layer, id: createId(layer.type), role: layer.role === "background" ? "layer" : layer.role, x: layer.x + 24, y: layer.y + 24, name: layer.name ? `${layer.name} copy` : undefined, groupId, locked: false };
    });
    commitLayers((current) => [...current, ...duplicates]); setSelectedLayerIds(duplicates.map((layer) => layer.id));
  }, [commitLayers, selectedLayers]);

  const bringForward = useCallback(() => {
    if (!selectedLayerIds.length) return;
    commitLayers((current) => {
      const next = [...current];
      for (let index = next.length - 2; index >= 0; index -= 1) if (selectedLayerIds.includes(next[index].id) && !selectedLayerIds.includes(next[index + 1].id)) [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, [commitLayers, selectedLayerIds]);

  const sendBackward = useCallback(() => {
    if (!selectedLayerIds.length) return;
    commitLayers((current) => {
      const next = [...current];
      for (let index = 1; index < next.length; index += 1) if (selectedLayerIds.includes(next[index].id) && !selectedLayerIds.includes(next[index - 1].id)) [next[index], next[index - 1]] = [next[index - 1], next[index]];
      return next;
    });
  }, [commitLayers, selectedLayerIds]);

  const toggleLayerVisibility = useCallback((layerId) => {
    commitLayers((current) => current.map((layer) => layer.id === layerId ? { ...layer, visible: layer.visible === false } : layer));
    setSelectedLayerIds((current) => current.filter((id) => id !== layerId));
  }, [commitLayers]);
  const toggleLayerLock = useCallback((layerId) => commitLayers((current) => current.map((layer) => layer.id === layerId ? { ...layer, locked: !layer.locked } : layer)), [commitLayers]);
  const renameLayer = useCallback((layerId, name) => commitLayers((current) => current.map((layer) => layer.id === layerId ? { ...layer, name: String(name || "").trim() || "Untitled layer" } : layer)), [commitLayers]);

  const groupSelected = useCallback(() => {
    if (selectedLayerIds.length < 2) return;
    const groupId = createId("group");
    commitLayers((current) => current.map((layer) => selectedLayerIds.includes(layer.id) ? { ...layer, groupId } : layer));
  }, [commitLayers, selectedLayerIds]);
  const ungroupSelected = useCallback(() => {
    if (!selectedLayerIds.length) return;
    commitLayers((current) => current.map((layer) => selectedLayerIds.includes(layer.id) ? { ...layer, groupId: null } : layer));
  }, [commitLayers, selectedLayerIds]);

  const nudgeSelected = useCallback((deltaX, deltaY) => {
    if (!selectedLayerIds.length) return;
    commitLayers((current) => current.map((layer) => selectedLayerIds.includes(layer.id) && !layer.locked ? { ...layer, x: layer.x + deltaX, y: layer.y + deltaY } : layer));
  }, [commitLayers, selectedLayerIds]);

  const applyHistorySnapshot = useCallback((nextIndex) => {
    const snapshot = historyRef.current[nextIndex]; if (!snapshot) return;
    historyIndexRef.current = nextIndex; setHistoryIndex(nextIndex); setCanvas(snapshot.canvas); setLayers(snapshot.layers);
    setSelectedLayerIds((current) => current.filter((id) => snapshot.layers.some((layer) => layer.id === id)));
  }, []);
  const undo = useCallback(() => { if (historyIndexRef.current > 0) applyHistorySnapshot(historyIndexRef.current - 1); }, [applyHistorySnapshot]);
  const redo = useCallback(() => { if (historyIndexRef.current < historyRef.current.length - 1) applyHistorySnapshot(historyIndexRef.current + 1); }, [applyHistorySnapshot]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isTyping) return;
      const modifier = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase();
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && key === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (modifier && key === "g") { event.preventDefault(); event.shiftKey ? ungroupSelected() : groupSelected(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); return; }
      if (event.key === "Escape") { clearSelection(); return; }
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") { event.preventDefault(); nudgeSelected(-step, 0); }
      else if (event.key === "ArrowRight") { event.preventDefault(); nudgeSelected(step, 0); }
      else if (event.key === "ArrowUp") { event.preventDefault(); nudgeSelected(0, -step); }
      else if (event.key === "ArrowDown") { event.preventDefault(); nudgeSelected(0, step); }
    };
    window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, deleteSelected, duplicateSelected, groupSelected, nudgeSelected, redo, undo, ungroupSelected]);

  return {
    canvas, layers, assets, uploadedBytes,
    selectedLayer, selectedLayerId, selectedLayerIds, selectedLayers,
    selectLayer, clearSelection, replaceProject,
    addText, addShape, addAdElement, addImageAsset, createFromImageAsset, replaceSelectedImage,
    updateLayer, updateLayers, updateSelectedLayer, updateCanvas, resizeCanvas, applyCanvasPreset,
    addGuide, updateGuide, removeGuide, clearGuides,
    deleteSelected, duplicateSelected, bringForward, sendBackward,
    toggleLayerVisibility, toggleLayerLock, renameLayer, groupSelected, ungroupSelected,
    undo, redo, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1,
    canGroup: selectedLayerIds.length > 1,
    canUngroup: selectedLayers.some((layer) => Boolean(layer.groupId)),
  };
}
