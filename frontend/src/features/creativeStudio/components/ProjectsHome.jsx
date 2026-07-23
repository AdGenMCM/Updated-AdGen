import React, { useMemo, useState } from "react";

export default function ProjectsHome({
  projects = [],
  loading,
  error,
  onRefresh,
  onCreate,
  onOpen,
  onDelete,
}) {
  const [query, setQuery] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return projects;

    return projects.filter((item) =>
      `${item.title} ${item.width} ${item.height}`
        .toLowerCase()
        .includes(value)
    );
  }, [projects, query]);

  const handleDelete = async (project) => {
    if (!project?.id || deletingProjectId) return;

    const confirmed = window.confirm(
      `Delete "${project.title || "Untitled design"}"?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingProjectId(project.id);
      await onDelete?.(project);
    } finally {
      setDeletingProjectId("");
    }
  };

  return (
    <main className="csv4 csv4-projects-home">
      <header className="csv4-projects-hero">
        <div>
          <span className="csv4__eyebrow">Creative Studio</span>
          <h1>Your projects</h1>
          <p>Create a new design or continue working on a saved project.</p>
        </div>

        <button
          type="button"
          className="csv4-header-button csv4-header-button--primary"
          onClick={onCreate}
        >
          Create New Project
        </button>
      </header>

      <div className="csv4-projects-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
        />

        <button
          type="button"
          className="csv4-header-button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="csv4-upload-error">{error}</div>}

      {loading && !projects.length ? (
        <div className="csv4-project-empty">Loading your projects...</div>
      ) : null}

      {!loading && !filtered.length ? (
        <section className="csv4-project-empty">
          <h2>No saved projects yet</h2>
          <p>
            Start with a template, customize it in the editor, and save it here.
          </p>

          <button
            type="button"
            className="csv4-header-button csv4-header-button--primary"
            onClick={onCreate}
          >
            Create your first project
          </button>
        </section>
      ) : (
        <section className="csv4-project-card-grid">
          <button
            type="button"
            className="csv4-project-create-card"
            onClick={onCreate}
          >
            <span>＋</span>
            <strong>Create New Project</strong>
            <small>Choose a size, template, and color direction</small>
          </button>

          {filtered.map((project) => {
            const isDeleting = deletingProjectId === project.id;

            return (
              <article className="csv4-project-card" key={project.id}>
                <button
                  type="button"
                  className="csv4-project-card__preview"
                  onClick={() => onOpen(project)}
                  disabled={isDeleting}
                >
                  {project.thumbnailUrl ? (
                    <img src={project.thumbnailUrl} alt="" />
                  ) : (
                    <span
                      style={{
                        aspectRatio: `${project.width || 1}/${project.height || 1}`,
                      }}
                    >
                      Creative Studio
                    </span>
                  )}
                </button>

                <div className="csv4-project-card__meta">
                  <div>
                    <strong>{project.title}</strong>

                    <span>
                      {project.width && project.height
                        ? `${project.width} × ${project.height}`
                        : "Editable design"}
                    </span>

                    <small>{project.updatedAtLabel}</small>
                  </div>

                  <div className="csv4-project-card__actions">
                    <button
                      type="button"
                      onClick={() => onOpen(project)}
                      disabled={isDeleting}
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      className="csv4-project-delete"
                      onClick={() => handleDelete(project)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
