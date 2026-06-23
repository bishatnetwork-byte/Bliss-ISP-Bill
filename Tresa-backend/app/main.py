from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import ads, auth, health, monitoring, notification, branch, messaging, package, payment_gateway, platform_admin, portal, router, staff, subscription, telegram, ticket, upload, wallet
from app.db.init import init_db
from app.services.routers.concentrator import concentrator_worker
from app.services.snmp_monitor import snmp_monitor_worker
from app.services.router_heartbeat import router_heartbeat_worker


def create_app() -> FastAPI:
    app = FastAPI(
        title="Renult Billing System",
        version="1.0.0",
        description="Mikrotik Router Billing System",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # CORSMiddleware doesn't reliably add headers to error responses handle
    # it explicitly so the browser can read the error detail instead of showing
    # a generic "Failed to fetch".
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        origin = request.headers.get("origin", "*")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers={"Access-Control-Allow-Origin": origin},
        )

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()
        concentrator_worker.start()
        snmp_monitor_worker.start()
        router_heartbeat_worker.start()

    @app.on_event("shutdown")
    def on_shutdown() -> None:
        concentrator_worker.stop()
        snmp_monitor_worker.stop()
        router_heartbeat_worker.stop()

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(notification.router)
    app.include_router(monitoring.router)
    app.include_router(upload.router)
    app.include_router(ads.router)
    app.include_router(branch.router)
    app.include_router(messaging.router)
    app.include_router(package.router)
    app.include_router(payment_gateway.payments_router)
    app.include_router(payment_gateway.send_money_router)
    app.include_router(platform_admin.router)
    app.include_router(portal.router)
    app.include_router(router.router)
    app.include_router(staff.router)
    app.include_router(subscription.router)
    app.include_router(telegram.router)
    app.include_router(ticket.router)
    app.include_router(wallet.router)
    return app


app = create_app()
