import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Save } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { CHANNEL_LABELS } from "./campaignUtils";

export default function InventorySelection({
  inventory,
  assets,
  loading,
  saving,
  onSave,
}) {
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [assignments, setAssignments] = useState({});

  useEffect(() => {
    const next = {};
    inventory.forEach((item) => {
      if (item.selected) {
        next[item.id] = [...(item.selected_asset_ids || [])];
      }
    });
    setAssignments(next);
  }, [inventory]);

  const assetById = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const visibleInventory = useMemo(
    () =>
      inventory.filter(
        (item) =>
          showIncompatible ||
          item.compatible_asset_ids?.length > 0 ||
          item.selected,
      ),
    [inventory, showIncompatible],
  );

  function toggleInventory(item) {
    setAssignments((current) => {
      if (current[item.id]) {
        const next = { ...current };
        delete next[item.id];
        return next;
      }

      return {
        ...current,
        [item.id]: [...(item.compatible_asset_ids || [])],
      };
    });
  }

  function toggleAsset(inventoryId, assetId) {
    setAssignments((current) => {
      const selected = current[inventoryId] || [];
      return {
        ...current,
        [inventoryId]: selected.includes(assetId)
          ? selected.filter((value) => value !== assetId)
          : [...selected, assetId],
      };
    });
  }

  function handleSave() {
    const payload = Object.entries(assignments).map(
      ([inventoryId, assetIds]) => ({
        inventory_id: inventoryId,
        asset_ids: assetIds,
      }),
    );
    onSave(payload);
  }

  if (loading) {
    return (
      <Card className="campaign-table-state">
        Loading compatible inventory…
      </Card>
    );
  }

  if (!assets.length) {
    return (
      <Card className="campaign-empty campaign-inventory-empty">
        <h2>Upload assets before selecting inventory</h2>
        <p>
          Inventory is derived from the real dimensions and file properties of
          the assets attached to this line item.
        </p>
      </Card>
    );
  }

  return (
    <div className="campaign-inventory-workspace">
      <div className="campaign-section-head campaign-inventory-head">
        <div>
          <h2>Compatible inventory</h2>
          <p>
            Only inventory supported by at least one uploaded asset is shown by
            default. Assign one or more compatible assets to every selected
            slot.
          </p>
        </div>

        <button
          type="button"
          className="campaign-inventory-toggle"
          onClick={() => setShowIncompatible((value) => !value)}
        >
          {showIncompatible ? <EyeOff size={16} /> : <Eye size={16} />}
          {showIncompatible ? "Hide incompatible" : "Show incompatible"}
        </button>
      </div>

      <div className="campaign-inventory-grid">
        {visibleInventory.map((item) => {
          const selectedAssetIds = assignments[item.id];
          const selected = Boolean(selectedAssetIds);
          const compatibleAssets = (item.compatible_asset_ids || [])
            .map((assetId) => assetById[assetId])
            .filter(Boolean);
          const compatible = compatibleAssets.length > 0;

          return (
            <Card
              key={item.id}
              className={`campaign-inventory-card${
                selected ? " selected" : ""
              }${!compatible ? " incompatible" : ""}`}
            >
              <div className="campaign-inventory-card-top">
                <div>
                  <span>{CHANNEL_LABELS[item.channel] || item.channel}</span>
                  <h3>{item.name}</h3>
                  <p>
                    {item.width} × {item.height} · {item.format}
                  </p>
                </div>
                {item.needs_attention ? (
                  <AlertTriangle className="campaign-inventory-warning-icon" />
                ) : compatible ? (
                  <CheckCircle2 className="campaign-inventory-ok-icon" />
                ) : null}
              </div>

              <p className="campaign-inventory-description">
                {item.description}
              </p>

              {!compatible ? (
                <div className="campaign-inventory-unavailable">
                  No uploaded asset matches this template.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={`campaign-inventory-select${
                      selected ? " selected" : ""
                    }`}
                    onClick={() => toggleInventory(item)}
                  >
                    {selected ? "Selected" : "Select inventory"}
                  </button>

                  {selected && (
                    <div className="campaign-inventory-assets">
                      <strong>Assigned assets</strong>
                      {compatibleAssets.map((asset) => (
                        <label key={asset.id}>
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.includes(asset.id)}
                            onChange={() => toggleAsset(item.id, asset.id)}
                          />
                          {asset.file_url ? (
                            <img src={asset.file_url} alt="" />
                          ) : null}
                          <span>
                            <strong>{asset.name}</strong>
                            <small>
                              {asset.width} × {asset.height}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <div className="campaign-inventory-savebar">
        <div>
          <strong>
            {Object.keys(assignments).length} inventory selections
          </strong>
          <span>Assignments are saved at the line-item level.</span>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? "Saving…" : "Save Inventory"}
        </Button>
      </div>
    </div>
  );
}
