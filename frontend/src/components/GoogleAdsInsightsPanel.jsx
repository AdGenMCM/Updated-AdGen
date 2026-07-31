import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  connectGoogleAds,
  disconnectGoogleAds,
  getGoogleAdsAssets,
  getGoogleAdsStatus,
  listGoogleAdsCustomers,
  selectGoogleAdsCustomer,
  syncGoogleAds,
} from "../services/googleAdsService";
import "./GoogleAdsInsightsPanel.css";

const DATE_OPTIONS = [
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7_DAYS", label: "Last 7 days" },
  { value: "LAST_14_DAYS", label: "Last 14 days" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "LAST_90_DAYS", label: "Last 90 days" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "MAXIMUM", label: "Maximum available" },
];

function number(value, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function currency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : "—";
}

function accountId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 10) return digits || "—";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function timestamp(value) {
  if (!value) return "Never";
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
}

function accountName(name, customerId) {
  const value = String(name || "").trim();
  const digits = String(customerId || "").replace(/\D/g, "");
  if (!value || value === `Google Ads ${digits}`) return "Google Ads Account";
  return value;
}

export default function GoogleAdsInsightsPanel({
  isActive = false,
  selectedDateRange = "LAST_30_DAYS",
  onDateRangeChange,
}) {
  const [status, setStatus] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [dateRange, setDateRange] = useState(selectedDateRange);
  const autoRefreshInFlightRef = useRef(false);
  const [assetType, setAssetType] = useState("ALL");
  const [assets, setAssets] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [expandedTextGroups, setExpandedTextGroups] = useState({});
  const [expandedAssetCampaigns, setExpandedAssetCampaigns] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStatus = async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await getGoogleAdsStatus());
    } catch (err) {
      setError(err?.message || "Could not load Google Ads.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async (range = dateRange) => {
    if (!status?.connected || !status?.selectedCustomerId) return;
    setLoadingAssets(true);
    setError("");
    try {
      const result = await getGoogleAdsAssets(range);
      setAssets(result?.assets || []);
    } catch (err) {
      setAssets([]);
      setError(err?.message || "Could not load Google Ads creative assets.");
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    loadStatus();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("google_ads");
    if (result === "error") {
      setError("Google Ads could not be connected. Please try again.");
    }
    if (result === "connected" || result === "error") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected && status?.selectedCustomerId) {
      loadAssets(dateRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, status?.selectedCustomerId]);

  useEffect(() => {
    if (selectedDateRange && selectedDateRange !== dateRange) {
      setDateRange(selectedDateRange);
    }
  }, [selectedDateRange, dateRange]);

  const campaignAssetGroups = useMemo(() => {
    const groups = new Map();

    assets.forEach((asset) => {
      const campaignId =
        String(asset.campaignId || "").trim() ||
        String(asset.campaignName || "untitled-campaign");
      const campaignName = asset.campaignName || "Untitled campaign";

      if (!groups.has(campaignId)) {
        groups.set(campaignId, {
          campaignId,
          campaignName,
          media: [],
          textByType: new Map(),
        });
      }

      const group = groups.get(campaignId);
      const isMedia =
        asset.assetType === "IMAGE" ||
        asset.assetType === "YOUTUBE_VIDEO" ||
        asset.fieldType === "VIDEO" ||
        asset.fieldType === "YOUTUBE_VIDEO";

      if (isMedia) {
        group.media.push(asset);
        return;
      }

      if (asset.assetType === "TEXT") {
        const type = asset.fieldType || "TEXT";
        if (!group.textByType.has(type)) {
          group.textByType.set(type, []);
        }
        group.textByType.get(type).push(asset);
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const textGroups = Array.from(group.textByType.entries())
          .map(([type, items]) => ({
            key: `${group.campaignId}::${type}`,
            type,
            items,
          }))
          .sort((a, b) => a.type.localeCompare(b.type));

        const images = group.media.filter(
          (asset) => asset.assetType === "IMAGE"
        );
        const videos = group.media.filter(
          (asset) =>
            asset.assetType === "YOUTUBE_VIDEO" ||
            asset.fieldType === "VIDEO" ||
            asset.fieldType === "YOUTUBE_VIDEO"
        );
        const textCount = textGroups.reduce(
          (total, item) => total + item.items.length,
          0
        );

        return {
          ...group,
          textGroups,
          counts: {
            images: images.length,
            videos: videos.length,
            text: textCount,
            total: group.media.length + textCount,
          },
        };
      })
      .filter((group) => {
        if (assetType === "ALL") return group.counts.total > 0;
        if (assetType === "IMAGE") return group.counts.images > 0;
        if (assetType === "VIDEO") return group.counts.videos > 0;
        if (assetType === "TEXT") return group.counts.text > 0;
        return true;
      })
      .sort((a, b) => a.campaignName.localeCompare(b.campaignName));
  }, [assets, assetType]);

  const assetSummary = useMemo(
    () =>
      assets.reduce(
        (summary, asset) => {
          const isVideo =
            asset.assetType === "YOUTUBE_VIDEO" ||
            asset.fieldType === "VIDEO" ||
            asset.fieldType === "YOUTUBE_VIDEO";

          if (asset.assetType === "IMAGE") summary.images += 1;
          else if (isVideo) summary.videos += 1;
          else if (asset.assetType === "TEXT") {
            summary.text += 1;
            const type = asset.fieldType || "TEXT";
            summary.byType[type] = (summary.byType[type] || 0) + 1;
          }

          return summary;
        },
        { images: 0, videos: 0, text: 0, byType: {} }
      ),
    [assets]
  );

  const connect = async () => {
    setError("");
    try {
      await connectGoogleAds();
    } catch (err) {
      setError(err?.message || "Could not start Google Ads connection.");
    }
  };

  const chooseAccount = async () => {
    setLoadingAccounts(true);
    setError("");
    try {
      const result = await listGoogleAdsCustomers();
      setCustomers(result?.customers || []);
    } catch (err) {
      setError(err?.message || "Could not load Google Ads accounts.");
      setCustomers([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const selectAccount = async (customer) => {
    setLoadingAccounts(true);
    setError("");
    try {
      await selectGoogleAdsCustomer({
        ...customer,
        name: customer?.name || `Google Ads ${customer.customerId}`,
      });
      setCustomers([]);
      setAssets([]);
      await loadStatus();
    } catch (err) {
      setError(err?.message || "Could not select this Google Ads account.");
      setLoadingAccounts(false);
    }
  };

  const refresh = async () => {
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      await syncGoogleAds(dateRange);
      const nextStatus = await getGoogleAdsStatus();
      setStatus(nextStatus);

      const assetResult = await getGoogleAdsAssets(dateRange);
      setAssets(assetResult?.assets || []);

      setSuccess("Google Ads data refreshed successfully.");
      window.setTimeout(() => setSuccess(""), 3500);
    } catch (err) {
      setError(err?.message || "Could not refresh Google Ads data.");
    } finally {
      setSyncing(false);
    }
  };

  const changeDateRange = async (event) => {
    const next = event.target.value;
    setDateRange(next);
    onDateRangeChange?.(next);
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      await syncGoogleAds(next);
      setStatus(await getGoogleAdsStatus());
      const assetResult = await getGoogleAdsAssets(next);
      setAssets(assetResult?.assets || []);
    } catch (err) {
      setError(err?.message || "Could not load this date range.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (
      !isActive ||
      !status?.connected ||
      !status?.selectedCustomerId ||
      syncing ||
      autoRefreshInFlightRef.current
    ) {
      return;
    }

    const key = `adgen-google-auto-refresh:${status.selectedCustomerId}:${dateRange}`;
    const last = Number(window.sessionStorage.getItem(key) || 0);
    const cooldownMs = 60 * 1000;
    if (Date.now() - last < cooldownMs) return;

    autoRefreshInFlightRef.current = true;
    window.sessionStorage.setItem(key, String(Date.now()));

    (async () => {
      try {
        await syncGoogleAds(dateRange);
        const nextStatus = await getGoogleAdsStatus();
        setStatus(nextStatus);
        const assetResult = await getGoogleAdsAssets(dateRange);
        setAssets(assetResult?.assets || []);
      } catch (err) {
        setError(err?.message || "Could not automatically refresh Google Ads data.");
      } finally {
        autoRefreshInFlightRef.current = false;
      }
    })();
  }, [isActive, status?.connected, status?.selectedCustomerId, dateRange, syncing]);

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Ads from AdGen MCM?")) return;
    setLoading(true);
    setError("");
    try {
      await disconnectGoogleAds();
      setAssets([]);
      setCustomers([]);
      await loadStatus();
    } catch (err) {
      setError(err?.message || "Could not disconnect Google Ads.");
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="gai-state">Checking Google Ads connection…</div>;
  }

  if (!status?.connected) {
    return (
      <section className="gai-panel">
        <div className="gai-connect">
          <div>
            <span className="gai-eyebrow">Google Ads</span>
            <h3>Turn campaign data into creative intelligence</h3>
            <p>
              Connect an advertiser account to review campaign performance and
              inspect the images, videos, and text currently used in its ads.
            </p>
          </div>
          <button type="button" className="gai-primary" onClick={connect}>
            Connect Google Ads
          </button>
        </div>
        {error && <div className="gai-error">{error}</div>}
      </section>
    );
  }

  const summary = status?.summary || {};
  const campaigns = status?.campaigns || [];

  return (
    <section className="gai-panel">
      <header className="gai-accountHeader">
        <div>
          <span className="gai-eyebrow">Connected Google Ads account</span>
          <h3>
            {status?.selectedCustomerId
              ? accountName(
                  status.selectedCustomerName,
                  status.selectedCustomerId
                )
              : "Choose an advertiser account"}
          </h3>
          <p>
            {status?.selectedCustomerId
              ? `${accountId(status.selectedCustomerId)} · Last synced ${timestamp(
                  status.lastSyncAt
                )}`
              : "Select the advertiser account whose performance you want to analyze."}
          </p>
        </div>

        <div className="gai-headerActions">
          <label>
            <span>Date range</span>
            <select
              value={dateRange}
              onChange={changeDateRange}
              disabled={syncing || !status?.selectedCustomerId}
            >
              {DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="gai-secondary"
            onClick={refresh}
            disabled={syncing || !status?.selectedCustomerId}
          >
            {syncing ? (
              <span className="gai-loading">
                <span className="gai-spinner" />
                Refreshing
              </span>
            ) : (
              "Refresh data"
            )}
          </button>

          <button
            type="button"
            className="gai-secondary"
            onClick={chooseAccount}
            disabled={loadingAccounts}
          >
            {loadingAccounts ? "Loading…" : "Change account"}
          </button>
        </div>
      </header>

      {error && <div className="gai-error">{error}</div>}
      {success && <div className="gai-success">✓ {success}</div>}

      {customers.length > 0 && (
        <div className="gai-accountPicker">
          <div>
            <strong>Select an advertiser account</strong>
            <small>Manager accounts cannot be selected for reporting.</small>
          </div>
          <div className="gai-accountList">
            {customers.map((customer) => (
              <button
                key={`${customer.customerId}-${customer.loginCustomerId || ""}`}
                type="button"
                disabled={customer.isManager || loadingAccounts}
                onClick={() => selectAccount(customer)}
              >
                <span>
                  <strong>{customer.name || "Google Ads Account"}</strong>
                  <small>{accountId(customer.customerId)}</small>
                </span>
                <span>{customer.isManager ? "Manager" : "Select"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!status?.selectedCustomerId ? (
        <div className="gai-empty">
          <h4>No advertiser account selected</h4>
          <p>Choose an account before syncing campaigns and creative assets.</p>
          <button type="button" className="gai-primary" onClick={chooseAccount}>
            Choose account
          </button>
        </div>
      ) : (
        <>
          <div className="gai-primaryKpis">
            <div><small>Spend</small><strong>{currency(summary.spend)}</strong></div>
            <div><small>Conversions</small><strong>{number(summary.conversions, 2)}</strong></div>
            <div><small>Cost / conversion</small><strong>{currency(summary.costPerConversion)}</strong></div>
            <div><small>ROAS</small><strong>{number(summary.roas, 2)}</strong></div>
          </div>

          <div className="gai-secondaryKpis">
            <div><small>Campaigns</small><strong>{status.campaignCount ?? 0}</strong></div>
            <div><small>Impressions</small><strong>{number(summary.impressions)}</strong></div>
            <div><small>Clicks</small><strong>{number(summary.clicks)}</strong></div>
            <div><small>CTR</small><strong>{percent(summary.ctr)}</strong></div>
            <div><small>Avg. CPC</small><strong>{currency(summary.averageCpc)}</strong></div>
            <div><small>Conversion value</small><strong>{currency(summary.conversionValue)}</strong></div>
          </div>

          <section className="gai-section">
            <div className="gai-sectionHeader">
              <div>
                <span className="gai-eyebrow">Campaign performance</span>
                <h4>{DATE_OPTIONS.find((option) => option.value === dateRange)?.label}</h4>
              </div>
              <span>{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</span>
            </div>

            {campaigns.length ? (
              <div className="gai-tableWrap">
                <table className="gai-table">
                  <thead>
                    <tr>
                      <th>Campaign</th><th>Status</th><th>Spend</th><th>Clicks</th>
                      <th>CTR</th><th>Conversions</th><th>CPA</th><th>ROAS</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => {
                      const open = Boolean(expanded[campaign.id]);
                      return (
                        <React.Fragment key={campaign.id}>
                          <tr>
                            <td><strong>{campaign.name}</strong><small>{campaign.id}</small></td>
                            <td><span className={`gai-status ${String(campaign.status || "").toLowerCase()}`}>{campaign.status || "Unknown"}</span></td>
                            <td>{currency(campaign.spend)}</td>
                            <td>{number(campaign.clicks)}</td>
                            <td>{percent(campaign.ctr)}</td>
                            <td>{number(campaign.conversions, 2)}</td>
                            <td>{currency(campaign.costPerConversion)}</td>
                            <td>{number(campaign.roas, 2)}</td>
                            <td>
                              <button
                                type="button"
                                className="gai-expand"
                                onClick={() =>
                                  setExpanded((current) => ({
                                    ...current,
                                    [campaign.id]: !open,
                                  }))
                                }
                                aria-expanded={open}
                              >
                                {open ? "−" : "+"}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="gai-detailRow">
                              <td colSpan="9">
                                <div className="gai-detailGrid">
                                  <div><small>Impressions</small><strong>{number(campaign.impressions)}</strong></div>
                                  <div><small>Average CPC</small><strong>{currency(campaign.averageCpc)}</strong></div>
                                  <div><small>Conversion value</small><strong>{currency(campaign.conversionValue)}</strong></div>
                                  <div><small>Campaign ID</small><strong>{campaign.id}</strong></div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="gai-empty compact">No campaign activity was returned.</div>
            )}
          </section>

          <section className="gai-section">
            <div className="gai-assetsHeader">
              <div>
                <span className="gai-eyebrow">Creative intelligence</span>
                <h4>Creative assets by campaign</h4>
                <p>
                  Review each campaign's headlines, descriptions, sitelinks,
                  images, and videos in one place.
                </p>
              </div>

              <div className="gai-filters">
                {["ALL", "IMAGE", "VIDEO", "TEXT"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={assetType === type ? "active" : ""}
                    onClick={() => setAssetType(type)}
                  >
                    {type === "ALL" ? "All" : type.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {loadingAssets ? (
              <div className="gai-state">Loading live creative assets…</div>
            ) : (
              <div className="gai-campaignAssetsContent">
                <div className="gai-creativeSummary">
                  <div>
                    <small>Campaigns with assets</small>
                    <strong>{campaignAssetGroups.length}</strong>
                  </div>
                  <div>
                    <small>Images</small>
                    <strong>{assetSummary.images}</strong>
                  </div>
                  <div>
                    <small>Videos</small>
                    <strong>{assetSummary.videos}</strong>
                  </div>
                  <div>
                    <small>Text assets</small>
                    <strong>{assetSummary.text}</strong>
                  </div>
                </div>

                {campaignAssetGroups.length ? (
                  <div className="gai-campaignAssetList">
                    {campaignAssetGroups.map((group) => {
                      const isOpen = Boolean(
                        expandedAssetCampaigns[group.campaignId]
                      );

                      const filteredMedia = group.media.filter((asset) => {
                        if (assetType === "ALL") return true;
                        if (assetType === "IMAGE") {
                          return asset.assetType === "IMAGE";
                        }
                        if (assetType === "VIDEO") {
                          return (
                            asset.assetType === "YOUTUBE_VIDEO" ||
                            asset.fieldType === "VIDEO" ||
                            asset.fieldType === "YOUTUBE_VIDEO"
                          );
                        }
                        return false;
                      });

                      const showText =
                        assetType === "ALL" || assetType === "TEXT";

                      return (
                        <article
                          key={group.campaignId}
                          className="gai-campaignAssetGroup"
                        >
                          <button
                            type="button"
                            className="gai-campaignAssetHeader"
                            onClick={() =>
                              setExpandedAssetCampaigns((current) =>
                                current[group.campaignId]
                                  ? {}
                                  : { [group.campaignId]: true }
                              )
                            }
                            aria-expanded={isOpen}
                          >
                            <div className="gai-campaignAssetIdentity">
                              <span
                                className={`gai-campaignChevron ${
                                  isOpen ? "open" : ""
                                }`}
                              >
                                ›
                              </span>
                              <div>
                                <strong>{group.campaignName}</strong>
                                <small>Campaign ID: {group.campaignId}</small>
                              </div>
                            </div>

                            <div className="gai-campaignAssetCounts">
                              <span>
                                <strong>{group.counts.images}</strong> Images
                              </span>
                              <span>
                                <strong>{group.counts.videos}</strong> Videos
                              </span>
                              <span>
                                <strong>{group.counts.text}</strong> Text
                              </span>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="gai-campaignAssetBody">
                              {filteredMedia.length > 0 && (
                                <section className="gai-campaignAssetSection">
                                  <div className="gai-subsectionHeader">
                                    <div>
                                      <strong>Image and video assets</strong>
                                      <small>
                                        Visual previews with available Google
                                        Ads reporting.
                                      </small>
                                    </div>
                                    <span>{filteredMedia.length}</span>
                                  </div>

                                  <div className="gai-assetGrid">
                                    {filteredMedia.map((asset, index) => (
                                      <article
                                        key={`${asset.assetId}-${asset.source}-${index}`}
                                        className="gai-assetCard"
                                      >
                                        <div className="gai-preview">
                                          {asset.previewUrl ? (
                                            <img
                                              src={asset.previewUrl}
                                              alt={
                                                asset.youtubeTitle ||
                                                asset.name ||
                                                "Google Ads asset"
                                              }
                                            />
                                          ) : (
                                            <div className="gai-textPreview">
                                              {asset.name ||
                                                asset.fieldType ||
                                                "Google Ads media asset"}
                                            </div>
                                          )}

                                          <span className="gai-type">
                                            {asset.assetType ===
                                            "YOUTUBE_VIDEO"
                                              ? "Video"
                                              : asset.assetType}
                                          </span>

                                          {asset.performanceLabel &&
                                            ![
                                              "UNKNOWN",
                                              "UNSPECIFIED",
                                            ].includes(
                                              asset.performanceLabel
                                            ) && (
                                              <span
                                                className={`gai-label ${String(
                                                  asset.performanceLabel
                                                ).toLowerCase()}`}
                                              >
                                                {asset.performanceLabel}
                                              </span>
                                            )}
                                        </div>

                                        <div className="gai-assetBody">
                                          <strong>
                                            {asset.youtubeTitle ||
                                              asset.name ||
                                              asset.fieldType ||
                                              "Untitled asset"}
                                          </strong>

                                          <div className="gai-assetStats">
                                            <div>
                                              <small>Impressions</small>
                                              <strong>
                                                {number(asset.impressions)}
                                              </strong>
                                            </div>
                                            <div>
                                              <small>Clicks</small>
                                              <strong>
                                                {number(asset.clicks)}
                                              </strong>
                                            </div>
                                            <div>
                                              <small>CTR</small>
                                              <strong>
                                                {percent(asset.ctr)}
                                              </strong>
                                            </div>
                                            <div>
                                              <small>Conversions</small>
                                              <strong>
                                                {number(
                                                  asset.conversions,
                                                  2
                                                )}
                                              </strong>
                                            </div>
                                          </div>

                                          <div className="gai-meta">
                                            <span>
                                              {asset.fieldType ||
                                                asset.source}
                                            </span>
                                            {asset.width > 0 &&
                                              asset.height > 0 && (
                                                <span>
                                                  {asset.width}×
                                                  {asset.height}
                                                </span>
                                              )}
                                            {asset.youtubeVideoId && (
                                              <a
                                                href={`https://www.youtube.com/watch?v=${asset.youtubeVideoId}`}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                Open video ↗
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                </section>
                              )}

                              {showText &&
                                group.textGroups.map((textGroup) => {
                                  const isTextOpen = Boolean(
                                    expandedTextGroups[textGroup.key]
                                  );
                                  const visibleItems = isTextOpen
                                    ? textGroup.items
                                    : textGroup.items.slice(0, 4);

                                  return (
                                    <section
                                      key={textGroup.key}
                                      className="gai-textGroup"
                                    >
                                      <div className="gai-textGroupHeader">
                                        <div>
                                          <span className="gai-textType">
                                            {String(
                                              textGroup.type
                                            ).replaceAll("_", " ")}
                                          </span>
                                          <strong>
                                            {textGroup.items.length} asset
                                            {textGroup.items.length === 1
                                              ? ""
                                              : "s"}
                                          </strong>
                                        </div>
                                      </div>

                                      <div className="gai-textList">
                                        {visibleItems.map((asset, index) => (
                                          <div
                                            key={`${asset.assetId}-${asset.source}-${index}`}
                                            className="gai-textRow"
                                          >
                                            <div className="gai-textCopy">
                                              <strong>
                                                {asset.text ||
                                                  asset.name ||
                                                  asset.fieldType ||
                                                  "Untitled text asset"}
                                              </strong>
                                              <small>
                                                Google reporting may reflect
                                                the asset association rather
                                                than isolated text-only
                                                attribution.
                                              </small>
                                            </div>

                                            <div className="gai-textMetrics">
                                              <div>
                                                <small>Impr.</small>
                                                <strong>
                                                  {number(asset.impressions)}
                                                </strong>
                                              </div>
                                              <div>
                                                <small>Clicks</small>
                                                <strong>
                                                  {number(asset.clicks)}
                                                </strong>
                                              </div>
                                              <div>
                                                <small>CTR</small>
                                                <strong>
                                                  {percent(asset.ctr)}
                                                </strong>
                                              </div>
                                              <div>
                                                <small>Conv.</small>
                                                <strong>
                                                  {number(
                                                    asset.conversions,
                                                    2
                                                  )}
                                                </strong>
                                              </div>
                                            </div>

                                            {asset.performanceLabel &&
                                              ![
                                                "UNKNOWN",
                                                "UNSPECIFIED",
                                              ].includes(
                                                asset.performanceLabel
                                              ) && (
                                                <span
                                                  className={`gai-inlineLabel ${String(
                                                    asset.performanceLabel
                                                  ).toLowerCase()}`}
                                                >
                                                  {asset.performanceLabel}
                                                </span>
                                              )}
                                          </div>
                                        ))}
                                      </div>

                                      {textGroup.items.length > 4 && (
                                        <button
                                          type="button"
                                          className="gai-viewAll"
                                          onClick={() =>
                                            setExpandedTextGroups(
                                              (current) => ({
                                                ...current,
                                                [textGroup.key]:
                                                  !isTextOpen,
                                              })
                                            )
                                          }
                                        >
                                          {isTextOpen
                                            ? "Show fewer"
                                            : `View all ${textGroup.items.length}`}
                                        </button>
                                      )}
                                    </section>
                                  );
                                })}

                              {!filteredMedia.length &&
                                (!showText ||
                                  !group.textGroups.length) && (
                                  <div className="gai-empty compact">
                                    No matching assets in this campaign.
                                  </div>
                                )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="gai-empty compact">
                    No matching assets were returned for this date range.
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="gai-footer">
        <button type="button" className="gai-danger" onClick={disconnect}>
          Disconnect Google Ads
        </button>
        <span>Creative previews are live-only and are not stored by AdGen.</span>
      </footer>
    </section>
  );
}
