import React from "react";

export default function StatusBadge({ status = "draft" }) {
  return <span className={`campaign-status ${status}`}>{status}</span>;
}
