import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import AssetFormView from "../components/campaigns/AssetFormView";
import CampaignFormView from "../components/campaigns/CampaignFormView";
import CampaignList from "../components/campaigns/CampaignList";
import CampaignWorkspace from "../components/campaigns/CampaignWorkspace";
import LineItemFormView from "../components/campaigns/LineItemFormView";
import LineItemWorkspace from "../components/campaigns/LineItemWorkspace";
import {
  calculateStatus,
  EMPTY_ASSET_FORM,
  EMPTY_CAMPAIGN_FORM,
  EMPTY_LINE_ITEM_FORM,
  frequencyKeyFromValues,
  frequencyValuesFromKey,
  normalizeItems,
  safeJson,
  toDateTimeLocal,
} from "../components/campaigns/campaignUtils";
import "./CampaignManager.css";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

function replaceItemById(items, updatedItem) {
  return items.map((item) => (item.id === updatedItem.id ? updatedItem : item));
}

export default function CampaignManager() {
  // Data
  const [campaigns, setCampaigns] = useState([]);
  const [brandKits, setBrandKits] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [inventory, setInventory] = useState([]);

  // Current workspace selection
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedLineItem, setSelectedLineItem] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Navigation
  const [view, setView] = useState("campaigns");
  const [activeTab, setActiveTab] = useState("overview");

  // Request state
  const [loading, setLoading] = useState(true);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI state
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Forms
  const [campaignForm, setCampaignForm] = useState({
    ...EMPTY_CAMPAIGN_FORM,
  });
  const [lineItemForm, setLineItemForm] = useState({
    ...EMPTY_LINE_ITEM_FORM,
  });
  const [assetForm, setAssetForm] = useState({
    ...EMPTY_ASSET_FORM,
  });

  const getToken = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error("You must be logged in.");
    }

    return auth.currentUser.getIdToken(true);
  }, []);

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const headers = {
        Authorization: `Bearer ${await getToken()}`,
        ...(options.headers || {}),
      };

      if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });

      const data = await safeJson(response);

      if (!response.ok) {
        const detail = Array.isArray(data?.detail)
          ? data.detail.map((value) => value.msg).join(" ")
          : data?.detail;

        throw new Error(detail || "Request failed.");
      }

      return data;
    },
    [getToken],
  );

  const updateUrl = useCallback(
    (nextView, campaign = null, lineItem = null, asset = null) => {
      const params = new URLSearchParams();

      if (campaign?.id) {
        params.set("campaign", campaign.id);
      }

      if (lineItem?.id) {
        params.set("lineItem", lineItem.id);
      }

      if (asset?.id) {
        params.set("asset", asset.id);
      }

      if (nextView !== "campaigns") {
        params.set("view", nextView);
      }

      const queryString = params.toString();
      const nextUrl = `${window.location.pathname}${
        queryString ? `?${queryString}` : ""
      }`;

      window.history.pushState({}, "", nextUrl);
    },
    [],
  );

  const navigate = useCallback(
    (
      nextView,
      campaign = selectedCampaign,
      lineItem = selectedLineItem,
      asset = null,
    ) => {
      setView(nextView);
      setSelectedCampaign(campaign);
      setSelectedLineItem(lineItem);
      setSelectedAsset(asset);
      updateUrl(nextView, campaign, lineItem, asset);
    },
    [selectedCampaign, selectedLineItem, updateUrl],
  );

  const loadCampaigns = useCallback(async () => {
    setLoading(true);

    try {
      const items = normalizeItems(
        await apiFetch("/campaigns?include_archived=true"),
      );

      setCampaigns(items);
      return items;
    } catch (requestError) {
      setError(requestError.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const loadBrandKits = useCallback(async () => {
    try {
      const items = normalizeItems(await apiFetch("/brand-kits"));
      setBrandKits(items);
    } catch {
      setBrandKits([]);
    }
  }, [apiFetch]);

  const loadLineItems = useCallback(
    async (campaign) => {
      if (!campaign) {
        return [];
      }

      setLineItemsLoading(true);

      try {
        const items = normalizeItems(
          await apiFetch(
            `/campaigns/${campaign.id}/line-items?include_archived=true`,
          ),
        );

        setLineItems(items);
        return items;
      } catch (requestError) {
        setError(requestError.message);
        return [];
      } finally {
        setLineItemsLoading(false);
      }
    },
    [apiFetch],
  );

  const loadAssets = useCallback(
    async (campaign, lineItem) => {
      if (!campaign || !lineItem) {
        return [];
      }

      setAssetsLoading(true);

      try {
        const items = normalizeItems(
          await apiFetch(
            `/campaigns/${campaign.id}/line-items/${lineItem.id}/assets?include_archived=true`,
          ),
        );

        setAssets(items);
        return items;
      } catch (requestError) {
        setError(requestError.message);
        return [];
      } finally {
        setAssetsLoading(false);
      }
    },
    [apiFetch],
  );

  const loadInventory = useCallback(
    async (campaign, lineItem) => {
      if (!campaign || !lineItem) {
        return [];
      }

      setInventoryLoading(true);

      try {
        const data = await apiFetch(
          `/campaigns/${campaign.id}/line-items/${lineItem.id}/inventory`,
        );
        const items = normalizeItems(data);
        setInventory(items);
        return items;
      } catch (requestError) {
        setError(requestError.message);
        return [];
      } finally {
        setInventoryLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const loadedCampaigns = await loadCampaigns();
      void loadBrandKits();

      if (!isMounted) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const campaignId = params.get("campaign");
      const lineItemId = params.get("lineItem");
      const assetId = params.get("asset");
      const requestedView = params.get("view");

      if (!campaignId) {
        return;
      }

      const campaign = loadedCampaigns.find((entry) => entry.id === campaignId);

      if (!campaign) {
        return;
      }

      setSelectedCampaign(campaign);

      const loadedLineItems = normalizeItems(
        await apiFetch(
          `/campaigns/${campaign.id}/line-items?include_archived=true`,
        ),
      );

      if (!isMounted) {
        return;
      }

      setLineItems(loadedLineItems);

      if (!lineItemId) {
        setView(requestedView || "campaign");
        return;
      }

      const lineItem = loadedLineItems.find((entry) => entry.id === lineItemId);

      if (!lineItem) {
        setView("campaign");
        return;
      }

      setSelectedLineItem(lineItem);

      const loadedAssets = normalizeItems(
        await apiFetch(
          `/campaigns/${campaign.id}/line-items/${lineItem.id}/assets?include_archived=true`,
        ),
      );

      if (!isMounted) {
        return;
      }

      setAssets(loadedAssets);

      const loadedInventory = normalizeItems(
        await apiFetch(
          `/campaigns/${campaign.id}/line-items/${lineItem.id}/inventory`,
        ),
      );

      if (!isMounted) {
        return;
      }

      setInventory(loadedInventory);

      if (assetId) {
        const asset = loadedAssets.find((entry) => entry.id === assetId);

        if (asset) {
          setSelectedAsset(asset);
        }
      }

      setView(requestedView || "line-item");
      setActiveTab(requestedView?.startsWith("asset") ? "assets" : "overview");
    }

    bootstrap().catch((bootstrapError) => {
      if (isMounted) {
        setError(
          bootstrapError.message || "Failed to restore Campaign Manager.",
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [apiFetch, loadBrandKits, loadCampaigns]);

  useEffect(() => {
    const handlePopState = () => {
      window.location.reload();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const visibleCampaigns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return campaigns
      .filter(
        (campaign) =>
          statusFilter === "all" || campaign.status === statusFilter,
      )
      .filter((campaign) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchableText = [
          campaign.name,
          campaign.description,
          campaign.objective,
          campaign.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort(
        (firstCampaign, secondCampaign) =>
          new Date(secondCampaign.updated_at || 0) -
          new Date(firstCampaign.updated_at || 0),
      );
  }, [campaigns, search, statusFilter]);

  const stats = useMemo(() => {
    return campaigns.reduce(
      (summary, campaign) => {
        if (campaign.status === "active") {
          summary.active += 1;
        }

        if (campaign.status === "scheduled") {
          summary.scheduled += 1;
        }

        if (campaign.status === "draft") {
          summary.drafts += 1;
        }

        if (campaign.status !== "archived") {
          summary.budget += Number(campaign.budget) || 0;
        }

        return summary;
      },
      {
        active: 0,
        scheduled: 0,
        drafts: 0,
        budget: 0,
      },
    );
  }, [campaigns]);

  const openCampaign = useCallback(
    (campaign) => {
      setActiveTab("overview");
      setLineItems([]);
      navigate("campaign", campaign, null);
      void loadLineItems(campaign);
    },
    [loadLineItems, navigate],
  );

  const openLineItem = useCallback(
    (lineItem) => {
      setActiveTab("overview");
      setAssets([]);
      setInventory([]);
      navigate("line-item", selectedCampaign, lineItem);
      void Promise.all([
        loadAssets(selectedCampaign, lineItem),
        loadInventory(selectedCampaign, lineItem),
      ]);
    },
    [loadAssets, loadInventory, navigate, selectedCampaign],
  );

  const newCampaign = useCallback(() => {
    setCampaignForm({ ...EMPTY_CAMPAIGN_FORM });
    navigate("campaign-create", null, null);
  }, [navigate]);

  const editCampaign = useCallback(() => {
    if (!selectedCampaign) {
      return;
    }

    setCampaignForm({
      name: selectedCampaign.name || "",
      brand_id: selectedCampaign.brand_id || "",
      objective: selectedCampaign.objective || "sales",
      budget_type: selectedCampaign.budget_type || "daily",
      budget: selectedCampaign.budget ?? "",
      start_at: toDateTimeLocal(selectedCampaign.start_at),
      end_at: toDateTimeLocal(selectedCampaign.end_at),
      description: selectedCampaign.description || "",
    });

    navigate("campaign-edit", selectedCampaign, null);
  }, [navigate, selectedCampaign]);

  const newLineItem = useCallback(() => {
    if (!selectedCampaign) {
      return;
    }

    setLineItemForm({
      ...EMPTY_LINE_ITEM_FORM,
      channels: [...(EMPTY_LINE_ITEM_FORM.channels || [])],
      start_at: toDateTimeLocal(selectedCampaign.start_at),
      end_at: toDateTimeLocal(selectedCampaign.end_at),
    });

    navigate("line-item-create", selectedCampaign, null);
  }, [navigate, selectedCampaign]);

  const editLineItem = useCallback(() => {
    if (!selectedLineItem) {
      return;
    }

    setLineItemForm({
      name: selectedLineItem.name || "",
      billing_model: selectedLineItem.billing_model || "cpm",
      budget_type: selectedLineItem.budget_type || "lifetime",
      budget_amount: selectedLineItem.budget_amount ?? "",
      bid_amount: selectedLineItem.bid_amount ?? "",
      start_at: toDateTimeLocal(selectedLineItem.start_at),
      end_at: toDateTimeLocal(selectedLineItem.end_at),
      channels: [...(selectedLineItem.channels || [])],
      frequency_cap_key: frequencyKeyFromValues(
        selectedLineItem.frequency_cap_count || selectedLineItem.frequency_cap,
        selectedLineItem.frequency_cap_window ||
          (selectedLineItem.frequency_cap ? "day" : null),
      ),
    });

    navigate("line-item-edit", selectedCampaign, selectedLineItem);
  }, [navigate, selectedCampaign, selectedLineItem]);

  const newAsset = useCallback(() => {
    setAssetForm({ ...EMPTY_ASSET_FORM });
    navigate("asset-create", selectedCampaign, selectedLineItem, null);
  }, [navigate, selectedCampaign, selectedLineItem]);

  const editAsset = useCallback(
    (asset) => {
      setAssetForm({
        name: asset.name || "",
        file: null,
        alt_text: asset.alt_text || "",
        click_through_url: asset.click_through_url || "",
        tracking_pixel_1: asset.tracking_pixels?.[0] || "",
        tracking_pixel_2: asset.tracking_pixels?.[1] || "",
        status: asset.status || "active",
      });

      navigate("asset-edit", selectedCampaign, selectedLineItem, asset);
    },
    [navigate, selectedCampaign, selectedLineItem],
  );

  const saveCampaign = useCallback(
    async (event) => {
      event.preventDefault();

      if (new Date(campaignForm.end_at) <= new Date(campaignForm.start_at)) {
        setError("End date must be after the start date.");
        return;
      }

      setSaving(true);
      setError("");

      try {
        const editing = view === "campaign-edit";
        const payload = {
          name: campaignForm.name.trim(),
          brand_id: campaignForm.brand_id || null,
          objective: campaignForm.objective,
          status: calculateStatus(
            campaignForm.start_at,
            campaignForm.end_at,
            selectedCampaign?.status,
          ),
          budget_type: campaignForm.budget_type,
          budget:
            campaignForm.budget === "" ? null : Number(campaignForm.budget),
          currency: "USD",
          start_at: new Date(campaignForm.start_at).toISOString(),
          end_at: new Date(campaignForm.end_at).toISOString(),
          description: campaignForm.description.trim() || null,
        };

        const data = await apiFetch(
          editing ? `/campaigns/${selectedCampaign.id}` : "/campaigns",
          {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        setCampaigns((currentCampaigns) =>
          editing
            ? replaceItemById(currentCampaigns, data)
            : [data, ...currentCampaigns],
        );
        setNotice(editing ? "Campaign updated." : "Campaign created.");
        setActiveTab("overview");
        navigate("campaign", data, null);
        void loadLineItems(data);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSaving(false);
      }
    },
    [apiFetch, campaignForm, loadLineItems, navigate, selectedCampaign, view],
  );

  const saveLineItem = useCallback(
    async (event) => {
      event.preventDefault();

      if (!lineItemForm.channels.length) {
        setError("Select at least one delivery channel.");
        return;
      }

      if (new Date(lineItemForm.end_at) <= new Date(lineItemForm.start_at)) {
        setError("End date must be after the start date.");
        return;
      }

      const frequency = frequencyValuesFromKey(lineItemForm.frequency_cap_key);

      setSaving(true);
      setError("");

      try {
        const editing = view === "line-item-edit";
        const payload = {
          name: lineItemForm.name.trim(),
          billing_model: lineItemForm.billing_model,
          budget_type: lineItemForm.budget_type,
          budget_amount: Number(lineItemForm.budget_amount),
          bid_amount: Number(lineItemForm.bid_amount),
          currency: "USD",
          start_at: new Date(lineItemForm.start_at).toISOString(),
          end_at: new Date(lineItemForm.end_at).toISOString(),
          channels: lineItemForm.channels,
          frequency_cap_count: frequency.count,
          frequency_cap_window: frequency.window,
        };

        const data = await apiFetch(
          editing
            ? `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}`
            : `/campaigns/${selectedCampaign.id}/line-items`,
          {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        setLineItems((currentLineItems) =>
          editing
            ? replaceItemById(currentLineItems, data)
            : [data, ...currentLineItems],
        );
        setNotice(
          editing
            ? "Line item updated."
            : "Line item created. Upload its campaign assets next.",
        );
        setActiveTab("assets");
        navigate("line-item", selectedCampaign, data);
        void Promise.all([
          loadAssets(selectedCampaign, data),
          loadInventory(selectedCampaign, data),
        ]);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSaving(false);
      }
    },
    [
      apiFetch,
      lineItemForm,
      loadAssets,
      loadInventory,
      navigate,
      selectedCampaign,
      selectedLineItem,
      view,
    ],
  );

  const saveAsset = useCallback(
    async (event) => {
      event.preventDefault();
      setSaving(true);
      setError("");

      try {
        const editing = view === "asset-edit";
        let data;

        if (editing) {
          data = await apiFetch(
            `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}/assets/${selectedAsset.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                name: assetForm.name.trim(),
                alt_text: assetForm.alt_text.trim() || null,
                click_through_url: assetForm.click_through_url,
                tracking_pixels: [
                  assetForm.tracking_pixel_1,
                  assetForm.tracking_pixel_2,
                ].filter(Boolean),
                status: assetForm.status,
              }),
            },
          );
        } else {
          const formData = new FormData();

          formData.append("name", assetForm.name.trim());
          formData.append("click_through_url", assetForm.click_through_url);
          formData.append("alt_text", assetForm.alt_text.trim());
          formData.append(
            "tracking_pixel_1",
            assetForm.tracking_pixel_1.trim(),
          );
          formData.append(
            "tracking_pixel_2",
            assetForm.tracking_pixel_2.trim(),
          );
          formData.append("file", assetForm.file);

          data = await apiFetch(
            `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}/assets`,
            {
              method: "POST",
              body: formData,
            },
          );
        }

        setAssets((currentAssets) =>
          editing
            ? replaceItemById(currentAssets, data)
            : [data, ...currentAssets],
        );
        setNotice(
          editing
            ? "Asset updated. Inventory compatibility has been recalculated."
            : "Asset uploaded. Review the compatible inventory now available.",
        );
        setActiveTab("inventory");
        navigate("line-item", selectedCampaign, selectedLineItem);
        void Promise.all([
          loadAssets(selectedCampaign, selectedLineItem),
          loadInventory(selectedCampaign, selectedLineItem),
        ]);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSaving(false);
      }
    },
    [
      apiFetch,
      assetForm,
      loadAssets,
      loadInventory,
      navigate,
      selectedAsset,
      selectedCampaign,
      selectedLineItem,
      view,
    ],
  );

  const archiveCampaign = useCallback(async () => {
    if (!selectedCampaign) {
      return;
    }

    const confirmed = window.confirm(`Archive “${selectedCampaign.name}”?`);

    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/campaigns/${selectedCampaign.id}`, {
        method: "DELETE",
      });

      const archivedCampaign = {
        ...selectedCampaign,
        status: "archived",
      };

      setCampaigns((currentCampaigns) =>
        replaceItemById(currentCampaigns, archivedCampaign),
      );
      setSelectedCampaign(archivedCampaign);
      setNotice("Campaign archived.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [apiFetch, selectedCampaign]);

  const changeLineItemStatus = useCallback(
    async (status) => {
      if (!selectedCampaign || !selectedLineItem) {
        return;
      }

      try {
        const data = await apiFetch(
          `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );

        setSelectedLineItem(data);
        setLineItems((currentLineItems) =>
          replaceItemById(currentLineItems, data),
        );
        setNotice(`Line item ${status}.`);
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    [apiFetch, selectedCampaign, selectedLineItem],
  );

  const archiveLineItem = useCallback(async () => {
    if (!selectedCampaign || !selectedLineItem) {
      return;
    }

    const confirmed = window.confirm(`Archive “${selectedLineItem.name}”?`);

    if (!confirmed) {
      return;
    }

    try {
      const data = await apiFetch(
        `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}`,
        {
          method: "DELETE",
        },
      );

      setSelectedLineItem(data);
      setLineItems((currentLineItems) =>
        replaceItemById(currentLineItems, data),
      );
      setNotice("Line item archived.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [apiFetch, selectedCampaign, selectedLineItem]);

  const updateCampaignForm = useCallback((field, value) => {
    setCampaignForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }, []);

  const updateLineItemForm = useCallback((field, value) => {
    setLineItemForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }, []);

  const updateAssetForm = useCallback((field, value) => {
    setAssetForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }, []);

  const toggleLineItemChannel = useCallback((channel) => {
    setLineItemForm((currentForm) => ({
      ...currentForm,
      channels: currentForm.channels.includes(channel)
        ? currentForm.channels.filter((value) => value !== channel)
        : [...currentForm.channels, channel],
    }));
  }, []);

  const saveInventoryAssignments = useCallback(
    async (assignments) => {
      if (!selectedCampaign || !selectedLineItem) {
        return;
      }

      setInventorySaving(true);
      setError("");

      try {
        const data = await apiFetch(
          `/campaigns/${selectedCampaign.id}/line-items/${selectedLineItem.id}/inventory`,
          {
            method: "PUT",
            body: JSON.stringify({ assignments }),
          },
        );
        setInventory(normalizeItems(data));
        setNotice("Inventory assignments saved.");
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setInventorySaving(false);
      }
    },
    [apiFetch, selectedCampaign, selectedLineItem],
  );

  const backToCampaigns = useCallback(() => {
    navigate("campaigns", null, null);
  }, [navigate]);

  const backToCampaign = useCallback(() => {
    setActiveTab("line-items");
    navigate("campaign", selectedCampaign, null);
  }, [navigate, selectedCampaign]);

  const backToLineItem = useCallback(() => {
    setActiveTab("assets");
    navigate("line-item", selectedCampaign, selectedLineItem);
  }, [navigate, selectedCampaign, selectedLineItem]);

  const backFromCampaignForm = useCallback(() => {
    if (view === "campaign-edit") {
      navigate("campaign", selectedCampaign, null);
      return;
    }

    backToCampaigns();
  }, [backToCampaigns, navigate, selectedCampaign, view]);

  if (view === "campaign-create" || view === "campaign-edit") {
    return (
      <CampaignFormView
        editing={view === "campaign-edit"}
        form={campaignForm}
        brandKits={brandKits}
        saving={saving}
        error={error}
        onChange={updateCampaignForm}
        onBack={backFromCampaignForm}
        onSubmit={saveCampaign}
      />
    );
  }

  if (view === "line-item-create" || view === "line-item-edit") {
    return (
      <LineItemFormView
        campaign={selectedCampaign}
        editing={view === "line-item-edit"}
        form={lineItemForm}
        saving={saving}
        error={error}
        onChange={updateLineItemForm}
        onToggleChannel={toggleLineItemChannel}
        onBack={view === "line-item-edit" ? backToLineItem : backToCampaign}
        onCampaign={backToCampaigns}
        onSubmit={saveLineItem}
      />
    );
  }

  if (view === "asset-create" || view === "asset-edit") {
    return (
      <AssetFormView
        campaign={selectedCampaign}
        lineItem={selectedLineItem}
        editing={view === "asset-edit" ? selectedAsset : null}
        form={assetForm}
        saving={saving}
        error={error}
        onChange={updateAssetForm}
        onBack={backToLineItem}
        onCampaigns={backToCampaigns}
        onCampaign={backToCampaign}
        onSubmit={saveAsset}
      />
    );
  }

  if (view === "line-item" && selectedCampaign && selectedLineItem) {
    return (
      <LineItemWorkspace
        campaign={selectedCampaign}
        item={selectedLineItem}
        activeTab={activeTab}
        assets={assets}
        assetsLoading={assetsLoading}
        inventory={inventory}
        inventoryLoading={inventoryLoading}
        inventorySaving={inventorySaving}
        notice={notice}
        error={error}
        onCampaigns={backToCampaigns}
        onCampaign={backToCampaign}
        onTabChange={setActiveTab}
        onEdit={editLineItem}
        onStatusChange={changeLineItemStatus}
        onArchive={archiveLineItem}
        onCreateAsset={newAsset}
        onOpenAsset={editAsset}
        onSaveInventory={saveInventoryAssignments}
      />
    );
  }

  if (view === "campaign" && selectedCampaign) {
    return (
      <CampaignWorkspace
        campaign={selectedCampaign}
        activeTab={activeTab}
        lineItems={lineItems}
        lineItemsLoading={lineItemsLoading}
        notice={notice}
        error={error}
        onBack={backToCampaigns}
        onTabChange={setActiveTab}
        onEdit={editCampaign}
        onArchive={archiveCampaign}
        onCreateLineItem={newLineItem}
        onOpenLineItem={openLineItem}
      />
    );
  }

  return (
    <CampaignList
      campaigns={visibleCampaigns}
      stats={stats}
      loading={loading}
      search={search}
      statusFilter={statusFilter}
      notice={notice}
      error={error}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      onRefresh={loadCampaigns}
      onCreate={newCampaign}
      onOpen={openCampaign}
    />
  );
}