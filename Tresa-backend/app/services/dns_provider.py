from typing import Any, Callable

from app.core.config import settings
from app.services import cloudflare_dns, ionos_dns


class DnsProviderError(RuntimeError):
    pass


def provider_name() -> str:
    if settings.cloudflare_api_token:
        return "cloudflare"
    if settings.ionos_api_key:
        return "ionos"
    return "unconfigured"


def is_configured() -> bool:
    return provider_name() != "unconfigured"


def _provider() -> Any:
    name = provider_name()
    if name == "cloudflare":
        return cloudflare_dns
    if name == "ionos":
        return ionos_dns
    raise DnsProviderError("Configure CLOUDFLARE_API_TOKEN or IONOS_API_KEY")


def _call(operation: Callable[..., Any], *args: Any) -> Any:
    try:
        return operation(*args)
    except (cloudflare_dns.CloudflareDnsError, ionos_dns.IonosDnsError) as exc:
        raise DnsProviderError(str(exc)) from exc


def list_zones() -> list[dict[str, Any]]:
    provider = _provider()
    name = provider_name()
    return [{**zone, "provider": name} for zone in _call(provider.list_zones)]


def list_records(zone_id: str) -> list[dict[str, Any]]:
    provider = _provider()
    return _call(provider.list_records, zone_id)


def create_record(zone_id: str, record: dict[str, Any]) -> None:
    provider = _provider()
    payload = dict(record)
    if provider_name() == "cloudflare":
        payload.pop("disabled", None)
    else:
        payload.pop("proxied", None)
    _call(provider.create_record, zone_id, payload)


def delete_record(zone_id: str, record_id: str) -> None:
    provider = _provider()
    _call(provider.delete_record, zone_id, record_id)
