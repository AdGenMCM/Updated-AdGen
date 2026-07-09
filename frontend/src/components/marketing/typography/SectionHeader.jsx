import React from "react";
import "./SectionHeader.css";

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left", // left | center
  className = "",
}) {
  return (
    <div className={`adgen-section-header ${align} ${className}`}>
      {eyebrow && <p className="adgen-section-eyebrow">{eyebrow}</p>}
      {title && <h2>{title}</h2>}
      {description && <p className="adgen-section-description">{description}</p>}
    </div>
  );
}