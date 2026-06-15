import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services import cloudflare_dns, dns_provider


class DnsProviderTests(unittest.TestCase):
    def test_cloudflare_is_preferred_when_both_providers_are_configured(self) -> None:
        with (
            patch.object(settings, "cloudflare_api_token", "cloudflare-token"),
            patch.object(settings, "ionos_api_key", "ionos-key"),
        ):
            self.assertEqual(dns_provider.provider_name(), "cloudflare")

    def test_ionos_is_used_as_fallback(self) -> None:
        with (
            patch.object(settings, "cloudflare_api_token", None),
            patch.object(settings, "ionos_api_key", "ionos-key"),
        ):
            self.assertEqual(dns_provider.provider_name(), "ionos")

    def test_unconfigured_provider_raises_clear_error(self) -> None:
        with (
            patch.object(settings, "cloudflare_api_token", None),
            patch.object(settings, "ionos_api_key", None),
        ):
            with self.assertRaisesRegex(
                dns_provider.DnsProviderError,
                "Configure CLOUDFLARE_API_TOKEN or IONOS_API_KEY",
            ):
                dns_provider.list_zones()

    def test_cloudflare_records_are_normalized(self) -> None:
        response = [{
            "id": "record-id",
            "name": "app.example.com",
            "type": "A",
            "content": "192.0.2.1",
            "ttl": 300,
            "proxied": True,
        }]
        with patch.object(cloudflare_dns, "_request", return_value=response):
            self.assertEqual(
                cloudflare_dns.list_records("zone-id"),
                [{
                    "id": "record-id",
                    "name": "app.example.com",
                    "type": "A",
                    "content": "192.0.2.1",
                    "ttl": 300,
                    "disabled": False,
                    "proxied": True,
                }],
            )

    def test_cloudflare_create_maps_priority_and_proxy(self) -> None:
        with patch.object(cloudflare_dns, "_request") as request:
            cloudflare_dns.create_record(
                "zone-id",
                {
                    "name": "app.example.com",
                    "type": "A",
                    "content": "192.0.2.1",
                    "ttl": 300,
                    "prio": 10,
                    "proxied": True,
                },
            )
        request.assert_called_once_with(
            "POST",
            "/zones/zone-id/dns_records",
            payload={
                "name": "app.example.com",
                "type": "A",
                "content": "192.0.2.1",
                "ttl": 300,
                "priority": 10,
                "proxied": True,
            },
        )


if __name__ == "__main__":
    unittest.main()
