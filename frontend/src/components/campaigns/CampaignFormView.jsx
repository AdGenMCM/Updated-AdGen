import React from "react";
import { ArrowLeft, BadgeDollarSign, CalendarDays, Save } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Breadcrumbs from "./Breadcrumbs";

export default function CampaignFormView({
  editing,
  form,
  brandKits,
  saving,
  error,
  onChange,
  onBack,
  onSubmit,
}) {
  return (
    <div className="campaign-page campaign-detail-page">
      <Breadcrumbs
        items={[
          { label: "Campaign Manager", onClick: onBack },
          { label: editing ? "Edit Campaign" : "New Campaign" },
        ]}
      />

      <header className="campaign-form-hero">
        <button type="button" className="campaign-back-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to campaigns
        </button>

        <span className="campaign-workspace-eyebrow">CAMPAIGN</span>
        <h1>{editing ? "Edit campaign" : "Create campaign"}</h1>
        <p>Define the campaign strategy, budget, and active flight.</p>
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
                <h2>Campaign details</h2>
                <p>Name the campaign and connect its brand and objective.</p>
              </div>
            </div>

            <div className="campaign-form-grid">
              <label className="campaign-field campaign-field-wide">
                <span>Campaign name</span>
                <input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="Example: Summer acquisition campaign"
                  required
                />
              </label>

              <label className="campaign-field">
                <span>Brand Kit</span>
                <select
                  value={form.brand_id}
                  onChange={(event) => onChange("brand_id", event.target.value)}
                >
                  <option value="">No Brand Kit</option>
                  {brandKits.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.brandName || kit.name || "Unnamed Brand"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="campaign-field">
                <span>Objective</span>
                <select
                  value={form.objective}
                  onChange={(event) =>
                    onChange("objective", event.target.value)
                  }
                >
                  <option value="awareness">Awareness</option>
                  <option value="traffic">Traffic</option>
                  <option value="engagement">Engagement</option>
                  <option value="leads">Leads</option>
                  <option value="sales">Sales</option>
                  <option value="app_installs">App installs</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="campaign-field campaign-field-wide">
                <span>Description</span>
                <textarea
                  rows="4"
                  value={form.description}
                  onChange={(event) =>
                    onChange("description", event.target.value)
                  }
                  placeholder="Add a short internal description for this campaign."
                />
              </label>
            </div>
          </section>

          <section className="campaign-form-section">
            <div className="campaign-form-section-heading">
              <div className="campaign-form-section-icon">
                <BadgeDollarSign size={19} />
              </div>
              <div>
                <h2>Budget and flight</h2>
                <p>Set the campaign budget in USD and define its schedule.</p>
              </div>
            </div>

            <div className="campaign-form-grid">
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

              <label className="campaign-field">
                <span>Campaign budget (USD)</span>
                <div className="campaign-money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.budget}
                    onChange={(event) => onChange("budget", event.target.value)}
                    placeholder="0.00"
                  />
                  <em>USD</em>
                </div>
              </label>

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
                  : "Create Campaign"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
