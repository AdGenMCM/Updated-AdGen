import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../AuthProvider";
import { useWorkspace } from "../../context/WorkspaceContext";
import Editor from "./components/Editor";
import {
  loadLibraryImageAsset,
  saveCreativeStudioProject,
  uploadCreativeStudioImage,
} from "./services/imageAssetService";
import "./styles/editor.css";

export default function CreativeStudio() {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { storageUsage, refreshWorkspace } = useWorkspace();
  const [initialAsset, setInitialAsset] = useState(null);
  const [initialProject, setInitialProject] = useState(null);
  const [loadError, setLoadError] = useState("");

  const studioState = location.state?.creativeStudio || null;

  const getToken = useCallback(async () => {
    if (!currentUser) throw new Error("You must be signed in.");
    return currentUser.getIdToken();
  }, [currentUser]);

  const uploadImageAsset = useCallback(
    async (file) => {
      const token = await getToken();
      const asset = await uploadCreativeStudioImage(file, token);
      await refreshWorkspace?.();
      return asset;
    },
    [getToken, refreshWorkspace],
  );

  const saveProject = useCallback(
    async (payload) => {
      const token = await getToken();
      const result = await saveCreativeStudioProject(payload, token);
      await refreshWorkspace?.();
      return result;
    },
    [getToken, refreshWorkspace],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSource() {
      if (!studioState || !currentUser) return;

      setLoadError("");
      if (studioState.creativeProject) {
        try {
          const token = await getToken();
          const project = studioState.creativeProject;
          const hydratedLayers = await Promise.all(
            (project.layers || []).map(async (layer) => {
              if (layer.type !== "image") return layer;

              const asset = await loadLibraryImageAsset(
                {
                  jobId: layer.imageJobId || studioState.sourceImageJobId,
                  imageUrl: layer.remoteUrl || layer.src,
                  title: layer.filename || layer.name,
                },
                token,
              );

              return {
                ...layer,
                src: asset.url,
                remoteUrl: asset.remoteUrl || layer.remoteUrl || layer.src,
                imageJobId: asset.imageJobId || layer.imageJobId || null,
                naturalWidth: asset.width,
                naturalHeight: asset.height,
              };
            }),
          );

          if (!cancelled) {
            setInitialProject({ ...project, layers: hydratedLayers });
          }
        } catch (error) {
          if (!cancelled) {
            setLoadError(
              error?.message || "The editable Creative Studio project could not be loaded.",
            );
          }
        }
        return;
      }

      if (!studioState.imageUrl && !studioState.sourceImageJobId) return;

      try {
        const token = await getToken();
        const asset = await loadLibraryImageAsset(
          {
            jobId: studioState.sourceImageJobId,
            imageUrl: studioState.imageUrl,
            title: studioState.title,
          },
          token,
        );
        if (!cancelled) setInitialAsset(asset);
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "The Library image could not be loaded.");
      }
    }

    loadSource();
    return () => {
      cancelled = true;
    };
  }, [currentUser, getToken, studioState]);

  const storage = useMemo(
    () => ({
      usedBytes: Number(storageUsage?.usedBytes || 0),
      limitBytes: Number(storageUsage?.limitBytes || 0),
    }),
    [storageUsage],
  );

  return (
    <>
      {loadError && <div className="csv4-upload-error">{loadError}</div>}
      <Editor
        uploadImageAsset={uploadImageAsset}
        saveProject={saveProject}
        initialAsset={initialAsset}
        initialProject={initialProject}
        sourceImageJobId={studioState?.sourceImageJobId || ""}
        initialTitle={studioState?.title || "Creative Studio design"}
        storageUsedBytes={storage.usedBytes}
        storageLimitBytes={storage.limitBytes}
      />
    </>
  );
}
