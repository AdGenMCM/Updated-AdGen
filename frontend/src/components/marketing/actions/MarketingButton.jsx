import React from "react";
import "./MarketingButton.css";

export default function MarketingButton({
  children,
  href,
  onClick,
  variant = "primary", // primary | secondary | ghost
  size = "md", // sm | md | lg
  className = "",
  type = "button",
}) {
  const classes = `adgen-marketing-button ${variant} ${size} ${className}`;

  if (href) {
    return (
      <a className={classes} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} type={type} onClick={onClick}>
      {children}
    </button>
  );
}