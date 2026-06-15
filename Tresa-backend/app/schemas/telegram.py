from pydantic import BaseModel, Field


class TelegramConnectRequest(BaseModel):
    bot_token: str = Field(min_length=20, max_length=300)
    slot: int = Field(default=1, ge=1, le=2)


class TelegramPreferenceUpdate(BaseModel):
    voucher_purchases: bool
    voucher_batches: bool
    withdrawal_receipts: bool
    router_alerts: bool
    hourly_router_ping: bool


class TelegramConnectionResponse(TelegramPreferenceUpdate):
    connected: bool
    bot_username: str | None = None
    chat_id: str | None = None
    chat_title: str | None = None
    secondary_chat_id: str | None = None
    secondary_chat_title: str | None = None


class TelegramActionResponse(BaseModel):
    success: bool
    message: str
