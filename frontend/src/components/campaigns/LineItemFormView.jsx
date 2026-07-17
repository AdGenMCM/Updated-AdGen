import React from "react";
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  Gauge,
  RadioTower,
  Save,
} from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Breadcrumbs from "./Breadcrumbs";
import { CHANNEL_OPTIONS, FREQUENCY_CAP_OPTIONS } from "./campaignUtils";

export default function LineItemFormView({
  campaign,
  editing,
  form,
  saving,
  error,
  onChange,
  onToggleChannel,
  onBack,
  onCampaign,
  onSubmit,
}) {
  return (
    <div className="campaign-page campaign-detail-page">
      <Breadcrumbs
        items={[
          { label: "Campaign Manager", onClick: onCampaign },
          { label: campaign.name, onClick: onBack },
          { label: editing ? "Edit Line Item" : "New Line Item" },
        ]}
      />

      <header className="campaign-form-hero">
        <button type="button" className="campaign-back-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to {campaign.name}
        </button>

        <span className="campaign-workspace-eyebrow">LINE ITEM</span>
        <h1>{editing ? "Edit line item" : "Create line item"}</h1>
        <p>
          Configure economics, schedule, frequency, and delivery channels.
          Upload assets next, then select only the inventory those assets can
          support.
        </p>
      </header>

      {error && <div className="campaign-error">{error}</div>}

      <form onSubmit={onSubmit} className="campaign-form-shell">
        <Card className="campaign-form-card campaign-form-card-polished">
          <section className="campaign-form-section">
            <div className="campaign-form-section-heading">
              <div className="campaign-form-section-icon">
                <span>01</span>
              </div>
              <div>
                <h2>Line-item details</h2>
                <p>Name the line item and choose how delivery is billed.</p>
              </div>
            </div>

            <div className="campaign-form-grid">
              <label className="campaign-field campaign-field-wide">
                <span>Line-item name</span>
                <input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="Example: Web prospecting — July"
                  required
                />
              </label>

              <label className="campaign-field">
                <span>Billing model</span>
                <select
                  value={form.billing_model}
                  onChange={(event) =>
                    onChange("billing_model", event.target.value)
                  }
                >
                  <option value="cpm">CPM — cost per 1,000 impressions</option>
                  <option value="cpc">CPC — cost per click</option>
                </select>
              </label>

              <label className="campaign-field">
                <span>Budget type</span>
                <select
                  value={form.budget_type}
                  onChange={(event) =>
                    onChange("budget_type", event.target.value)
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </label>
            </div>
          </section>

          <section className="campaign-form-section">
            <div className="campaign-form-section-heading">
              <div className="campaign-form-section-icon">
                <BadgeDollarSign size={19} />
              </div>
              <div>
                <h2>Budget and bid</h2>
                <p>All financial values are entered and stored in USD.</p>
              </div>
            </div>

            <div className="campaign-form-grid">
              <label className="campaign-field">
                <span>Line-item budget (USD)</span>
                <div className="campaign-money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.budget_amount}
                    onChange={(event) =>
                      onChange("budget_amount", event.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                  <em>USD</em>
                </div>
              </label>

              <label className="campaign-field">
                <span>
                  {form.billing_model === "cpm"
                    ? "CPM bid (USD)"
                    : "CPC bid (USD)"}
                </span>
                <div className="campaign-money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.bid_amount}
                    onChange={(event) =>
                      onChange("bid_amount", event.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                  <em>USD</em>
                </div>
              </label>
            </div>
          </section>

          <section className="campaign-form-section">
            <div className="campaign-form-section-heading">
              <div className="campaign-form-section-icon">
                <CalendarDays size={19} />
              </div>
              <div>
                <h2>Flight and frequency</h2>
                <p>
                  Control when the line item runs and how often one person can
                  receive it.
                </p>
              </div>
            </div>

            <div className="campaign-form-grid">
              <label className="campaign-field">
                <span>Start</span>
                <div className="campaign-date-field">
                  <CalendarDays size={16} />
                  <input
                    type="datetime-local"
                    value={form.start_at}
                    onChange={(event) =>
                      onChange("start_at", event.target.value)
                    }
                    required
                  />
                </div>
              </label>

              <label className="campaign-field">
                <span>End</span>
                <div className="campaign-date-field">
                  <CalendarDays size={16} />
                  <input
                    type="datetime-local"
                    value={form.end_at}
                    onChange={(event) => onChange("end_at", event.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="campaign-field campaign-field-wide">
                <span>Frequency cap</span>
                <div className="campaign-select-with-icon">
                  <Gauge size={17} />
                  <select
                    value={form.frequency_cap_key}
                    onChange={(event) =>
                      onChange("frequency_cap_key", event.target.value)
                    }
                  >
                    {FREQUENCY_CAP_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <small>
                  Limits how often the same person can receive this line item
                  during the selected time window.
                </small>
              </label>
            </div>
          </section>

          <section className="campaign-form-section">
            <div className="campaign-form-section-heading">
              <div className="campaign-form-section-icon">
                <RadioTower size={19} />
              </div>
              <div>
                <h2>Delivery channels</h2>
                <p>
                  Choose the environments this line item may use. Exact
                  inventory is selected after compatible assets are uploaded.
                </p>
              </div>
            </div>

            <fieldset className="campaign-choice-fieldset">
              <legend>Eligible channels</legend>
              <p>Select at least one channel.</p>
              <div className="campaign-channel-options">
                {CHANNEL_OPTIONS.map(([value, label]) => (
                  <label
                    key={value}
                    className={form.channels.includes(value) ? "selected" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={form.channels.includes(value)}
                      onChange={() => onToggleChannel(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="campaign-inventory-next-step">
              <strong>Next: upload campaign assets</strong>
              <p>
                AdGen MCM will read each image’s true dimensions and reveal only
                the inventory and templates it can fit.
              </p>
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
                  : "Create Line Item"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
