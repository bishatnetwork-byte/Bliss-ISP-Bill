from unittest.mock import patch
from uuid import UUID

import pytest

from app.core.config import settings
from app.services import renult_pay


REFERENCE = UUID("c97fae8b-9b7f-4192-9f72-6f0859d33e67")


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_initialize_collection_verifies_identity_then_collects(monkeypatch):
    monkeypatch.setattr(settings, "marz_api_credentials", "creds")

    def fake_post(url, json=None, headers=None, timeout=None):
        assert url == settings.identity_api_url
        assert json == {"msisdn": "+256700000000"}
        return _FakeResponse(200, {"identityname": "JALAL ELACHKAR", "message": "ok", "success": True})

    def fake_request(method, url, data=None, headers=None, timeout=None):
        assert method == "POST"
        assert url == f"{settings.marz_api_base_url}/collect-money"
        assert headers["Authorization"] == "Basic creds"
        assert data["amount"] == "1000"
        return _FakeResponse(200, {
            "status": "success",
            "data": {"transaction": {"status": "processing", "uuid": "abc-123"}},
        })

    with patch("app.services.renult_pay.requests.post", side_effect=fake_post), \
            patch("app.services.renult_pay.requests.request", side_effect=fake_request):
        response = renult_pay.initialize_collection(
            amount=1000,
            phone_number="+256700000000",
            reference=REFERENCE,
            description="Voucher",
        )

    assert response["data"]["customer_identity"]["identityname"] == "JALAL ELACHKAR"
    assert renult_pay.extract_status(response) == "processing"
    assert renult_pay.extract_collection_uuid(response) == "abc-123"
    assert renult_pay.normalize_status(renult_pay.extract_status(response)) == "PENDING"


def test_initialize_collection_stops_on_failed_identity(monkeypatch):
    monkeypatch.setattr(settings, "marz_api_credentials", "creds")

    def fake_post(url, json=None, headers=None, timeout=None):
        return _FakeResponse(200, {"identityname": None, "message": "not found", "success": False})

    with patch("app.services.renult_pay.requests.post", side_effect=fake_post), \
            patch("app.services.renult_pay.requests.request") as mock_request:
        with pytest.raises(renult_pay.RenultPayError):
            renult_pay.initialize_collection(
                amount=1000,
                phone_number="+256700000000",
                reference=REFERENCE,
            )

    mock_request.assert_not_called()


def test_verify_collection_calls_marzpay_directly(monkeypatch):
    monkeypatch.setattr(settings, "marz_api_credentials", "creds")

    def fake_request(method, url, data=None, headers=None, timeout=None):
        assert method == "GET"
        assert url == f"{settings.marz_api_base_url}/collect-money/abc-123"
        return _FakeResponse(200, {
            "status": "success",
            "data": {"transaction": {"status": "SUCCESS", "uuid": "abc-123"}},
        })

    with patch("app.services.renult_pay.requests.request", side_effect=fake_request):
        response = renult_pay.verify_collection("abc-123")

    assert renult_pay.normalize_status(renult_pay.extract_status(response)) == "SUCCESS"


def test_marz_request_requires_credentials(monkeypatch):
    monkeypatch.setattr(settings, "marz_api_credentials", "")

    with pytest.raises(renult_pay.RenultPayError):
        renult_pay.verify_collection("abc-123")
