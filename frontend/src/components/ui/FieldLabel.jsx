import React from "react";
import InfoTip from "./InfoTip";

export default function FieldLabel({
  label,
  htmlFor,
  info,
  optional = false,
  required = false,
  beta = false,
  className = "",
}) {
  return (
    <label
    htmlFor={htmlFor}
    className={`ui-field-label ${className}`}
    >
      <span className="ui-field-label-text">{label}</span>

      {required && (
        <span className="ui-field-badge required">
          Required
        </span>
      )}

      {optional && (
        <span className="ui-field-badge optional">
          Optional
        </span>
      )}

      {beta && (
        <span className="ui-field-badge beta">
          Beta
        </span>
      )}

      {info && (
        <InfoTip text={info} />
      )}
    </label>
  );
}