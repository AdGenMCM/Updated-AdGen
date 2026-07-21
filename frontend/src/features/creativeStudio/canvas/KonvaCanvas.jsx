import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import ShapeRenderer from "./ShapeRenderer";

const MIN_SIZE = 20;
const SNAP_DISTANCE_SCREEN_PX = 6;

function clampSize(value) {
  return Math.max(MIN_SIZE, Math.round(value));
}

function getNodeRect(node, relativeTo) {
  return node.getClientRect({
    relativeTo,
    skipShadow: true,
    skipStroke: false,
  });
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

function getGuideStops({
  canvas,
  nodeRefs,
  activeLayerId,
  relativeTo,
}) {
  const vertical = [
    { value: 0, source: "canvas" },
    { value: canvas.width / 2, source: "canvas" },
    { value: canvas.width, source: "canvas" },
  ];

  const horizontal = [
    { value: 0, source: "canvas" },
    { value: canvas.height / 2, source: "canvas" },
    { value: canvas.height, source: "canvas" },
  ];

  nodeRefs.current.forEach((node, layerId) => {
    if (!node || layerId === activeLayerId) return;

    const rect = getNodeRect(node, relativeTo);
    const points = getRectSnapPoints(rect);

    points.vertical.forEach((point) => {
      vertical.push({
        value: point.value,
        source: "layer",
        layerId,
      });
    });

    points.horizontal.forEach((point) => {
      horizontal.push({
        value: point.value,
        source: "layer",
        layerId,
      });
    });
  });

  return { vertical, horizontal };
}

function findClosestSnap({
  candidates,
  targets,
  threshold,
}) {
  let closest = null;

  candidates.forEach((candidate) => {
    targets.forEach((target) => {
      const delta = target.value - candidate.value;
      const distance = Math.abs(delta);

      if (distance > threshold) return;

      if (!closest || distance < closest.distance) {
        closest = {
          distance,
          delta,
          guide: target.value,
          candidateEdge: candidate.edge,
          source: target.source,
          layerId: target.layerId || null,
        };
      }
    });
  });

  return closest;
}

function calculateSnap({
  node,
  canvas,
  nodeRefs,
  activeLayerId,
  stageScale,
}) {
  const relativeTo = node.getLayer();
  const activeRect = getNodeRect(node, relativeTo);
  const activePoints = getRectSnapPoints(activeRect);

  const guideStops = getGuideStops({
    canvas,
    nodeRefs,
    activeLayerId,
    relativeTo,
  });

  const threshold = SNAP_DISTANCE_SCREEN_PX / Math.max(stageScale, 0.01);

  const verticalSnap = findClosestSnap({
    candidates: activePoints.vertical,
    targets: guideStops.vertical,
    threshold,
  });

  const horizontalSnap = findClosestSnap({
    candidates: activePoints.horizontal,
    targets: guideStops.horizontal,
    threshold,
  });

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
  snapEnabled,
  canvas,
  nodeRefs,
  stageScale,
  onSelect,
  onCommit,
  onGuidesChange,
  registerNode,
}) {
  return (
    <Group
      id={layer.id}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      draggable
      ref={registerNode}
      shadowColor={isSelected ? "rgba(37, 99, 235, 0.35)" : undefined}
      shadowBlur={isSelected ? 12 : 0}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(layer.id);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(layer.id);
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onSelect(layer.id);
        onGuidesChange({ vertical: null, horizontal: null });
      }}
      onDragMove={(event) => {
        if (!snapEnabled) {
          onGuidesChange({ vertical: null, horizontal: null });
          return;
        }

        const node = event.target;
        const snap = calculateSnap({
          node,
          canvas,
          nodeRefs,
          activeLayerId: layer.id,
          stageScale,
        });

        if (snap.deltaX !== 0 || snap.deltaY !== 0) {
          node.position({
            x: node.x() + snap.deltaX,
            y: node.y() + snap.deltaY,
          });
        }

        onGuidesChange({
          vertical: snap.verticalGuide,
          horizontal: snap.horizontalGuide,
        });
      }}
      onDragEnd={(event) => {
        const node = event.target;

        onGuidesChange({ vertical: null, horizontal: null });

        onCommit(layer.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        });
      }}
      onTransformStart={() => {
        onSelect(layer.id);
        onGuidesChange({ vertical: null, horizontal: null });
      }}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        const nextWidth = clampSize(node.width() * scaleX);
        const nextHeight = clampSize(node.height() * scaleY);

        node.scaleX(1);
        node.scaleY(1);

        onCommit(layer.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: nextWidth,
          height: nextHeight,
          rotation: Math.round(node.rotation()),
        });
      }}
    >
      <ShapeRenderer layer={layer} />
    </Group>
  );
}

const KonvaCanvas = forwardRef(function KonvaCanvas({
  canvas,
  layers,
  selectedLayerId,
  zoom,
  snapEnabled,
  onSelectLayer,
  onClearSelection,
  onCommitLayer,
}, ref) {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const [guides, setGuides] = useState({
    vertical: null,
    horizontal: null,
  });

  const stageSize = useMemo(() => {
    const maxWidth = 760;
    const maxHeight = 650;

    const fitScale = Math.min(
      maxWidth / canvas.width,
      maxHeight / canvas.height,
      1,
    );

    const scale = fitScale * zoom;

    return {
      width: canvas.width * scale,
      height: canvas.height * scale,
      scale,
    };
  }, [canvas.height, canvas.width, zoom]);

  useImperativeHandle(
    ref,
    () => ({
      toDataURL(options = {}) {
        return (
          stageRef.current?.toDataURL({
            pixelRatio: 1 / Math.max(stageSize.scale, 0.01),
            ...options,
          }) || ""
        );
      },
    }),
    [stageSize.scale],
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = selectedLayerId
      ? nodeRefs.current.get(selectedLayerId)
      : null;

    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerId, layers]);

  useEffect(() => {
    if (!snapEnabled) {
      setGuides({ vertical: null, horizontal: null });
    }
  }, [snapEnabled]);

  return (
    <div className="csv4-canvas-wrap">
      <div
        className="csv4-canvas-frame"
        style={{
          width: stageSize.width,
          height: stageSize.height,
        }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={stageSize.scale}
          scaleY={stageSize.scale}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) {
              onClearSelection();
            }
          }}
          onTouchStart={(event) => {
            if (event.target === event.target.getStage()) {
              onClearSelection();
            }
          }}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={canvas.width}
              height={canvas.height}
              fill={canvas.background}
              listening={false}
            />

            {layers.map((layer) => (
              <LayerNode
                key={layer.id}
                layer={layer}
                isSelected={layer.id === selectedLayerId}
                snapEnabled={snapEnabled}
                canvas={canvas}
                nodeRefs={nodeRefs}
                stageScale={stageSize.scale}
                onSelect={onSelectLayer}
                onCommit={onCommitLayer}
                onGuidesChange={setGuides}
                registerNode={(node) => {
                  if (node) {
                    nodeRefs.current.set(layer.id, node);
                  } else {
                    nodeRefs.current.delete(layer.id);
                  }
                }}
              />
            ))}

            {guides.vertical !== null && (
              <Line
                points={[
                  guides.vertical,
                  0,
                  guides.vertical,
                  canvas.height,
                ]}
                stroke="#ec4899"
                strokeWidth={1.5 / stageSize.scale}
                dash={[
                  8 / stageSize.scale,
                  6 / stageSize.scale,
                ]}
                listening={false}
              />
            )}

            {guides.horizontal !== null && (
              <Line
                points={[
                  0,
                  guides.horizontal,
                  canvas.width,
                  guides.horizontal,
                ]}
                stroke="#ec4899"
                strokeWidth={1.5 / stageSize.scale}
                dash={[
                  8 / stageSize.scale,
                  6 / stageSize.scale,
                ]}
                listening={false}
              />
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
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
                "top-center",
                "bottom-center",
              ]}
              boundBoxFunc={(oldBox, newBox) => {
                if (
                  Math.abs(newBox.width) < MIN_SIZE ||
                  Math.abs(newBox.height) < MIN_SIZE
                ) {
                  return oldBox;
                }

                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>

      <p className="csv4-canvas-help">
        Drag to move. Use handles to resize and rotate. Arrow keys nudge the selected layer.
      </p>
    </div>
  );
});

export default KonvaCanvas;
