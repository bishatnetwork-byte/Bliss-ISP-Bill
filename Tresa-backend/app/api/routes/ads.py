from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.api.deps import CurrentUser
from app.api.routes.portal import check_router_ownership
from app.db.session import SessionDep
from app.models.portal_ad import PortalAd
from app.schemas.ads import (
    PortalAdAnalyticsResponse,
    PortalAdCreate,
    PortalAdEventCreate,
    PortalAdEventResponse,
    PortalAdFeedResponse,
    PortalAdResponse,
    PortalAdUpdate,
)
from app.services.ads import (
    analytics_for_router,
    create_router_ad,
    get_ad_metrics,
    get_public_router_ads,
    get_router_ads,
    record_ad_event,
    serialize_portal_ad,
    update_router_ad,
)
from app.services.portal import find_router_by_name

router = APIRouter(tags=["Ads"])


def owned_ad(session: SessionDep, router_id: UUID, ad_id: UUID) -> PortalAd:
    ad = session.get(PortalAd, ad_id)
    if not ad or ad.router_id != router_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    return ad


@router.get("/portal/{router_name}/ads", response_model=PortalAdFeedResponse)
def public_portal_ads(router_name: str, session: SessionDep) -> PortalAdFeedResponse:
    return PortalAdFeedResponse(ads=get_public_router_ads(session, router_name))


@router.post(
    "/portal/{router_name}/ads/{ad_id}/events",
    response_model=PortalAdEventResponse,
)
def public_portal_ad_event(
    router_name: str,
    ad_id: UUID,
    payload: PortalAdEventCreate,
    request: Request,
    session: SessionDep,
) -> PortalAdEventResponse:
    db_router = find_router_by_name(session, router_name)
    ad = session.get(PortalAd, ad_id)
    if not db_router or not ad or ad.router_id != db_router.id or not ad.enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ad not found")
    return PortalAdEventResponse(
        accepted=record_ad_event(session, ad, payload.event_type, request, payload.visitor_id)
    )


@router.get("/routers/{router_id}/ads", response_model=list[PortalAdResponse])
def list_router_ads(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> list[PortalAdResponse]:
    db_router = check_router_ownership(session, router_id, user.id)
    ads = get_router_ads(session, db_router.id)
    metrics = get_ad_metrics(session, [ad.id for ad in ads])
    return [PortalAdResponse(**serialize_portal_ad(ad, metrics.get(ad.id))) for ad in ads]


@router.post("/routers/{router_id}/ads", response_model=PortalAdResponse, status_code=201)
def create_ad(
    router_id: UUID,
    payload: PortalAdCreate,
    user: CurrentUser,
    session: SessionDep,
) -> PortalAdResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    ad = create_router_ad(session, db_router.id, payload)
    return PortalAdResponse(**serialize_portal_ad(ad))


@router.put("/routers/{router_id}/ads/{ad_id}", response_model=PortalAdResponse)
def update_ad(
    router_id: UUID,
    ad_id: UUID,
    payload: PortalAdUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> PortalAdResponse:
    check_router_ownership(session, router_id, user.id)
    ad = update_router_ad(session, owned_ad(session, router_id, ad_id), payload)
    metrics = get_ad_metrics(session, [ad.id])
    return PortalAdResponse(**serialize_portal_ad(ad, metrics.get(ad.id)))


@router.delete("/routers/{router_id}/ads/{ad_id}", status_code=204)
def delete_ad(
    router_id: UUID,
    ad_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> Response:
    check_router_ownership(session, router_id, user.id)
    ad = owned_ad(session, router_id, ad_id)
    session.delete(ad)
    session.commit()
    return Response(status_code=204)


@router.get("/routers/{router_id}/ads/analytics", response_model=PortalAdAnalyticsResponse)
def router_ad_analytics(
    router_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    days: int = Query(default=30, ge=7, le=365),
) -> PortalAdAnalyticsResponse:
    db_router = check_router_ownership(session, router_id, user.id)
    return PortalAdAnalyticsResponse(**analytics_for_router(session, db_router.id, days))
