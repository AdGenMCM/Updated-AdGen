import React from "react";
import "./ui.css";

export default function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="ui-section-title">
      {eyebrow && <span>{eyebrow}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}