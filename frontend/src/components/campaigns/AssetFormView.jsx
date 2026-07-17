import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Save,
  UploadCloud,
} from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Breadcrumbs from "./Breadcrumbs";

export default function AssetFormView({
  campaign,
  lineItem,
  editing,
  form,
  saving,
  error,
  onChange,
  onBack,
  onCampaigns,
  onCampaign,
  onSubmit,
}) {
  const [dimensions, setDimensions] = useState(null);

  const preview = useMemo(() => {
    if (form.file) {
      return URL.createObjectURL(form.file);
    }
    return editing?.file_url || "";
  }, [editing, form.file]);

  useEffect(() => {
    if (!form.file) {
      setDimensions(
        editing?.width && editing?.height
          ? { width: editing.width, height: editing.height }
          : null,
      );
      return undefined;
    }

    const objectUrl = URL.createObjectURL(form.file);
    const image = new Image();

    image.onload = () => {
      setDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      setDimensions(null);
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;

    return () => URL.revokeObjectURL(objectUrl);
  }, [editing, form.file]);

  useEffect(() => {
    return () => {
      if (form.file && preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [form.file, preview]);

  function handleSubmit(event) {
    if (!editing && !form.file) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  }

  return (
    <div className="campaign-page campaign-detail-page">
      <Breadcrumbs
        items={[
          { label: "Campaign Manager", onClick: onCampaigns },
          { label: campaign.name, onClick: onCampaign },
          { label: lineItem.name, onClick: onBack },
          { label: editing ? "Edit Asset" : "Upload Asset" },
        ]}
      />

      <header className="campaign-form-hero">
        <button type="button" className="campaign-back-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to {lineItem.name}
        </button>

        <span className="campaign-workspace-eyebrow">CAMPAIGN ASSET</span>
        <h1>{editing ? "Edit asset" : "Upload asset"}</h1>
        <p>
          Add the image, destination URL, and up to two third-party impression
          pixels. Compatible inventory will be calculated after upload.
        </p>
      </header>

      {error && <div className="campaign-error">{error}</div>}

      <form onSubmit={handleSubmit} className="campaign-form-shell">
        <div className="campaign-asset-layout">
          <Card className="campaign-form-card campaign-form-card-polished">
            <section className="campaign-form-section">
              <div className="campaign-form-section-heading">
                <div className="campaign-form-section-icon">
                  <ImageIcon size={19} />
                </div>
                <div>
                  <h2>Creative file</h2>
                  <p>
                    AdGen MCM reads the image’s real dimensions and uses them to
                    reveal compatible inventory on the line item.
                  </p>
                </div>
              </div>

              <div className="campaign-form-grid">
                <label className="campaign-field campaign-field-wide">
                  <span>Asset name</span>
                  <input
                    value={form.name}
                    onChange={(event) => onChange("name", event.target.value)}
                    placeholder="Example: Summer offer — 300 × 250"
                    required
                  />
                </label>

                {!editing && (
                  <label className="campaign-upload-field campaign-field-wide">
                    <UploadCloud size={28} />
                    <strong>Choose image</strong>
                    <span>JPG, PNG, WEBP, or GIF · Maximum 10 MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) =>
                        onChange("file", event.target.files?.[0] || null)
                      }
                      required
                    />
                  </label>
                )}

                <label className="campaign-field campaign-field-wide">
                  <span>Alt text</span>
                  <input
                    value={form.alt_text}
                    onChange={(event) =>
                      onChange("alt_text", event.target.value)
                    }
                    placeholder="Describe the image for accessibility"
                  />
                </label>
              </div>
            </section>

            <section className="campaign-form-section">
              <div className="campaign-form-section-heading">
                <div className="campaign-form-section-icon">
                  <ExternalLink size={19} />
                </div>
                <div>
                  <h2>Destination and tracking</h2>
                  <p>
                    Tracking pixel fields accept HTTPS impression URLs only.
                  </p>
                </div>
              </div>

              <div className="campaign-form-grid">
                <label className="campaign-field campaign-field-wide">
                  <span>Click-through URL</span>
                  <div className="campaign-input-icon">
                    <ExternalLink size={16} />
                    <input
                      type="url"
                      value={form.click_through_url}
                      onChange={(event) =>
                        onChange("click_through_url", event.target.value)
                      }
                      placeholder="https://advertiser.com/landing-page"
                      required
                    />
                  </div>
                </label>

                <label className="campaign-field campaign-field-wide">
                  <span>Third-party tracking pixel 1</span>
                  <input
                    type="url"
                    value={form.tracking_pixel_1}
                    onChange={(event) =>
                      onChange("tracking_pixel_1", event.target.value)
                    }
                    placeholder="https://tracker.example.com/impression/..."
                  />
                </label>

                <label className="campaign-field campaign-field-wide">
                  <span>Third-party tracking pixel 2</span>
                  <input
                    type="url"
                    value={form.tracking_pixel_2}
                    onChange={(event) =>
                      onChange("tracking_pixel_2", event.target.value)
                    }
                    placeholder="https://tracker.example.com/impression/..."
                  />
                  <small>
                    Pixels are stored for delivery and are not fired from this
                    preview.
                  </small>
                </label>
              </div>
            </section>

            <div className="campaign-form-actions campaign-form-actions-sticky">
              <Button
                type="button"
                className="campaign-secondary-button"
                onClick={onBack}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                <Save size={16} />
                {saving
                  ? "Saving..."
                  : editing
                    ? "Save Changes"
                    : "Upload Asset"}
              </Button>
            </div>
          </Card>

          <aside className="campaign-asset-sidebar">
            <Card className="campaign-asset-preview">
              <span>Image preview</span>
              {preview ? (
                <>
                  <img src={preview} alt={form.alt_text || "Asset preview"} />
                  <p>
                    {dimensions
                      ? `${dimensions.width} × ${dimensions.height} pixels`
                      : "Reading image dimensions..."}
                  </p>
                </>
              ) : (
                <div className="campaign-preview-empty">
                  <ImageIcon size={25} />
                  Select an image to preview it here.
                </div>
              )}
            </Card>

            <Card className="campaign-compatibility-card">
              <span>Inventory matching</span>
              <h3>Calculated after upload</h3>
              <p>
                The backend verifies the actual image dimensions. Once saved,
                the line item’s Inventory tab will show only templates this
                asset can fit.
              </p>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  );
}
