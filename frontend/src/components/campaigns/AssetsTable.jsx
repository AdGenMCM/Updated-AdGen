import React from "react";
import { ChevronRight, ImagePlus, Plus } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import StatusBadge from "./StatusBadge";
import { formatDate, formatFileSize } from "./campaignUtils";

export default function AssetsTable({ assets, loading, onCreate, onOpen }) {
  return (
    <Card className="campaign-table-card">
      <div className="campaign-section-head">
        <div>
          <h2>Assets</h2>
          <p>
            Upload images with destination and tracking URLs. Their verified
            dimensions determine compatible inventory.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} />
          Upload Asset
        </Button>
      </div>

      {loading ? (
        <div className="campaign-table-state">Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="campaign-empty">
          <ImagePlus size={28} />
          <h3>No assets yet</h3>
          <p>
            Upload the first image for this line item. Compatible inventory will
            be calculated next.
          </p>
          <Button onClick={onCreate}>
            <Plus size={16} />
            Upload Asset
          </Button>
        </div>
      ) : (
        <div className="campaign-table-wrap">
          <table className="campaign-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Status</th>
                <th>Dimensions</th>
                <th>Inventory matching</th>
                <th>Tracking</th>
                <th>Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr
                  key={asset.id}
                  onClick={() => onOpen(asset)}
                  className={asset.status === "archived" ? "archived-row" : ""}
                >
                  <td>
                    <div className="campaign-asset-name">
                      <img src={asset.file_url} alt="" />
                      <div>
                        <strong>{asset.name}</strong>
                        <span>{asset.alt_text || asset.original_filename}</span>
                        <small>{formatFileSize(asset.file_size)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={asset.status} />
                  </td>
                  <td>
                    {asset.width && asset.height
                      ? `${asset.width} × ${asset.height}`
                      : "—"}
                  </td>
                  <td>Calculated automatically</td>
                  <td>
                    {(asset.tracking_pixels || []).length} pixel
                    {(asset.tracking_pixels || []).length === 1 ? "" : "s"}
                  </td>
                  <td>{formatDate(asset.created_at)}</td>
                  <td>
                    <ChevronRight size={18} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
