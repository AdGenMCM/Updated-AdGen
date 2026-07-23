import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import ShapeRenderer from "./ShapeRenderer";

const MIN_SIZE = 20;
const SNAP_DISTANCE_SCREEN_PX = 6;

function clampSize(value) {
  return Math.max(MIN_SIZE, Math.round(value));
}

function getNodeRect(node, relativeTo) {
  return node.getClientRect({ relativeTo, skipShadow: true, skipStroke: false });
}

function getRectSnapPoints(rect) {
  return {
    vertical: [
      { value: rect.x, edge: "start" },
      { value: rect.x + rect.width / 2, edge: "center" },
      { value: rect.x + rect.width, edge: "end" },
    ],
    horizontal: [
      { value: rect.y, edge: "start" },
      { value: rect.y + rect.height / 2, edge: "center" },
      { value: rect.y + rect.height, edge: "end" },
    ],
  };
}

function getGuideStops({ canvas, nodeRefs, activeLayerIds, relativeTo }) {
  const vertical = [
    { value: 0, source: "canvas" },
    { value: canvas.width / 2, source: "canvas" },
    { value: canvas.width, source: "canvas" },
    ...canvas.guides.filter((guide) => guide.orientation === "vertical").map((guide) => ({ value: guide.position, source: "guide" })),
  ];
  const horizontal = [
    { value: 0, source: "canvas" },
    { value: canvas.height / 2, source: "canvas" },
    { value: canvas.height, source: "canvas" },
    ...canvas.guides.filter((guide) => guide.orientation === "horizontal").map((guide) => ({ value: guide.position, source: "guide" })),
  ];

  nodeRefs.current.forEach((node, layerId) => {
    if (!node || activeLayerIds.includes(layerId)) return;
    const rect = getNodeRect(node, relativeTo);
    const points = getRectSnapPoints(rect);
    points.vertical.forEach((point) => vertical.push({ value: point.value, source: "layer", layerId }));
    points.horizontal.forEach((point) => horizontal.push({ value: point.value, source: "layer", layerId }));
  });
  return { vertical, horizontal };
}

function findClosestSnap({ candidates, targets, threshold }) {
  let closest = null;
  candidates.forEach((candidate) => {
    targets.forEach((target) => {
      const delta = target.value - candidate.value;
      const distance = Math.abs(delta);
      if (distance <= threshold && (!closest || distance < closest.distance)) {
        closest = { distance, delta, guide: target.value };
      }
    });
  });
  return closest;
}

function calculateSnap({ node, canvas, nodeRefs, activeLayerIds, stageScale }) {
  const relativeTo = node.getLayer();
  const activeRect = getNodeRect(node, relativeTo);
  const activePoints = getRectSnapPoints(activeRect);
  const guideStops = getGuideStops({ canvas, nodeRefs, activeLayerIds, relativeTo });
  const threshold = SNAP_DISTANCE_SCREEN_PX / Math.max(stageScale, 0.01);
  const verticalSnap = findClosestSnap({ candidates: activePoints.vertical, targets: guideStops.vertical, threshold });
  const horizontalSnap = findClosestSnap({ candidates: activePoints.horizontal, targets: guideStops.horizontal, threshold });
  return {
    deltaX: verticalSnap?.delta ?? 0,
    deltaY: horizontalSnap?.delta ?? 0,
    verticalGuide: verticalSnap?.guide ?? null,
    horizontalGuide: horizontalSnap?.guide ?? null,
  };
}

function LayerNode({
  layer,
  isSelected,
  selectedLayerIds,
  snapEnabled,
  canvas,
  nodeRefs,
  stageScale,
  onSelect,
  onCommit,
  onCommitMany,
  onGuidesChange,
  registerNode,
}) {
  const dragStartRef = useRef(null);

  if (layer.visible === false) return null;

  return (
    <Group
      id={layer.id}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      draggable={!layer.locked}
      listening={!layer.locked || true}
      ref={registerNode}
      shadowColor={isSelected ? "rgba(37, 99, 235, 0.35)" : undefined}
      shadowBlur={isSelected ? 12 : 0}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(layer.id, { additive: event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey });
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(layer.id, { additive: false });
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        if (!selectedLayerIds.includes(layer.id)) onSelect(layer.id, { additive: false });
        onGuidesChange({ vertical: null, horizontal: null });
        const ids = selectedLayerIds.includes(layer.id) ? selectedLayerIds : [layer.id];
        dragStartRef.current = new Map(ids.map((id) => {
          const node = nodeRefs.current.get(id);
          return [id, node ? { x: node.x(), y: node.y() } : null];
        }));
      }}
      onDragMove={(event) => {
        const node = event.target;
        const ids = selectedLayerIds.includes(layer.id) ? selectedLayerIds : [layer.id];
        const origin = dragStartRef.current?.get(layer.id);
        if (!origin) return;

        if (snapEnabled) {
          const snap = calculateSnap({ node, canvas, nodeRefs, activeLayerIds: ids, stageScale });
          if (snap.deltaX !== 0 || snap.deltaY !== 0) {
            node.position({ x: node.x() + snap.deltaX, y: node.y() + snap.deltaY });
          }
          onGuidesChange({ vertical: snap.verticalGuide, horizontal: snap.horizontalGuide });
        } else {
          onGuidesChange({ vertical: null, horizontal: null });
        }

        const deltaX = node.x() - origin.x;
        const deltaY = node.y() - origin.y;
        ids.forEach((id) => {
          if (id === layer.id) return;
          const otherNode = nodeRefs.current.get(id);
          const otherOrigin = dragStartRef.current?.get(id);
          if (otherNode && otherOrigin) otherNode.position({ x: otherOrigin.x + deltaX, y: otherOrigin.y + deltaY });
        });
        node.getLayer()?.batchDraw();
      }}
      onDragEnd={(event) => {
        onGuidesChange({ vertical: null, horizontal: null });
        const ids = selectedLayerIds.includes(layer.id) ? selectedLayerIds : [layer.id];
        const updates = {};
        ids.forEach((id) => {
          const node = nodeRefs.current.get(id);
          if (node) updates[id] = { x: Math.round(node.x()), y: Math.round(node.y()) };
        });
        onCommitMany(updates);
        dragStartRef.current = null;
      }}
      onTransformStart={() => {
        if (!selectedLayerIds.includes(layer.id)) onSelect(layer.id, { additive: false });
        onGuidesChange({ vertical: null, horizontal: null });
      }}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const nextWidth = clampSize(node.width() * scaleX);
        const nextHeight = clampSize(node.height() * scaleY);
        node.scaleX(1); node.scaleY(1);
        onCommit(layer.id, {
          x: Math.round(node.x()), y: Math.round(node.y()),
          width: nextWidth, height: nextHeight, rotation: Math.round(node.rotation()),
        });
      }}
    >
      <ShapeRenderer layer={layer} />
    </Group>
  );
}

function Ruler({ orientation, length, scale }) {
  const majorEvery = length > 1600 ? 200 : length > 800 ? 100 : 50;
  const ticks = [];
  for (let value = 0; value <= length; value += majorEvery) ticks.push(value);
  return (
    <div className={`csv4-ruler csv4-ruler--${orientation}`} aria-hidden="true">
      {ticks.map((value) => (
        <span key={value} style={orientation === "horizontal" ? { left: value * scale } : { top: value * scale }}>
          <i />
          <b>{value}</b>
        </span>
      ))}
    </div>
  );
}

const KonvaCanvas = forwardRef(function KonvaCanvas({
  canvas,
  layers,
  selectedLayerIds,
  zoom,
  snapEnabled,
  rulersEnabled,
  guidesEnabled,
  safeZonesEnabled,
  onSelectLayer,
  onClearSelection,
  onCommitLayer,
  onCommitLayers,
  onUpdateGuide,
  onRemoveGuide,
}, ref) {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const [guides, setGuides] = useState({ vertical: null, horizontal: null });

  const stageSize = useMemo(() => {
    const maxWidth = 760; const maxHeight = 650;
    const fitScale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
    const scale = fitScale * zoom;
    return { width: canvas.width * scale, height: canvas.height * scale, scale };
  }, [canvas.height, canvas.width, zoom]);

  useImperativeHandle(ref, () => ({
    toDataURL(options = {}) {
      return stageRef.current?.toDataURL({ pixelRatio: 1 / Math.max(stageSize.scale, 0.01), ...options }) || "";
    },
  }), [stageSize.scale]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedLayerIds
      .map((id) => nodeRefs.current.get(id))
      .filter((node) => node && !layers.find((layer) => layer.id === node.id())?.locked);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [layers, selectedLayerIds]);

  useEffect(() => {
    if (!snapEnabled) setGuides({ vertical: null, horizontal: null });
  }, [snapEnabled]);

  const safeZone = canvas.safeZone;

  return (
    <div className="csv4-canvas-wrap">
      <div className={`csv4-canvas-area${rulersEnabled ? " has-rulers" : ""}`}>
        {rulersEnabled && <Ruler orientation="horizontal" length={canvas.width} scale={stageSize.scale} />}
        {rulersEnabled && <Ruler orientation="vertical" length={canvas.height} scale={stageSize.scale} />}
        <div
          className={`csv4-canvas-frame${canvas.transparent ? " is-transparent" : ""}`}
          style={{ width: stageSize.width, height: stageSize.height }}
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={stageSize.scale}
            scaleY={stageSize.scale}
            onMouseDown={(event) => { if (event.target === event.target.getStage()) onClearSelection(); }}
            onTouchStart={(event) => { if (event.target === event.target.getStage()) onClearSelection(); }}
          >
            <Layer>
              {!canvas.transparent && (
                <Rect x={0} y={0} width={canvas.width} height={canvas.height} fill={canvas.background} listening={false} />
              )}

              {layers.map((layer) => (
                <LayerNode
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerIds.includes(layer.id)}
                  selectedLayerIds={selectedLayerIds}
                  snapEnabled={snapEnabled}
                  canvas={canvas}
                  nodeRefs={nodeRefs}
                  stageScale={stageSize.scale}
                  onSelect={onSelectLayer}
                  onCommit={onCommitLayer}
                  onCommitMany={onCommitLayers}
                  onGuidesChange={setGuides}
                  registerNode={(node) => {
                    if (node) nodeRefs.current.set(layer.id, node);
                    else nodeRefs.current.delete(layer.id);
                  }}
                />
              ))}

              {safeZonesEnabled && safeZone && (
                <Rect
                  x={safeZone.left}
                  y={safeZone.top}
                  width={Math.max(0, canvas.width - safeZone.left - safeZone.right)}
                  height={Math.max(0, canvas.height - safeZone.top - safeZone.bottom)}
                  stroke="#22c55e"
                  strokeWidth={1.5 / stageSize.scale}
                  dash={[10 / stageSize.scale, 7 / stageSize.scale]}
                  listening={false}
                />
              )}

              {guidesEnabled && canvas.guides.map((guide) => (
                <Line
                  key={guide.id}
                  points={guide.orientation === "vertical"
                    ? [guide.position, 0, guide.position, canvas.height]
                    : [0, guide.position, canvas.width, guide.position]}
                  stroke="#06b6d4"
                  strokeWidth={1.5 / stageSize.scale}
                  dash={[8 / stageSize.scale, 5 / stageSize.scale]}
                  draggable
                  hitStrokeWidth={12 / stageSize.scale}
                  dragBoundFunc={(position) => guide.orientation === "vertical"
                    ? { x: Math.max(0, Math.min(canvas.width, position.x)), y: 0 }
                    : { x: 0, y: Math.max(0, Math.min(canvas.height, position.y)) }}
                  onDragEnd={(event) => {
                    const position = guide.orientation === "vertical" ? event.target.x() : event.target.y();
                    event.target.position({ x: 0, y: 0 });
                    onUpdateGuide(guide.id, position);
                  }}
                  onDblClick={() => onRemoveGuide(guide.id)}
                />
              ))}

              {guides.vertical !== null && (
                <Line points={[guides.vertical, 0, guides.vertical, canvas.height]} stroke="#ec4899" strokeWidth={1.5 / stageSize.scale} dash={[8 / stageSize.scale, 6 / stageSize.scale]} listening={false} />
              )}
              {guides.horizontal !== null && (
                <Line points={[0, guides.horizontal, canvas.width, guides.horizontal]} stroke="#ec4899" strokeWidth={1.5 / stageSize.scale} dash={[8 / stageSize.scale, 6 / stageSize.scale]} listening={false} />
              )}

              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                keepRatio={false}
                anchorSize={10 / stageSize.scale}
                anchorCornerRadius={4 / stageSize.scale}
                borderStroke="#3b82f6"
                borderStrokeWidth={1.5 / stageSize.scale}
                anchorStroke="#3b82f6"
                anchorFill="#ffffff"
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
                boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < MIN_SIZE || Math.abs(newBox.height) < MIN_SIZE ? oldBox : newBox}
              />
            </Layer>
          </Stage>
        </div>
      </div>
      <p className="csv4-canvas-help">
        Shift-click to multi-select. Drag cyan guides to reposition; double-click one to remove it.
      </p>
    </div>
  );
});

export default KonvaCanvas;
