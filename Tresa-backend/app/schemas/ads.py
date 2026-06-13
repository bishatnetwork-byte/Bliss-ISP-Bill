from datetime import datetime
from typing import Literal, Optional
from urllib.parse import parse_qs, urlparse
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

AdPlacement = Literal["banner", "flash"]
AdMediaType = Literal["image", "video", "youtube"]
AdEventType = Literal["impression", "view", "click"]


def _clean_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if urlparse(cleaned).scheme not in {"http", "https"}:
        raise ValueError("URL must start with http:// or https://")
    return cleaned


class PortalAdCreate(BaseModel):
    enabled: bool = True
    advertiser_name: str = Field(default="", max_length=160)
    business_type: str = Field(default="other", max_length=80)
    placement: AdPlacement = "banner"
    media_type: AdMediaType = "image"
    title: str = Field(default="Sponsored", max_length=160)
    description: str = Field(default="", max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=2000)
    target_url: Optional[str] = Field(default=None, max_length=2000)
    duration_seconds: int = Field(default=5, ge=1, le=60)
    sort_order: int = Field(default=0, ge=0, le=10000)

    @field_validator("media_url", "target_url")
    @classmethod
    def clean_optional_url(cls, value: Optional[str]) -> Optional[str]:
        return _clean_url(value)

    @field_validator("media_url")
    @classmethod
    def validate_youtube_url(cls, value: Optional[str], info):
        if info.data.get("media_type") != "youtube" or not value:
            return value
        host = urlparse(value).netloc.lower()
        if host not in {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}:
            raise ValueError("YouTube ads require a youtube.com or youtu.be link")
        return value


class PortalAdUpdate(PortalAdCreate):
    pass


class PortalAdResponse(PortalAdCreate):
    id: UUID
    router_id: UUID
    impressions: int = 0
    views: int = 0
    unique_views: int = 0
    clicks: int = 0
    ctr: float = 0
    created_at: datetime
    updated_at: datetime


class PublicPortalAd(BaseModel):
    id: UUID
    placement: AdPlacement
    media_type: AdMediaType
    title: str
    description: str
    media_url: Optional[str] = None
    youtube_embed_url: Optional[str] = None
    target_url: Optional[str] = None
    duration_seconds: int


class PortalAdFeedResponse(BaseModel):
    ads: list[PublicPortalAd]
    rotation_seconds: int = 8


class PortalAdEventCreate(BaseModel):
    event_type: AdEventType
    visitor_id: Optional[str] = Field(default=None, max_length=160)


class PortalAdEventResponse(BaseModel):
    accepted: bool


class AdMetricPoint(BaseModel):
    date: str
    impressions: int
    views: int
    unique_views: int
    clicks: int


class AdAreaMetric(BaseModel):
    area: str
    impressions: int
    views: int
    clicks: int


class AdAnalyticsSummary(BaseModel):
    impressions: int
    views: int
    unique_views: int
    clicks: int
    ctr: float
    view_rate: float
    growth_percent: float


class PortalAdAnalyticsResponse(BaseModel):
    days: int
    summary: AdAnalyticsSummary
    timeline: list[AdMetricPoint]
    areas: list[AdAreaMetric]
    ads: list[PortalAdResponse]


def youtube_embed_url(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    video_id = ""
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith("/shorts/") or parsed.path.startswith("/embed/"):
            video_id = parsed.path.split("/")[2]
    if not video_id:
        return None
    return f"https://www.youtube.com/embed/{video_id}?autoplay=1&mute=1&playsinline=1&rel=0"
