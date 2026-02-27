import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./Library.css";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

async function safeJson(res) {
  try { return await res.json(); } catch { return {}; }
}

function formatDate(ts) {
  if (!ts) return "";
  // your createdAt looks like unix seconds
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

export default function Library() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [videos, setVideos] = useState([]);
  const [images, setImages] = useState([]);

  const [filter, setFilter] = useState("all"); // all | video | image

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

      setVideos(Array.isArray(vData.items) ? vData.items : []);
      setImages(Array.isArray(iData.items) ? iData.items : []);
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
    const mappedVideos = videos.map(v => ({
      kind: "video",
      id: v.id,
      createdAt: v.createdAt,
      title: v.productName ? `Video: ${v.productName}` : "Video Ad",
      status: v.status,
      url: v.finalVideoUrl || null,
      thumb: v.thumbnailUrl || null, // optional if you add later
      ratio: v.ratio,
      duration: v.duration,
      model: v.model,
      prompt: v.directorPrompt || v.userPrompt || "",
      error: v.error || null,
    }));

    const mappedImages = images.map(i => ({
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
      error: i.error || null,
    }));

    const all = [...mappedVideos, ...mappedImages].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (filter === "video") return all.filter(x => x.kind === "video");
    if (filter === "image") return all.filter(x => x.kind === "image");
    return all;
  }, [videos, images, filter]);

  return (
    <div className="lib-wrap">
      <div className="lib-header">
        <h1 className="lib-title">Creative Library</h1>

        <div className="lib-actions">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="lib-select">
            <option value="all">All</option>
            <option value="video">Video</option>
            <option value="image">Image</option>
          </select>

          <button className="lib-btn" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <div className="lib-muted">Loading…</div>}
      {err && <div className="lib-error">{err}</div>}

      {!loading && !err && combined.length === 0 && (
        <div className="lib-muted">
          No creatives yet. Generate an image or video and they’ll appear here.
        </div>
      )}

      <div className="lib-grid">
        {combined.map(item => (
          <div key={`${item.kind}-${item.id}`} className="lib-card">
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}