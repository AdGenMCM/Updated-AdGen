import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Palette } from "lucide-react";
import { auth } from "../firebaseConfig";
import "./BrandKitSelector.css";

export default function BrandKitSelector({
  value,
  onChange,
  onKitChange,
  disabled = false,
  className = "",
}) {
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = auth.currentUser;

      if (!user || !apiBase) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const token = await user.getIdToken();
        const res = await fetch(`${apiBase}/brand-kits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || cancelled) return;

        const items = Array.isArray(data?.items) ? data.items : [];
        setKits(items);

        if (items.length) {
          const requestedId = value || data?.defaultBrandKitId || items[0].id;
          const selected = items.find((kit) => kit.id === requestedId) || items[0];

          if (!value || value !== selected.id) {
            onChange?.(selected.id);
          }

          onKitChange?.(selected);
        } else {
          onKitChange?.(null);
        }
      } catch (error) {
        console.error("Failed to load Brand Kits:", error);
        onKitChange?.(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // Intentionally load once per API base. Selection changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const selectedKit = useMemo(
    () => kits.find((kit) => kit.id === value) || kits[0] || null,
    [kits, value]
  );

  const handleSelectionChange = (event) => {
    const nextId = event.target.value;
    const nextKit = kits.find((kit) => kit.id === nextId) || null;

    onChange?.(nextId);
    onKitChange?.(nextKit);
  };

  if (!loading && !kits.length) return null;

  return (
    <section
      className={`brand-selector ${disabled ? "is-disabled" : ""} ${className}`.trim()}
    >
      <div className="brand-selector__copy">
        <div className="brand-selector__icon" aria-hidden="true">
          <Palette size={19} />
        </div>

        <div>
          <div className="brand-selector__labelRow">
            <span className="brand-selector__label">Active Brand</span>
            {selectedKit?.isDefault && (
              <span className="brand-selector__defaultBadge">Default</span>
            )}
          </div>

          <p className="brand-selector__helper">
            Everything you generate will use this brand&apos;s logo, colors, fonts,
            voice, and creative guidelines when Brand Kit is enabled.
          </p>
        </div>
      </div>

      <div className="brand-selector__controls">
        <div className="brand-selector__selectWrap">
          <select
            aria-label="Active Brand"
            value={value || selectedKit?.id || ""}
            onChange={handleSelectionChange}
            disabled={disabled || loading}
          >
            {loading && <option value="">Loading brands...</option>}
            {!loading &&
              kits.map((kit) => (
                <option key={kit.id} value={kit.id}>
                  {kit.name || kit.brandName || "Untitled Brand"}
                  {kit.isDefault ? " — Default" : ""}
                </option>
              ))}
          </select>
          <ChevronDown
            className="brand-selector__chevron"
            size={18}
            aria-hidden="true"
          />
        </div>

        <Link className="brand-selector__manage" to="/brand-kit">
          Manage Brands
        </Link>
      </div>
    </section>
  );
}