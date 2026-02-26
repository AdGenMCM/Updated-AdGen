# storage_utils.py
import os
import uuid
from typing import Optional
from urllib.parse import quote

def upload_bytes_to_firebase_storage(
    data: bytes,
    uid: str,
    content_type: str,
    folder: str = "uploaded_creatives",
    filename_hint: Optional[str] = None,
) -> str:
    """
    Upload arbitrary bytes to Firebase Storage and return a direct download URL.
    Uses firebaseStorageDownloadTokens so the URL can be fetched without auth.
    """
    from firebase_admin import storage  # lazy import

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    if not bucket_name:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing.")

    ct = (content_type or "application/octet-stream").lower().strip()

    # Pick extension
    ext = "bin"
    if ct == "image/png":
        ext = "png"
    elif ct in ("image/jpeg", "image/jpg"):
        ext = "jpg"
    elif ct == "image/webp":
        ext = "webp"
    elif ct == "video/mp4":
        ext = "mp4"
    elif filename_hint and "." in filename_hint:
        ext = filename_hint.split(".")[-1].lower()[:8]

    bucket = storage.bucket(bucket_name)

    object_id = f"{folder}/{uid}/{uuid.uuid4().hex}.{ext}"
    token = uuid.uuid4().hex

    blob = bucket.blob(object_id)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(data, content_type=ct)

    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(object_id, safe='')}?alt=media&token={token}"
    )