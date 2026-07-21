import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAdElementLayer } from "../data/adElementPresets";

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
};

function createShapeLayer(type) {
  const common = {
    id: createId(type),
    type,
    x: 340,
    y: 390,
    width: 400,
    height: 300,
    rotation: 0,
    opacity: 1,
    fill: "#2563eb",
  };

  if (type === "roundedRect") return { ...common, cornerRadius: 48 };
  if (type === "circle") return { ...common, width: 300, height: 300 };
  if (type === "triangle") return { ...common, width: 320, height: 300 };

  if (type === "line") {
    return {
      ...common,
      width: 420,
      height: 40,
      stroke: "#2563eb",
      strokeWidth: 12,
      fill: undefined,
    };
  }

  if (type === "arrow") {
    return {
      ...common,
      width: 420,
      height: 60,
      stroke: "#2563eb",
      strokeWidth: 12,
      fill: undefined,
    };
  }

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
  const scale = Math.min(
    maxDimension / naturalWidth,
    maxDimension / naturalHeight,
    1,
  );
  const width = Math.max(80, Math.round(naturalWidth * scale));
  const height = Math.max(80, Math.round(naturalHeight * scale));

  return {
    id: createId("image"),
    type: "image",
    role: "layer",
    name: asset.filename || "Uploaded image",
    ...imageLayerMetadata(asset),
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    fit: "cover",
    lockAspectRatio: true,
    cornerRadius: 0,
    borderWidth: 0,
    borderColor: "#ffffff",
    shadowEnabled: false,
    shadowBlur: 20,
    shadowOpacity: 0.2,
    shadowOffsetY: 8,
  };
}

function createBackgroundImageLayer(asset) {
  const width = Math.max(1, Math.round(asset.width || 1));
  const height = Math.max(1, Math.round(asset.height || 1));

  return {
    id: createId("background-image"),
    type: "image",
    role: "background",
    name: asset.filename
      ? `Background: ${asset.filename}`
      : "Background image",
    ...imageLayerMetadata(asset),
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    opacity: 1,
    fit: "cover",
    lockAspectRatio: true,
    cornerRadius: 0,
    borderWidth: 0,
    borderColor: "#ffffff",
    shadowEnabled: false,
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowOffsetY: 0,
  };
}

function normalizeProject(initialProject) {
  return {
    canvas: initialProject?.canvas || INITIAL_CANVAS,
    layers: Array.isArray(initialProject?.layers) ? initialProject.layers : [],
  };
}

export default function useEditor({ initialProject = null } = {}) {
  const initialSnapshot = normalizeProject(initialProject);
  const [canvas, setCanvas] = useState(initialSnapshot.canvas);
  const [layers, setLayers] = useState(initialSnapshot.layers);
  const [assets, setAssets] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [history, setHistory] = useState([initialSnapshot]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const loadedProjectRef = useRef(initialProject);

  useEffect(() => {
    if (!initialProject || loadedProjectRef.current === initialProject) return;

    const snapshot = normalizeProject(initialProject);
    loadedProjectRef.current = initialProject;
    setCanvas(snapshot.canvas);
    setLayers(snapshot.layers);
    setHistory([snapshot]);
    setHistoryIndex(0);
    setSelectedLayerId(null);
  }, [initialProject]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );

  const uploadedBytes = useMemo(
    () => assets.reduce((total, asset) => total + (asset.sizeBytes || 0), 0),
    [assets],
  );

  const commitProject = useCallback((updater) => {
    const currentSnapshot = {
      canvas: historyRef.current[historyIndexRef.current]?.canvas || INITIAL_CANVAS,
      layers: historyRef.current[historyIndexRef.current]?.layers || [],
    };
    const next = typeof updater === "function" ? updater(currentSnapshot) : updater;
    if (!next || next === currentSnapshot) return;

    const nextSnapshot = {
      canvas: next.canvas || currentSnapshot.canvas,
      layers: next.layers || currentSnapshot.layers,
    };
    const nextHistory = [
      ...historyRef.current.slice(0, historyIndexRef.current + 1),
      nextSnapshot,
    ];

    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setCanvas(nextSnapshot.canvas);
    setLayers(nextSnapshot.layers);
  }, []);

  const commitLayers = useCallback(
    (updater) => {
      commitProject((current) => {
        const nextLayers =
          typeof updater === "function" ? updater(current.layers) : updater;
        if (nextLayers === current.layers) return current;
        return { ...current, layers: nextLayers };
      });
    },
    [commitProject],
  );

  const selectLayer = useCallback((layerId) => setSelectedLayerId(layerId), []);
  const clearSelection = useCallback(() => setSelectedLayerId(null), []);

  const addText = useCallback(() => {
    const layer = {
      id: createId("text"),
      type: "text",
      text: "Edit this text",
      x: 290,
      y: 460,
      width: 500,
      height: 150,
      rotation: 0,
      opacity: 1,
      fill: "#111827",
      fontSize: 72,
    };

    commitLayers((current) => [...current, layer]);
    setSelectedLayerId(layer.id);
  }, [commitLayers]);

  const addShape = useCallback(
    (type) => {
      const layer = createShapeLayer(type);
      commitLayers((current) => [...current, layer]);
      setSelectedLayerId(layer.id);
    },
    [commitLayers],
  );

  const addAdElement = useCallback(
    (type) => {
      const layer = createAdElementLayer(type, createId);
      commitLayers((current) => [...current, layer]);
      setSelectedLayerId(layer.id);
    },
    [commitLayers],
  );

  const addImageAsset = useCallback(
    (asset) => {
      const layer = createImageLayer(asset, canvas);
      setAssets((current) => [...current, asset]);
      commitLayers((current) => [...current, layer]);
      setSelectedLayerId(layer.id);
      return layer;
    },
    [canvas, commitLayers],
  );

  const createFromImageAsset = useCallback(
    (asset) => {
      const nextCanvas = {
        width: Math.max(1, Math.round(asset.width || 1)),
        height: Math.max(1, Math.round(asset.height || 1)),
        background: "#ffffff",
      };
      const backgroundLayer = createBackgroundImageLayer(asset);

      setAssets((current) => [...current, asset]);
      commitProject((current) => ({
        canvas: nextCanvas,
        layers: [
          backgroundLayer,
          ...current.layers.filter((layer) => layer.role !== "background"),
        ],
      }));
      setSelectedLayerId(backgroundLayer.id);
      return backgroundLayer;
    },
    [commitProject],
  );

  const updateLayer = useCallback(
    (layerId, updates) => {
      commitLayers((current) =>
        current.map((layer) => {
          if (layer.id !== layerId) return layer;
          const resolved =
            typeof updates === "function" ? updates(layer) : updates;
          return { ...layer, ...resolved };
        }),
      );
    },
    [commitLayers],
  );

  const updateSelectedLayer = useCallback(
    (updates) => {
      if (!selectedLayerId) return;
      updateLayer(selectedLayerId, updates);
    },
    [selectedLayerId, updateLayer],
  );

  const replaceSelectedImage = useCallback(
    (asset) => {
      if (!selectedLayerId) return;

      setAssets((current) => [...current, asset]);
      updateLayer(selectedLayerId, {
        ...imageLayerMetadata(asset),
        name:
          selectedLayer?.role === "background"
            ? `Background: ${asset.filename || "image"}`
            : asset.filename || "Uploaded image",
      });
    },
    [selectedLayer, selectedLayerId, updateLayer],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedLayerId) return;
    commitLayers((current) =>
      current.filter((layer) => layer.id !== selectedLayerId),
    );
    setSelectedLayerId(null);
  }, [commitLayers, selectedLayerId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedLayer) return;

    const duplicate = {
      ...selectedLayer,
      id: createId(selectedLayer.type),
      role: selectedLayer.role === "background" ? "layer" : selectedLayer.role,
      x: selectedLayer.x + 24,
      y: selectedLayer.y + 24,
      name: selectedLayer.name ? `${selectedLayer.name} copy` : undefined,
    };

    commitLayers((current) => [...current, duplicate]);
    setSelectedLayerId(duplicate.id);
  }, [commitLayers, selectedLayer]);

  const bringForward = useCallback(() => {
    if (!selectedLayerId) return;
    commitLayers((current) => {
      const index = current.findIndex((layer) => layer.id === selectedLayerId);
      if (index < 0 || index === current.length - 1) return current;
      const next = [...current];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, [commitLayers, selectedLayerId]);

  const sendBackward = useCallback(() => {
    if (!selectedLayerId) return;
    commitLayers((current) => {
      const index = current.findIndex((layer) => layer.id === selectedLayerId);
      if (index <= 0) return current;
      const next = [...current];
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
      return next;
    });
  }, [commitLayers, selectedLayerId]);

  const nudgeSelected = useCallback(
    (deltaX, deltaY) => {
      if (!selectedLayerId) return;
      updateLayer(selectedLayerId, (currentLayer) => ({
        x: currentLayer.x + deltaX,
        y: currentLayer.y + deltaY,
      }));
    },
    [selectedLayerId, updateLayer],
  );

  const applyHistorySnapshot = useCallback((nextIndex) => {
    const snapshot = historyRef.current[nextIndex];
    if (!snapshot) return;

    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setCanvas(snapshot.canvas);
    setLayers(snapshot.layers);
    setSelectedLayerId((currentId) =>
      snapshot.layers.some((layer) => layer.id === currentId) ? currentId : null,
    );
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    applyHistorySnapshot(historyIndexRef.current - 1);
  }, [applyHistorySnapshot]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    applyHistorySnapshot(historyIndexRef.current + 1);
  }, [applyHistorySnapshot]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isTyping) return;

      const isModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (isModifier && key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (event.key === "Escape") {
        clearSelection();
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelected(-step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelected(step, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelected(0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelected(0, step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearSelection,
    deleteSelected,
    duplicateSelected,
    nudgeSelected,
    redo,
    undo,
  ]);

  return {
    canvas,
    layers,
    assets,
    uploadedBytes,
    selectedLayer,
    selectedLayerId,
    selectLayer,
    clearSelection,
    addText,
    addShape,
    addAdElement,
    addImageAsset,
    createFromImageAsset,
    replaceSelectedImage,
    updateLayer,
    updateSelectedLayer,
    deleteSelected,
    duplicateSelected,
    bringForward,
    sendBackward,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
