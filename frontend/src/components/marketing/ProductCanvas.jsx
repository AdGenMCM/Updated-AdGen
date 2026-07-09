import React from "react";
import "./ProductCanvas.css";

export default function ProductCanvas({
  src,
  alt = "AdGen product screenshot",
  variant = "showcase",
  floatingCards = null,
  className = "",
  children,
}) {
  return (
    <div className={`adgen-product-canvas-wrap ${variant} ${className}`}>
      <div className="adgen-product-canvas-glow" />

      <div className="adgen-product-canvas">
        {children ? (
          children
        ) : src ? (
          <img src={src} alt={alt} />
        ) : (
          <div className="adgen-product-canvas-empty">
            AdGen Product Preview
          </div>
        )}
      </div>

      {floatingCards && (
        <div className="adgen-product-floating-cards">
          {floatingCards}
        </div>
      )}
    </div>
  );
}