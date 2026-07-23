import Konva from "konva";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";

const FILTER_MAP = {
  grayscale: Konva.Filters.Grayscale,
  sepia: Konva.Filters.Sepia,
  invert: Konva.Filters.Invert,
};

export default function ImageRenderer({ layer }) {
  const image = useHtmlImage(layer.src);
  const imageRef = useRef(null);
  const placement = calculateImagePlacement(layer, image);
  const filters = useMemo(() => buildFilters(layer), [layer]);

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;

    if (filters.length) node.cache({ pixelRatio: 1 });
    else node.clearCache();

    node.getLayer()?.batchDraw();
  }, [
    image,
    filters,
    layer.brightness,
    layer.contrast,
    layer.saturation,
    layer.blurRadius,
    layer.filterPreset,
  ]);

  return (
    <Group
      clipX={0}
      clipY={0}
      clipWidth={layer.width}
      clipHeight={layer.height}
      clipFunc={(context) => {
        roundedRectPath(
          context,
          0,
          0,
          layer.width,
          layer.height,
          layer.cornerRadius || 0,
        );
      }}
    >
      {/*
        Keep a nearly transparent hit surface so the entire image frame remains
        selectable, including transparent pixels in PNG/WebP assets.
      */}
      <Rect
        width={layer.width}
        height={layer.height}
        fill="rgba(0, 0, 0, 0.001)"
        cornerRadius={layer.cornerRadius || 0}
      />

      {/* Only render a visual image background when the user explicitly set one. */}
      {layer.imageBackground && layer.imageBackground !== "transparent" && (
        <Rect
          width={layer.width}
          height={layer.height}
          fill={layer.imageBackground}
          cornerRadius={layer.cornerRadius || 0}
          listening={false}
        />
      )}

      {/* Shadow belongs to the frame but must not introduce an opaque fill. */}
      {layer.shadowEnabled && (
        <Rect
          width={layer.width}
          height={layer.height}
          fill="rgba(0, 0, 0, 0.001)"
          cornerRadius={layer.cornerRadius || 0}
          shadowEnabled
          shadowColor={layer.shadowColor || "#000000"}
          shadowBlur={layer.shadowBlur || 20}
          shadowOpacity={layer.shadowOpacity ?? 0.2}
          shadowOffsetX={layer.shadowOffsetX || 0}
          shadowOffsetY={layer.shadowOffsetY || 8}
          listening={false}
        />
      )}

      {image ? (
        <KonvaImage
          ref={imageRef}
          image={image}
          x={placement.centerX}
          y={placement.centerY}
          width={placement.width}
          height={placement.height}
          offsetX={placement.width / 2}
          offsetY={placement.height / 2}
          rotation={Number(layer.imageRotation || 0)}
          scaleX={layer.flipX ? -1 : 1}
          scaleY={layer.flipY ? -1 : 1}
          filters={filters}
          brightness={normalizeBrightness(layer.brightness)}
          contrast={clamp(Number(layer.contrast || 0), -100, 100)}
          saturation={clamp(Number(layer.saturation ?? 0), -1, 1)}
          blurRadius={clamp(Number(layer.blurRadius || 0), 0, 100)}
          listening={false}
        />
      ) : (
        <Text
          width={layer.width}
          height={layer.height}
          text="Loading image…"
          align="center"
          verticalAlign="middle"
          fill="#64748b"
          fontFamily="Inter, Arial, sans-serif"
          fontSize={Math.max(16, Math.min(layer.width, layer.height) * 0.07)}
          listening={false}
        />
      )}

      {(layer.borderWidth || 0) > 0 && (
        <Rect
          x={(layer.borderWidth || 0) / 2}
          y={(layer.borderWidth || 0) / 2}
          width={Math.max(0, layer.width - (layer.borderWidth || 0))}
          height={Math.max(0, layer.height - (layer.borderWidth || 0))}
          stroke={layer.borderColor || "#ffffff"}
          strokeWidth={layer.borderWidth || 0}
          dash={layer.borderStyle === "dashed" ? [18, 12] : undefined}
          cornerRadius={layer.cornerRadius || 0}
          listening={false}
        />
      )}
    </Group>
  );
}

function useHtmlImage(src) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return undefined;
    }

    let cancelled = false;
    const nextImage = new Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) setImage(nextImage);
    };
    nextImage.onerror = () => {
      if (!cancelled) setImage(null);
    };
    nextImage.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

function buildFilters(layer) {
  const filters = [];
  const presetFilter = FILTER_MAP[layer.filterPreset];
  if (presetFilter) filters.push(presetFilter);
  if (Number(layer.brightness || 0) !== 0) filters.push(Konva.Filters.Brighten);
  if (Number(layer.contrast || 0) !== 0) filters.push(Konva.Filters.Contrast);
  if (Number(layer.saturation || 0) !== 0) filters.push(Konva.Filters.HSL);
  if (Number(layer.blurRadius || 0) > 0) filters.push(Konva.Filters.Blur);
  return filters;
}

function calculateImagePlacement(layer, image) {
  const sourceWidth = image?.naturalWidth || layer.naturalWidth || layer.width || 1;
  const sourceHeight = image?.naturalHeight || layer.naturalHeight || layer.height || 1;

  let baseWidth = layer.width;
  let baseHeight = layer.height;

  if (layer.fit !== "stretch") {
    const scale = layer.fit === "contain"
      ? Math.min(layer.width / sourceWidth, layer.height / sourceHeight)
      : Math.max(layer.width / sourceWidth, layer.height / sourceHeight);
    baseWidth = sourceWidth * scale;
    baseHeight = sourceHeight * scale;
  }

  const imageScale = clamp(Number(layer.imageScale || 1), 0.1, 5);
  return {
    centerX: layer.width / 2 + Number(layer.imageOffsetX || 0),
    centerY: layer.height / 2 + Number(layer.imageOffsetY || 0),
    width: baseWidth * imageScale,
    height: baseHeight * imageScale,
  };
}

function normalizeBrightness(value) {
  const number = Number(value || 0);
  return clamp(Math.abs(number) > 1 ? number / 100 : number, -1, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}
