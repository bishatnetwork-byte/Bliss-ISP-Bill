from typing import Any

import requests

from app.core.config import settings


class CloudflareDnsError(RuntimeError):
    pass


def _request(
    method: str,
    path: str,
    payload: Any = None,
    params: dict[str, Any] | None = None,
) -> Any:
    if not settings.cloudflare_api_token:
        raise CloudflareDnsError("CLOUDFLARE_API_TOKEN is not configured")
    try:
        response = requests.request(
            method,
            f"{settings.cloudflare_api_base_url}/{path.lstrip('/')}",
            headers={
                "Authorization": f"Bearer {settings.cloudflare_api_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=payload,
            params=params,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise CloudflareDnsError("Could not reach Cloudflare DNS API") from exc

    try:
        data = response.json()
    except ValueError:
        data = {}
    if not response.ok or not data.get("success", False):
        errors = data.get("errors") or []
        message = errors[0].get("message") if errors and isinstance(errors[0], dict) else response.text[:300]
        raise CloudflareDnsError(
            f"Cloudflare DNS API returned {response.status_code}: {message or 'request failed'}"
        )
    return data.get("result")


def list_zones() -> list[dict[str, Any]]:
    data = _request("GET", "/zones", params={"per_page": 50})
    if not isinstance(data, list):
        return []
    return [
        {
            "id": zone["id"],
            "name": zone["name"],
            "type": zone.get("status") or "cloudflare",
        }
        for zone in data
    ]


def list_records(zone_id: str) -> list[dict[str, Any]]:
    data = _request("GET", f"/zones/{zone_id}/dns_records", params={"per_page": 500})
    if not isinstance(data, list):
        return []
    return [
        {
            "id": record["id"],
            "name": record["name"],
            "type": record["type"],
            "content": record["content"],
            "ttl": record.get("ttl", 1),
            "disabled": False,
            "proxied": record.get("proxied"),
        }
        for record in data
    ]


def create_record(zone_id: str, record: dict[str, Any]) -> None:
    payload = {
        "name": record["name"],
        "type": record["type"],
        "content": record["content"],
        "ttl": record.get("ttl", 3600),
    }
    if record.get("prio") is not None:
        payload["priority"] = record["prio"]
    if record["type"].upper() in {"A", "AAAA", "CNAME"} and record.get("proxied") is not None:
        payload["proxied"] = record["proxied"]
    _request("POST", f"/zones/{zone_id}/dns_records", payload=payload)


def delete_record(zone_id: str, record_id: str) -> None:
    _request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}")
