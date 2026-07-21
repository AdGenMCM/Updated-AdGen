import os
import uuid
from typing import Optional, Dict, Any
from urllib.parse import quote


def upload_bytes_to_firebase_storage_with_metadata(
    data: bytes,
    uid: str,
    content_type: str,
    folder: str = "uploaded_creatives",
    filename_hint: Optional[str] = None,
) -> Dict[str, Any]:
    """Upload bytes and return URL plus durable storage metadata."""
    from firebase_admin import storage

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    if not bucket_name:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing.")

    ct = (content_type or "application/octet-stream").lower().strip()
    ext = "bin"
    if ct == "image/png":
        ext = "png"
    elif ct in ("image/jpeg", "image/jpg"):
        ext = "jpg"
    elif ct == "image/webp":
        ext = "webp"
    elif ct == "image/svg+xml":
        ext = "svg"
    elif ct == "video/mp4":
        ext = "mp4"
    elif ct in ("audio/mpeg", "audio/mp3"):
        ext = "mp3"
    elif filename_hint and "." in filename_hint:
        ext = filename_hint.split(".")[-1].lower()[:8]

    bucket = storage.bucket(bucket_name)
    object_id = f"{folder}/{uid}/{uuid.uuid4().hex}.{ext}"
    token = uuid.uuid4().hex

    blob = bucket.blob(object_id)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(data, content_type=ct)

    url = (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(object_id, safe='')}?alt=media&token={token}"
    )

    return {
        "url": url,
        "storagePath": object_id,
        "fileSizeBytes": len(data),
        "contentType": ct,
        "bucket": bucket_name,
    }


def upload_bytes_to_firebase_storage(
    data: bytes,
    uid: str,
    content_type: str,
    folder: str = "uploaded_creatives",
    filename_hint: Optional[str] = None,
) -> str:
    """Backward-compatible URL-only wrapper."""
    return upload_bytes_to_firebase_storage_with_metadata(
        data,
        uid,
        content_type,
        folder,
        filename_hint,
    )["url"]


def delete_firebase_storage_object(storage_path: str) -> bool:
    from firebase_admin import storage

    path = (storage_path or "").strip()
    if not path:
        return False

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    if not bucket_name:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing.")

    blob = storage.bucket(bucket_name).blob(path)
    try:
        blob.delete()
        return True
    except Exception as exc:
        # Deleting a Firestore record should remain idempotent if the object is already gone.
        if "404" in str(exc) or "NotFound" in exc.__class__.__name__:
            return False
        raise

