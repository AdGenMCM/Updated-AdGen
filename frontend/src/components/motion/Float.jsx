import React from "react";
import "./Float.css";

export default function Float({
  children,
  className = "",
  speed = "md", // sm | md | lg
  delay = 0,
  intensity = 10,
  as: Tag = "div",
}) {
  return (
    <Tag
      className={`adgen-float adgen-float-${speed} ${className}`}
      style={{
        "--float-delay": `${delay}ms`,
        "--float-distance": `${intensity}px`,
      }}
    >
      {children}
    </Tag>
  );
}