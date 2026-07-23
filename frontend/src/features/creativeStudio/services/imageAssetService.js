const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function uploadCreativeStudioImage(file, token) {
  if (!file) throw new Error("Choose an image to upload.");
  if (!token) throw new Error("You must be signed in to upload images.");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE}/creative-studio/upload-image`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          "The image could not be uploaded.";

    throw new Error(message);
  }

  const item = data?.item;

  if (!item?.id || !item?.imageUrl) {
    throw new Error(
      "The upload completed without valid image metadata."
    );
  }

  const preview = await fetchAuthenticatedImageBlob(
    item.id,
    token
  );

  const dimensions = await readImageDimensions(preview.url);

  return {
    id: `asset-${item.id}`,
    imageJobId: item.id,
    filename:
      item.originalFilename ||
      file.name ||
      "Uploaded image",
    mimeType: item.contentType || file.type,
    sizeBytes: Number(
      item.fileSizeBytes ||
        file.size ||
        0
    ),
    width: dimensions.width,
    height: dimensions.height,
    url: preview.url,
    remoteUrl: item.imageUrl,
    storagePath: item.storagePath || null,
    uploadedAt: item.createdAt || Date.now(),
    isObjectUrl: true,
    storage: data.storage || null,
  };
}

export async function listLibraryImageAssets(
  token,
  limit = 60
) {
  if (!token) {
    throw new Error(
      "You must be signed in to load your Library."
    );
  }

  const response = await fetch(
    `${API_BASE}/image/jobs?limit=${encodeURIComponent(limit)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          "Your Library images could not be loaded.";

    throw new Error(message);
  }

  const candidates = firstArray(
    data?.items,
    data?.jobs,
    data?.imageJobs,
    data?.image_jobs,
    data?.results,
    data?.data,
    Array.isArray(data) ? data : null
  );

  return candidates
    .map(normalizeLibraryImageItem)
    .filter(
      (item) =>
        item.id &&
        item.imageUrl &&
        item.status !== "failed"
    )
    .sort(
      (a, b) =>
        Number(new Date(b.createdAt || 0)) -
        Number(new Date(a.createdAt || 0))
    );
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function normalizeLibraryImageItem(item) {
  const id =
    item?.id ||
    item?.jobId ||
    item?.job_id ||
    item?.imageJobId ||
    item?.image_job_id ||
    "";

  const imageUrl =
    item?.imageUrl ||
    item?.image_url ||
    item?.outputUrl ||
    item?.output_url ||
    item?.resultUrl ||
    item?.result_url ||
    item?.storageUrl ||
    item?.storage_url ||
    item?.url ||
    "";

  const thumbnailUrl =
    item?.thumbnailUrl ||
    item?.thumbnail_url ||
    item?.previewUrl ||
    item?.preview_url ||
    item?.posterUrl ||
    imageUrl;

  const title =
    item?.title ||
    item?.name ||
    item?.productName ||
    item?.product_name ||
    item?.originalFilename ||
    item?.original_filename ||
    item?.filename ||
    item?.prompt ||
    "Library image";

  return {
    id: String(id),
    imageUrl,
    thumbnailUrl,
    title: String(title).slice(0, 120),
    filename:
      item?.originalFilename ||
      item?.original_filename ||
      item?.filename ||
      title,
    prompt:
      item?.prompt ||
      item?.description ||
      "",
    createdAt:
      item?.createdAt ||
      item?.created_at ||
      item?.completedAt ||
      item?.completed_at ||
      null,
    status: String(
      item?.status || "succeeded"
    ).toLowerCase(),
  };
}

export async function loadLibraryImageAsset(
  { jobId, imageUrl, title },
  token
) {
  if (!token) {
    throw new Error(
      "You must be signed in to load this image."
    );
  }

  let preview;

  if (jobId) {
    preview = await fetchAuthenticatedImageBlob(
      jobId,
      token
    );
  } else if (imageUrl) {
    preview = await fetchTrustedImageBlob(
      imageUrl,
      token
    );
  } else {
    throw new Error(
      "This Library item has no image source."
    );
  }

  const dimensions = await readImageDimensions(preview.url);

  return {
    id: `asset-${jobId || Date.now()}`,
    imageJobId: jobId || null,
    filename: title || "Library image",
    mimeType: preview.type || "image/png",
    sizeBytes: preview.size || 0,
    width: dimensions.width,
    height: dimensions.height,
    url: preview.url,
    remoteUrl: imageUrl || null,
    storagePath: null,
    uploadedAt: Date.now(),
    isObjectUrl: true,
  };
}

export async function saveCreativeStudioProject(
  {
    blob,
    project,
    title,
    sourceImageJobId,
    projectId,
    saveAs = false,
  },
  token
) {
  if (!blob) {
    throw new Error(
      "The design could not be rendered."
    );
  }

  if (!token) {
    throw new Error(
      "You must be signed in to save your design."
    );
  }

  const formData = new FormData();

  formData.append(
    "file",
    blob,
    "creative-studio-design.png"
  );
  formData.append(
    "project",
    JSON.stringify(project)
  );
  formData.append(
    "title",
    title || "Creative Studio design"
  );
  formData.append(
    "source_image_job_id",
    sourceImageJobId || ""
  );
  formData.append(
    "project_id",
    saveAs ? "" : projectId || ""
  );
  formData.append(
    "save_as",
    saveAs ? "true" : "false"
  );

  const response = await fetch(
    `${API_BASE}/creative-studio/save`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          "The design could not be saved.";

    throw new Error(message);
  }

  return data;
}

export async function deleteCreativeStudioProject(
  projectId,
  token
) {
  if (!projectId) {
    throw new Error(
      "A project ID is required."
    );
  }

  if (!token) {
    throw new Error(
      "You must be signed in to delete a project."
    );
  }

  const response = await fetch(
    `${API_BASE}/image/jobs/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          "The project could not be deleted.";

    throw new Error(message);
  }

  return data;
}

export function serializeProject(canvas, layers) {
  return {
    version: 2,
    canvas,
    layers: layers.map((layer) => {
      if (layer.type !== "image") return layer;

      return {
        ...layer,
        src: layer.remoteUrl || layer.src,
      };
    }),
  };
}

export function releaseImageAsset(asset) {
  if (asset?.isObjectUrl && asset.url) {
    URL.revokeObjectURL(asset.url);
  }
}

async function fetchAuthenticatedImageBlob(
  jobId,
  token
) {
  const response = await fetch(
    `${API_BASE}/creative-studio/image/${encodeURIComponent(jobId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      "The uploaded image could not be loaded into the canvas."
    );
  }

  const blob = await response.blob();

  return {
    url: URL.createObjectURL(blob),
    size: blob.size,
    type: blob.type,
  };
}

async function fetchTrustedImageBlob(
  imageUrl,
  token
) {
  const response = await fetch(
    `${API_BASE}/creative-studio/proxy-image?url=${encodeURIComponent(imageUrl)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      "The Library image could not be loaded into the canvas."
    );
  }

  const blob = await response.blob();

  return {
    url: URL.createObjectURL(blob),
    size: blob.size,
    type: blob.type,
  };
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () =>
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });

    image.onerror = () =>
      reject(
        new Error(
          "The selected image could not be loaded."
        )
      );

    image.src = url;
  });
}

export async function listCreativeStudioProjects(
  token,
  limit = 100
) {
  if (!token) {
    throw new Error(
      "You must be signed in to load your projects."
    );
  }

  const response = await fetch(
    `${API_BASE}/image/jobs?limit=${encodeURIComponent(limit)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Your Creative Studio projects could not be loaded."
    );
  }

  const candidates = firstArray(
    data?.items,
    data?.jobs,
    data?.imageJobs,
    data?.image_jobs,
    data?.results,
    data?.data,
    Array.isArray(data) ? data : null
  );

  return candidates
    .map(normalizeCreativeStudioProject)
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.updatedAt || 0) -
        new Date(a.updatedAt || 0)
    );
}

function normalizeTimestamp(value) {
  if (!value) return null;

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      return value.toDate();
    }

    if (Number.isFinite(value.seconds)) {
      return new Date(value.seconds * 1000);
    }

    if (Number.isFinite(value._seconds)) {
      return new Date(value._seconds * 1000);
    }
  }

  if (typeof value === "number") {
    const milliseconds =
      value < 100000000000
        ? value * 1000
        : value;

    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function normalizeCreativeStudioProject(item) {
  let project =
    item?.creativeProject ||
    item?.creative_project ||
    item?.project ||
    item?.metadata?.creativeProject ||
    item?.metadata?.creative_project ||
    item?.metadata?.project;

  if (typeof project === "string") {
    try {
      project = JSON.parse(project);
    } catch {
      project = null;
    }
  }

  if (
    !project?.canvas ||
    !Array.isArray(project?.layers)
  ) {
    return null;
  }

  const id = String(
    item?.id ||
      item?.jobId ||
      item?.job_id ||
      item?.imageJobId ||
      item?.image_job_id ||
      ""
  );

  if (!id) return null;

  const updatedRaw =
    item?.updatedAt ||
    item?.updated_at ||
    item?.createdAt ||
    item?.created_at ||
    item?.completedAt ||
    item?.completed_at ||
    null;

  const updatedDate = normalizeTimestamp(updatedRaw);

  const thumbnailUrl =
    item?.thumbnailUrl ||
    item?.thumbnail_url ||
    item?.imageUrl ||
    item?.image_url ||
    item?.outputUrl ||
    item?.output_url ||
    item?.url ||
    "";

  const title =
    project?.title ||
    project?.metadata?.title ||
    item?.title ||
    item?.name ||
    item?.filename ||
    item?.originalFilename ||
    "Untitled design";

  return {
    id,
    title,
    project: {
      ...project,
      title,
    },
    thumbnailUrl,
    updatedAt: updatedDate
      ? updatedDate.toISOString()
      : null,
    updatedAtLabel: updatedDate
      ? `Edited ${updatedDate.toLocaleDateString()}`
      : "Saved project",
    width: Number(project.canvas.width || 0),
    height: Number(project.canvas.height || 0),
    sourceImageJobId:
      item?.sourceImageJobId ||
      item?.source_image_job_id ||
      id,
  };
}
