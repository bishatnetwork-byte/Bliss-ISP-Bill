import unittest

from fastapi import HTTPException

from app.models.user import User
from app.services.platform_admin import ADMIN_PERMISSIONS, permissions_for


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


if __name__ == "__main__":
    unittest.main()
