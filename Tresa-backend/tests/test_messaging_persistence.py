import unittest
from unittest.mock import patch

from app.models.telegram_connection import TelegramConnection
from app.services.messaging import sms_failure_reason, sms_was_accepted
from app.services.telegram import send_connection_message


class MessagingDiagnosticsTests(unittest.TestCase):
    def test_provider_rejection_reason_is_preserved(self) -> None:
        response = {
            "SMSMessageData": {
                "Recipients": [{
                    "number": "+256772123456",
                    "status": "Rejected",
                    "statusCode": 403,
                }]
            }
        }
        self.assertFalse(sms_was_accepted(response, "+256772123456"))
        self.assertEqual(
            sms_failure_reason(response, "+256772123456"),
            "Rejected (provider code 403)",
        )

    @patch("app.services.telegram.decrypt_secret", return_value="bot-token")
    @patch("app.services.telegram._request")
    def test_telegram_notification_is_sent_to_two_chats(self, request, _decrypt) -> None:
        connection = TelegramConnection(
            user_id="00000000-0000-0000-0000-000000000001",
            bot_token_encrypted="encrypted",
            bot_username="renult_bot",
            chat_id="100",
            secondary_chat_id="200",
        )
        send_connection_message(connection, "Test")
        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[0].args[2]["chat_id"], "100")
        self.assertEqual(request.call_args_list[1].args[2]["chat_id"], "200")


if __name__ == "__main__":
    unittest.main()
