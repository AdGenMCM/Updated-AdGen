import React from "react";
import "./Section.css";

export default function Section({
  children,
  className = "",
  size = "md", // sm | md | lg | xl
  container = "standard", // narrow | standard | wide | full
  align = "left", // left | center
  divider = false,
  id,
}) {
  return (
    <section
      id={id}
      className={`adgen-section ${size} ${align} ${divider ? "with-divider" : ""} ${className}`}
    >
      <div className={`adgen-section-container ${container}`}>
        {children}
      </div>
    </section>
  );
}