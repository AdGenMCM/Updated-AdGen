import React from "react";
import {
  Arrow,
  Ellipse,
  Line,
  Rect,
  RegularPolygon,
  Star,
} from "react-konva";

export default function BasicShapeRenderer({ layer }) {
  switch (layer.type) {
    case "rect":
      return (
        <Rect width={layer.width} height={layer.height} fill={layer.fill} />
      );

    case "roundedRect":
      return (
        <Rect
          width={layer.width}
          height={layer.height}
          fill={layer.fill}
          cornerRadius={layer.cornerRadius}
        />
      );

    case "circle":
      return (
        <Ellipse
          x={layer.width / 2}
          y={layer.height / 2}
          radiusX={layer.width / 2}
          radiusY={layer.height / 2}
          fill={layer.fill}
        />
      );

    case "triangle":
      return (
        <RegularPolygon
          x={layer.width / 2}
          y={layer.height / 2}
          sides={3}
          radius={Math.min(layer.width, layer.height) / 2}
          fill={layer.fill}
        />
      );

    case "line":
      return (
        <Line
          points={[0, layer.height / 2, layer.width, layer.height / 2]}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          lineCap="round"
          hitStrokeWidth={Math.max(18, layer.strokeWidth + 10)}
        />
      );

    case "arrow":
      return (
        <Arrow
          points={[0, layer.height / 2, layer.width, layer.height / 2]}
          stroke={layer.stroke}
          fill={layer.stroke}
          strokeWidth={layer.strokeWidth}
          pointerLength={24}
          pointerWidth={22}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(18, layer.strokeWidth + 10)}
        />
      );

    case "star":
      return (
        <Star
          x={layer.width / 2}
          y={layer.height / 2}
          numPoints={5}
          innerRadius={Math.min(layer.width, layer.height) * 0.22}
          outerRadius={Math.min(layer.width, layer.height) * 0.5}
          fill={layer.fill}
        />
      );

    default:
      return null;
  }
}
