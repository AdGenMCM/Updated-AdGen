import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./Library.css";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function formatDate(ts) {
  if (!ts) return "";
  // createdAt is unix seconds
  const d = new Date(ts * 1000);
  return d.toLocaleString();
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

export default function Library() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [videos, setVideos] = useState([]);
  const [images, setImages] = useState([]);

  const [filter, setFilter] = useState("all"); // all | video | image

  // ✅ NEW: sort + quick filters
  const [sortBy, setSortBy] = useState("newest"); // newest | ctr | cpa | roas | spend
  const [onlyWithPerf, setOnlyWithPerf] = useState(false);
  const [onlySuccessful, setOnlySuccessful] = useState(false);

  // Performance form state (keyed by kind-id)
  const [perfDrafts, setPerfDrafts] = useState({});
  const [perfSaving, setPerfSaving] = useState({});
  const [perfNotice, setPerfNotice] = useState({});

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    return await user.getIdToken(true);
  };

  const load = async () => {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();

      const [vRes, iRes] = await Promise.all([
        fetch(`${API_BASE}/video/jobs?limit=50`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/image/jobs?limit=50`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const vData = await safeJson(vRes);
      const iData = await safeJson(iRes);

      if (!vRes.ok) throw new Error(vData?.detail || "Failed to load video history.");
      if (!iRes.ok) throw new Error(iData?.detail || "Failed to load image history.");

      const vItems = Array.isArray(vData.items) ? vData.items : [];
      const iItems = Array.isArray(iData.items) ? iData.items : [];

      setVideos(vItems);
      setImages(iItems);

      // Seed drafts from stored performance
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
    }));

    let out = [...mappedVideos, ...mappedImages];

    // Type filter
    if (filter === "video") out = out.filter((x) => x.kind === "video");
    if (filter === "image") out = out.filter((x) => x.kind === "image");

    // Quick filters
    if (onlyWithPerf) {
      out = out.filter((x) => x.performance && Object.keys(x.performance).length > 0);
    }
    if (onlySuccessful) {
      out = out.filter((x) => x.performance?.marked_successful === true);
    }

    const metric = (item, key) => {
      const p = item.performance || {};
      return numOrNull(p[key]);
    };

    // Sort
    out = [...out].sort((a, b) => {
      if (sortBy === "newest") return (b.createdAt || 0) - (a.createdAt || 0);

      if (sortBy === "ctr") return (metric(b, "ctr") ?? -Infinity) - (metric(a, "ctr") ?? -Infinity);
      if (sortBy === "roas") return (metric(b, "roas") ?? -Infinity) - (metric(a, "roas") ?? -Infinity);
      if (sortBy === "spend") return (metric(b, "spend") ?? -Infinity) - (metric(a, "spend") ?? -Infinity);

      // lowest CPA first
      if (sortBy === "cpa") return (metric(a, "cpa") ?? Infinity) - (metric(b, "cpa") ?? Infinity);

      return 0;
    });

    return out;
  }, [videos, images, filter, onlyWithPerf, onlySuccessful, sortBy]);

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

      // ✅ ROAS is NOT sent. Backend calculates ROAS from spend + revenue.
      const numFields = [
        "ctr",
        "cpc",
        "cpa",
        "cpm", // ✅ NEW
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

      if (typeof d.marked_successful === "boolean") payload.marked_successful = d.marked_successful;
      if (typeof d.notes === "string" && d.notes.trim()) payload.notes = d.notes.trim();

      const res = await fetch(`${API_BASE}/creative/performance/${kind}/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg =
          data?.detail && typeof data.detail === "string"
            ? data.detail
            : "Failed to save performance.";

        // friendly gating message
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

      setPerfNotice((prev) => ({ ...prev, [k]: "Saved ✓" }));

      // Update local lists with server response (includes computed ROAS)
      const perfSaved = data?.performance || payload;

      if (kind === "image") {
        setImages((prev) => prev.map((x) => (x.id === id ? { ...x, performance: perfSaved } : x)));
      } else {
        setVideos((prev) => prev.map((x) => (x.id === id ? { ...x, performance: perfSaved } : x)));
      }

      // Also reflect saved values into drafts
      setPerfDrafts((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...perfSaved } }));
    } catch (e) {
      setPerfNotice((prev) => ({ ...prev, [k]: e?.message || "Failed to save performance." }));
    } finally {
      setPerfSaving((prev) => ({ ...prev, [k]: false }));
    }
  };

  return (
    <div className="lib-wrap">
      <div className="lib-header">
        <h1 className="lib-title">Creative Library</h1>

        <div className="lib-controls">
          <button className={`lib-pill ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            All
          </button>
          <button className={`lib-pill ${filter === "image" ? "active" : ""}`} onClick={() => setFilter("image")}>
            Images
          </button>
          <button className={`lib-pill ${filter === "video" ? "active" : ""}`} onClick={() => setFilter("video")}>
            Videos
          </button>
          <button className="lib-pill" onClick={load}>
            Refresh
          </button>
        </div>

        {/* ✅ NEW: Sort + quick filters */}
        <div className="lib-sortRow">
          <label className="lib-inline">
            <span>Sort</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="ctr">Highest CTR</option>
              <option value="cpa">Lowest CPA</option>
              <option value="roas">Highest ROAS</option>
              <option value="spend">Highest Spend</option>
            </select>
          </label>

          <label className="lib-check">
            <input
              type="checkbox"
              checked={onlyWithPerf}
              onChange={(e) => setOnlyWithPerf(e.target.checked)}
            />
            <span>Has performance</span>
          </label>

          <label className="lib-check">
            <input
              type="checkbox"
              checked={onlySuccessful}
              onChange={(e) => setOnlySuccessful(e.target.checked)}
            />
            <span>Successful only</span>
          </label>
        </div>
      </div>

      <div className="lib-hint">
        Add performance metrics to track what works over time. Performance tracking is available on{" "}
        <b>Pro</b> and <b>Business</b>.
      </div>

      {loading && <div className="lib-muted">Loading…</div>}
      {err && <div className="lib-error">{err}</div>}

      {!loading && !err && combined.length === 0 && (
        <div className="lib-muted">No creatives yet. Generate an image or video and they’ll appear here.</div>
      )}

      <div className="lib-grid">
        {combined.map((item) => {
          const k = keyFor(item.kind, item.id);
          const d = perfDrafts[k] || {};
          const saving = !!perfSaving[k];
          const notice = perfNotice[k];

          const roasDisplay =
            d.roas != null && d.roas !== ""
              ? String(d.roas)
              : calcRoas(d.spend, d.revenue);

          return (
            <div key={k} className="lib-card">
              <div className="lib-media">
                {item.kind === "image" && item.thumb && <img src={item.thumb} alt={item.title} />}

                {item.kind === "video" && item.url && <video src={item.url} controls preload="metadata" />}

                {item.kind === "video" && !item.url && <div className="lib-placeholder">Video not ready</div>}
              </div>

              <div className="lib-meta">
                <div className="lib-row">
                  <span className="lib-badge">{item.kind.toUpperCase()}</span>
                  <span className={`lib-status ${item.status || ""}`}>{item.status || "unknown"}</span>
                </div>

                <div className="lib-name">{item.title}</div>
                <div className="lib-sub">{formatDate(item.createdAt)}</div>

                {item.error && <div className="lib-errorSmall">{String(item.error).slice(0, 140)}</div>}

                <div className="lib-buttons">
                  {item.url && (
                    <a className="lib-linkBtn" href={item.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                  {item.url && (
                    <a className="lib-linkBtn" href={item.url} download>
                      Download
                    </a>
                  )}
                </div>

                {/* Performance Tracking */}
                <div className="lib-perf">
                  <div className="lib-perfTitle">Performance</div>

                  <div className="lib-perfGrid">
                    <label className="lib-field">
                      <span>CTR %</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.ctr ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "ctr", e.target.value)}
                        placeholder="e.g. 1.25"
                      />
                    </label>

                    <label className="lib-field">
                      <span>CPC $</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.cpc ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "cpc", e.target.value)}
                        placeholder="e.g. 0.85"
                      />
                    </label>

                    <label className="lib-field">
                      <span>CPA $</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.cpa ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "cpa", e.target.value)}
                        placeholder="e.g. 18.40"
                      />
                    </label>

                    {/* ✅ NEW: CPM */}
                    <label className="lib-field">
                      <span>CPM $</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.cpm ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "cpm", e.target.value)}
                        placeholder="e.g. 12.50"
                      />
                    </label>

                    <label className="lib-field">
                      <span>Spend $</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.spend ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "spend", e.target.value)}
                        placeholder="e.g. 120"
                      />
                    </label>

                    <label className="lib-field">
                      <span>Revenue $</span>
                      <input
                        type="number"
                        step="0.01"
                        value={d.revenue ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "revenue", e.target.value)}
                        placeholder="e.g. 600"
                      />
                    </label>

                    <label className="lib-field">
                      <span>ROAS</span>
                      <input type="text" value={roasDisplay ?? ""} placeholder="Auto-calculated" readOnly />
                    </label>

                    <label className="lib-field lib-fieldWide">
                      <span>Successful?</span>
                      <select
                        value={typeof d.marked_successful === "boolean" ? String(d.marked_successful) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          onPerfChange(item.kind, item.id, "marked_successful", v === "" ? null : v === "true");
                        }}
                      >
                        <option value="">Not set</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </label>

                    <label className="lib-field lib-fieldWide">
                      <span>Notes</span>
                      <textarea
                        value={d.notes ?? ""}
                        onChange={(e) => onPerfChange(item.kind, item.id, "notes", e.target.value)}
                        placeholder="What happened? (hook, placement, audience, etc.)"
                        rows={3}
                      />
                    </label>
                  </div>

                  <div className="lib-perfActions">
                    <button className="lib-saveBtn" onClick={() => savePerformance(item.kind, item.id)} disabled={saving}>
                      {saving ? "Saving…" : "Save performance"}
                    </button>
                    {notice && <div className="lib-perfNotice">{notice}</div>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}