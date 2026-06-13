import posixpath
import re
from functools import lru_cache
from typing import Any
from urllib.parse import quote, unquote

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings


class StorageConfigurationError(RuntimeError):
    pass


def clean_object_key(key: str) -> str:
    normalized = posixpath.normpath(key.strip().replace("\\", "/"))
    if normalized in {"", ".", "/"} or normalized == ".." or normalized.startswith("../"):
        raise ValueError("Invalid file key")
    return normalized.lstrip("/")


@lru_cache
def r2_client() -> Any:
    required = {
        "R2_ACCOUNT_ID": settings.r2_account_id,
        "R2_ACCESS_KEY_ID": settings.r2_access_key_id,
        "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key,
        "R2_BUCKET_NAME": settings.r2_bucket_name,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise StorageConfigurationError(f"Missing R2 configuration: {', '.join(missing)}")
    endpoint = settings.r2_endpoint_url or (
        f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def object_url(key: str, expires_in: int = 3600) -> str:
    if settings.r2_public_base_url:
        return f"{settings.r2_public_base_url.rstrip('/')}/{quote(key, safe='/')}"
    return r2_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": key},
        ExpiresIn=expires_in,
    )


def upload_bytes(key: str, content: bytes, content_type: str | None = None) -> str:
    object_key = clean_object_key(key)
    r2_client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=object_key,
        Body=content,
        ContentType=content_type or "application/octet-stream",
    )
    return object_url(object_key)


def list_objects(prefix: str = "") -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    paginator = r2_client().get_paginator("list_objects_v2")
    for page in paginator.paginate(
        Bucket=settings.r2_bucket_name,
        Prefix=prefix.strip().lstrip("/"),
    ):
        for item in page.get("Contents", []):
            key = item["Key"]
            objects.append({**item, "url": object_url(key)})
    return objects


def delete_object(key: str) -> None:
    r2_client().delete_object(
        Bucket=settings.r2_bucket_name,
        Key=clean_object_key(key),
    )


STORAGE_ERRORS = (BotoCoreError, ClientError, StorageConfigurationError)

_R2_OBJECT_KEY_RE = re.compile(r"(users/[^/]+/[^?]+)")


def refresh_logo_url(url: str | None) -> str | None:
    """Re-sign a stored R2 logo URL so it doesn't expire.

    Uploaded logos are saved with a presigned URL that is only valid for an
    hour. Re-deriving the object key from that URL and re-presigning it on
    every read means the captive portal always gets a link that is fresh for
    the lifetime of the page load, without needing a public R2 bucket.
    """
    if not url:
        return url
    is_r2_url = "r2.cloudflarestorage.com" in url or (
        settings.r2_public_base_url and settings.r2_public_base_url in url
    )
    if not is_r2_url:
        return url
    match = _R2_OBJECT_KEY_RE.search(unquote(url))
    if not match:
        return url
    try:
        return object_url(match.group(1))
    except STORAGE_ERRORS:
        return url
