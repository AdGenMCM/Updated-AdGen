import React from "react";
import Card from "../ui/Card";
import {
  CHANNEL_LABELS,
  formatCurrency,
  formatDate,
  formatFrequencyCap,
} from "./campaignUtils";

export default function LineItemOverview({ item, assets, inventory }) {
  const selectedInventory = inventory.filter((entry) => entry.selected);
  const needsAttention = selectedInventory.filter(
    (entry) => entry.needs_attention,
  ).length;

  return (
    <div className="campaign-overview-grid">
      <Card className="campaign-overview-card">
        <span>Budget (USD)</span>
        <strong>{formatCurrency(item.budget_amount)}</strong>
        <p>{item.budget_type} budget</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>{item.billing_model?.toUpperCase()} bid (USD)</span>
        <strong>{formatCurrency(item.bid_amount)}</strong>
        <p>Delivery bid</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>Flight</span>
        <strong>{formatDate(item.start_at)}</strong>
        <p>Through {formatDate(item.end_at)}</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>Assets</span>
        <strong>{assets.length}</strong>
        <p>Uploaded creative assets</p>
      </Card>

      <Card className="campaign-overview-card campaign-overview-wide">
        <span>Delivery channels</span>
        <strong>
          {(item.channels || [])
            .map((value) => CHANNEL_LABELS[value] || value)
            .join(", ") || "None"}
        </strong>
        <p>Eligible inventory environments</p>
      </Card>

      <Card className="campaign-overview-card campaign-overview-wide">
        <span>Frequency cap</span>
        <strong>
          {formatFrequencyCap(
            item.frequency_cap_count || item.frequency_cap,
            item.frequency_cap_window || (item.frequency_cap ? "day" : null),
          )}
        </strong>
        <p>Maximum exposure for the same person</p>
      </Card>

      <Card className="campaign-overview-card campaign-overview-full">
        <span>Inventory assignments</span>
        <strong>{selectedInventory.length} selected</strong>
        <p>
          {needsAttention
            ? `${needsAttention} selection${needsAttention === 1 ? " needs" : "s need"} attention because no active compatible asset is assigned.`
            : "Inventory is chosen after assets are uploaded and matched by dimensions."}
        </p>
      </Card>
    </div>
  );
}
