import React from "react";
import {
  ChevronRight,
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import PageHeader from "../ui/PageHeader";
import StatusBadge from "./StatusBadge";
import { formatCurrency, formatDate } from "./campaignUtils";

const FILTERS = [
  "all",
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "archived",
];

export default function CampaignList(props) {
  const {
    campaigns,
    stats,
    loading,
    search,
    statusFilter,
    notice,
    error,
    onSearchChange,
    onStatusFilterChange,
    onRefresh,
    onCreate,
    onOpen,
  } = props;

  return (
    <div className="campaign-page">
      <PageHeader
        eyebrow="CAMPAIGN MANAGER"
        title="Plan and manage every campaign"
        description="Build campaigns, configure line items, and upload delivery-ready assets from one connected workflow."
        actions={
          <div className="campaign-header-actions">
            <Button className="campaign-secondary-button" onClick={onRefresh}>
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button onClick={onCreate}>
              <Plus size={17} />
              New Campaign
            </Button>
          </div>
        }
      />

      <div className="campaign-stat-grid">
        <Card className="campaign-stat-card">
          <span>Active</span>
          <strong>{stats.active}</strong>
          <p>Currently in flight</p>
        </Card>
        <Card className="campaign-stat-card">
          <span>Scheduled</span>
          <strong>{stats.scheduled}</strong>
          <p>Launching next</p>
        </Card>
        <Card className="campaign-stat-card">
          <span>Drafts</span>
          <strong>{stats.drafts}</strong>
          <p>Still being prepared</p>
        </Card>
        <Card className="campaign-stat-card">
          <span>Planned Budget (USD)</span>
          <strong>{formatCurrency(stats.budget)}</strong>
          <p>Across non-archived campaigns</p>
        </Card>
      </div>

      <Card className="campaign-toolbar">
        <label className="campaign-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search campaigns..."
          />
        </label>
        <div className="campaign-filter-row">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`campaign-filter-pill ${statusFilter === value ? "active" : ""}`}
              onClick={() => onStatusFilterChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </Card>

      {notice && <div className="campaign-notice">{notice}</div>}
      {error && <div className="campaign-error">{error}</div>}

      {loading ? (
        <Card className="campaign-state-card">Loading campaigns...</Card>
      ) : campaigns.length === 0 ? (
        <Card className="campaign-empty">
          <FolderKanban size={30} />
          <h3>No campaigns found</h3>
          <p>Create a campaign or adjust the filters.</p>
          <Button onClick={onCreate}>
            <Plus size={16} />
            New Campaign
          </Button>
        </Card>
      ) : (
        <Card className="campaign-table-card">
          <div className="campaign-table-wrap">
            <table className="campaign-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Objective</th>
                  <th>Budget (USD)</th>
                  <th>Flight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={
                      campaign.status === "archived" ? "archived-row" : ""
                    }
                    onClick={() => onOpen(campaign)}
                  >
                    <td>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.description || "No description"}</span>
                    </td>
                    <td>
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td>{campaign.objective || "—"}</td>
                    <td>
                      {formatCurrency(campaign.budget)}
                      <small>{campaign.budget_type}</small>
                    </td>
                    <td>
                      {formatDate(campaign.start_at)} –{" "}
                      {formatDate(campaign.end_at)}
                    </td>
                    <td>
                      <ChevronRight size={18} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
