import React from "react";
import { ChevronRight, CircleDollarSign, Plus } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import StatusBadge from "./StatusBadge";
import { CHANNEL_LABELS, formatCurrency, formatDate } from "./campaignUtils";

export default function LineItemsTable({
  lineItems,
  loading,
  onCreate,
  onOpen,
}) {
  return (
    <Card className="campaign-table-card">
      <div className="campaign-section-head">
        <div>
          <h2>Line Items</h2>
          <p>
            Configure budget, bidding, schedule, and delivery channels.
            Inventory is selected after assets are uploaded.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} />
          New Line Item
        </Button>
      </div>

      {loading ? (
        <div className="campaign-table-state">Loading line items...</div>
      ) : lineItems.length === 0 ? (
        <div className="campaign-empty">
          <CircleDollarSign size={28} />
          <h3>No line items yet</h3>
          <p>Create the first execution group for this campaign.</p>
          <Button onClick={onCreate}>
            <Plus size={16} />
            New Line Item
          </Button>
        </div>
      ) : (
        <div className="campaign-table-wrap">
          <table className="campaign-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Budget (USD)</th>
                <th>Channels</th>
                <th>Inventory</th>
                <th>Flight</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onOpen(item)}
                  className={item.status === "archived" ? "archived-row" : ""}
                >
                  <td>
                    <strong>{item.name}</strong>
                    <span>{item.billing_model?.toUpperCase()} delivery</span>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.billing_model?.toUpperCase()}</td>
                  <td>
                    {formatCurrency(item.budget_amount)}
                    <small>{item.budget_type}</small>
                  </td>
                  <td>
                    <div className="campaign-channel-list">
                      {(item.channels || []).map((channel) => (
                        <span key={channel}>
                          {CHANNEL_LABELS[channel] || channel}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{(item.inventory_assignments || []).length}</td>
                  <td>
                    {formatDate(item.start_at)} – {formatDate(item.end_at)}
                  </td>
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
