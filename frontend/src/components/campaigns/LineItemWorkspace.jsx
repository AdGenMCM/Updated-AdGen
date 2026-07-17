import React from "react";
import { Edit3 } from "lucide-react";
import Button from "../ui/Button";
import Breadcrumbs from "./Breadcrumbs";
import AssetsTable from "./AssetsTable";
import InventorySelection from "./InventorySelection";
import LineItemOverview from "./LineItemOverview";
import StatusBadge from "./StatusBadge";

export default function LineItemWorkspace({
  campaign,
  item,
  activeTab,
  assets,
  assetsLoading,
  inventory,
  inventoryLoading,
  inventorySaving,
  notice,
  error,
  onCampaigns,
  onCampaign,
  onTabChange,
  onEdit,
  onStatusChange,
  onArchive,
  onCreateAsset,
  onOpenAsset,
  onSaveInventory,
}) {
  return (
    <div className="campaign-page campaign-detail-page">
      <Breadcrumbs
        items={[
          { label: "Campaign Manager", onClick: onCampaigns },
          { label: campaign.name, onClick: onCampaign },
          { label: item.name },
        ]}
      />

      <div className="campaign-detail-header">
        <div>
          <span className="campaign-workspace-eyebrow">
            LINE ITEM WORKSPACE
          </span>
          <h1>{item.name}</h1>
          <div className="campaign-workspace-meta">
            <StatusBadge status={item.status} />
            <span>
              {(item.channels || []).length} delivery channel
              {(item.channels || []).length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <Button onClick={onEdit}>
          <Edit3 size={16} />
          Edit Line Item
        </Button>
      </div>

      <nav className="campaign-tabs">
        {[
          ["overview", "Overview"],
          ["assets", "Assets"],
          ["inventory", "Inventory"],
          ["settings", "Settings"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={activeTab === value ? "active" : ""}
            onClick={() => onTabChange(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice && <div className="campaign-notice">{notice}</div>}
      {error && <div className="campaign-error">{error}</div>}

      {activeTab === "overview" && (
        <LineItemOverview item={item} assets={assets} inventory={inventory} />
      )}

      {activeTab === "assets" && (
        <AssetsTable
          assets={assets}
          loading={assetsLoading}
          onCreate={onCreateAsset}
          onOpen={onOpenAsset}
        />
      )}

      {activeTab === "inventory" && (
        <InventorySelection
          inventory={inventory}
          assets={assets}
          loading={inventoryLoading}
          saving={inventorySaving}
          onSave={onSaveInventory}
        />
      )}

      {activeTab === "settings" && (
        <div className="campaign-settings-card">
          <h2>Line Item Settings</h2>
          <p>Pause, resume, edit, or archive this line item.</p>
          <div className="campaign-settings-actions">
            <Button onClick={onEdit}>Edit Line Item</Button>
            {item.status === "paused" ? (
              <Button onClick={() => onStatusChange("active")}>Resume</Button>
            ) : (
              <Button
                className="campaign-secondary-button"
                onClick={() => onStatusChange("paused")}
              >
                Pause
              </Button>
            )}
            <Button className="campaign-danger-button" onClick={onArchive}>
              Archive Line Item
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
