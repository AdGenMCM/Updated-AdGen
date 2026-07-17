import React from "react";
import Card from "../ui/Card";
import { formatCurrency, formatDate, OBJECTIVE_LABELS } from "./campaignUtils";

export default function CampaignOverview({ campaign, lineItems }) {
  return (
    <div className="campaign-overview-grid">
      <Card className="campaign-overview-card">
        <span>Campaign budget (USD)</span>
        <strong>{formatCurrency(campaign.budget)}</strong>
        <p>{campaign.budget_type || "lifetime"} budget</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>Objective</span>
        <strong>
          {OBJECTIVE_LABELS[campaign.objective] || campaign.objective || "—"}
        </strong>
        <p>Campaign goal</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>Flight</span>
        <strong>{formatDate(campaign.start_at)}</strong>
        <p>Through {formatDate(campaign.end_at)}</p>
      </Card>

      <Card className="campaign-overview-card">
        <span>Line items</span>
        <strong>{lineItems.length}</strong>
        <p>Execution groups</p>
      </Card>
    </div>
  );
}
