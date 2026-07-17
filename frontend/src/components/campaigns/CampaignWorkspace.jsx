import React from "react";
import { Edit3 } from "lucide-react";
import Button from "../ui/Button";
import Breadcrumbs from "./Breadcrumbs";
import CampaignOverview from "./CampaignOverview";
import LineItemsTable from "./LineItemsTable";
import StatusBadge from "./StatusBadge";
import { formatDate } from "./campaignUtils";
export default function CampaignWorkspace({
  campaign,
  activeTab,
  lineItems,
  lineItemsLoading,
  notice,
  error,
  onBack,
  onTabChange,
  onEdit,
  onArchive,
  onCreateLineItem,
  onOpenLineItem,
}) {
  return (
    <div className="campaign-page campaign-detail-page">
      <Breadcrumbs
        items={[
          { label: "Campaign Manager", onClick: onBack },
          { label: campaign.name },
        ]}
      />
      <div className="campaign-detail-header">
        <div>
          <span className="campaign-workspace-eyebrow">CAMPAIGN WORKSPACE</span>
          <h1>{campaign.name}</h1>
          <div className="campaign-workspace-meta">
            <StatusBadge status={campaign.status} />
            <span>
              {formatDate(campaign.start_at)} – {formatDate(campaign.end_at)}
            </span>
          </div>
        </div>
        <Button onClick={onEdit}>
          <Edit3 size={16} />
          Edit Campaign
        </Button>
      </div>
      <nav className="campaign-tabs">
        {[
          ["overview", "Overview"],
          ["line-items", "Line Items"],
          ["settings", "Settings"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={activeTab === v ? "active" : ""}
            onClick={() => onTabChange(v)}
          >
            {l}
          </button>
        ))}
      </nav>
      {notice && <div className="campaign-notice">{notice}</div>}
      {error && <div className="campaign-error">{error}</div>}
      {activeTab === "overview" && (
        <CampaignOverview campaign={campaign} lineItems={lineItems} />
      )}{" "}
      {activeTab === "line-items" && (
        <LineItemsTable
          lineItems={lineItems}
          loading={lineItemsLoading}
          onCreate={onCreateLineItem}
          onOpen={onOpenLineItem}
        />
      )}{" "}
      {activeTab === "settings" && (
        <div className="campaign-settings-card">
          <h2>Campaign Settings</h2>
          <p>Update campaign details or archive this campaign.</p>
          <div className="campaign-settings-actions">
            <Button onClick={onEdit}>Edit Campaign</Button>
            <Button className="campaign-danger-button" onClick={onArchive}>
              Archive Campaign
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
