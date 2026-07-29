import React, { useEffect, useMemo, useState } from "react";
import {
  connectMetaAds,
  disconnectMetaAds,
  getMetaAdsStatus,
  listMetaAdsAccounts,
  selectMetaAdsAccount,
  syncMetaAds,
  syncMetaAdsCreatives,
  getMetaAdsCreatives,
} from "../services/metaAdsService";
import "./MetaAdsInsightsPanel.css";

function formatAccountId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `act_${digits}` : "—";
}

function timestamp(value) {
  if (!value) return "Never";
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
}

function accountStatusLabel(value) {
  const labels = {
    1: "Active",
    2: "Disabled",
    3: "Unsettled",
    7: "Pending review",
    8: "Pending closure",
    9: "Closed",
    100: "Pending risk review",
    101: "Pending settlement",
  };
  return labels[Number(value)] || "Unknown";
}

function money(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function number(value, digits = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(2)}%` : "—";
}

export default function MetaAdsInsightsPanel() {
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creatives, setCreatives] = useState([]);
  const [creativeFilter, setCreativeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStatus = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const next = await getMetaAdsStatus();
      setStatus(next);
      if (next?.lastSyncDateRange) {
        setDateRange(next.lastSyncDateRange);
      }
      return next;
    } catch (err) {
      setStatus(null);
      setError(err?.message || "Could not load Meta Ads.");
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const loadCreatives = async () => {
    if (!status?.connected || !status?.selectedAdAccountId) {
      setCreatives([]);
      return;
    }

    try {
      const result = await getMetaAdsCreatives(500);
      setCreatives(result?.creatives || []);
    } catch (err) {
      setCreatives([]);
      setError(err?.message || "Could not load Meta Ads creative assets.");
    }
  };

  useEffect(() => {
    loadStatus();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("meta_ads");
    if (result === "connected") {
      setSuccess("Meta Ads connected successfully.");
    } else if (result === "error") {
      setError("Meta Ads could not be connected. Please try again.");
    }

    if (result === "connected" || result === "error") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected && status?.selectedAdAccountId) {
      loadCreatives();
    } else {
      setCreatives([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, status?.selectedAdAccountId]);

  const filteredCreatives = useMemo(() => {
    if (creativeFilter === "all") return creatives;
    return creatives.filter((item) => item.mediaType === creativeFilter);
  }, [creatives, creativeFilter]);

  const campaigns = useMemo(
    () => status?.campaigns || [],
    [status]
  );
  const summary = status?.summary || {};
  const currency = status?.selectedCurrency || "USD";

  const connect = async () => {
    setError("");
    try {
      await connectMetaAds();
    } catch (err) {
      setError(err?.message || "Could not start Meta Ads connection.");
    }
  };

  const chooseAccount = async () => {
    setLoadingAccounts(true);
    setError("");
    setSuccess("");
    try {
      const result = await listMetaAdsAccounts();
      setAccounts(result?.accounts || []);
      if (!(result?.accounts || []).length) {
        setError(
          "No accessible Meta ad accounts were returned for this Meta user."
        );
      }
    } catch (err) {
      setAccounts([]);
      setError(err?.message || "Could not load Meta ad accounts.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const selectAccount = async (account) => {
    setLoadingAccounts(true);
    setError("");
    setSuccess("");
    try {
      await selectMetaAdsAccount(account);
      setAccounts([]);
      setCreatives([]);
      await loadStatus({ quiet: true });
      setSuccess("Meta ad account selected successfully.");
      window.setTimeout(() => setSuccess(""), 3500);
    } catch (err) {
      setError(err?.message || "Could not select this Meta ad account.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const refreshForRange = async (
    range,
    { showSuccess = false } = {}
  ) => {
    setSyncing(true);
    setError("");
    setSuccess("");

    try {
      const result = await syncMetaAds(range);
      const creativeResult = await syncMetaAdsCreatives(range);

      const nextStatus = await getMetaAdsStatus();
      setStatus(nextStatus);
      setCreatives(creativeResult?.creatives || []);

      if (showSuccess) {
        setSuccess(
          `Synced ${result?.campaignCount || 0} campaigns and ${
            creativeResult?.creativeCount || 0
          } creatives.`
        );
        window.setTimeout(() => setSuccess(""), 3500);
      }
    } catch (err) {
      setError(err?.message || "Could not refresh Meta Ads data.");
    } finally {
      setSyncing(false);
    }
  };

  const sync = async () => {
    await refreshForRange(dateRange, { showSuccess: true });
  };

  const changeDateRange = async (event) => {
    const next = event.target.value;
    setDateRange(next);
    await refreshForRange(next);
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Meta Ads from ADGen?")) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await disconnectMetaAds();
      setAccounts([]);
      setCreatives([]);
      await loadStatus({ quiet: true });
    } catch (err) {
      setError(err?.message || "Could not disconnect Meta Ads.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="mai-state">Checking Meta Ads connection…</div>;
  }

  if (!status?.connected) {
    return (
      <section className="mai-panel">
        <div className="mai-connect">
          <div>
            <span className="mai-eyebrow">Meta Ads</span>
            <h3>Connect Meta campaign performance to ADGen</h3>
            <p>
              Authorize read-only access so ADGen can retrieve your available
              ad accounts, campaign delivery, spend, clicks, conversions, and
              return on ad spend.
            </p>
          </div>
          <button type="button" className="mai-primary" onClick={connect}>
            Connect Meta Ads
          </button>
        </div>
        {error && <div className="mai-error">{error}</div>}
      </section>
    );
  }

  return (
    <section className="mai-panel">
      <header className="mai-accountHeader">
        <div>
          <span className="mai-eyebrow">Connected Meta account</span>
          <h3>
            {status.selectedAdAccountId
              ? status.selectedAdAccountName || "Meta ad account"
              : status.metaName || "Meta Ads connected"}
          </h3>
          <p>
            {status.selectedAdAccountId
              ? `${formatAccountId(status.selectedAdAccountId)} · ${
                  status.selectedBusinessName || "Directly accessible account"
                }`
              : "Choose the advertiser account whose campaigns ADGen should analyze."}
          </p>
        </div>

        <button
          type="button"
          className="mai-secondary"
          onClick={chooseAccount}
          disabled={loadingAccounts || syncing}
        >
          {loadingAccounts
            ? "Loading accounts…"
            : status.selectedAdAccountId
            ? "Change account"
            : "Choose account"}
        </button>
      </header>

      {error && <div className="mai-error">{error}</div>}
      {success && <div className="mai-success">✓ {success}</div>}

      <div className="mai-identityGrid">
        <div>
          <small>Connected user</small>
          <strong>{status.metaName || status.metaEmail || "Meta user"}</strong>
        </div>
        <div>
          <small>Ad account</small>
          <strong>
            {status.selectedAdAccountId
              ? formatAccountId(status.selectedAdAccountId)
              : "Not selected"}
          </strong>
        </div>
        <div>
          <small>Currency</small>
          <strong>{status.selectedCurrency || "—"}</strong>
        </div>
        <div>
          <small>Time zone</small>
          <strong>{status.selectedTimeZone || "—"}</strong>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mai-accountPicker">
          <div className="mai-pickerHeader">
            <div>
              <strong>Select a Meta ad account</strong>
              <small>
                Only accounts available to the connected Meta user are shown.
              </small>
            </div>
            <span>{accounts.length}</span>
          </div>

          <div className="mai-accountList">
            {accounts.map((account) => (
              <button
                key={account.adAccountId}
                type="button"
                onClick={() => selectAccount(account)}
                disabled={loadingAccounts}
              >
                <span>
                  <strong>{account.name || "Meta ad account"}</strong>
                  <small>
                    {formatAccountId(account.adAccountId)}
                    {account.businessName
                      ? ` · ${account.businessName}`
                      : ""}
                  </small>
                </span>
                <span>
                  {account.currency || "—"} ·{" "}
                  {accountStatusLabel(account.accountStatus)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!status.selectedAdAccountId && !accounts.length && (
        <div className="mai-empty">
          <h4>No advertiser account selected</h4>
          <p>
            Choose an account before ADGen begins importing Meta campaign
            performance.
          </p>
          <button type="button" className="mai-primary" onClick={chooseAccount}>
            Choose Meta ad account
          </button>
        </div>
      )}

      {status.selectedAdAccountId && (
        <>
          <div className="mai-syncBar">
            <div>
              <small>Account status</small>
              <strong>
                {accountStatusLabel(status.selectedAccountStatus)}
              </strong>
              <span>Last synced {timestamp(status.lastSyncAt)}</span>
            </div>

            <label>
              <span>Date range</span>
              <select
                value={dateRange}
                onChange={changeDateRange}
                disabled={syncing}
              >
                <option value="LAST_7_DAYS">Previous 7 days</option>
                <option value="LAST_14_DAYS">Previous 14 days</option>
                <option value="LAST_30_DAYS">Previous 30 days</option>
                <option value="LAST_90_DAYS">Previous 90 days</option>
                <option value="THIS_MONTH">This month</option>
                <option value="LAST_MONTH">Last month</option>
                <option value="MAXIMUM">Maximum available</option>
              </select>
            </label>

            <button
              type="button"
              className="mai-primary"
              onClick={sync}
              disabled={syncing}
            >
              {syncing ? (
                <span className="mai-loading">
                  <span className="mai-spinner" />
                  Refreshing
                </span>
              ) : (
                "Refresh data"
              )}
            </button>
          </div>

          <div className="mai-kpiGrid">
            <div>
              <small>Spend</small>
              <strong>{money(summary.spend, currency)}</strong>
            </div>
            <div>
              <small>Impressions</small>
              <strong>{number(summary.impressions)}</strong>
            </div>
            <div>
              <small>Clicks</small>
              <strong>{number(summary.clicks)}</strong>
            </div>
            <div>
              <small>Conversions</small>
              <strong>{number(summary.conversions, 2)}</strong>
            </div>
            <div>
              <small>CTR</small>
              <strong>{percent(summary.ctr)}</strong>
            </div>
            <div>
              <small>CPC</small>
              <strong>{money(summary.cpc, currency)}</strong>
            </div>
            <div>
              <small>CPA</small>
              <strong>{money(summary.cpa, currency)}</strong>
            </div>
            <div>
              <small>ROAS</small>
              <strong>
                {Number.isFinite(Number(summary.roas))
                  ? `${Number(summary.roas).toFixed(2)}x`
                  : "—"}
              </strong>
            </div>
          </div>


          <div className="mai-creativePanel">
            <div className="mai-creativeHeader">
              <div>
                <span className="mai-eyebrow">Creative intelligence</span>
                <h4>Ads and creative assets</h4>
                <p>Review images, videos, copy, calls to action, and ad-level performance.</p>
              </div>
              <div className="mai-creativeFilters">
                {["all", "image", "video", "text"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={creativeFilter === filter ? "active" : ""}
                    onClick={() => setCreativeFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {!filteredCreatives.length ? (
              <div className="mai-campaignEmpty">
                No synced Meta creatives are available for this date range yet.
              </div>
            ) : (
              <div className="mai-creativeGrid">
                {filteredCreatives.map((item) => (
                  <article key={item.adId || item.id} className="mai-creativeCard">
                    <div className="mai-creativePreview">
                      {item.thumbnailUrl || item.imageUrl ? (
                        <img src={item.thumbnailUrl || item.imageUrl} alt="" />
                      ) : (
                        <div className="mai-textPreview">{item.headline || item.adName || "Meta creative"}</div>
                      )}
                      <span className="mai-mediaType">{item.mediaType || "creative"}</span>
                    </div>
                    <div className="mai-creativeBody">
                      <small>{item.campaignName} · {item.adSetName}</small>
                      <h5>{item.headline || item.adName || "Meta ad"}</h5>
                      {item.primaryText && <p>{item.primaryText}</p>}
                      <div className="mai-creativeMeta">
                        {item.ctaType && <span>{item.ctaType.replaceAll("_", " ")}</span>}
                        {item.destinationUrl && (
                          <a href={item.destinationUrl} target="_blank" rel="noreferrer">Destination ↗</a>
                        )}
                      </div>
                      <div className="mai-creativeStats">
                        <div><small>Spend</small><strong>{money(item.spend, currency)}</strong></div>
                        <div><small>Impr.</small><strong>{number(item.impressions)}</strong></div>
                        <div><small>CTR</small><strong>{percent(item.ctr)}</strong></div>
                        <div><small>ROAS</small><strong>{Number.isFinite(Number(item.roas)) ? `${Number(item.roas).toFixed(2)}x` : "—"}</strong></div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="mai-campaignPanel">
            <div className="mai-campaignHeader">
              <div>
                <span className="mai-eyebrow">Campaign reporting</span>
                <h4>Meta campaign performance</h4>
              </div>
              <span>
                {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
              </span>
            </div>

            {!campaigns.length ? (
              <div className="mai-campaignEmpty">
                Refresh data to import campaign performance from this account.
              </div>
            ) : (
              <div className="mai-tableWrap">
                <table className="mai-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th>Spend</th>
                      <th>Impressions</th>
                      <th>Clicks</th>
                      <th>CTR</th>
                      <th>Conversions</th>
                      <th>CPA</th>
                      <th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => (
                      <tr key={campaign.campaignId}>
                        <td>
                          <strong>{campaign.name || "Meta campaign"}</strong>
                          <small>{campaign.objective || campaign.campaignId}</small>
                        </td>
                        <td>
                          <span
                            className={`mai-status ${String(
                              campaign.effectiveStatus ||
                                campaign.status ||
                                "unknown"
                            ).toLowerCase()}`}
                          >
                            {campaign.effectiveStatus ||
                              campaign.status ||
                              "Unknown"}
                          </span>
                        </td>
                        <td>{money(campaign.spend, currency)}</td>
                        <td>{number(campaign.impressions)}</td>
                        <td>{number(campaign.clicks)}</td>
                        <td>{percent(campaign.ctr)}</td>
                        <td>{number(campaign.conversions, 2)}</td>
                        <td>{money(campaign.cpa, currency)}</td>
                        <td>
                          {Number.isFinite(Number(campaign.roas))
                            ? `${Number(campaign.roas).toFixed(2)}x`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <footer className="mai-footer">
        <button type="button" className="mai-danger" onClick={disconnect}>
          Disconnect Meta Ads
        </button>
        <span>
          Connected {timestamp(status.connectedAt)} · Read-only advertising access
        </span>
      </footer>
    </section>
  );
}
