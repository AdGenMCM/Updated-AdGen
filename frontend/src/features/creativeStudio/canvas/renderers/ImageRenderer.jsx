import React, { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";

export default function ImageRenderer({ layer }) {
  const image = useHtmlImage(layer.src);
  const crop = calculateImagePlacement(layer, image);

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
      <Rect
        width={layer.width}
        height={layer.height}
        fill="#e2e8f0"
        cornerRadius={layer.cornerRadius || 0}
        shadowEnabled={Boolean(layer.shadowEnabled)}
        shadowColor="#000000"
        shadowBlur={layer.shadowBlur || 20}
        shadowOpacity={layer.shadowOpacity ?? 0.2}
        shadowOffsetY={layer.shadowOffsetY || 8}
      />

      {image ? (
        <KonvaImage
          image={image}
          x={crop.x}
          y={crop.y}
          width={crop.width}
          height={crop.height}
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

function calculateImagePlacement(layer, image) {
  const sourceWidth =
    image?.naturalWidth || layer.naturalWidth || layer.width || 1;
  const sourceHeight =
    image?.naturalHeight || layer.naturalHeight || layer.height || 1;

  if (layer.fit === "stretch") {
    return { x: 0, y: 0, width: layer.width, height: layer.height };
  }

  const scale =
    layer.fit === "contain"
      ? Math.min(layer.width / sourceWidth, layer.height / sourceHeight)
      : Math.max(layer.width / sourceWidth, layer.height / sourceHeight);

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (layer.width - width) / 2,
    y: (layer.height - height) / 2,
    width,
    height,
  };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}
