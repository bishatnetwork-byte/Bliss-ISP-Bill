from typing import Any

from app.models.router import Router


def get_remote_winbox_access(router: Router) -> dict[str, Any]:
    winbox_port = router.winbox_nat_port
    enabled = router.is_active and winbox_port is not None
    endpoint = f"{router.host}:{winbox_port}" if winbox_port else ""

    api_port = router.port
    api_endpoint = f"{router.host}:{api_port}" if api_port else ""

    return {
        "enabled": enabled,
        "protocol": "L2TP",
        "service": "Winbox",
        "host": router.host,
        "port": winbox_port or 0,
        "endpoint": endpoint,
        "url": endpoint,
        "api_port": api_port,
        "api_endpoint": api_endpoint,
        "api_protocol": "MikroTik API",
    }
