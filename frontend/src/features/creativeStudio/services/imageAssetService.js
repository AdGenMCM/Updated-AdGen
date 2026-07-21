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

  const response = await fetch(`${API_BASE}/creative-studio/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await safeJson(response);
  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || "The image could not be uploaded.";
    throw new Error(message);
  }

  const item = data?.item;
  if (!item?.id || !item?.imageUrl) {
    throw new Error("The upload completed without valid image metadata.");
  }

  const preview = await fetchAuthenticatedImageBlob(item.id, token);
  const dimensions = await readImageDimensions(preview.url);

  return {
    id: `asset-${item.id}`,
    imageJobId: item.id,
    filename: item.originalFilename || file.name || "Uploaded image",
    mimeType: item.contentType || file.type,
    sizeBytes: Number(item.fileSizeBytes || file.size || 0),
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

export async function loadLibraryImageAsset({ jobId, imageUrl, title }, token) {
  if (!token) throw new Error("You must be signed in to load this image.");

  let preview;
  if (jobId) {
    preview = await fetchAuthenticatedImageBlob(jobId, token);
  } else if (imageUrl) {
    preview = await fetchTrustedImageBlob(imageUrl, token);
  } else {
    throw new Error("This Library item has no image source.");
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

export async function saveCreativeStudioProject({ blob, project, title, sourceImageJobId }, token) {
  if (!blob) throw new Error("The design could not be rendered.");
  if (!token) throw new Error("You must be signed in to save your design.");

  const formData = new FormData();
  formData.append("file", blob, "creative-studio-design.png");
  formData.append("project", JSON.stringify(project));
  formData.append("title", title || "Creative Studio design");
  formData.append("source_image_job_id", sourceImageJobId || "");

  const response = await fetch(`${API_BASE}/creative-studio/save`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await safeJson(response);

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || "The design could not be saved.";
    throw new Error(message);
  }

  return data;
}

export function serializeProject(canvas, layers) {
  return {
    version: 1,
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
  if (asset?.isObjectUrl && asset.url) URL.revokeObjectURL(asset.url);
}

async function fetchAuthenticatedImageBlob(jobId, token) {
  const response = await fetch(`${API_BASE}/creative-studio/image/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("The uploaded image could not be loaded into the canvas.");
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), size: blob.size, type: blob.type };
}

async function fetchTrustedImageBlob(imageUrl, token) {
  const response = await fetch(
    `${API_BASE}/creative-studio/proxy-image?url=${encodeURIComponent(imageUrl)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("The Library image could not be loaded into the canvas.");
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), size: blob.size, type: blob.type };
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("The selected image could not be loaded."));
    image.src = url;
  });
}
