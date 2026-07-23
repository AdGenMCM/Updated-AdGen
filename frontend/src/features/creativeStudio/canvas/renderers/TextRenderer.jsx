import React from "react";
import { Text } from "react-konva";
import { getTypographyProps, transformText } from "../typography";

export default function TextRenderer({ layer }) {
  const typography = getTypographyProps(layer);

  return (
    <Text
      x={0}
      y={0}
      width={layer.width}
      height={layer.height}
      text={transformText(layer.text, layer.textTransform)}
      fill={layer.fill || "#111827"}
      fontSize={Number(layer.fontSize || 72)}
      verticalAlign={layer.verticalAlign || "middle"}
      padding={8}
      wrap="word"
      {...typography}
    />
  );
}
