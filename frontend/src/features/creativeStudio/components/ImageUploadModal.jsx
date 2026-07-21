import React, { useState } from "react";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

export default function ImageUploadModal({
  open,
  mode = "layer",
  onClose,
  onChooseFile,
  storageUsedBytes = 0,
  storageLimitBytes = 0,
  uploading = false,
}) {
  const [hideNextTime, setHideNextTime] = useState(false);

  if (!open) return null;

  const usageText = formatStorageUsage(storageUsedBytes, storageLimitBytes);
  const createCanvas = mode === "canvas";

  const handleChoose = (event) => {
    if (uploading) return;
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (hideNextTime) {
      window.localStorage.setItem("creativeStudioHideStorageNotice", "true");
    }

    onChooseFile(file);
  };

  return (
    <div className="csv4-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="csv4-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv4-image-upload-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="csv4-modal__icon">{createCanvas ? "▣" : "▧"}</div>

        <div>
          <span className="csv4__eyebrow">Creative Studio</span>
          <h2 id="csv4-image-upload-title">
            {createCanvas ? "Create from an image" : "Add an image layer"}
          </h2>
        </div>

        <p>
          {createCanvas
            ? "The canvas will resize to the uploaded image's exact dimensions and aspect ratio."
            : "The image will be added as a movable, resizable layer without changing the canvas."}
        </p>

        <div className="csv4-storage-notice">
          <strong>Storage notice</strong>
          <p>
            Images uploaded to Creative Studio are stored with your account and
            count toward your available storage limit. Deleting an uploaded
            image later will free that space.
          </p>
          {usageText && <span>{usageText}</span>}
        </div>

        <label className="csv4-check-field csv4-check-field--modal">
          <input
            type="checkbox"
            checked={hideNextTime}
            onChange={(event) => setHideNextTime(event.target.checked)}
          />
          <span>Do not show this notice again</span>
        </label>

        <div className="csv4-modal__actions">
          <button type="button" className="csv4-modal__secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>

          <label className={`csv4-modal__primary ${uploading ? "is-disabled" : ""}`}>
            {uploading ? "Uploading..." : createCanvas ? "Choose canvas image" : "Choose layer image"}
            <input type="file" accept={ACCEPTED_TYPES} onChange={handleChoose} disabled={uploading} />
          </label>
        </div>
      </section>
    </div>
  );
}

function formatStorageUsage(usedBytes, limitBytes) {
  if (!usedBytes && !limitBytes) return "";

  const used = formatBytes(usedBytes);
  if (!limitBytes) return `${used} currently used`;
  return `${used} of ${formatBytes(limitBytes)} currently used`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[index]
  }`;
}
