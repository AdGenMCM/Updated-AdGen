import React from "react";
import "./ProductMomentCard.css";

export default function ProductMomentCard({
  eyebrow,
  title,
  detail,
  status = "default", // default | success | active | insight | video
  icon = "spark",
  position = "",
  className = "",
}) {
  return (
    <div className={`adgen-moment-card ${status} ${position} ${className}`}>
      <div className="adgen-moment-icon" aria-hidden="true">
        {icon === "check" && "✓"}
        {icon === "spark" && "✦"}
        {icon === "chart" && "↗"}
        {icon === "video" && "▶"}
        {icon === "brand" && "◆"}
      </div>

      <div className="adgen-moment-copy">
        {eyebrow && <div className="adgen-moment-eyebrow">{eyebrow}</div>}
        <div className="adgen-moment-title">{title}</div>
        {detail && <div className="adgen-moment-detail">{detail}</div>}
      </div>
    </div>
  );
}