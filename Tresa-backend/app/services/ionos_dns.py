from typing import Any

import requests

from app.core.config import settings


class IonosDnsError(RuntimeError):
    pass


def _request(method: str, path: str, payload: Any = None) -> Any:
    if not settings.ionos_api_key:
        raise IonosDnsError("IONOS_API_KEY is not configured")
    try:
        response = requests.request(
            method,
            f"{settings.ionos_api_base_url}/{path.lstrip('/')}",
            headers={"X-API-Key": settings.ionos_api_key, "Accept": "application/json"},
            json=payload,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise IonosDnsError("Could not reach IONOS DNS API") from exc
    if not response.ok:
        raise IonosDnsError(f"IONOS DNS API returned {response.status_code}: {response.text[:300]}")
    if response.status_code == 204:
        return None
    return response.json()


def list_zones() -> list[dict[str, Any]]:
    data = _request("GET", "/zones")
    return data if isinstance(data, list) else []


def list_records(zone_id: str) -> list[dict[str, Any]]:
    data = _request("GET", f"/zones/{zone_id}")
    records = data.get("records", []) if isinstance(data, dict) else []
    return records if isinstance(records, list) else []


def delete_record(zone_id: str, record_id: str) -> None:
    _request("DELETE", f"/zones/{zone_id}/records/{record_id}")


def create_record(zone_id: str, record: dict[str, Any]) -> None:
    _request("POST", f"/zones/{zone_id}/records", [record])
