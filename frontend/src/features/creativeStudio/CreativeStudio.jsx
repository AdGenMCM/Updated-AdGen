import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../AuthProvider";
import { useWorkspace } from "../../context/WorkspaceContext";
import Editor from "./components/Editor";
import ProjectsHome from "./components/ProjectsHome";
import TemplateGallery from "./components/TemplateGallery";
import { createProjectFromTemplate } from "./data/projectTemplates";
import {
  deleteCreativeStudioProject,
  listCreativeStudioProjects,
  listLibraryImageAssets,
  loadLibraryImageAsset,
  saveCreativeStudioProject,
  uploadCreativeStudioImage,
} from "./services/imageAssetService";
import {
  listCreativeStudioBrandKits,
  normalizeBrandKits,
} from "./services/brandKitService";
import "./styles/editor.css";

export default function CreativeStudio() {
  const location = useLocation();
  const { currentUser } = useAuth();
  const workspace = useWorkspace();
  const { storageUsage, refreshWorkspace } = workspace;
  const studioState = location.state?.creativeStudio || null;

  const [screen, setScreen] = useState(studioState ? "loading" : "projects");
  const [initialAsset, setInitialAsset] = useState(null);
  const [initialProject, setInitialProject] = useState(null);
  const [initialTitle, setInitialTitle] = useState("Creative Studio design");
  const [sourceImageJobId, setSourceImageJobId] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  const getToken = useCallback(async () => {
    if (!currentUser) {
      throw new Error("You must be signed in.");
    }

    return currentUser.getIdToken();
  }, [currentUser]);

  const fetchLibraryImages = useCallback(
    async () => listLibraryImageAssets(await getToken()),
    [getToken]
  );

  const hydrateLibraryAsset = useCallback(
    async (item) =>
      loadLibraryImageAsset(
        {
          jobId: item.id,
          imageUrl: item.imageUrl,
          title: item.title || item.filename,
        },
        await getToken()
      ),
    [getToken]
  );

  const workspaceBrandKits = useMemo(
    () =>
      normalizeBrandKits(
        []
          .concat(
            workspace?.brandKits ||
              workspace?.brand_kits ||
              workspace?.kits ||
              workspace?.brandKit?.kits ||
              workspace?.brandKit ||
              []
          )
          .filter(Boolean)
      ),
    [workspace]
  );

  const fetchBrandKits = useCallback(
    async () =>
      workspaceBrandKits.length
        ? workspaceBrandKits
        : listCreativeStudioBrandKits(await getToken()),
    [getToken, workspaceBrandKits]
  );

  const hydrateBrandLogo = useCallback(
    async (logo) =>
      loadLibraryImageAsset(
        {
          imageUrl: logo.url,
          title: logo.name || "Brand logo",
        },
        await getToken()
      ),
    [getToken]
  );

  const uploadImageAsset = useCallback(
    async (file) => {
      const asset = await uploadCreativeStudioImage(file, await getToken());
      await refreshWorkspace?.();
      return asset;
    },
    [getToken, refreshWorkspace]
  );

  const saveProject = useCallback(
    async (payload) => {
      const result = await saveCreativeStudioProject(
        payload,
        await getToken()
      );

      await refreshWorkspace?.();
      return result;
    },
    [getToken, refreshWorkspace]
  );

  const refreshProjects = useCallback(async () => {
    if (!currentUser) return;

    try {
      setProjectsLoading(true);
      setProjectsError("");

      setProjects(
        await listCreativeStudioProjects(await getToken())
      );
    } catch (error) {
      setProjectsError(
        error?.message || "Your projects could not be loaded."
      );
    } finally {
      setProjectsLoading(false);
    }
  }, [currentUser, getToken]);

  const deleteProject = useCallback(
    async (project) => {
      if (!project?.id) return;

      try {
        setProjectsError("");

        await deleteCreativeStudioProject(
          project.id,
          await getToken()
        );

        setProjects((current) =>
          current.filter((item) => item.id !== project.id)
        );

        if (currentProjectId === project.id) {
          setCurrentProjectId("");
        }

        await refreshWorkspace?.();
      } catch (error) {
        const message =
          error?.message || "The project could not be deleted.";

        setProjectsError(message);
        throw error;
      }
    },
    [currentProjectId, getToken, refreshWorkspace]
  );

  const hydrateProject = useCallback(
    async (project) => {
      const token = await getToken();

      const hydratedLayers = await Promise.all(
        (project.layers || []).map(async (layer) => {
          if (layer.type !== "image") return layer;

          const asset = await loadLibraryImageAsset(
            {
              jobId: layer.imageJobId,
              imageUrl: layer.remoteUrl || layer.src,
              title: layer.filename || layer.name,
            },
            token
          );

          return {
            ...layer,
            src: asset.url,
            remoteUrl:
              asset.remoteUrl ||
              layer.remoteUrl ||
              layer.src,
            imageJobId:
              asset.imageJobId ||
              layer.imageJobId ||
              null,
            naturalWidth: asset.width,
            naturalHeight: asset.height,
          };
        })
      );

      return {
        ...project,
        layers: hydratedLayers,
      };
    },
    [getToken]
  );

  const openProject = useCallback(
    async (item) => {
      try {
        setLoadError("");
        setScreen("loading");
        setInitialAsset(null);
        setInitialProject(await hydrateProject(item.project));
        setInitialTitle(item.title || "Untitled design");
        setSourceImageJobId(
          item.sourceImageJobId || item.id || ""
        );
        setCurrentProjectId(item.id || "");
        setEditorKey((value) => value + 1);
        setScreen("editor");
      } catch (error) {
        setLoadError(
          error?.message || "The project could not be opened."
        );
        setScreen("projects");
      }
    },
    [hydrateProject]
  );

  useEffect(() => {
    if (screen === "projects") {
      refreshProjects();
    }
  }, [screen, refreshProjects]);

  useEffect(() => {
    let cancelled = false;

    async function loadSource() {
      if (!studioState || !currentUser) return;

      try {
        if (studioState.creativeProject) {
          const project = await hydrateProject(
            studioState.creativeProject
          );

          if (!cancelled) {
            setInitialProject(project);
            setInitialTitle(
              studioState.title ||
                project?.title ||
                "Creative Studio design"
            );
            setSourceImageJobId(
              studioState.sourceImageJobId || ""
            );
            setCurrentProjectId(
              studioState.projectId ||
                studioState.id ||
                ""
            );
            setScreen("editor");
          }
        } else if (
          studioState.imageUrl ||
          studioState.sourceImageJobId
        ) {
          const asset = await loadLibraryImageAsset(
            {
              jobId: studioState.sourceImageJobId,
              imageUrl: studioState.imageUrl,
              title: studioState.title,
            },
            await getToken()
          );

          if (!cancelled) {
            setInitialAsset(asset);
            setInitialTitle(
              studioState.title || "Creative Studio design"
            );
            setSourceImageJobId(
              studioState.sourceImageJobId || ""
            );
            setCurrentProjectId("");
            setScreen("editor");
          }
        } else if (!cancelled) {
          setScreen("projects");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error?.message ||
              "The Creative Studio item could not be loaded."
          );
          setScreen("projects");
        }
      }
    }

    loadSource();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser,
    getToken,
    hydrateProject,
    studioState,
  ]);

  const createFromTemplate = (configuration) => {
    const project = createProjectFromTemplate(configuration);

    setInitialAsset(null);
    setInitialProject(project);
    setInitialTitle(
      configuration.projectName ||
        project.title ||
        "Untitled design"
    );
    setSourceImageJobId("");
    setCurrentProjectId("");
    setEditorKey((value) => value + 1);
    setScreen("editor");
  };

  const storage = {
    usedBytes: Number(storageUsage?.usedBytes || 0),
    limitBytes: Number(storageUsage?.limitBytes || 0),
  };

  if (screen === "loading") {
    return (
      <main className="csv4">
        <div className="csv4-project-empty">
          Loading Creative Studio...
        </div>
      </main>
    );
  }

  if (screen === "templates") {
    return (
      <TemplateGallery
        onBack={() => setScreen("projects")}
        onCreate={createFromTemplate}
      />
    );
  }

  if (screen === "projects") {
    return (
      <ProjectsHome
        projects={projects}
        loading={projectsLoading}
        error={projectsError || loadError}
        onRefresh={refreshProjects}
        onCreate={() => setScreen("templates")}
        onOpen={openProject}
        onDelete={deleteProject}
      />
    );
  }

  return (
    <Editor
      key={editorKey}
      uploadImageAsset={uploadImageAsset}
      fetchLibraryImages={fetchLibraryImages}
      hydrateLibraryAsset={hydrateLibraryAsset}
      fetchBrandKits={fetchBrandKits}
      hydrateBrandLogo={hydrateBrandLogo}
      saveProject={saveProject}
      initialAsset={initialAsset}
      initialProject={initialProject}
      sourceImageJobId={sourceImageJobId}
      projectId={currentProjectId}
      initialTitle={initialTitle}
      storageUsedBytes={storage.usedBytes}
      storageLimitBytes={storage.limitBytes}
      startWithNewProject={false}
      onBackToProjects={() => setScreen("projects")}
      onNewProject={() => setScreen("templates")}
      onProjectSaved={async (saved) => {
        if (saved?.id) {
          setCurrentProjectId(saved.id);
        }

        await refreshProjects();
      }}
    />
  );
}
