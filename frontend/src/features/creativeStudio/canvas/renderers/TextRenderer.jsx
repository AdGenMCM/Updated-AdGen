import React from "react";
import { Text } from "react-konva";

export default function TextRenderer({ layer }) {
  return (
    <Text
      x={0}
      y={0}
      width={layer.width}
      height={layer.height}
      text={layer.text}
      fill={layer.fill}
      fontSize={layer.fontSize}
      fontFamily="Inter, Arial, sans-serif"
      verticalAlign="middle"
      padding={8}
      wrap="word"
    />
  );
}
