import React, { useEffect, useMemo, useState } from "react";

export default function LibraryImageModal({
  open,
  mode,
  items,
  loading,
  error,
  selectingId,
  onClose,
  onRefresh,
  onSelect,
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.title, item.prompt, item.filename]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [items, query]);

  if (!open) return null;

  const heading = mode === "replace" ? "Replace from Library" : "Import from Library";
  const description =
    mode === "replace"
      ? "Choose an existing Library image to replace the selected image layer. Its frame and edits will remain in place."
      : "Choose an existing generated or uploaded image and add it as a new editable layer.";

  return (
    <div className="csv4-library-modal" role="dialog" aria-modal="true" aria-labelledby="csv4-library-modal-title">
      <button type="button" className="csv4-library-modal__backdrop" onClick={onClose} aria-label="Close Library picker" />
      <section className="csv4-library-modal__card">
        <header className="csv4-library-modal__header">
          <div>
            <span className="csv4__eyebrow">AdGen Library</span>
            <h2 id="csv4-library-modal-title">{heading}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="csv4-library-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="csv4-library-modal__controls">
          <label>
            <span className="csv4-visually-hidden">Search Library images</span>
            <input
              type="search"
              placeholder="Search Library images"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </label>
          <button type="button" className="csv4-properties-button csv4-properties-button--secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="csv4-library-modal__body">
          {loading && !items.length && (
            <div className="csv4-library-modal__state"><span className="csv4-spinner" /><strong>Loading your Library...</strong></div>
          )}

          {!loading && error && (
            <div className="csv4-library-modal__state csv4-library-modal__state--error">
              <strong>Library images could not be loaded.</strong>
              <span>{error}</span>
              <button type="button" className="csv4-properties-button" onClick={onRefresh}>Try again</button>
            </div>
          )}

          {!loading && !error && !filteredItems.length && (
            <div className="csv4-library-modal__state">
              <strong>{query ? "No images match your search." : "No image creatives are in your Library yet."}</strong>
              <span>Generated images and Creative Studio uploads will appear here.</span>
            </div>
          )}

          {filteredItems.length > 0 && (
            <div className="csv4-library-grid">
              {filteredItems.map((item) => {
                const selecting = selectingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="csv4-library-card"
                    onClick={() => onSelect(item)}
                    disabled={Boolean(selectingId)}
                    title={item.title}
                  >
                    <span className="csv4-library-card__preview">
                      <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" />
                      {selecting && <span className="csv4-library-card__loading"><span className="csv4-spinner" />Loading</span>}
                    </span>
                    <span className="csv4-library-card__content">
                      <strong>{item.title || "Library image"}</strong>
                      <small>{formatDate(item.createdAt)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Saved in Library";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved in Library";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
