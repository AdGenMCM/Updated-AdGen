import React from "react";
import { Circle, Line, Rect, Star, Text } from "react-konva";

function centeredTextProps(layer, overrides = {}) {
  return {
    x: 0,
    y: 0,
    width: layer.width,
    height: layer.height,
    align: "center",
    verticalAlign: "middle",
    fontFamily: "Inter, Arial, sans-serif",
    fontStyle: "bold",
    fill: layer.textColor || layer.fill || "#111827",
    fontSize: layer.fontSize || 36,
    listening: false,
    ...overrides,
  };
}

function RatingStars({ layer }) {
  const count = Math.max(1, Math.min(5, Math.round(layer.rating || 5)));
  const gap = layer.width * 0.025;
  const textArea = layer.showRatingText ? layer.width * 0.2 : 0;
  const available = layer.width - textArea;
  const starSize = Math.min(layer.height * 0.72, (available - gap * 4) / 5);
  const top = (layer.height - starSize) / 2;

  return (
    <>
      <Rect
        width={layer.width}
        height={layer.height}
        fill="rgba(0, 0, 0, 0.001)"
      />

      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          x={starSize / 2 + index * (starSize + gap)}
          y={top + starSize / 2}
          numPoints={5}
          innerRadius={starSize * 0.22}
          outerRadius={starSize * 0.48}
          fill={index < count ? layer.fill : "#d1d5db"}
          listening={false}
        />
      ))}

      {layer.showRatingText && (
        <Text
          x={available}
          y={0}
          width={textArea}
          height={layer.height}
          text={layer.text || String(layer.rating || 5)}
          align="center"
          verticalAlign="middle"
          fontFamily="Inter, Arial, sans-serif"
          fontStyle="bold"
          fontSize={layer.fontSize || 34}
          fill={layer.textColor || "#111827"}
          listening={false}
        />
      )}
    </>
  );
}

export default function AdElementRenderer({ layer }) {
  switch (layer.type) {
    case "ctaButton":
      return (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill={layer.fill}
            cornerRadius={layer.cornerRadius || 24}
            shadowEnabled={layer.shadowEnabled}
            shadowColor="#000000"
            shadowBlur={layer.shadowBlur || 20}
            shadowOpacity={layer.shadowOpacity ?? 0.2}
            shadowOffsetY={8}
          />
          <Text {...centeredTextProps(layer)} text={layer.text || "SHOP NOW"} />
        </>
      );

    case "saleBadge":
      return (
        <>
          <Star
            x={layer.width / 2}
            y={layer.height / 2}
            numPoints={layer.badgePoints || 18}
            innerRadius={Math.min(layer.width, layer.height) * 0.41}
            outerRadius={Math.min(layer.width, layer.height) * 0.5}
            fill={layer.fill}
          />
          <Text
            {...centeredTextProps(layer, {
              padding: layer.width * 0.16,
              lineHeight: 0.9,
            })}
            text={layer.text || "50%\nOFF"}
          />
        </>
      );

    case "priceTag":
      return (
        <>
          <Line
            points={[
              0,
              0,
              layer.width * 0.84,
              0,
              layer.width,
              layer.height / 2,
              layer.width * 0.84,
              layer.height,
              0,
              layer.height,
            ]}
            closed
            fill={layer.fill}
          />
          <Circle
            x={layer.width * 0.88}
            y={layer.height / 2}
            radius={Math.max(8, layer.height * 0.06)}
            fill={layer.accentColor || "#f59e0b"}
          />
          <Text
            x={layer.width * 0.06}
            y={layer.height * 0.13}
            width={layer.width * 0.72}
            height={layer.height * 0.55}
            text={layer.text || "$29.99"}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fontSize={layer.fontSize || 56}
            fill={layer.textColor || "#ffffff"}
            verticalAlign="middle"
          />
          <Text
            x={layer.width * 0.06}
            y={layer.height * 0.65}
            width={layer.width * 0.72}
            height={layer.height * 0.22}
            text={layer.subtext || "LIMITED OFFER"}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fontSize={Math.max(12, (layer.fontSize || 56) * 0.28)}
            fill={layer.accentColor || "#f59e0b"}
            letterSpacing={1.5}
          />
        </>
      );

    case "ratingStars":
      return <RatingStars layer={layer} />;

    case "promoPill":
      return (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill={layer.fill}
            cornerRadius={layer.cornerRadius || layer.height / 2}
          />
          <Circle
            x={layer.height * 0.25}
            y={layer.height / 2}
            radius={layer.height * 0.09}
            fill={layer.textColor || "#6d28d9"}
          />
          <Text
            {...centeredTextProps(layer, {
              x: layer.height * 0.18,
              width: layer.width - layer.height * 0.18,
            })}
            text={layer.text || "LIMITED TIME"}
          />
        </>
      );

    case "ribbon":
      return (
        <>
          <Line
            points={[
              0,
              layer.height * 0.15,
              layer.width * 0.12,
              layer.height * 0.15,
              layer.width * 0.12,
              layer.height * 0.85,
              0,
              layer.height * 0.85,
              layer.width * 0.06,
              layer.height / 2,
            ]}
            closed
            fill={layer.accentColor || "#5b21b6"}
          />
          <Line
            points={[
              layer.width,
              layer.height * 0.15,
              layer.width * 0.88,
              layer.height * 0.15,
              layer.width * 0.88,
              layer.height * 0.85,
              layer.width,
              layer.height * 0.85,
              layer.width * 0.94,
              layer.height / 2,
            ]}
            closed
            fill={layer.accentColor || "#5b21b6"}
          />
          <Rect
            x={layer.width * 0.08}
            y={0}
            width={layer.width * 0.84}
            height={layer.height}
            fill={layer.fill}
            cornerRadius={10}
          />
          <Text
            {...centeredTextProps(layer, {
              x: layer.width * 0.1,
              width: layer.width * 0.8,
            })}
            text={layer.text || "BEST SELLER"}
          />
        </>
      );

    case "productCard":
      return (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill={layer.fill}
            cornerRadius={layer.cornerRadius || 28}
            shadowColor="#000000"
            shadowBlur={24}
            shadowOpacity={0.16}
            shadowOffsetY={8}
          />
          <Rect
            x={layer.width * 0.06}
            y={layer.height * 0.08}
            width={layer.width * 0.2}
            height={layer.width * 0.2}
            fill={layer.accentColor || "#2563eb"}
            cornerRadius={18}
            opacity={0.12}
          />
          <Star
            x={layer.width * 0.16}
            y={layer.height * 0.08 + layer.width * 0.1}
            numPoints={5}
            innerRadius={layer.width * 0.025}
            outerRadius={layer.width * 0.055}
            fill={layer.accentColor || "#2563eb"}
          />
          <Text
            x={layer.width * 0.31}
            y={layer.height * 0.09}
            width={layer.width * 0.62}
            height={layer.height * 0.25}
            text={layer.title || "Premium Formula"}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fontSize={layer.fontSize || 36}
            fill={layer.textColor || "#111827"}
            verticalAlign="middle"
          />
          <Text
            x={layer.width * 0.07}
            y={layer.height * 0.43}
            width={layer.width * 0.86}
            height={layer.height * 0.23}
            text={layer.text || "Built to stand out and convert."}
            fontFamily="Inter, Arial, sans-serif"
            fontSize={Math.max(16, (layer.fontSize || 36) * 0.48)}
            fill={layer.textColor || "#111827"}
            opacity={0.72}
            wrap="word"
          />
          <Text
            x={layer.width * 0.07}
            y={layer.height * 0.72}
            width={layer.width * 0.4}
            height={layer.height * 0.18}
            text={layer.price || "$39"}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fontSize={Math.max(22, (layer.fontSize || 36) * 0.86)}
            fill={layer.accentColor || "#2563eb"}
            verticalAlign="middle"
          />
          <Rect
            x={layer.width * 0.61}
            y={layer.height * 0.72}
            width={layer.width * 0.32}
            height={layer.height * 0.16}
            fill={layer.accentColor || "#2563eb"}
            cornerRadius={layer.height * 0.08}
          />
          <Text
            x={layer.width * 0.61}
            y={layer.height * 0.72}
            width={layer.width * 0.32}
            height={layer.height * 0.16}
            text="BUY NOW"
            align="center"
            verticalAlign="middle"
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fontSize={Math.max(13, (layer.fontSize || 36) * 0.38)}
            fill="#ffffff"
          />
        </>
      );

    case "frame":
      return (
        <Rect
          x={(layer.strokeWidth || 12) / 2}
          y={(layer.strokeWidth || 12) / 2}
          width={layer.width - (layer.strokeWidth || 12)}
          height={layer.height - (layer.strokeWidth || 12)}
          stroke={layer.stroke || "#2563eb"}
          strokeWidth={layer.strokeWidth || 12}
          cornerRadius={layer.cornerRadius || 0}
        />
      );

    default:
      return null;
  }
}
