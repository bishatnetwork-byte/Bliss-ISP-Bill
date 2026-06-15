import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.routes.platform_admin import _provision_account_subdomain
from app.models.user import User
from app.services.platform_admin import ADMIN_PERMISSIONS, permissions_for
from app.services.security import (
    create_subdomain_handoff_token,
    decode_access_token,
    decode_subdomain_handoff_token,
)


class PlatformAdminPermissionsTests(unittest.TestCase):
    def test_superadmin_receives_every_permission(self) -> None:
        user = User(email="admin@example.com", full_name="Admin", platform_role="superadmin")
        self.assertEqual(permissions_for(user), ADMIN_PERMISSIONS)

    def test_subadmin_permissions_are_scoped(self) -> None:
        user = User(
            email="ops@example.com",
            full_name="Ops",
            platform_role="subadmin",
            platform_permissions="users,tunnels,unknown",
        )
        self.assertEqual(permissions_for(user), {"users", "tunnels"})

    def test_regular_user_has_no_platform_permissions(self) -> None:
        user = User(email="user@example.com", full_name="User")
        self.assertEqual(permissions_for(user), set())

    def test_subdomain_handoff_is_scoped_and_not_an_access_token(self) -> None:
        user = User(
            email="tenant@example.com",
            full_name="Tenant",
            account_subdomain="tenant",
            subdomain_enabled=True,
        )
        token = create_subdomain_handoff_token(user)
        claims = decode_subdomain_handoff_token(token)
        self.assertEqual(claims["subdomain"], "tenant")
        with self.assertRaises(Exception):
            decode_access_token(token)

    @patch("app.api.routes.platform_admin.create_record")
    @patch("app.api.routes.platform_admin.list_records", return_value=[])
    @patch("app.api.routes.platform_admin.list_zones", return_value=[{"id": "zone-1", "name": "renult.xyz"}])
    def test_account_subdomain_provisions_dns_record(self, _zones, _records, create) -> None:
        _provision_account_subdomain("musoke")
        create.assert_called_once_with("zone-1", {
            "name": "musoke.renult.xyz",
            "type": "CNAME",
            "content": "app.renult.xyz",
            "ttl": 600,
            "disabled": False,
            "proxied": False,
        })

    @patch("app.api.routes.platform_admin.create_record")
    @patch(
        "app.api.routes.platform_admin.list_records",
        return_value=[{
            "id": "record-1",
            "name": "musoke.renult.xyz",
            "type": "CNAME",
            "content": "app.renult.xyz",
        }],
    )
    @patch("app.api.routes.platform_admin.list_zones", return_value=[{"id": "zone-1", "name": "renult.xyz"}])
    def test_account_subdomain_sync_is_idempotent(self, _zones, _records, create) -> None:
        _provision_account_subdomain("musoke")
        create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
