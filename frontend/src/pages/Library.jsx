import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";
import "./Library.css";

import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InfoTip from "../components/ui/InfoTip";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function keyFor(kind, id) {
  return `${kind}-${id}`;
}

function calcRoas(spend, revenue) {
  const s = Number(spend);
  const r = Number(revenue);
  if (!Number.isFinite(s) || !Number.isFinite(r) || s <= 0) return "";
  return (r / s).toFixed(2);
}

function numOrNull(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function metricLabel(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}


const INTELLIGENCE_STATUS = {
  winner: {
    label: "Winner",
    detail: "Top qualified performance signal",
    rank: 6,
  },
  strong: {
    label: "Strong",
    detail: "Positive qualified performance signal",
    rank: 5,
  },
  qualified: {
    label: "Qualified",
    detail: "Reliable performance evidence",
    rank: 4,
  },
  underperformer: {
    label: "Underperformer",
    detail: "Qualified negative signal",
    rank: 3,
  },
  learning: {
    label: "Learning",
    detail: "Building toward qualification",
    rank: 2,
  },
  insufficient: {
    label: "Insufficient Data",
    detail: "Needs delivery and outcome data",
    rank: 1,
  },
};

function intelligenceMeta(status) {
  return (
    INTELLIGENCE_STATUS[String(status || "").toLowerCase()] ||
    INTELLIGENCE_STATUS.insufficient
  );
}

function qualificationPercent(evidence) {
  const score = Number(evidence?.qualification_score);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function evidenceAssetId(evidence) {
  return String(
    evidence?.external_asset_id ||
      evidence?.raw_metadata?.libraryJobId ||
      ""
  );
}

export default function Library() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [videos, setVideos] = useState([]);
  const [images, setImages] = useState([]);
  const [intelligenceEvidence, setIntelligenceEvidence] = useState({});
  const [intelligenceStatus, setIntelligenceStatus] = useState("all");

  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [onlyWithPerf, setOnlyWithPerf] = useState(false);
  const [onlySuccessful, setOnlySuccessful] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedPerf, setExpandedPerf] = useState({});

  const [perfDrafts, setPerfDrafts] = useState({});
  const [perfSaving, setPerfSaving] = useState({});
  const [perfNotice, setPerfNotice] = useState({});
  const [me, setMe] = useState({ tier: null, status: null, isAdmin: false });
  const [visibleCount, setVisibleCount] = useState(2);

  const canTrackPerformance = useMemo(() => {
    if (me.isAdmin) return true;
    const tier = (me.tier || "").toLowerCase();
    return tier === "pro_monthly" || tier === "business_monthly";
  }, [me]);

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    return await user.getIdToken(true);
  };

  const loadIntelligenceEvidence = async (token) => {
    try {
      const res = await fetch(
        `${API_BASE}/performance-intelligence/evidence?limit=1000&source=manual_tracking`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await safeJson(res);

      if (!res.ok) {
        if (![402, 403].includes(res.status)) {
          console.warn(
            "[Library] Performance Intelligence evidence failed:",
            data?.detail || res.status,
          );
        }
        setIntelligenceEvidence({});
        return;
      }

      const items = Array.isArray(data?.evidence) ? data.evidence : [];
      const byAsset = {};

      for (const evidence of items) {
        const assetId = evidenceAssetId(evidence);
        if (!assetId) continue;

        const existing = byAsset[assetId];
        const nextScore = Number(evidence?.qualification_score || 0);
        const existingScore = Number(existing?.qualification_score || 0);

        if (!existing || nextScore >= existingScore) {
          byAsset[assetId] = evidence;
        }
      }

      setIntelligenceEvidence(byAsset);
    } catch (error) {
      console.warn(
        "[Library] Could not load Performance Intelligence evidence:",
        error,
      );
      setIntelligenceEvidence({});
    }
  };

  const load = async () => {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();

      const meRes = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const meData = await safeJson(meRes);

      if (meRes.ok && meData) {
        setMe({
          tier: meData.tier || null,
          status: meData.status || null,
          isAdmin: !!meData.isAdmin,
        });
      }

      const [vRes, iRes] = await Promise.all([
        fetch(`${API_BASE}/video/jobs?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/image/jobs?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const vData = await safeJson(vRes);
      const iData = await safeJson(iRes);

      if (!vRes.ok)
        throw new Error(vData?.detail || "Failed to load video history.");
      if (!iRes.ok)
        throw new Error(iData?.detail || "Failed to load image history.");

      const vItems = Array.isArray(vData.items) ? vData.items : [];
      const iItems = Array.isArray(iData.items) ? iData.items : [];

      setVideos(vItems);
      setImages(iItems);

      await loadIntelligenceEvidence(token);

      setPerfDrafts((prev) => {
        const next = { ...prev };

        for (const v of vItems) {
          const k = keyFor("video", v.id);
          if (next[k] == null) next[k] = { ...(v.performance || {}) };
        }

        for (const i of iItems) {
          const k = keyFor("image", i.id);
          if (next[k] == null) next[k] = { ...(i.performance || {}) };
        }

        return next;
      });
    } catch (e) {
      setErr(e?.message || "Failed to load library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setVisibleCount(12);
  }, [
    filter,
    sortBy,
    onlyWithPerf,
    onlySuccessful,
    intelligenceStatus,
    search,
  ]);

  const combined = useMemo(() => {
    const mappedVideos = videos.map((v) => ({
      kind: "video",
      id: v.id,
      createdAt: v.createdAt,
      title: v.productName ? `Video: ${v.productName}` : "Video Ad",
      status: v.status,
      url: v.finalVideoUrl || null,
      thumb: v.thumbnailUrl || null,
      ratio: v.ratio,
      duration: v.duration,
      model: v.model,
      prompt: v.directorPrompt || v.userPrompt || "",
      performance: v.performance || null,
      error: v.error || null,
      fileSizeBytes: v.fileSizeBytes || 0,
      intelligence: intelligenceEvidence[v.id] || null,
    }));

    const mappedImages = images.map((i) => ({
      kind: "image",
      id: i.id,
      createdAt: i.createdAt,
      title: i.productName ? `Image: ${i.productName}` : "Image Ad",
      status: i.status,
      url: i.imageUrl || null,
      thumb: i.imageUrl || null,
      ratio: i.aspectRatio || null,
      prompt: i.visualPrompt || "",
      copy: i.copy || null,
      performance: i.performance || null,
      error: i.error || null,
      fileSizeBytes: i.fileSizeBytes || 0,
      source: i.source || null,
      sourceType: i.sourceType || null,
      productName: i.productName || null,
      creativeProject: i.creativeProject || null,
      intelligence: intelligenceEvidence[i.id] || null,
    }));

    let out = [...mappedVideos, ...mappedImages].filter(
      (item) => item.status === "succeeded",
    );

    if (filter === "video") out = out.filter((x) => x.kind === "video");
    if (filter === "image") out = out.filter((x) => x.kind === "image");

    if (onlyWithPerf) {
      out = out.filter(
        (x) => x.performance && Object.keys(x.performance).length > 0,
      );
    }

    if (onlySuccessful) {
      out = out.filter((x) => x.performance?.marked_successful === true);
    }

    if (intelligenceStatus !== "all") {
      out = out.filter(
        (x) =>
          String(
            x.intelligence?.evidence_status || "insufficient",
          ).toLowerCase() === intelligenceStatus,
      );
    }

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((x) => {
        const copyText = x.copy
          ? `${x.copy.headline || ""} ${x.copy.primary_text || ""} ${x.copy.cta || ""}`
          : "";

        return [x.title, x.kind, x.ratio, x.model, x.prompt, copyText]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    }

    const metric = (item, key) => {
      const p = item.performance || {};
      return numOrNull(p[key]);
    };

    out = [...out].sort((a, b) => {
      if (sortBy === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === "intelligence") {
        const aMeta = intelligenceMeta(a.intelligence?.evidence_status);
        const bMeta = intelligenceMeta(b.intelligence?.evidence_status);
        const statusDifference = bMeta.rank - aMeta.rank;
        if (statusDifference) return statusDifference;

        return (
          Number(b.intelligence?.qualification_score || 0) -
          Number(a.intelligence?.qualification_score || 0)
        );
      }
      if (sortBy === "ctr")
        return (
          (metric(b, "ctr") ?? -Infinity) - (metric(a, "ctr") ?? -Infinity)
        );
      if (sortBy === "roas")
        return (
          (metric(b, "roas") ?? -Infinity) - (metric(a, "roas") ?? -Infinity)
        );
      if (sortBy === "spend")
        return (
          (metric(b, "spend") ?? -Infinity) - (metric(a, "spend") ?? -Infinity)
        );
      if (sortBy === "cpa")
        return (metric(a, "cpa") ?? Infinity) - (metric(b, "cpa") ?? Infinity);
      return 0;
    });

    return out;
  }, [
    videos,
    images,
    intelligenceEvidence,
    filter,
    onlyWithPerf,
    onlySuccessful,
    intelligenceStatus,
    sortBy,
    search,
  ]);

  const stats = useMemo(() => {
    const imageCount = images.filter((x) => x.status === "succeeded").length;
    const videoCount = videos.filter((x) => x.status === "succeeded").length;
    const withPerf = [...images, ...videos].filter(
      (x) => x.performance && Object.keys(x.performance).length > 0,
    ).length;

    const evidence = Object.values(intelligenceEvidence);
    const qualified = evidence.filter((item) =>
      ["qualified", "strong", "winner", "underperformer"].includes(
        String(item?.evidence_status || "").toLowerCase(),
      ),
    ).length;

    const positive = evidence.filter((item) =>
      ["strong", "winner"].includes(
        String(item?.evidence_status || "").toLowerCase(),
      ),
    ).length;

    return {
      imageCount,
      videoCount,
      withPerf,
      qualified,
      positive,
    };
  }, [images, videos, intelligenceEvidence]);

  const onPerfChange = (kind, id, field, value) => {
    const k = keyFor(kind, id);
    setPerfDrafts((prev) => ({
      ...prev,
      [k]: {
        ...(prev[k] || {}),
        [field]: value,
      },
    }));
  };

  const savePerformance = async (kind, id) => {
    const k = keyFor(kind, id);
    setPerfNotice((prev) => ({ ...prev, [k]: null }));
    setPerfSaving((prev) => ({ ...prev, [k]: true }));

    try {
      const token = await getToken();

      const d = perfDrafts[k] || {};
      const payload = {};

      const numFields = [
        "impressions",
        "clicks",
        "conversions",
        "ctr",
        "cpc",
        "cpa",
        "cpm",
        "spend",
        "revenue",
        "thumb_stop_rate",
        "view_3s",
        "view_6s",
        "hold_rate",
        "conversion_rate",
      ];

      for (const f of numFields) {
        if (d[f] === "" || d[f] == null) continue;
        const n = Number(d[f]);
        if (Number.isNaN(n)) continue;
        payload[f] = n;
      }

      if (typeof d.marked_successful === "boolean")
        payload.marked_successful = d.marked_successful;
      if (typeof d.notes === "string" && d.notes.trim())
        payload.notes = d.notes.trim();

      const res = await fetch(
        `${API_BASE}/creative/performance/${kind}/${id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await safeJson(res);

      if (!res.ok) {
        const msg =
          data?.detail && typeof data.detail === "string"
            ? data.detail
            : "Failed to save performance.";

        if (res.status === 402 || res.status === 403) {
          setPerfNotice((prev) => ({
            ...prev,
            [k]: "Performance tracking is available on Pro and Business plans.",
          }));
        } else {
          setPerfNotice((prev) => ({ ...prev, [k]: msg }));
        }
        return;
      }

      setPerfNotice((prev) => ({
        ...prev,
        [k]: data?.intelligenceRefreshQueued
          ? "Saved · intelligence refresh queued"
          : "Saved ✓",
      }));

      const perfSaved = data?.performance || payload;

      if (kind === "image") {
        setImages((prev) =>
          prev.map((x) => (x.id === id ? { ...x, performance: perfSaved } : x)),
        );
      } else {
        setVideos((prev) =>
          prev.map((x) => (x.id === id ? { ...x, performance: perfSaved } : x)),
        );
      }

      setPerfDrafts((prev) => ({
        ...prev,
        [k]: { ...(prev[k] || {}), ...perfSaved },
      }));

      window.setTimeout(async () => {
        try {
          const refreshedToken = await getToken();
          await loadIntelligenceEvidence(refreshedToken);
        } catch {
          // Non-fatal. The next Library refresh will load the new status.
        }
      }, 1400);
    } catch (e) {
      setPerfNotice((prev) => ({
        ...prev,
        [k]: e?.message || "Failed to save performance.",
      }));
    } finally {
      setPerfSaving((prev) => ({ ...prev, [k]: false }));
    }
  };

  const downloadLibraryImage = async (item) => {
    try {
      if (item.kind !== "image") return;

      const token = await getToken();

      const response = await fetch(`${API_BASE}/download-image/${item.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Download request failed.");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `adgen-${item.id}.png`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed. Please try again.");
    }
  };

  const editImageInStudio = (item) => {
    if (item.kind !== "image" || !item.url) return;

    navigate("/creative-studio", {
      state: {
        creativeStudio: {
          sourceType: "library",
          sourceImageJobId: item.id,
          imageUrl: item.url,
          title: item.productName || item.title || "Library creative",
          copy: item.copy || {},
          creativeProject: item.creativeProject || null,
        },
      },
    });
  };

  const deleteCreative = async (item) => {
    if (!window.confirm(`Delete this ${item.kind} from your Library?`)) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/${item.kind === "image" ? "image" : "video"}/jobs/${item.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.detail || "Delete failed.");
      if (item.kind === "image")
        setImages((prev) => prev.filter((x) => x.id !== item.id));
      else setVideos((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e) {
      alert(e?.message || "Delete failed.");
    }
  };

  const togglePerf = (key) => {
    setExpandedPerf((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="lib-page">
      <PageHeader
        eyebrow="CREATIVE LIBRARY"
        title="Your ad creative workspace"
        description="Browse, search, download, and track the performance of every image and video creative generated inside AdGen."
        actions={
          <Button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Library"}
          </Button>
        }
      />

      <div className="lib-statGrid">
        <Card className="lib-statCard">
          <span>Images</span>
          <strong>{stats.imageCount}</strong>
          <p>Generated image creatives</p>
        </Card>

        <Card className="lib-statCard">
          <span>Videos</span>
          <strong>{stats.videoCount}</strong>
          <p>Generated video creatives</p>
        </Card>

        <Card className="lib-statCard">
          <span>Tracked</span>
          <strong>{stats.withPerf}</strong>
          <p>Creatives with performance data</p>
        </Card>

        <Card className="lib-statCard lib-intelligenceStat">
          <span>Qualified Signals</span>
          <strong>{stats.qualified}</strong>
          <p>{stats.positive} positive learning signals</p>
        </Card>
      </div>

      <Card className="lib-toolbar">
        <div className="lib-searchWrap">
          <label>
            Search Library
            <InfoTip text="Search by product name, creative type, prompt, headline, CTA, model, or aspect ratio." />
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, prompt, headline, CTA..."
          />
        </div>

        <div className="lib-filterRow">
          <button
            className={`lib-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`lib-pill ${filter === "image" ? "active" : ""}`}
            onClick={() => setFilter("image")}
          >
            Images
          </button>
          <button
            className={`lib-pill ${filter === "video" ? "active" : ""}`}
            onClick={() => setFilter("video")}
          >
            Videos
          </button>

          <label className="lib-sort">
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="intelligence">Best Intelligence Signal</option>
              <option value="ctr">Highest CTR</option>
              <option value="cpa">Lowest CPA</option>
              <option value="roas">Highest ROAS</option>
              <option value="spend">Highest Spend</option>
            </select>
          </label>
        </div>

        <div className="lib-checkRow">
          <label>
            <input
              type="checkbox"
              checked={onlyWithPerf}
              onChange={(e) => setOnlyWithPerf(e.target.checked)}
            />
            Has performance
          </label>

          <label>
            <input
              type="checkbox"
              checked={onlySuccessful}
              onChange={(e) => setOnlySuccessful(e.target.checked)}
            />
            Manually marked successful
          </label>

          <label className="lib-intelligenceFilter">
            Intelligence status
            <select
              value={intelligenceStatus}
              onChange={(e) => setIntelligenceStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="winner">Winner</option>
              <option value="strong">Strong</option>
              <option value="qualified">Qualified</option>
              <option value="learning">Learning</option>
              <option value="underperformer">Underperformer</option>
              <option value="insufficient">Insufficient Data</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="lib-hint">
        Add impressions, clicks, conversions, spend, and revenue so
        Performance Intelligence can qualify each creative and improve future
        image and video generations.
      </div>

      {loading && (
        <Card className="lib-stateCard">Loading your creative library...</Card>
      )}
      {err && <Card className="lib-error">{err}</Card>}

      {!loading && !err && combined.length === 0 && (
        <Card className="lib-empty">
          <h3>No creatives found</h3>
          <p>
            Generate an image or video and it will appear here automatically.
          </p>
        </Card>
      )}

      <div className="lib-grid">
        {combined.slice(0, visibleCount).map((item) => {
          const k = keyFor(item.kind, item.id);
          const d = perfDrafts[k] || {};
          const saving = !!perfSaving[k];
          const notice = perfNotice[k];
          const isExpanded = !!expandedPerf[k];

          const roasDisplay =
            d.roas != null && d.roas !== ""
              ? String(d.roas)
              : calcRoas(d.spend, d.revenue);
          const isWinner = item.performance?.marked_successful === true;
          const intelligence = item.intelligence;
          const intelligenceStatusValue = String(
            intelligence?.evidence_status || "insufficient",
          ).toLowerCase();
          const intelligenceInfo = intelligenceMeta(
            intelligenceStatusValue,
          );
          const intelligenceScore = qualificationPercent(intelligence);

          return (
            <Card
              key={k}
              className={`lib-card intelligence-${intelligenceStatusValue} ${
                isWinner ? "manual-winner" : ""
              }`}
            >
              <div className="lib-media">
                {item.kind === "image" && item.thumb && (
                  <img src={item.thumb} alt={item.title} />
                )}
                {item.kind === "video" && item.url && (
                  <video src={item.url} controls preload="metadata" />
                )}
                {item.kind === "video" && !item.url && (
                  <div className="lib-placeholder">Video not ready</div>
                )}

                <div className="lib-mediaOverlay">
                  {item.url && (
                    <a
                      className="lib-overlayBtn"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  )}

                  {item.kind === "image" && item.url && (
                    <>
                      <button
                        type="button"
                        className="lib-overlayBtn"
                        onClick={() => editImageInStudio(item)}
                      >
                        Edit in Studio
                      </button>
                      <button
                        type="button"
                        className="lib-overlayBtn"
                        onClick={() => downloadLibraryImage(item)}
                      >
                        Download
                      </button>
                    </>
                  )}

                  {item.kind === "video" && item.url && (
                    <a className="lib-overlayBtn" href={item.url} download>
                      Download
                    </a>
                  )}
                </div>
              </div>

              <div className="lib-meta">
                <div className="lib-topRow">
                  <span className={`lib-badge ${item.kind}`}>
                    {item.kind.toUpperCase()}
                  </span>
                  <span
                    className={`lib-intelligenceBadge ${intelligenceStatusValue}`}
                    title={intelligenceInfo.detail}
                  >
                    {intelligenceInfo.label}
                  </span>
                  {isWinner && (
                    <span className="lib-manualBadge">Manual Pick</span>
                  )}
                </div>

                <h3>{item.title}</h3>
                <p className="lib-date">
                  {formatDate(item.createdAt)} ·{" "}
                  {formatBytes(item.fileSizeBytes)}
                </p>
                <div className="lib-intelligenceSummary">
                  <div>
                    <span>Performance Intelligence</span>
                    <strong>{intelligenceInfo.label}</strong>
                  </div>
                  <p>
                    {intelligenceInfo.detail}
                    {intelligenceScore !== null
                      ? ` · Signal ${intelligenceScore}%`
                      : ""}
                  </p>
                </div>
                {item.error && (
                  <div className="lib-errorSmall">
                    {String(item.error).slice(0, 140)}
                  </div>
                )}

                <div className="lib-metricStrip">
                  <div>
                    <span>Impressions</span>
                    <strong>{metricLabel(d.impressions)}</strong>
                  </div>
                  <div>
                    <span>CTR</span>
                    <strong>{metricLabel(d.ctr, "%")}</strong>
                  </div>
                  <div>
                    <span>ROAS</span>
                    <strong>{roasDisplay || "—"}</strong>
                  </div>
                </div>

                <div className="lib-cardActions">
                  {canTrackPerformance ? (
                    <button
                      type="button"
                      className="lib-cardAction primary"
                      onClick={() => togglePerf(k)}
                    >
                      {isExpanded ? "Hide Performance" : "Edit Performance"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="lib-cardAction primary"
                      onClick={() => (window.location.href = "/account")}
                    >
                      Upgrade to Track
                    </button>
                  )}

                  <button
                    type="button"
                    className="lib-cardAction danger"
                    onClick={() => deleteCreative(item)}
                    aria-label={`Delete ${item.title}`}
                  >
                    Delete
                  </button>
                </div>

                {isExpanded && (
                  <div className="lib-perf">
                    <div className="lib-perfTitle">
                      Performance Data
                      <InfoTip text="Impressions, clicks, conversions, spend, and revenue determine whether this creative becomes Learning, Qualified, Strong, Winner, or Underperformer evidence." />
                    </div>

                    <div className="lib-perfGrid">
                      <label className="lib-field">
                        <span>Impressions</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={d.impressions ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "impressions",
                              e.target.value,
                            )
                          }
                          placeholder="250"
                        />
                      </label>

                      <label className="lib-field">
                        <span>Clicks</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={d.clicks ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "clicks",
                              e.target.value,
                            )
                          }
                          placeholder="10"
                        />
                      </label>

                      <label className="lib-field">
                        <span>Conversions</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={d.conversions ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "conversions",
                              e.target.value,
                            )
                          }
                          placeholder="1"
                        />
                      </label>

                      <label className="lib-field">
                        <span>CTR %</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.ctr ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "ctr",
                              e.target.value,
                            )
                          }
                          placeholder="1.25"
                        />
                      </label>

                      <label className="lib-field">
                        <span>CPC $</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.cpc ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "cpc",
                              e.target.value,
                            )
                          }
                          placeholder="0.85"
                        />
                      </label>

                      <label className="lib-field">
                        <span>CPA $</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.cpa ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "cpa",
                              e.target.value,
                            )
                          }
                          placeholder="18.40"
                        />
                      </label>

                      <label className="lib-field">
                        <span>CPM $</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.cpm ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "cpm",
                              e.target.value,
                            )
                          }
                          placeholder="12.50"
                        />
                      </label>

                      <label className="lib-field">
                        <span>Spend $</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.spend ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "spend",
                              e.target.value,
                            )
                          }
                          placeholder="120"
                        />
                      </label>

                      <label className="lib-field">
                        <span>Revenue $</span>
                        <input
                          type="number"
                          step="0.01"
                          value={d.revenue ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "revenue",
                              e.target.value,
                            )
                          }
                          placeholder="600"
                        />
                      </label>

                      <label className="lib-field">
                        <span>ROAS</span>
                        <input
                          type="text"
                          value={roasDisplay ?? ""}
                          placeholder="Auto"
                          readOnly
                        />
                      </label>

                      <label className="lib-field lib-fieldWide">
                        <span>Manual success override</span>
                        <select
                          value={
                            typeof d.marked_successful === "boolean"
                              ? String(d.marked_successful)
                              : ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            onPerfChange(
                              item.kind,
                              item.id,
                              "marked_successful",
                              v === "" ? null : v === "true",
                            );
                          }}
                        >
                          <option value="">No override</option>
                          <option value="true">Mark as successful</option>
                          <option value="false">Mark as not successful</option>
                        </select>
                      </label>

                      <label className="lib-field lib-fieldWide">
                        <span>Notes</span>
                        <textarea
                          value={d.notes ?? ""}
                          onChange={(e) =>
                            onPerfChange(
                              item.kind,
                              item.id,
                              "notes",
                              e.target.value,
                            )
                          }
                          placeholder="What happened? Hook, placement, audience, creative notes..."
                          rows={3}
                        />
                      </label>
                    </div>

                    <div className="lib-perfActions">
                      <Button
                        type="button"
                        onClick={() => savePerformance(item.kind, item.id)}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save Performance"}
                      </Button>
                      {notice && <div className="lib-perfNotice">{notice}</div>}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {visibleCount < combined.length && (
        <div className="lib-loadMore">
          <Button
            type="button"
            onClick={() =>
              setVisibleCount((count) => Math.min(count + 12, combined.length))
            }
          >
            Load More Creatives
          </Button>
        </div>
      )}
    </div>
  );
}