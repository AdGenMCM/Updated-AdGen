import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileImage,
  Film,
  Image as ImageIcon,
  Sparkles,
  Star,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { auth } from "../firebaseConfig";
import "./AdminCreative.css";

const PRODUCTION_API = "https://updated-adgen.onrender.com";
const API_BASE = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  PRODUCTION_API
).trim();

const TIER_LABELS = {
  free: "Free",
  trial_monthly: "Trial",
  starter_monthly: "Starter",
  pro_monthly: "Pro",
  business_monthly: "Business",
  admin: "Admin",
};

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "Unknown date";

  return new Date(value * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function tierLabel(value) {
  return TIER_LABELS[value] || value || "Unknown";
}

function formatStructureValue(value) {
  if (value === true) return "On";
  if (value === false) return "Off";
  return "Unknown";
}

function logoModeLabel(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "none") return "No Logo";
  if (mode === "generate") return "Generated";
  if (mode === "brand_kit") return "Brand Kit";
  return "Unknown";
}

function structureSourceLabel(item) {
  const explicit = String(item?.structureSource || "").trim().toLowerCase();
  if (explicit === "known") return "ADGen";
  if (explicit === "user_confirmed") return "User confirmed";
  if (explicit === "inferred" || explicit === "inferred_from_platform") {
    return "Inferred";
  }

  if (item?.kind === "image" && item?.creativeElements) {
    if (item?.source === "ad_generator" || item?.source === "optimizer_generate") {
      return "ADGen";
    }
  }

  return "Unknown";
}

function creativeTitle(item) {
  if (item.productName) return item.productName;
  if (item.kind === "optimizer") return "Optimizer run";
  return item.kind === "video" ? "Video creative" : "Image creative";
}

function StatusBadge({ value }) {
  const status = String(value || "unknown").toLowerCase();
  return (
    <span className={`admin-creative-status status-${status}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function CreativeCard({ item, onSelect }) {
  const isVideo = item.kind === "video";
  const isOptimizer = item.kind === "optimizer";
  const mediaUrl = item.url || item.thumbnailUrl;

  return (
    <article className="admin-creative-card">
      <button
        type="button"
        className="admin-creative-media"
        onClick={() => onSelect(item)}
        aria-label={`View ${creativeTitle(item)} details`}
      >
        {isOptimizer ? (
          <span className="admin-creative-placeholder">
            <Sparkles size={34} />
            <small>Optimization analysis</small>
          </span>
        ) : isVideo && item.url ? (
          <video
            src={item.url}
            poster={item.thumbnailUrl || undefined}
            preload="metadata"
            muted
          />
        ) : !isVideo && mediaUrl ? (
          <img src={mediaUrl} alt={creativeTitle(item)} loading="lazy" />
        ) : (
          <span className="admin-creative-placeholder">
            {isVideo ? <Film size={34} /> : <FileImage size={34} />}
            <small>{isVideo ? "Video unavailable" : "Image unavailable"}</small>
          </span>
        )}

        <span className={`admin-creative-kind kind-${item.kind}`}>
          {isOptimizer ? <Sparkles size={13} /> : isVideo ? <Video size={13} /> : <ImageIcon size={13} />}
          {item.kind}
        </span>

        <span className="admin-creative-open-overlay">View details</span>
      </button>

      <div className="admin-creative-card-body">
        <div className="admin-creative-card-heading">
          <div>
            <h3>{creativeTitle(item)}</h3>
            <p>{formatDate(item.createdAt)}</p>
          </div>
          <div className="admin-creative-card-badges">
            <StatusBadge value={item.status} />
            {item.feedback?.rating && <span className="admin-creative-rating"><Star size={13} fill="currentColor" /> {item.feedback.rating}/5</span>}
            {item.feedback?.skipped && <span className="admin-creative-feedback-skipped">Skipped</span>}
          </div>
        </div>

        <div className="admin-creative-user-row">
          <span className="admin-creative-avatar">
            {(item.user?.displayName || item.user?.email || "U")
              .trim()
              .charAt(0)
              .toUpperCase()}
          </span>
          <span>
            <strong>{item.user?.displayName || "AdGen user"}</strong>
            <small>{item.user?.email || item.uid || "Unknown user"}</small>
          </span>
          <em>{tierLabel(item.user?.tier)}</em>
        </div>

        <div className="admin-creative-meta-row">
          <span>{item.ratio || "Unknown ratio"}</span>
          <span>{isVideo && item.duration ? `${item.duration}s` : formatBytes(item.fileSizeBytes)}</span>
          <span>{item.model || "Model unavailable"}</span>
        </div>

        {!isVideo && !isOptimizer && (
          <div className="admin-creative-structure-row">
            <span>H: {formatStructureValue(item.creativeElements?.headline)}</span>
            <span>B: {formatStructureValue(item.creativeElements?.body)}</span>
            <span>CTA: {formatStructureValue(item.creativeElements?.cta)}</span>
            <span>Logo: {logoModeLabel(item.creativeElements?.logoMode)}</span>
          </div>
        )}

        <p className="admin-creative-prompt-preview">
          {item.prompt || "No generation prompt was stored for this creative."}
        </p>

        <div className="admin-creative-actions">
          <button type="button" onClick={() => onSelect(item)}>
            View details
          </button>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open
            </a>
          )}
          {item.url && (
            <a href={item.url} download>
              <Download size={14} /> Download
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function DetailsDrawer({ item, onClose }) {
  if (!item) return null;

  const copy = item.copy || {};

  return (
    <div className="admin-creative-drawer-layer">
      <button
        type="button"
        className="admin-creative-drawer-backdrop"
        onClick={onClose}
        aria-label="Close creative details"
      />

      <aside className="admin-creative-drawer" aria-label="Creative details">
        <header>
          <div>
            <span>Creative details</span>
            <h2>{creativeTitle(item)}</h2>
            <p>{formatDate(item.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>

        <div className="admin-creative-drawer-scroll">
          <div className="admin-creative-drawer-media">
            {item.kind === "optimizer" ? (
              <div className="admin-creative-optimizer-preview"><Sparkles size={30} /><strong>Optimizer analysis</strong><p>{item.prompt || "Optimization completed."}</p></div>
            ) : item.kind === "video" && item.url ? (
              <video
                src={item.url}
                poster={item.thumbnailUrl || undefined}
                controls
                preload="metadata"
              />
            ) : item.url ? (
              <img src={item.url} alt={creativeTitle(item)} />
            ) : (
              <span>No media URL is available.</span>
            )}
          </div>

          <section className="admin-creative-detail-section">
            <h3>User</h3>
            <dl>
              <div><dt>Name</dt><dd>{item.user?.displayName || "AdGen user"}</dd></div>
              <div><dt>Email</dt><dd>{item.user?.email || "—"}</dd></div>
              <div><dt>Plan</dt><dd>{tierLabel(item.user?.tier)}</dd></div>
              <div><dt>UID</dt><dd className="is-code">{item.uid || "—"}</dd></div>
            </dl>
          </section>

          <section className="admin-creative-detail-section">
            <h3>Creative</h3>
            <dl>
              <div><dt>Type</dt><dd>{item.kind}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge value={item.status} /></dd></div>
              <div><dt>Ratio</dt><dd>{item.ratio || "—"}</dd></div>
              <div><dt>Duration</dt><dd>{item.duration ? `${item.duration}s` : "—"}</dd></div>
              <div><dt>Model</dt><dd>{item.model || "—"}</dd></div>
              <div><dt>File size</dt><dd>{formatBytes(item.fileSizeBytes)}</dd></div>
              <div><dt>Source</dt><dd>{item.source || "—"}</dd></div>
              <div><dt>Job ID</dt><dd className="is-code">{item.id}</dd></div>
            </dl>
          </section>

          {item.kind === "image" && (
            <section className="admin-creative-detail-section">
              <h3>Creative Structure</h3>
              <dl>
                <div>
                  <dt>Headline</dt>
                  <dd>{formatStructureValue(item.creativeElements?.headline)}</dd>
                </div>
                <div>
                  <dt>Body Text</dt>
                  <dd>{formatStructureValue(item.creativeElements?.body)}</dd>
                </div>
                <div>
                  <dt>CTA</dt>
                  <dd>{formatStructureValue(item.creativeElements?.cta)}</dd>
                </div>
                <div>
                  <dt>Logo</dt>
                  <dd>{logoModeLabel(item.creativeElements?.logoMode)}</dd>
                </div>
                <div>
                  <dt>Structure Source</dt>
                  <dd>{structureSourceLabel(item)}</dd>
                </div>
              </dl>

              {!item.creativeElements && (
                <p className="admin-creative-structure-note">
                  This creative predates structure tracking or was created by a source
                  that did not save exact element metadata.
                </p>
              )}
            </section>
          )}

          <section className="admin-creative-detail-section">
            <h3>User feedback</h3>
            {item.feedback ? (
              <dl>
                <div><dt>Rating</dt><dd>{item.feedback.rating ? `${item.feedback.rating}/5` : "—"}</dd></div>
                <div><dt>Skipped</dt><dd>{item.feedback.skipped ? "Yes" : "No"}</dd></div>
                <div><dt>Comment</dt><dd>{item.feedback.comment || "—"}</dd></div>
              </dl>
            ) : <p className="admin-creative-long-copy">No feedback submitted.</p>}
          </section>

          <section className="admin-creative-detail-section">
            <h3>Prompt</h3>
            <p className="admin-creative-long-copy">
              {item.prompt || "No prompt was stored for this creative."}
            </p>
          </section>

          {(copy.headline || copy.primary_text || copy.cta) && (
            <section className="admin-creative-detail-section">
              <h3>Generated copy</h3>
              <dl>
                <div><dt>Headline</dt><dd>{copy.headline || "—"}</dd></div>
                <div><dt>Body</dt><dd>{copy.primary_text || "—"}</dd></div>
                <div><dt>CTA</dt><dd>{copy.cta || "—"}</dd></div>
              </dl>
            </section>
          )}
        </div>

        <footer>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Open original
            </a>
          )}
          {item.url && (
            <a href={item.url} download>
              <Download size={15} /> Download
            </a>
          )}
        </footer>
      </aside>
    </div>
  );
}

export default function AdminCreative() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [pageStack, setPageStack] = useState([]);

  const authedFetch = useCallback(async (path) => {
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("You must be signed in as an administrator.");

    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || `Request failed (${response.status}).`);
    }
    return data;
  }, []);

  const load = useCallback(
    async (requestedCursor = cursor) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          kind,
          status,
          days: String(days),
          limit: "48",
        });

        if (appliedSearch) params.set("q", appliedSearch);
        if (requestedCursor) params.set("cursor", String(requestedCursor));

        const data = await authedFetch(`/admin/creative?${params.toString()}`);
        setItems(Array.isArray(data?.items) ? data.items : []);
        setNextCursor(data?.nextCursor || null);
      } catch (requestError) {
        setItems([]);
        setNextCursor(null);
        setError(requestError?.message || "Could not load creative records.");
      } finally {
        setLoading(false);
      }
    },
    [appliedSearch, authedFetch, cursor, days, kind, status]
  );

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const images = items.filter((item) => item.kind === "image").length;
    const videos = items.filter((item) => item.kind === "video").length;
    const optimizations = items.filter((item) => item.kind === "optimizer").length;
    const succeeded = items.filter((item) => item.status === "succeeded").length;
    const uniqueUsers = new Set(items.map((item) => item.uid).filter(Boolean)).size;

    const structuredImages = items.filter(
      (item) =>
        item.kind === "image" &&
        item.creativeElements &&
        typeof item.creativeElements === "object"
    );

    const percentOn = (key) => {
      const known = structuredImages.filter(
        (item) => typeof item.creativeElements?.[key] === "boolean"
      );
      if (!known.length) return null;
      const on = known.filter((item) => item.creativeElements[key] === true).length;
      return Math.round((on / known.length) * 100);
    };

    const logoCounts = structuredImages.reduce(
      (acc, item) => {
        const mode = String(item.creativeElements?.logoMode || "").toLowerCase();
        if (mode === "none") acc.none += 1;
        else if (mode === "generate") acc.generate += 1;
        else if (mode === "brand_kit") acc.brandKit += 1;
        else acc.unknown += 1;
        return acc;
      },
      { none: 0, generate: 0, brandKit: 0, unknown: 0 }
    );

    return {
      images,
      videos,
      optimizations,
      succeeded,
      uniqueUsers,
      structuredImages: structuredImages.length,
      headlineOnPct: percentOn("headline"),
      bodyOnPct: percentOn("body"),
      ctaOnPct: percentOn("cta"),
      logoCounts,
    };
  }, [items]);

  const applyFilters = async (event) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setCursor(null);
    setNextCursor(null);
    setPageStack([]);

    // State updates are asynchronous, so build this request directly.
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        kind,
        status,
        days: String(days),
        limit: "48",
      });
      if (search.trim()) params.set("q", search.trim());
      const data = await authedFetch(`/admin/creative?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setNextCursor(data?.nextCursor || null);
    } catch (requestError) {
      setItems([]);
      setNextCursor(null);
      setError(requestError?.message || "Could not load creative records.");
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = async () => {
    setKind("all");
    setStatus("all");
    setDays(30);
    setSearch("");
    setAppliedSearch("");
    setCursor(null);
    setNextCursor(null);
    setPageStack([]);

    setLoading(true);
    setError("");
    try {
      const data = await authedFetch(
        "/admin/creative?kind=all&status=all&days=30&limit=48"
      );
      setItems(Array.isArray(data?.items) ? data.items : []);
      setNextCursor(data?.nextCursor || null);
    } catch (requestError) {
      setItems([]);
      setNextCursor(null);
      setError(requestError?.message || "Could not load creative records.");
    } finally {
      setLoading(false);
    }
  };

  const goNext = async () => {
    if (!nextCursor) return;
    setPageStack((stack) => [...stack, cursor]);
    setCursor(nextCursor);
    await load(nextCursor);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goPrevious = async () => {
    if (!pageStack.length) return;
    const previous = pageStack[pageStack.length - 1];
    setPageStack((stack) => stack.slice(0, -1));
    setCursor(previous);
    await load(previous);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="admin-creative-page">
      <div className="admin-creative-bg" aria-hidden="true" />

      <div className="admin-creative-shell">
        <header className="admin-creative-header">
          <div>
            <span>Content operations</span>
            <h1>Creative Manager</h1>
            <p>
              Review the images and videos generated across AdGen from one
              secure, administrator-only workspace.
            </p>
          </div>

          <button type="button" onClick={() => load(cursor)} disabled={loading}>
            <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <section className="admin-creative-stats">
          <article><ImageIcon size={19} /><span><small>Images shown</small><strong>{stats.images}</strong></span></article>
          <article><Video size={19} /><span><small>Videos shown</small><strong>{stats.videos}</strong></span></article>
          <article><Sparkles size={19} /><span><small>Optimizer shown</small><strong>{stats.optimizations}</strong></span></article>
          <article><SlidersHorizontal size={19} /><span><small>Succeeded</small><strong>{stats.succeeded}</strong></span></article>
          <article><UserRound size={19} /><span><small>Users shown</small><strong>{stats.uniqueUsers}</strong></span></article>
        </section>

        <section className="admin-creative-structure-summary">
          <div className="admin-creative-structure-summary-head">
            <div>
              <span>Creative structure</span>
              <strong>Current page usage</strong>
            </div>
            <small>
              {stats.structuredImages
                ? `${stats.structuredImages} image${stats.structuredImages === 1 ? "" : "s"} with structure metadata`
                : "No tracked structure metadata on this page"}
            </small>
          </div>

          <div className="admin-creative-structure-summary-grid">
            <article>
              <small>Headline On</small>
              <strong>
                {stats.headlineOnPct == null ? "—" : `${stats.headlineOnPct}%`}
              </strong>
            </article>
            <article>
              <small>Body On</small>
              <strong>{stats.bodyOnPct == null ? "—" : `${stats.bodyOnPct}%`}</strong>
            </article>
            <article>
              <small>CTA On</small>
              <strong>{stats.ctaOnPct == null ? "—" : `${stats.ctaOnPct}%`}</strong>
            </article>
            <article className="admin-creative-logo-summary">
              <small>Logo modes</small>
              <div>
                <span>No Logo <b>{stats.logoCounts.none}</b></span>
                <span>Generated <b>{stats.logoCounts.generate}</b></span>
                <span>Brand Kit <b>{stats.logoCounts.brandKit}</b></span>
              </div>
            </article>
          </div>

          <p>
            Older creatives without saved structure metadata are excluded from these percentages.
          </p>
        </section>

        <form className="admin-creative-toolbar" onSubmit={applyFilters}>
          <label className="admin-creative-search">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email, user, product, prompt, model, or job ID"
            />
          </label>

          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">All creative</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="optimizer">Optimizer</option>
          </select>

          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
          </select>

          <label className="admin-creative-date-select">
            <CalendarDays size={15} />
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={0}>All time</option>
            </select>
          </label>

          <button type="submit" disabled={loading}>Apply</button>
          <button type="button" className="is-secondary" onClick={resetFilters} disabled={loading}>Reset</button>
        </form>

        {error && (
          <div className="admin-creative-error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}><X size={15} /></button>
          </div>
        )}

        <div className="admin-creative-results-head">
          <div>
            <span>Generated assets</span>
            <strong>{loading ? "Loading creative…" : `${items.length} creative${items.length === 1 ? "" : "s"} on this page`}</strong>
          </div>
          <div>
            <button type="button" onClick={goPrevious} disabled={!pageStack.length || loading}>
              <ChevronLeft size={16} /> Previous
            </button>
            <span>Page {pageStack.length + 1}</span>
            <button type="button" onClick={goNext} disabled={!nextCursor || loading}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {loading && !items.length && (
          <div className="admin-creative-empty">Loading generated creative…</div>
        )}

        {!loading && !error && !items.length && (
          <div className="admin-creative-empty">
            <FileImage size={34} />
            <h2>No creative found</h2>
            <p>Try broadening the type, date, status, or search filters.</p>
          </div>
        )}

        <section className="admin-creative-grid">
          {items.map((item) => (
            <CreativeCard
              key={`${item.kind}-${item.id}`}
              item={item}
              onSelect={setSelected}
            />
          ))}
        </section>
      </div>

      <DetailsDrawer item={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
