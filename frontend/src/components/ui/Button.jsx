import React from "react";
import "./ui.css";

export default function Button({ children, className = "", ...props }) {
  return (
    <button className={`ui-button ${className}`} {...props}>
      {children}
    </button>
  );
}