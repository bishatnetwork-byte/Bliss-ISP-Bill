import hashlib
from collections import defaultdict
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import Request
from sqlmodel import Session, select

from app.core.config import settings
from app.models.portal_ad import PortalAd
from app.models.portal_ad_event import PortalAdEvent
from app.schemas.ads import PortalAdCreate, PortalAdUpdate, youtube_embed_url
from app.services.portal import find_router_by_name
from app.services.storage import refresh_logo_url


def get_router_ads(session: Session, router_id: UUID, enabled_only: bool = False) -> list[PortalAd]:
    statement = select(PortalAd).where(PortalAd.router_id == router_id)
    if enabled_only:
        statement = statement.where(PortalAd.enabled.is_(True))
    return session.exec(statement.order_by(PortalAd.sort_order, PortalAd.created_at)).all()


def get_ad_metrics(session: Session, ad_ids: list[UUID], since: datetime | None = None) -> dict[UUID, dict]:
    metrics: dict[UUID, dict] = defaultdict(
        lambda: {"impressions": 0, "views": 0, "clicks": 0, "viewers": set()}
    )
    if not ad_ids:
        return metrics
    statement = select(PortalAdEvent).where(PortalAdEvent.ad_id.in_(ad_ids))
    if since:
        statement = statement.where(PortalAdEvent.created_at >= since)
    for event in session.exec(statement).all():
        if event.event_type in {"impression", "view", "click"}:
            metrics[event.ad_id][f"{event.event_type}s"] += 1
        if event.event_type == "view":
            metrics[event.ad_id]["viewers"].add(event.ip_hash)
    return metrics


def serialize_portal_ad(ad: PortalAd, metric: dict | None = None) -> dict:
    metric = metric or {}
    impressions = int(metric.get("impressions", 0))
    clicks = int(metric.get("clicks", 0))
    views = int(metric.get("views", 0))
    return {
        "id": ad.id,
        "router_id": ad.router_id,
        "enabled": ad.enabled,
        "advertiser_name": ad.advertiser_name,
        "business_type": ad.business_type,
        "placement": ad.placement,
        "media_type": ad.media_type,
        "title": ad.title,
        "description": ad.description,
        "media_url": refresh_logo_url(ad.media_url),
        "target_url": ad.target_url,
        "duration_seconds": ad.duration_seconds,
        "sort_order": ad.sort_order,
        "impressions": impressions,
        "views": views,
        "unique_views": len(metric.get("viewers", set())),
        "clicks": clicks,
        "ctr": round((clicks / impressions * 100) if impressions else 0, 2),
        "created_at": ad.created_at,
        "updated_at": ad.updated_at,
    }


def public_portal_ad(ad: PortalAd) -> dict:
    media_url = refresh_logo_url(ad.media_url)
    return {
        "id": ad.id,
        "placement": ad.placement,
        "media_type": ad.media_type,
        "title": ad.title,
        "description": ad.description,
        "media_url": media_url,
        "youtube_embed_url": youtube_embed_url(media_url) if ad.media_type == "youtube" else None,
        "target_url": ad.target_url,
        "duration_seconds": ad.duration_seconds,
    }


def get_public_router_ads(session: Session, router_name: str) -> list[dict]:
    router = find_router_by_name(session, router_name)
    if not router:
        return []
    return [public_portal_ad(ad) for ad in get_router_ads(session, router.id, enabled_only=True)]


def create_router_ad(session: Session, router_id: UUID, payload: PortalAdCreate) -> PortalAd:
    ad = PortalAd(router_id=router_id, **payload.model_dump())
    session.add(ad)
    session.commit()
    session.refresh(ad)
    return ad


def update_router_ad(session: Session, ad: PortalAd, payload: PortalAdUpdate) -> PortalAd:
    for name, value in payload.model_dump().items():
        setattr(ad, name, value)
    ad.updated_at = datetime.utcnow()
    session.add(ad)
    session.commit()
    session.refresh(ad)
    return ad


def _request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _hash(value: str) -> str:
    return hashlib.sha256(f"{settings.jwt_secret}:{value}".encode()).hexdigest()


def record_ad_event(
    session: Session,
    ad: PortalAd,
    event_type: str,
    request: Request,
    visitor_id: str | None,
) -> bool:
    ip_hash = _hash(_request_ip(request))
    visitor_hash = _hash(f"{ip_hash}:{visitor_id or request.headers.get('user-agent', '')}")
    cooldown = {"impression": 5, "view": 30, "click": 2}[event_type]
    duplicate = session.exec(
        select(PortalAdEvent)
        .where(PortalAdEvent.ad_id == ad.id)
        .where(PortalAdEvent.event_type == event_type)
        .where(PortalAdEvent.ip_hash == ip_hash)
        .where(PortalAdEvent.created_at >= datetime.utcnow() - timedelta(seconds=cooldown))
    ).first()
    if duplicate:
        return False

    event = PortalAdEvent(
        ad_id=ad.id,
        router_id=ad.router_id,
        event_type=event_type,
        ip_hash=ip_hash,
        visitor_hash=visitor_hash,
        country=request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country"),
        region=request.headers.get("x-vercel-ip-country-region"),
        city=request.headers.get("x-vercel-ip-city"),
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        referrer=(request.headers.get("referer") or "")[:1000] or None,
    )
    session.add(event)
    session.commit()
    return True


def analytics_for_router(session: Session, router_id: UUID, days: int) -> dict:
    ads = get_router_ads(session, router_id)
    ad_ids = [ad.id for ad in ads]
    since = datetime.utcnow() - timedelta(days=days - 1)
    previous_since = since - timedelta(days=days)
    events = []
    previous_events = []
    if ad_ids:
        events = session.exec(
            select(PortalAdEvent)
            .where(PortalAdEvent.ad_id.in_(ad_ids))
            .where(PortalAdEvent.created_at >= since)
        ).all()
        previous_events = session.exec(
            select(PortalAdEvent)
            .where(PortalAdEvent.ad_id.in_(ad_ids))
            .where(PortalAdEvent.created_at >= previous_since)
            .where(PortalAdEvent.created_at < since)
        ).all()

    dates = [(date.today() - timedelta(days=offset)) for offset in reversed(range(days))]
    timeline = {
        day.isoformat(): {"date": day.isoformat(), "impressions": 0, "views": 0, "unique_views": 0, "clicks": 0, "_viewers": set()}
        for day in dates
    }
    areas: dict[str, dict] = defaultdict(lambda: {"impressions": 0, "views": 0, "clicks": 0})
    totals = {"impressions": 0, "views": 0, "clicks": 0}
    viewers: set[str] = set()

    for event in events:
        key = event.created_at.date().isoformat()
        metric_key = f"{event.event_type}s"
        if key in timeline and metric_key in totals:
            timeline[key][metric_key] += 1
            if event.event_type == "view":
                timeline[key]["_viewers"].add(event.ip_hash)
        if metric_key in totals:
            totals[metric_key] += 1
        if event.event_type == "view":
            viewers.add(event.ip_hash)
        area = ", ".join(filter(None, [event.city, event.region, event.country])) or "Unknown"
        if event.event_type in {"impression", "view", "click"}:
            areas[area][event.event_type + "s"] += 1

    current_views = totals["views"]
    previous_views = sum(1 for event in previous_events if event.event_type == "view")
    growth = ((current_views - previous_views) / previous_views * 100) if previous_views else (100.0 if current_views else 0.0)
    metrics = get_ad_metrics(session, ad_ids, since)
    timeline_rows = []
    for row in timeline.values():
        row["unique_views"] = len(row.pop("_viewers"))
        timeline_rows.append(row)

    return {
        "days": days,
        "summary": {
            **totals,
            "unique_views": len(viewers),
            "ctr": round((totals["clicks"] / totals["impressions"] * 100) if totals["impressions"] else 0, 2),
            "view_rate": round((totals["views"] / totals["impressions"] * 100) if totals["impressions"] else 0, 2),
            "growth_percent": round(growth, 2),
        },
        "timeline": timeline_rows,
        "areas": [
            {"area": area, **values}
            for area, values in sorted(areas.items(), key=lambda item: item[1]["views"], reverse=True)[:10]
        ],
        "ads": [serialize_portal_ad(ad, metrics.get(ad.id)) for ad in ads],
    }
